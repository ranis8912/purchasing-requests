import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Download, FilePlus2, Search, SearchX } from "lucide-react";
import { listRequests, type RequestSummary } from "../api";
import { datePT, day, money } from "../format";
import { CapitalTag, EmailBadge, Empty, ErrorBox, StatusBadge, UrgentTag, useMe } from "../components/ui";

const OPEN = ["Pending Review", "In Review", "Info Needed"];
const STATUSES = ["Pending Review", "In Review", "Info Needed", "PO/Req Created", "PO Issued", "Contract Signed", "Closed", "Rejected"];
type SortKey = "request_number" | "submitted_at" | "supplier_name" | "amount" | "status" | "start_date";

export default function Requests() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  // Filters live in the URL so Back, refresh and shared links return to the same view.
  const [params, setParams] = useSearchParams();
  const scope = me?.is_admin && params.get("scope") !== "mine" ? "all" : "mine";
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const urgent = params.get("urgent") === "1";
  const sort = (params.get("sort") as SortKey) || "submitted_at";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ["requests", scope], queryFn: () => listRequests(scope) });

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) =>
      (!status || (status === "open" ? OPEN.includes(r.status) : r.status === status)) &&
      (!urgent || r.is_urgent) &&
      (!needle || [r.request_number, r.supplier_name, r.project_number, r.cost_center, r.requester_name]
        .some((v) => v.toLowerCase().includes(needle))));
    const val = (r: RequestSummary) => r[sort] ?? "";
    return out.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (dir === "asc" ? 1 : -1));
  }, [rows, q, status, urgent, sort, dir]);

  const total = visible.reduce((s, r) => s + r.amount, 0);

  const th = (k: SortKey, children: string, num = false) => (
    <th className={num ? "num" : ""} aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => { const next = new URLSearchParams(params); next.set("sort", k); next.set("dir", sort === k && dir === "desc" ? "asc" : "desc"); setParams(next, { replace: true }); }}>
        {children}{sort === k && (dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{scope === "all" ? "All requests" : "My requests"}</h1>
          <p>{scope === "all" ? "Every IT procurement requisition submitted through the portal." : "Requisitions you've submitted to Procurement."}</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {me?.is_admin && <a className="btn btn-secondary" href="/api/requests/export.csv"><Download size={16} aria-hidden /> Export CSV</a>}
          <Link to="/new" className="btn btn-primary"><FilePlus2 size={16} aria-hidden /> New request</Link>
        </div>
      </div>

      {error && <ErrorBox error={error} />}

      <section className="card">
        <div className="toolbar">
          {me?.is_admin && (
            <div className="segmented" role="group" aria-label="Whose requests">
              <button type="button" aria-pressed={scope === "all"} onClick={() => set("scope", "")}>All</button>
              <button type="button" aria-pressed={scope === "mine"} onClick={() => set("scope", "mine")}>Mine</button>
            </div>
          )}
          <div className="search">
            <Search size={16} aria-hidden />
            <input className="input" placeholder="Search number, supplier, project, CC…" aria-label="Search requests" value={q} onChange={(e) => set("q", e.target.value)} />
          </div>
          <select className="select" aria-label="Status" value={status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All statuses</option>
            <option value="open">Open (any)</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <label className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={urgent} onChange={(e) => set("urgent", e.target.checked ? "1" : "")} /> Urgent only
          </label>
          {(q || status || urgent) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams(scope === "mine" && me?.is_admin ? { scope: "mine" } : {}, { replace: true })}>Clear filters</button>}
        </div>

        {isLoading ? (
          <div style={{ padding: 20, display: "grid", gap: 10 }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}</div>
        ) : rows.length === 0 ? (
          <Empty title="No requests yet">
            <p>When you submit a request it will appear here with its status.</p>
            <Link to="/new" className="btn btn-primary"><FilePlus2 size={16} aria-hidden /> New request</Link>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty title="No matching requests" icon={SearchX}><p>Try a different search or clear the filters.</p></Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {th("request_number", "Request")}
                    {th("supplier_name", "Supplier")}
                    <th>Project · CC</th>
                    {scope === "all" && <th>Requester</th>}
                    {th("amount", "Amount", true)}
                    {th("status", "Status")}
                    {th("start_date", "Service start")}
                    {th("submitted_at", "Submitted")}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.request_number} onClick={() => navigate(`/requests/${r.request_number}`)}>
                      <td><Link to={`/requests/${r.request_number}`} className="mono" onClick={(e) => e.stopPropagation()}>{r.request_number}</Link></td>
                      <td><div className="cell-title">{r.supplier_name}</div>{r.is_urgent && <UrgentTag reason={r.urgent_reason} />}</td>
                      <td className="small"><span className="mono">{r.project_number}</span> · <span className="mono">{r.cost_center}</span></td>
                      {scope === "all" && <td>{r.requester_name}</td>}
                      <td className="num">{money(r.amount)}<div><CapitalTag capital={r.is_capital_project} /></div></td>
                      <td><StatusBadge status={r.status} />{r.po_number && <div className="small mono" style={{ marginTop: 4 }}>PO {r.po_number}</div>}{me?.is_admin && r.email_status === "Failed" && <div style={{ marginTop: 4 }}><EmailBadge status="Failed" /></div>}</td>
                      <td className="muted">{day(r.start_date)}</td>
                      <td className="muted">{datePT(r.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">{visible.length} of {rows.length} requests · {money(total)} total</div>
          </>
        )}
      </section>
    </div>
  );
}
