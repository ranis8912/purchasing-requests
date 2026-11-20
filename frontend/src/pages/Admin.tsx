import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Database, Mail, RefreshCw, Save, XCircle } from "lucide-react";
import { getLookupStatus, getRecipients, refreshLookups, saveRecipients } from "../api";
import { dateTimePT } from "../format";
import { Card, ErrorBox, PageLoader, Spinner, useMe, useToast } from "../components/ui";

/** Who gets the submission email. Purchasing edits this here instead of asking IT to change app settings. */
function RecipientsCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["recipients"], queryFn: getRecipients });
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  useEffect(() => { if (data) { setTo(data.to); setCc(data.cc); } }, [data]);
  const save = useMutation({
    mutationFn: () => saveRecipients(to, cc),
    onSuccess: (d) => { qc.setQueryData(["recipients"], d); toast("Email recipients saved"); },
    onError: (e: Error) => toast(e.message, true),
  });
  if (error) return <ErrorBox error={error} />;
  const changed = !!data && (to !== data.to || cc !== data.cc);

  return (
    <Card title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Mail size={18} aria-hidden /> Submission email recipients</span>}
      subtitle="Every new requisition is emailed to these people. Separate multiple addresses with commas. The requester is always copied.">
      <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
        <div className="field">
          <label htmlFor="rcpt_to">To<span className="req" aria-hidden>*</span></label>
          <input id="rcpt_to" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="po@ges.com, reviewer@ges.com" />
        </div>
        <div className="field">
          <label htmlFor="rcpt_cc">CC</label>
          <input id="rcpt_cc" className="input" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14 }}>
        <span className="small muted">
          {data?.source === "admin" && data.updated_at
            ? `Last changed ${dateTimePT(data.updated_at)} by ${data.updated_by}`
            : "Using the default from the app settings until you save here."}
        </span>
        <button type="button" className="btn btn-primary" disabled={!changed || !to.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Spinner /> : <Save size={16} aria-hidden />} Save recipients
        </button>
      </div>
    </Card>
  );
}

export default function Admin() {
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["lookup-status"], queryFn: getLookupStatus, enabled: !!me?.is_admin });
  const refresh = useMutation({
    mutationFn: refreshLookups,
    onSuccess: (d) => {
      qc.setQueryData(["lookup-status"], d);
      qc.invalidateQueries({ queryKey: ["lookups"] });
      const last = d.refreshes[0];
      toast(last?.ok ? "Lists refreshed" : `Refresh failed: ${last?.message ?? "unknown error"}`, !last?.ok);
    },
    onError: (e: Error) => toast(e.message, true),
  });

  if (!me?.is_admin) return <div className="page"><ErrorBox error={new Error("This page is for Purchasing admins.")} /></div>;
  if (isLoading) return <PageLoader />;
  if (error || !data) return <div className="page"><ErrorBox error={error} /></div>;

  const last = data.refreshes[0];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p>Manage who receives new requisitions. Dropdown lists come from the <strong>PO Intake Lists</strong> workbook in SharePoint. They refresh every night, or you can refresh them now.</p>
        </div>
        <button type="button" className="btn btn-primary" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          {refresh.isPending ? <Spinner /> : <RefreshCw size={16} aria-hidden />} Refresh lists now
        </button>
      </div>

      {last && !last.ok && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <XCircle size={18} aria-hidden />
          <div><strong>The last refresh failed, so the form is still using the previous lists.</strong><div style={{ marginTop: 4 }}>{last.message}</div></div>
        </div>
      )}

      <div className="grid grid-auto" style={{ marginBottom: 20 }}>
        {Object.entries(data.sheets).map(([key, sheet]) => (
          <div key={key} className="card kpi">
            <div className="kpi__top"><span className="kpi__label">{sheet.replace(/([a-z])([A-Z])/g, "$1 $2")}</span><span className="kpi__icon"><Database size={18} aria-hidden /></span></div>
            <div className="kpi__value">{data.counts[key] ?? 0}</div>
            <div className="kpi__sub">active values · sheet “{sheet}”</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}><RecipientsCard /></div>

      <Card title="Refresh history" subtitle="Last 10 attempts">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Result</th><th>Source</th><th>Details</th><th>By</th></tr></thead>
            <tbody>
              {data.refreshes.map((r, i) => (
                <tr key={i} style={{ cursor: "default" }}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{dateTimePT(r.started_at)}</td>
                  <td>{r.ok
                    ? <span className="badge badge-ok"><CheckCircle2 size={13} aria-hidden /> OK</span>
                    : <span className="badge badge-danger"><XCircle size={13} aria-hidden /> Failed</span>}</td>
                  <td>{r.source === "sharepoint" ? "SharePoint" : "Local file"}</td>
                  <td className="small">{r.message}</td>
                  <td className="small muted">{r.triggered_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
