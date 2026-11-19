# GES Coding Standards: Dashboards and Internal Web Apps

**Version 1.0 · 2026-11-19 · Owner: GES IT Applications**

These standards come from building and running five GES apps: Oracle Dashboard (v1/v2), SmartSchedule (Electrical Scheduling), AIS Dashboard (azure-logicapps-dashboard), Exhibitor Exchange Manager, and the Purchasing Request Portal. Each rule exists because something went wrong without it. The **Why** lines say what.

Words used: **must** = required; **should** = the default, so write down why if you deviate.

---

## 1. Default stack

| Layer | Default | Notes |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript (strict) | Plain CSS with design tokens (section 3). No CSS framework. |
| Data fetching | TanStack Query | One `api()` wrapper handles auth redirects and errors. |
| Forms | react-hook-form + zod | Validate in the browser for UX, and **again on the server**. |
| Charts | Recharts | Follow the chart rules in 3.6. |
| Icons | lucide-react | |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2 + pydantic-settings | |
| Database | SQLite on `/home/data` for small single-instance apps; Azure SQL when multiple instances or heavy reporting are needed | |
| Hosting | One Linux App Service (code, not container) on the GES private network (ASE or private endpoint) | FastAPI serves both `/api/*` and the built React app, so there is one origin and no CORS. |
| Auth | App Service Easy Auth (Entra ID) | Section 4. |
| Email/SharePoint | Microsoft Graph, app-only via MSAL | Section 5.4. |

Streamlit is fine for single-user analysis tools. For anything with several pages, roles, or forms, use the stack above.

## 2. Repository layout

```
<app>/
  backend/
    app/
      main.py          # FastAPI app, lifespan (DB init, scheduler), SPA serving, error handler
      config.py        # pydantic-settings; the ONLY place env vars are read
      auth.py          # Easy Auth principal -> User; require_admin
      db.py, models.py, schemas.py
      routers/<area>.py      # APIRouter(prefix="/api/<area>")
      services/<thing>.py    # Graph, storage, email, loaders: no FastAPI imports
    tests/             # pytest
    requirements.txt   # pinned or lower-bounded
    startup.sh         # App Service startup command
    .env.example       # every setting, no secrets
  frontend/
    src/
      api.ts           # typed client + all endpoint functions
      format.ts        # dates, money, etc.
      styles/tokens.css, app.css
      components/      # shared UI (Layout, ui.tsx)
      pages/           # one file per route
      assets/          # logos (imported, so Vite fingerprints them)
  docs/
  scripts/package.py   # builds the deploy zip
  deploy.ps1
  .gitattributes       # *.sh eol=lf
  README.md            # local dev, deploy, one-time environment setup
```

## 3. Look and feel

### 3.1 Brand tokens
- All colours **must** come from `tokens.css` CSS variables. Components never hard-code hex.
- GES palette:

| Token | Hex | Use |
|---|---|---|
| `--ges-navy-900` | `#0c2536` | Header, hero, headings |
| `--ges-navy-800` | `#063c59` | Header gradient, emphasis |
| `--ges-teal` | `#7dc3cd` | Header accent rule, highlights |
| `--ges-lime` | `#c3d735` | Active nav, primary call to action on dark backgrounds |
| `--ges-orange` | `#e27124` | Second data series (for example CapEx) |
| `--ges-gold` | `#f7bc55` | Attention accents |
| `--primary` | `#0067b1` | Buttons and links on light surfaces |

- Pages use a light surface (`#f3f5f8` background, white cards). Dark-only themes made long tables and forms tiring to read.

### 3.2 Logo
- **White logo (`GES-logo-white.png`) on dark backgrounds. Black logo (`GES-logo.webp`) on light backgrounds.** *Why: the black logo on the dark SmartSchedule sidebar was nearly invisible, and it took several rounds to fix.*
- Import the logo from `src/assets` (`import logo from "../assets/GES-logo-white.png"`) rather than putting it in `public/`. *Why: a catch-all SPA route returned HTML for `/GES-logo.webp`, so the Exhibitor Exchange logo never loaded in Azure.*
- Header layout: logo (about 30px high), 1px divider, app name, then nav. Logo height stays the same across apps.

### 3.3 Layout pattern
- **Header:** sticky, 64px, navy gradient, 3px teal bottom rule. Nav tabs show the active tab with a lime underline. On the right: user name and email, an initials avatar, an `ADMIN` chip when the user is an admin, and sign out (`/.auth/logout`).
- **Dashboard page:** a hero banner with greeting and main call to action, then a row of 4 KPI tiles, then charts, then a recent-items table.
- **KPI tile:** uppercase 11px label, 30px value, one-line context, 4px coloured left accent. Make the tile clickable when it maps to a filter.
- **Forms:** numbered sections, with a short "why we ask" intro on the left and fields in a 2-column grid. Conditional fields appear in a highlighted panel. The submit bar is sticky. Mark required fields with `*`.
- **Tables:** uppercase 11px headers, the whole row clickable, numbers right-aligned with tabular figures, sortable headers, a footer with count and total.
- Every data view has **loading** (skeleton), **empty** (icon + next action), and **error** states.

### 3.4 Content rules
- **Timestamps are shown in Pacific time as `2026-10-27 13:20 PT`** (24-hour, with a `PT` suffix). Store UTC and convert only when displaying. Calendar dates (no time) display as `YYYY-MM-DD`. *Why: users read UTC military time as wrong.*
- Money: `$85,000`. Use the compact form (`$3M`) only in KPI tiles.
- **Status is never colour alone.** A badge is colour + icon + label. Status colours (ok, warn, danger, info) are reserved for status and never reused for chart series.
- **Contrast:** body text at least 4.5:1, large text and UI parts at least 3:1. Never grey-on-white for important text. *Why: two SmartSchedule rounds were spent fixing barely visible sidebar text.*
- **Filters, sort and search live in the URL** (`?status=open&sort=amount`), so Back, refresh and shared links return to the same view. *Why: users asked to "return to the page I am on".*
- Write for business users: plain words, no stack traces, no internal IDs except reference numbers.

### 3.5 Typography and assets
- Use the system font stack `"Segoe UI", -apple-system, …`. **Don't load web fonts or CDN assets.** *Why: private-network apps can't always reach the internet, and external fonts slow every page.*
- Use lucide icons at 16–18px in UI and 13px in badges.

### 3.6 Charts
- Pick the form first: a single number is a KPI tile, change over time is a bar or line chart, part-of-whole with 2–3 parts is a split bar.
- **Never use two y-axes.** Plot two measures as two charts.
- One series = one hue (`--viz-1`), with no legend because the title names it. Two or more series get a legend plus direct labels.
- Validate any new categorical palette for colour-blind separation and contrast before using it. `--viz-1` blue `#1d6fb8` and `--viz-2` orange `#e27124` pass on white.
- Bars have a 4px rounded top, a recessive grid with no vertical lines, a hover tooltip, and an `aria-label` summarising the data.
- Disable chart animations if screenshots or exports are needed.

### 3.7 Accessibility and responsiveness
- Every input has a `<label htmlFor>`, errors use `role="alert"`, and icon-only buttons have `aria-label`.
- Keyboard: comboboxes support arrows, Enter and Escape, and focus is always visible (`:focus-visible` ring).
- Respect `prefers-reduced-motion`.
- Layouts must work from 1440px down to phone width. Grids collapse with `minmax(0, 1fr)`, never plain `1fr`, so long content can't force horizontal scroll.

## 4. Authentication and authorization (Easy Auth)

- **Must** use App Service Easy Auth with "Require authentication" and "302 redirect to login". The app doesn't implement login.
- The backend reads the user **only** from `X-MS-CLIENT-PRINCIPAL` (base64 JSON; add `=` padding before decoding). Fail closed: no header means 401.
- **Don't issue your own JWTs or keep tokens in localStorage or the URL.** *Why: AIS's "Easy Auth + JWT handoff" added a second secret, a token in the URL, and three rewrites.*
- Roles come from **Entra app roles** (the `roles` claim) or an admin security group in a setting such as `AZURE_AD_ADMIN_GROUP_ID` (the `groups` claim). Never hard-code group GUIDs or user emails in code.
- Local development uses `AUTH_MODE=dev` with a fake user. The code **must refuse dev auth when `WEBSITE_SITE_NAME` is set** (that is, on App Service).
- Frontend: on 401, redirect to `/.auth/login/aad?post_login_redirect_uri=<current path>`. Sign-out goes to `/.auth/logout?post_logout_redirect_uri=/`.
- Authorization is enforced **in server queries** (`WHERE requester_email = :me` unless admin), never only by hiding UI. Return the same 404 for "doesn't exist" and "not yours".
- Entra setup checklist, each item learned the hard way:
  - Add a redirect URI for **every hostname** (`https://<host>/.auth/login/aad/callback` for azurewebsites.net and any custom domain). *Why: a missing one caused HTTP 431 cookie pile-ups.*
  - Only **direct** group members get in, because nested groups don't count (AADSTS50105). Infra adds members.
  - Add Graph `User.Read` with admin consent on **every environment's** app registration. *Why: the AIS production registration showed an "Approval required" prompt that DEV didn't.*
  - Exclude `/api/health` from Easy Auth (`excludedPaths`) so the platform health check works.
- Claude and curl can't get past Easy Auth. UI checks happen in a browser, preferably InPrivate.

## 5. Backend rules

### 5.1 Configuration
- Read every setting through one `Settings` class (pydantic-settings). Names are UPPER_SNAKE with a prefix (`GRAPH_*`, `SP_*`, `BLOB_*`).
- Business rules that change (lists, mailboxes, schedules) go in settings or a data source, not code.
- App Service app settings don't strip `# comments`, but `.env` files do. Don't put comments on setting values.

### 5.2 API behaviour
- All API routes live under `/api/`. The SPA catch-all **must never answer `/api/*`** with HTML: unknown API paths return a JSON 404. *Why: the frontend crashed with "JSON.parse: unexpected character" when bad API routes returned index.html.*
- Don't put user data containing `/` in path segments. Starlette decodes `%2F`. Use query parameters instead.
- A global exception handler logs the full error with an 8-character reference and returns `"Something went wrong. Reference: ab12cd34"`. Never send stack traces to the browser.
- **Never swallow exceptions into empty results.** Log a warning with the real exception. *Why: AIS showed "Unavailable" for hours with nothing in the logs.*
- Every outbound HTTP call has a timeout (10–60 seconds).
- Security headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`. API responses also get `Cache-Control: no-store`. Fingerprinted `/assets/*` files are cached for a year, and `index.html` gets `no-cache`.
- Disable `/docs` and `/openapi.json` outside local development.

### 5.3 Data and files
- **Runtime data lives under `/home/data`**, never in `wwwroot`. *Why: AIS lost `metadata.json` on every deploy until it moved there. Under run-from-package, wwwroot is read-only.*
- Don't delete `/home/data/.auth`, which holds the Easy Auth token store.
- SQLite on `/home` (an SMB share): **no WAL mode**, `busy_timeout=5000`, **one instance and one worker process**, and a nightly `sqlite3` backup-API copy to Blob.
- Uploaded files go to Blob Storage through the managed identity (`DefaultAzureCredential`). Validate type by **content** (for example `%PDF-`), not file extension, and enforce count and size limits on the server. Users download through an authorised endpoint, never a public or SAS URL.
- When a value comes from a changeable list (job number, cost center), store **both the code and the description** at write time.
- When loading reference lists from Excel or SharePoint, validate the whole file first and replace in one transaction. **A bad file must never empty the dropdowns.** Keep the last good data and show the error to admins.

### 5.4 Microsoft Graph
- Use app-only auth (MSAL `ConfidentialClientApplication`, created **once** so the token cache works).
- Grant least privilege: `Mail.Send` for sendMail, plus `Mail.ReadWrite` only if you need drafts (attachments over 3 MB). Scope both to specific mailboxes with an **Exchange Application Access Policy**. For SharePoint, use `Sites.Selected` rather than `Sites.Read.All`.
- Attachments under 3 MB in total go through `sendMail`. Larger ones need draft + `createUploadSession` (don't send an Authorization header to the upload URL).
- Escape all user text in HTML email bodies.
- An email failure must not lose data. Save first, record `EmailStatus = Failed` plus the error, and give admins a Resend button.

### 5.5 Background jobs
- Use APScheduler, started in the FastAPI **lifespan** hook (not on first page view), with Always On enabled. Jobs log their failures.

## 6. Security and secrets

- Secrets live in App Service settings as **Key Vault references** (`@Microsoft.KeyVault(SecretUri=…)`, versionless). They never go in code, git, or chat.
- **Never print app settings or environment variables**, including `export $(…)` or `env` in Kudu SSH. *Why: a Kudu command dumped every secret and infra had to rotate them all.* Query setting **names** only.
- Remove leftover `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` settings. They silently override the managed identity in `DefaultAzureCredential`.
- When copying secrets with `az` on Windows, strip `\r` (`tr -d '\r'`).
- `npm audit` and dependency updates are part of every release. Don't ship known advisories.
- Infra owns app settings and Azure resources. **Ask before changing settings or creating resources**, and report every change.

## 7. Deployment (private network)

- **Build agents outside GES can't reach the SCM endpoint of an app on a private ASE or behind a private endpoint.** GitHub-hosted runners fail with ENOTFOUND. Deploy from the GES network/VPN with `deploy.ps1`, or from the self-hosted Azure DevOps InfraPool agents. Azure DevOps is the target pipeline platform.
- The deploy script runs tests, builds the frontend, packages, deploys, and polls. **Never deploy a frontend change without rebuilding.** *Why: AIS shipped a fix to source but not to `dist`, so production ran old code.* Don't commit build output; the script always rebuilds it.
- **Build the zip with `scripts/package.py` or `git -c core.autocrlf=false archive`. Never use PowerShell `Compress-Archive`** for nested folders. *Why: it writes backslash paths and Linux extraction fails.*
- **`*.sh` files keep LF endings** (`.gitattributes`). *Why: a CRLF `startup.sh` gives "not found", exit 127, and a 503.*
- Startup command: `bash /home/site/wwwroot/startup.sh`. The script reuses a venv on `/home` keyed by a hash of `requirements.txt`, so restarts are fast. Set `SCM_DO_BUILD_DURING_DEPLOYMENT=false`. *Why: the Oryx build hung for more than 15 minutes on the ASE.*
- Check `linuxFxVersion` is `PYTHON|3.12`. *Why: a blank value made Kudu treat the app as PHP.*
- Use `az webapp deploy --type zip --async true`, then poll `https://<scm>/api/deployments/latest` (status 4 = success). The synchronous client hangs or returns 502.
- After repeated failed boots, the platform stops the container even though the portal says Running. **Restart after deploying a fix.**
- Scripts must not change the global `az` subscription. Pass `--subscription` instead.
- `az.cmd` runs through cmd.exe and splits on `&`. Pass settings that contain `&` or parentheses with `--settings @file.json`.
- Git Bash mangles `/subscriptions/...` paths. Set `MSYS_NO_PATHCONV=1`.
- After deploying, check in a browser (InPrivate), hard-refresh, and confirm the `index-<hash>.js` name changed.
- Logs: `az webapp log tail`, or Kudu `/api/logs/docker` (`*_default_docker.log` is the app).

## 8. Testing

- Backend: pytest with FastAPI `TestClient`. **Required tests:** auth (no header, bad header, admin vs user), authorization (users can't see others' records), validation (bad files, conditional required fields), SPA routing (unknown `/api` returns a JSON 404), and any loader's bad-input handling.
- Mock external services (Graph, Blob) at the service-module boundary. Tests must not need network access or secrets.
- Frontend: `tsc` strict type-check on every build. Review the UI with real screenshots at desktop and phone widths before handing over.
- Demo data must refuse to load unless `APP_ENV=local` or an explicit `DEMO_MODE=true`. Demo deployments show a visible "Demo environment" banner and never send real email. Use fictional people (`@example.com`) in seed data, because repos may be public.

## 9. Source control and process

- Branch flow: feature branch, then `DEV` (deploy and test), then `main` (production). **Never commit directly to `main`.** Merge with `--no-ff`. Apply branch policies with the `devops-guardrails` skill.
- Use conventional commit messages (`feat:`, `fix:`, `build:`, `docs:`, `chore:`).
- AI assistants don't commit, push, deploy, or change Azure resources without explicit approval. They also don't add co-author trailers.
- Several GES apps look alike. **Confirm which app (by URL) before making UI changes.** *Why: a logo change once went to the wrong app.*

## 10. Documentation

- `README.md`: what the app does, local development, deployment, and **one-time environment setup** (Entra, Easy Auth, app settings, storage, Graph permissions).
- `.env.example` lists every setting with a comment.
- User guides are short, non-technical `.docx` files for business users.

## 11. Go-live checklist

- [ ] Easy Auth: require auth, 302, redirect URIs for every hostname, `/api/health` excluded, `Admin` app role assigned to a group with direct members
- [ ] `User.Read` and app permissions consented in **this** environment's registration
- [ ] App settings set (Key Vault references for secrets); no leftover `AZURE_CLIENT_*`
- [ ] `linuxFxVersion = PYTHON|3.12`, startup command set, Always On, HTTPS only, TLS 1.2, FTP off
- [ ] Single instance if SQLite; `/home/data` exists; nightly backup verified in Blob
- [ ] Graph: Exchange Application Access Policy and `Sites.Selected` grant in place; test email received with attachment
- [ ] Health check green; deploy from a clean clone works; README setup steps followed by someone else
- [ ] Browser check (InPrivate) as a normal user **and** as an admin
