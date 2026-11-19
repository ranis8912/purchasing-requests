import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Database, RefreshCw, XCircle } from "lucide-react";
import { getLookupStatus, refreshLookups } from "../api";
import { dateTimePT } from "../format";
import { Card, ErrorBox, PageLoader, Spinner, useMe, useToast } from "../components/ui";

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
          <p>Dropdown lists come from the <strong>PO Intake Lists</strong> workbook in SharePoint. They refresh every night, or you can refresh them now.</p>
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
