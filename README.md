# GES Purchasing Request Portal

Interim IT procurement requisition intake (until Ironclad), built to the *IT Procurement Requisition Form – Pilot Functional Requirements*. Requesters fill in a validated form (stakeholders, project costing, SOW/quote/order form, urgency) with their PDFs attached. Submit unlocks only when every required field passes validation. On submit the request is time-stamped, set to **Pending Review**, added to the queue, and emailed out.

- **Requesters:** dashboard of their own requests, the New Request form, and request history with status.
- **Purchasing admins (`Admin` app role):** every request, status updates with timeline notes, internal notes, email resend, CSV export, and a lists refresh.
- **Email:** one message per submission from the PO shared mailbox to `EMAIL_TO` (PO mailbox plus the Procurement reviewers), CC + Reply-To the requester, PDFs attached (Microsoft Graph). The approver and the additional PO recipients are stored but not emailed.
- **Approvers list** (people with Oracle approval access) comes from the `PO Intake Lists.xlsx` workbook in SharePoint and refreshes nightly. Project number (9 digits) and task / cost center (4 digits) are typed in and stored as text. Oracle can replace the source later without changing the app.

**Stack:** React + Vite + TypeScript frontend, FastAPI backend, SQLite on `/home/data`, Blob Storage for PDFs and backups, Easy Auth (Entra ID), on one Linux App Service with a private endpoint: `app-wus2-purreq-dv` (resource group `rg-wus2-purreq-dv-services`, subscription GES-AIS-Dv), reachable at https://dv-gespurchasingrequests.ges.com.

Development rules: [docs/GES-App-Coding-Standards.md](docs/GES-App-Coding-Standards.md).

---

## Local development

Prerequisites: Python 3.12+ and Node 22+.

```powershell
# Backend (terminal 1)
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env            # AUTH_MODE=dev signs you in as a fake admin
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api to :8000)
```

When running locally:
- Emails are written to `backend/data/outbox/*.html` instead of being sent.
- Files are stored in `backend/data/files/`.
- Lists load from `backend/sample_data/PO Intake Lists.xlsx`, which holds **sample values**. Regenerate it with `scripts/make_sample_lists.py`.
- To see the requester view, set `DEV_USER_ROLES=` (empty) in `.env`.

Tests: `cd backend; .venv\Scripts\python -m pytest -q`. Type-check: `cd frontend; npm run typecheck`.

## Deploy

Run from the GES network or VPN. The App Service has public access disabled, so cloud build agents (GitHub Actions, Microsoft-hosted DevOps agents) can't reach it.

```powershell
az login
pwsh -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1 -Subscription <GES-AIS-Dv subscription id>
```

The script runs the tests, builds the frontend into `backend/static`, packages a Linux-safe zip, deploys it with `az webapp deploy`, and waits for Kudu to report success. It deploys code only and doesn't change app settings.

After deploying, open https://dv-gespurchasingrequests.ges.com in an InPrivate window and hard-refresh. Python packages are bundled into the zip as Linux wheels, so nothing is installed at boot. Expect about a minute of 503 while the container restarts.

## One-time environment setup (infra)

### App Service `app-wus2-purreq-dv`
| Setting | Value |
|---|---|
| Stack | Linux, Python 3.12 (`linuxFxVersion = PYTHON\|3.12`) |
| Startup command | `bash /home/site/wwwroot/startup.sh` |
| Instances | **1, autoscale off** (SQLite) |
| Always On / HTTPS only / TLS / FTP | On / On / 1.2 / Off |
| Managed identity | System-assigned |
| Health check | `/api/health` |

### Easy Auth (Authentication blade)
- Microsoft provider, new app registration, **Require authentication**, **HTTP 302 redirect**, token store on.
- Redirect URI on the app registration: `https://app-wus2-purreq-dv.azurewebsites.net/.auth/login/aad/callback`, plus one for any custom domain.
- Admins are either members of the Entra group in `AZURE_AD_ADMIN_GROUP_ID` (requires the app registration to emit the **groups** claim) or users with app role **`Admin`**. Group members must be **direct** members.
- Microsoft Graph **User.Read** (delegated) with admin consent.
- Exclude the health check from auth: in `authsettingsV2`, set `globalValidation.excludedPaths = ["/api/health"]`.

### App settings
| Name | Value |
|---|---|
| `APP_ENV` | `dev`, or `prod` in production. Any value other than `prod` or blank marks emails `[TEST – …]` with a test banner; it never stops emails from sending. If unset on App Service it defaults to `dev`. |
| `AUTH_MODE` | `easyauth` |
| `AZURE_AD_ADMIN_GROUP_ID` | Object ID of the Purchasing admins group |
| `DEMO_MODE` | `true` only for a demo: sample lists instead of SharePoint. Emails are sent if `GRAPH_*` is set, otherwise written to `/home/data/outbox`. Remove for real use. |
| `APP_BASE_URL` | `https://app-wus2-purreq-dv.azurewebsites.net` |
| `DB_PATH` | `/home/data/po_intake.db` |
| `GRAPH_APP_ID`, `GRAPH_TENANT_ID` | Graph app registration (separate from the Easy Auth one) |
| `GRAPH_CLIENT_SECRET` | Key Vault reference |
| `GRAPH_SHARED_MAILBOX` | **Sender**: a real user or shared mailbox the Graph app may send as (not a distribution group, which Graph rejects with `ErrorInvalidUser`) |
| `EMAIL_TO` | Default recipient(s), comma-separated; used only until a Purchasing admin saves recipients on the Admin page. |
| `SP_SITE_URL` | e.g. `https://<tenant>.sharepoint.com/sites/<Purchasing site>` |
| `SP_LISTS_PATH` | Path in the site's Documents library, e.g. `PO Intake/PO Intake Lists.xlsx` |
| `BLOB_ACCOUNT_URL` | `https://<storage account>.blob.core.windows.net` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (packages are bundled in the zip) |

There must be no `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` settings, because they override the managed identity.

### Graph app registration (application permissions, admin consent)
- **`Mail.Send`**: sends the submission email.
- **`Mail.ReadWrite`**: needed **only** when a request's PDFs total 3 MB or more (Graph needs a draft message plus an upload session for large attachments). Without it, small submissions still email fine, and large ones are saved with "Email failed" so an admin can resend after the permission is added.
- An **Exchange Application Access Policy** restricting the app to the PO shared mailbox (covers both mail permissions).
- **`Sites.Selected`**, with a read grant on the SharePoint site holding the lists workbook.

### Storage account
- Private containers `attachments` and `backups`, public access off, soft delete 7–14 days, lifecycle rule deleting `backups` after 30 days.
- The App Service managed identity needs **Storage Blob Data Contributor**.

### Lists workbook
`PO Intake Lists.xlsx` in the SharePoint folder, with an `Approvers` sheet:
- Column A is the approver's email.
- Column B is their display name.
- An optional `Active` column (`N` hides a row).

Use `backend/sample_data/PO Intake Lists.xlsx` as the template. A refresh that finds a problem (missing sheet, duplicate code) keeps the previous lists and shows the error on the Admin page.

## How it works

```
Browser ── Easy Auth (Entra ID) ──► App Service: FastAPI
                                     ├─ /api/*  requests, lookups, admin
                                     ├─ /*      React build (backend/static)
                                     ├─ SQLite  /home/data/po_intake.db (no WAL, 1 instance)
                                     ├─ Blob    attachments/<PR-number>/<guid>.pdf, nightly DB backups
                                     ├─ Graph   sendMail from the PO mailbox
                                     └─ Graph   SharePoint lists workbook (nightly + on demand)
```

- Request numbers are `PR-<year>-<0001>`.
- A request is saved before the email is sent. If the email fails, the request shows "Email failed" with the error, and admins can resend it.
- Nightly jobs (09:00 / 09:30 UTC, about 1–2 AM Pacific) refresh the lists and back up the database.
