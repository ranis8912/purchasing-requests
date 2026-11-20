import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronLeft, ExternalLink, FileText, Mail, RefreshCw, Save } from "lucide-react";
import { attachmentUrl, getRequest, resendEmail, updateNotes, updateStatus, type RequestDetail as Detail } from "../api";
import { dateTimePT, day, fileSize, money } from "../format";
import { CapitalTag, Card, EmailBadge, Empty, ErrorBox, PageLoader, Spinner, StatusBadge, UrgentTag, useMe, useToast } from "../components/ui";

const STATUSES = ["Pending Review", "In Review", "Info Needed", "PO/Req Created", "Contract Signed", "Closed", "Rejected"];
const yesNo = (b: boolean) => (b ? "Yes" : "No");

function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="dl">
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v === null || v === undefined || v === "" ? "—" : v}</dd></div>)}
    </dl>
  );
}

function AdminPanel({ r }: { r: Detail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState(r.status);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState(r.admin_notes ?? "");
  useEffect(() => { setStatus(r.status); setNotes(r.admin_notes ?? ""); }, [r]);

  const done = (msg: string) => (updated: Detail) => {
    qc.setQueryData(["request", r.request_number], updated);
    qc.invalidateQueries({ queryKey: ["requests"] });
    toast(msg);
  };
  const fail = (e: Error) => toast(e.message, true);
  const statusMut = useMutation({ mutationFn: () => updateStatus(r.request_number, status, note), onSuccess: (u) => { setNote(""); done("Status updated")(u); }, onError: fail });
  const notesMut = useMutation({ mutationFn: () => updateNotes(r.request_number, notes), onSuccess: done("Notes saved"), onError: fail });
  const emailMut = useMutation({
    mutationFn: () => resendEmail(r.request_number),
    onSuccess: (u) => { done(u.email_status === "Sent" ? "Email sent to Procurement" : "Email failed again")(u); }, onError: fail,
  });

  return (
    <Card title="Purchasing actions" subtitle="Only Purchasing admins see this panel">
      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="note">Note for the timeline</label>
        <textarea id="note" className="textarea" style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={status === "Info Needed" ? "What's missing? e.g. W-9 and certificate of insurance" : "Optional"} />
      </div>
      <button type="button" className="btn btn-primary" style={{ marginTop: 12, width: "100%" }}
        disabled={statusMut.isPending || (status === r.status && !note.trim())} onClick={() => statusMut.mutate()}>
        {statusMut.isPending ? <Spinner /> : <Save size={16} aria-hidden />} Update status
      </button>

      <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "20px 0" }} />
      <div className="field">
        <label htmlFor="admin_notes">Internal notes</label>
        <textarea id="admin_notes" className="textarea" style={{ minHeight: 90 }} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Visible to Purchasing admins only (PO number, vendor follow-ups…)" />
      </div>
      <button type="button" className="btn btn-secondary" style={{ marginTop: 10, width: "100%" }}
        disabled={notesMut.isPending || notes === (r.admin_notes ?? "")} onClick={() => notesMut.mutate()}>
        {notesMut.isPending ? <Spinner dark /> : <Save size={16} aria-hidden />} Save notes
      </button>

      <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "20px 0" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span className="small muted">{r.email_sent_at ? `Emailed ${dateTimePT(r.email_sent_at)}` : "Not emailed yet"}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={emailMut.isPending} onClick={() => emailMut.mutate()}>
          {emailMut.isPending ? <Spinner dark /> : <RefreshCw size={15} aria-hidden />} Resend email
        </button>
      </div>
    </Card>
  );
}

export default function RequestDetail() {
  const { number = "" } = useParams();
  const { data: me } = useMe();
  const { data: r, isLoading, error } = useQuery({ queryKey: ["request", number], queryFn: () => getRequest(number) });

  if (isLoading) return <PageLoader />;
  if (error || !r) {
    return (
      <div className="page">
        {error && (error as { status?: number }).status === 404
          ? <div className="card"><Empty title="Request not found"><p>It doesn't exist, or it belongs to someone else.</p><Link to="/requests" className="btn btn-primary">Back to requests</Link></Empty></div>
          : <ErrorBox error={error} />}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="crumbs"><Link to="/requests"><ChevronLeft size={14} aria-hidden style={{ verticalAlign: -2 }} /> Requests</Link><span>/</span><span>{r.request_number}</span></div>
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 15 }}>{r.request_number}</span>
            <StatusBadge status={r.status} />
            <EmailBadge status={r.email_status} />
            {r.is_urgent && <UrgentTag reason={r.urgent_reason} />}
          </div>
          <h1 style={{ marginTop: 6 }}>{r.supplier_name}</h1>
          <p>Project {r.project_number} · CC {r.cost_center} · Submitted {dateTimePT(r.submitted_at)} by {r.requester_name}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ges-navy-900)" }}>{money(r.amount)}</div>
          <CapitalTag capital={r.is_capital_project} />
        </div>
      </div>

      {me?.is_admin && r.email_status === "Failed" && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} aria-hidden />
          <div><strong>The email to Procurement failed.</strong> Use “Resend email” once the issue is fixed.<div className="small" style={{ marginTop: 4, opacity: 0.85 }}>{r.email_error}</div></div>
        </div>
      )}
      {r.status === "Info Needed" && (
        <div className="alert alert-warn" style={{ marginBottom: 20 }}>
          <Mail size={18} aria-hidden /><div><strong>Procurement needs more information.</strong> Check the timeline below and reply to the Procurement email thread.</div>
        </div>
      )}

      <div className="grid grid-3-1">
        <div className="grid" style={{ alignContent: "start" }}>
          {r.is_urgent && (
            <div className="alert alert-danger"><AlertCircle size={18} aria-hidden /><div><strong>Urgent:</strong> {r.urgent_reason}</div></div>
          )}
          <Card title="Stakeholders">
            <Dl items={[
              ["Requester", <>{r.requester_name}<div className="small muted">{r.requester_email}</div></>],
              ["Date submitted", dateTimePT(r.submitted_at)],
              ["Approver", <>{r.approver_name}<div className="small muted">{r.approver_email}</div></>],
              ["Additional PO recipients", r.po_recipients],
            ]} />
          </Card>
          <Card title="Project costing">
            <Dl items={[
              ["PO extension / add-on", yesNo(r.is_po_extension)], ["Previous PO", r.previous_po],
              ["Capital project", yesNo(r.is_capital_project)], ["Capital project number", r.capital_project_number],
              ["Project number", <span className="mono">{r.project_number}</span>],
              ["Task / cost center", <span className="mono">{r.cost_center}</span>],
            ]} />
          </Card>
          <Card title="SOW / quote / order form">
            <Dl items={[
              ["Supplier", r.supplier_name], ["Total value", money(r.amount)],
              ["Service start", day(r.start_date)], ["Service end", day(r.end_date)],
              ["Agreement signed", yesNo(r.agreement_signed)], ["Date of signature", day(r.signature_date)],
            ]} />
          </Card>
          {r.description && <Card title="Description / notes"><div className="prose">{r.description}</div></Card>}
        </div>

        <div className="grid" style={{ alignContent: "start" }}>
          <Card title="Documents" subtitle={`${r.attachments.length} file${r.attachments.length === 1 ? "" : "s"}`}>
            <ul className="files" style={{ marginTop: 0 }}>
              {r.attachments.map((a) => (
                <li key={a.id} className="file">
                  <FileText size={20} className="file__icon" aria-hidden />
                  <a className="file__name" href={attachmentUrl(r.request_number, a.id)} target="_blank" rel="noreferrer">{a.file_name}</a>
                  <span className="file__size">{fileSize(a.size_bytes)}</span>
                  <ExternalLink size={14} className="muted" aria-hidden />
                </li>
              ))}
            </ul>
          </Card>

          {me?.is_admin && <AdminPanel r={r} />}

          <Card title="Timeline">
            <ol className="timeline">
              {r.history.map((h, i) => (
                <li key={i}>
                  <div style={{ fontWeight: 600 }}>{h.old_status && h.old_status !== h.new_status ? `${h.old_status} → ${h.new_status}` : h.new_status}</div>
                  <div className="small muted">{dateTimePT(h.changed_at)} · {h.changed_by}</div>
                  {h.note && <div className="prose small" style={{ marginTop: 4, padding: "8px 10px", background: "var(--surface-2)", borderRadius: 8 }}>{h.note}</div>}
                </li>
              ))}
            </ol>
          </Card>

          {me?.is_admin && r.admin_notes && (
            <Card title="Internal notes"><div className="prose small">{r.admin_notes}</div></Card>
          )}
        </div>
      </div>
    </div>
  );
}
