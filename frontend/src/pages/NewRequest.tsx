import { forwardRef, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Controller, useForm, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText, FileUp, Mail, Send, ShieldAlert, X } from "lucide-react";
import { getLookups, submitRequest, type RequestDetail } from "../api";
import { fileSize, money } from "../format";
import Combobox from "../components/Combobox";
import { EmailBadge, ErrorBox, PageLoader, Spinner, useMe, useToast } from "../components/ui";

const MAX_FILES = 5;
const MAX_MB = 20;
const req = (label: string) => z.string().trim().min(1, `${label} is required`);

const schema = z.object({
  request_type: req("Request type"),
  title: z.string().trim().min(3, "Give the request a short title"),
  department: z.string().trim().optional(),
  needed_by: z.string().optional(),
  job_number: req("Job number"),
  cost_center: req("Cost center"),
  vendor_name: z.string().trim().min(2, "Vendor name is required"),
  is_new_vendor: z.boolean(),
  vendor_category: req("Vendor category"),
  vendor_contact_name: z.string().trim().optional(),
  vendor_contact_email: z.string().trim().optional(),
  expense_class: z.enum(["OpEx", "CapEx"], { error: "Choose OpEx or CapEx" }),
  expense_type: req("Expense type"),
  capex_project_number: z.string().trim().optional(),
  amount: z.number({ error: "Enter the total amount" }).positive("Amount must be more than 0"),
  currency: z.string(),
  billing_type: req("Billing type"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  is_budgeted: z.boolean(),
  nda_in_place: z.boolean(),
  vendor_data_access: z.boolean(),
  description: z.string().trim().min(10, "Add a few sentences on what this is for (10+ characters)"),
}).superRefine((v, ctx) => {
  if (v.is_new_vendor && !v.vendor_contact_name) ctx.addIssue({ code: "custom", path: ["vendor_contact_name"], message: "Contact name is required for new vendors" });
  if (v.is_new_vendor && !z.email().safeParse(v.vendor_contact_email).success)
    ctx.addIssue({ code: "custom", path: ["vendor_contact_email"], message: "Enter a valid contact email" });
  if (v.expense_class === "CapEx" && !v.capex_project_number) ctx.addIssue({ code: "custom", path: ["capex_project_number"], message: "Capital project number is required for CapEx" });
  if (v.start_date && v.end_date && v.end_date < v.start_date) ctx.addIssue({ code: "custom", path: ["end_date"], message: "End date is before start date" });
});
type FormValues = z.infer<typeof schema>;

const DEFAULTS: Partial<FormValues> = {
  request_type: "", title: "", department: "", needed_by: "", job_number: "", cost_center: "", vendor_name: "",
  is_new_vendor: false, vendor_category: "", vendor_contact_name: "", vendor_contact_email: "", expense_type: "",
  capex_project_number: "", currency: "USD", billing_type: "", start_date: "", end_date: "",
  is_budgeted: true, nda_in_place: false, vendor_data_access: false, description: "",
};

function Field({ label, error, required, hint, span, htmlFor, children }: {
  label: string; error?: FieldError; required?: boolean; hint?: string; span?: boolean; htmlFor?: string; children: ReactNode;
}) {
  return (
    <div className={`field ${span ? "span-2" : ""} ${error ? "invalid" : ""}`}>
      <label htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden>*</span>}</label>
      {children}
      {error ? <span className="field-error" role="alert">{error.message}</span> : hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function Section({ step, title, intro, children }: { step: number; title: string; intro: string; children: ReactNode }) {
  return (
    <div className="form-section">
      <div className="form-section__intro"><h2><span className="step">{step}</span>{title}</h2><p>{intro}</p></div>
      <div className="fields">{children}</div>
    </div>
  );
}

// forwardRef so react-hook-form's register() can reach the checkbox (React 18 drops `ref` from plain props).
const Toggle = forwardRef<HTMLInputElement, { label: string } & React.InputHTMLAttributes<HTMLInputElement>>(
  ({ label, ...rest }, ref) => (
    <label className="toggle-row">
      <span>{label}</span>
      <span className="switch"><input type="checkbox" ref={ref} {...rest} /><i /></span>
    </label>
  ),
);

function Success({ r, onAnother }: { r: RequestDetail; onAnother: () => void }) {
  return (
    <div className="page">
      <div className="card success">
        <div className="success__icon"><CheckCircle2 size={40} aria-hidden /></div>
        <h1>Request submitted</h1>
        <div className="ref">{r.request_number}</div>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          {r.request_type} · {r.vendor_name} · {money(r.amount, r.currency)}
        </p>
        <p style={{ margin: "0 0 18px" }}><EmailBadge status={r.email_status} /></p>
        <p className="muted">
          {r.email_status === "Sent"
            ? "Purchasing has your request and documents. You were copied on the email, and replies from Purchasing come straight to you."
            : "Your request is saved. The email to Purchasing didn't go out yet; the Purchasing team can see it and will resend it."}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
          <Link to={`/requests/${r.request_number}`} className="btn btn-primary">View request</Link>
          <button type="button" className="btn btn-secondary" onClick={onAnother}>Submit another</button>
        </div>
      </div>
    </div>
  );
}

export default function NewRequest() {
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: lists, isLoading, error } = useQuery({ queryKey: ["lookups"], queryFn: getLookups, staleTime: 5 * 60_000 });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [drag, setDrag] = useState(false);
  const [done, setDone] = useState<RequestDetail | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { register, control, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: DEFAULTS, mode: "onTouched",
  });
  const isNewVendor = watch("is_new_vendor");
  const expenseClass = watch("expense_class");
  const dataAccess = watch("vendor_data_access");
  const amount = watch("amount");
  const currency = watch("currency");

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const blankToNull = (s?: string) => (s ? s : null);
      return submitRequest({
        ...v,
        department: blankToNull(v.department), needed_by: blankToNull(v.needed_by), start_date: blankToNull(v.start_date),
        end_date: blankToNull(v.end_date), vendor_contact_name: blankToNull(v.vendor_contact_name),
        vendor_contact_email: blankToNull(v.vendor_contact_email), capex_project_number: blankToNull(v.capex_project_number),
      }, files);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      setDone(r);
      window.scrollTo({ top: 0 });
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Submit failed", true),
  });

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileError("");
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") { setFileError(`"${f.name}" isn't a PDF.`); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { setFileError(`"${f.name}" is over ${MAX_MB} MB.`); continue; }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length >= MAX_FILES) { setFileError(`You can attach up to ${MAX_FILES} files.`); break; }
      next.push(f);
    }
    setFiles(next);
  }

  const onSubmit = handleSubmit((v) => {
    if (files.length === 0) { setFileError("Attach the SOW, quote or contract (PDF)."); return; }
    mutation.mutate(v);
  }, () => {
    if (files.length === 0) setFileError("Attach the SOW, quote or contract (PDF).");
    toast("Some required details are missing. Check the highlighted fields.", true);
  });

  if (done) return <Success r={done} onAnother={() => { setDone(null); reset(DEFAULTS); setFiles([]); }} />;
  if (isLoading) return <PageLoader />;
  if (error || !lists) return <div className="page"><ErrorBox error={error} /></div>;

  const options = (xs: { code: string; label: string }[]) => xs.map((o) => <option key={o.code} value={o.code}>{o.label}</option>);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>New purchasing request</h1>
          <p>Fields marked <span className="req">*</span> are required. Purchasing gets everything in one email, with your PDFs attached.</p>
        </div>
      </div>

      <form className="card" onSubmit={onSubmit} noValidate>
        <Section step={1} title="Request" intro="What do you need Purchasing to do?">
          <Field label="Request type" required error={errors.request_type} htmlFor="request_type">
            <select id="request_type" className="select" {...register("request_type")}>
              <option value="">Select…</option>{options(lists.request_types)}
            </select>
          </Field>
          <Field label="Needed by" error={errors.needed_by} htmlFor="needed_by" hint="Leave blank if there's no hard deadline">
            <input id="needed_by" type="date" className="input" {...register("needed_by")} />
          </Field>
          <Field label="Title" required span error={errors.title} htmlFor="title" hint="A short name Purchasing will recognise, e.g. “2027 Show Wi-Fi services”">
            <input id="title" className="input" maxLength={200} {...register("title")} />
          </Field>
          <Field label="Requested by" htmlFor="requester">
            <input id="requester" className="input" value={me ? `${me.name} (${me.email})` : ""} disabled />
          </Field>
          <Field label="Department" error={errors.department} htmlFor="department">
            <input id="department" className="input" maxLength={200} {...register("department")} />
          </Field>
        </Section>

        <Section step={2} title="Charge to" intro="Which job and cost center will this be billed to?">
          <Field label="Job number" required error={errors.job_number} htmlFor="job_number">
            <Controller control={control} name="job_number" render={({ field }) => (
              <Combobox id="job_number" options={lists.job_numbers} value={field.value} invalid={!!errors.job_number}
                onChange={(c) => { field.onChange(c); field.onBlur(); }} placeholder="Search by number or name" />
            )} />
          </Field>
          <Field label="Cost center" required error={errors.cost_center} htmlFor="cost_center">
            <Controller control={control} name="cost_center" render={({ field }) => (
              <Combobox id="cost_center" options={lists.cost_centers} value={field.value} invalid={!!errors.cost_center}
                onChange={(c) => { field.onChange(c); field.onBlur(); }} placeholder="Search by code or name" />
            )} />
          </Field>
        </Section>

        <Section step={3} title="Vendor" intro="Who is the supplier? New vendors need a contact so Purchasing can set them up.">
          <Field label="Vendor name" required error={errors.vendor_name} htmlFor="vendor_name">
            <input id="vendor_name" className="input" maxLength={200} {...register("vendor_name")} />
          </Field>
          <Field label="Vendor category" required error={errors.vendor_category} htmlFor="vendor_category">
            <select id="vendor_category" className="select" {...register("vendor_category")}>
              <option value="">Select…</option>{options(lists.vendor_categories)}
            </select>
          </Field>
          <div className="field span-2"><Toggle label="This is a new vendor (not yet set up at GES)" {...register("is_new_vendor")} /></div>
          {isNewVendor && (
            <div className="reveal">
              <Field label="Vendor contact name" required error={errors.vendor_contact_name} htmlFor="vendor_contact_name">
                <input id="vendor_contact_name" className="input" {...register("vendor_contact_name")} />
              </Field>
              <Field label="Vendor contact email" required error={errors.vendor_contact_email} htmlFor="vendor_contact_email">
                <input id="vendor_contact_email" type="email" className="input" {...register("vendor_contact_email")} />
              </Field>
            </div>
          )}
        </Section>

        <Section step={4} title="Financials" intro="How much, how it's billed, and whether it's operating or capital spend.">
          <Field label="OpEx or CapEx" required error={errors.expense_class as FieldError | undefined}>
            <Controller control={control} name="expense_class" render={({ field }) => (
              <div className="segmented" role="group" aria-label="OpEx or CapEx">
                {(["OpEx", "CapEx"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={field.value === v} onClick={() => { field.onChange(v); field.onBlur(); }}>{v}</button>
                ))}
              </div>
            )} />
          </Field>
          <Field label="Expense type" required error={errors.expense_type} htmlFor="expense_type">
            <select id="expense_type" className="select" {...register("expense_type")}>
              <option value="">Select…</option>{options(lists.expense_types)}
            </select>
          </Field>
          {expenseClass === "CapEx" && (
            <div className="reveal">
              <Field label="Capital project number" required error={errors.capex_project_number} htmlFor="capex_project_number">
                <input id="capex_project_number" className="input" {...register("capex_project_number")} />
              </Field>
            </div>
          )}
          <Field label="Total amount" required error={errors.amount} htmlFor="amount"
            hint={amount > 0 ? money(amount, currency) : "Total value of the SOW, PO or contract"}>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="amount" type="number" min="0" step="0.01" inputMode="decimal" className="input" {...register("amount", { valueAsNumber: true })} />
              <select className="select" style={{ width: 96 }} aria-label="Currency" {...register("currency")}>
                {lists.currencies.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Billing" required error={errors.billing_type} htmlFor="billing_type">
            <select id="billing_type" className="select" {...register("billing_type")}>
              <option value="">Select…</option>{lists.billing_types.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Start date" error={errors.start_date} htmlFor="start_date">
            <input id="start_date" type="date" className="input" {...register("start_date")} />
          </Field>
          <Field label="End date" error={errors.end_date} htmlFor="end_date">
            <input id="end_date" type="date" className="input" {...register("end_date")} />
          </Field>
          <div className="field span-2"><Toggle label="This spend is in the approved budget" {...register("is_budgeted")} /></div>
        </Section>

        <Section step={5} title="Risk & compliance" intro="Helps Purchasing spot when legal or IT security needs to be involved.">
          <div className="field"><Toggle label="NDA already in place" {...register("nda_in_place")} /></div>
          <div className="field"><Toggle label="Vendor will access GES data or systems" {...register("vendor_data_access")} /></div>
          {dataAccess && (
            <div className="alert alert-warn span-2" style={{ gridColumn: "1 / -1" }}>
              <ShieldAlert size={18} aria-hidden /><div>Vendors that access GES data or systems may need an IT security review. Purchasing will let you know.</div>
            </div>
          )}
        </Section>

        <Section step={6} title="Details & documents" intro={`Explain the business need and attach the SOW, quote or contract. PDF only, up to ${MAX_FILES} files, ${MAX_MB} MB each.`}>
          <Field label="Description / business justification" required span error={errors.description} htmlFor="description">
            <textarea id="description" className="textarea" maxLength={5000} {...register("description")}
              placeholder="What is being purchased, why, and anything Purchasing should know (renewal of an existing contract, sole source, deadlines)…" />
          </Field>
          <div className={`field span-2 ${fileError ? "invalid" : ""}`}>
            <span className="label">Attachments<span className="req" aria-hidden>*</span></span>
            <div
              className={`drop ${drag ? "drag" : ""}`} role="button" tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            >
              <div className="drop__icon"><FileUp size={22} aria-hidden /></div>
              <div><strong>Click to choose PDFs</strong> or drag them here</div>
              <div className="small muted">SOW, quote, contract or supporting documents</div>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {fileError && <span className="field-error" role="alert">{fileError}</span>}
            {files.length > 0 && (
              <ul className="files">
                {files.map((f) => (
                  <li key={f.name + f.size} className="file">
                    <FileText size={20} className="file__icon" aria-hidden />
                    <span className="file__name">{f.name}</span><span className="file__size">{fileSize(f.size)}</span>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles(files.filter((x) => x !== f))}><X size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <div className="form-footer">
          <span className="small muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mail size={16} aria-hidden /> Sent to the Purchasing mailbox. You'll be copied, and replies come to you.
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn btn-secondary" disabled={mutation.isPending}
              onClick={() => { reset(DEFAULTS); setFiles([]); setFileError(""); }}>Clear</button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={mutation.isPending}>
              {mutation.isPending ? <><Spinner /> Submitting…</> : <><Send size={17} aria-hidden /> Submit request</>}
            </button>
          </div>
        </div>
        {mutation.isError && (
          <div style={{ padding: "0 24px 20px" }}>
            <div className="alert alert-danger"><AlertTriangle size={18} aria-hidden /><div>{(mutation.error as Error).message}</div></div>
          </div>
        )}
      </form>
    </div>
  );
}
