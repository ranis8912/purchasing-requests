import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, DollarSign, FilePlus2, FileText, Hourglass, MessageSquareWarning } from "lucide-react";
import { listRequests, type RequestSummary } from "../api";
import { datePT, greeting, money, monthKeyPT } from "../format";
import { Card, Empty, ErrorBox, ExpenseTag, StatusBadge, useMe } from "../components/ui";

const OPEN = ["Submitted", "In Review", "Info Needed"];

function lastTwelveMonths(rows: RequestSummary[]) {
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(monthKeyPT(r.submitted_at), (counts.get(monthKeyPT(r.submitted_at)) ?? 0) + 1));
  const out = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: d.toLocaleString("en-US", { month: "short" }), full: d.toLocaleString("en-US", { month: "long", year: "numeric" }), count: counts.get(key) ?? 0 });
  }
  return out;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { full: string; count: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return <div className="tooltip"><strong>{p.full}</strong>{p.count} request{p.count === 1 ? "" : "s"}</div>;
}

function Kpi({ label, value, sub, icon: Icon, accent, onClick }: {
  label: string; value: string | number; sub: string; icon: typeof FileText; accent: string; onClick?: () => void;
}) {
  const body = (
    <>
      <div className="kpi__top"><span className="kpi__label">{label}</span><span className="kpi__icon"><Icon size={18} aria-hidden /></span></div>
      <div className="kpi__value">{value}</div>
      <div className="kpi__sub">{sub}</div>
    </>
  );
  const style = { "--accent": accent } as React.CSSProperties;
  return onClick
    ? <button type="button" className="card kpi" style={style} onClick={onClick}>{body}</button>
    : <div className="card kpi" style={style}>{body}</div>;
}

export default function Dashboard() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const scope = me?.is_admin ? "all" : "mine";
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ["requests", scope], queryFn: () => listRequests(scope) });

  const stats = useMemo(() => {
    const year = String(new Date().getFullYear());
    const ytd = rows.filter((r) => monthKeyPT(r.submitted_at).startsWith(year) && r.currency === "USD");
    const opex = ytd.filter((r) => r.expense_class === "OpEx").reduce((s, r) => s + r.amount, 0);
    const capex = ytd.filter((r) => r.expense_class === "CapEx").reduce((s, r) => s + r.amount, 0);
    const byType = new Map<string, number>();
    rows.forEach((r) => byType.set(r.request_type, (byType.get(r.request_type) ?? 0) + 1));
    return {
      open: rows.filter((r) => OPEN.includes(r.status)).length,
      infoNeeded: rows.filter((r) => r.status === "Info Needed").length,
      thisMonth: rows.filter((r) => monthKeyPT(r.submitted_at) === monthKeyPT(new Date().toISOString())).length,
      opex, capex, ytdTotal: opex + capex,
      months: lastTwelveMonths(rows),
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [rows]);

  const firstName = me?.name.split(/[\s,]+/)[0] ?? "";
  const whose = me?.is_admin ? "All requests" : "Your requests";

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>{greeting()}{firstName && `, ${firstName}`}</h1>
          <p>
            {me?.is_admin
              ? "Here's everything coming into Purchasing. Review new requests, follow up on missing information and keep vendors moving."
              : "Send SOWs, requisitions, POs and contracts to Purchasing with everything they need the first time."}
          </p>
        </div>
        <Link to="/new" className="btn btn-lime btn-lg"><FilePlus2 size={18} aria-hidden /> New request</Link>
      </section>

      {error && <ErrorBox error={error} />}

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Kpi label="Total requests" value={isLoading ? "—" : rows.length} sub={`${stats.thisMonth} this month`} icon={FileText} accent="var(--ges-teal)" />
        <Kpi label="Open" value={isLoading ? "—" : stats.open} sub="Submitted, in review or waiting on info" icon={Hourglass} accent="var(--primary)"
          onClick={() => navigate("/requests?status=open")} />
        <Kpi label="Info needed" value={isLoading ? "—" : stats.infoNeeded} sub={stats.infoNeeded ? "Waiting on the requester" : "Nothing waiting"} icon={MessageSquareWarning}
          accent="var(--ges-gold)" onClick={() => navigate("/requests?status=Info%20Needed")} />
        <Kpi label={`Value ${new Date().getFullYear()}`} value={isLoading ? "—" : money(stats.ytdTotal, "USD", true)} sub="Year to date, USD requests" icon={DollarSign} accent="var(--ges-lime)" />
      </div>

      <div className="grid grid-3-1" style={{ marginBottom: 20 }}>
        <Card title="Requests per month" subtitle={`${whose}, last 12 months`}>
          <div className="chart" role="img" aria-label={`Requests per month: ${stats.months.map((m) => `${m.full} ${m.count}`).join(", ")}`}>
            <ResponsiveContainer>
              <BarChart data={stats.months} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-3)", fontSize: 12 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--text-3)", fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(29,111,184,0.08)" }} />
                <Bar dataKey="count" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="OpEx vs CapEx" subtitle={`Requested value, ${new Date().getFullYear()} (USD)`}>
          {stats.ytdTotal === 0 ? (
            <p className="muted">No requests yet this year.</p>
          ) : (
            <>
              <div className="split-bar" role="img" aria-label={`OpEx ${money(stats.opex)}, CapEx ${money(stats.capex)}`}>
                {stats.opex > 0 && <div style={{ width: `${(stats.opex / stats.ytdTotal) * 100}%`, background: "var(--viz-1)" }} title={`OpEx ${money(stats.opex)}`} />}
                {stats.capex > 0 && <div style={{ width: `${(stats.capex / stats.ytdTotal) * 100}%`, background: "var(--viz-2)" }} title={`CapEx ${money(stats.capex)}`} />}
              </div>
              <div className="grid grid-2" style={{ marginTop: 16, gap: 12 }}>
                {[["OpEx", stats.opex, "var(--viz-1)"], ["CapEx", stats.capex, "var(--viz-2)"]].map(([label, v, color]) => (
                  <div key={label as string}>
                    <div className="legend"><span><i style={{ background: color as string }} />{label}</span></div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ges-navy-900)" }}>{money(v as number, "USD", true)}</div>
                    <div className="small muted">{Math.round(((v as number) / stats.ytdTotal) * 100)}% of value</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <h3 style={{ fontSize: 13, margin: "22px 0 10px", color: "var(--text-2)" }}>By request type</h3>
          {stats.byType.length === 0 ? <p className="muted">—</p> : (
            <div className="bar-list">
              {stats.byType.slice(0, 5).map(([type, n]) => (
                <div className="bar-list__row" key={type}>
                  <span>{type}</span><strong className="num">{n}</strong>
                  <div className="bar-list__track"><div className="bar-list__fill" style={{ width: `${(n / stats.byType[0]![1]) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <section className="card">
        <div className="card__head" style={{ paddingBottom: 12 }}>
          <div><h2>Recent requests</h2><p>{whose}, newest first</p></div>
          <Link to="/requests" className="btn btn-ghost btn-sm">View all <ArrowRight size={15} aria-hidden /></Link>
        </div>
        {!isLoading && rows.length === 0 ? (
          <Empty title="No requests yet">
            <p>Submit your first purchasing request and it will show up here.</p>
            <Link to="/new" className="btn btn-primary"><FilePlus2 size={16} aria-hidden /> New request</Link>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Request</th><th>Title / vendor</th><th>Type</th>{me?.is_admin && <th>Requester</th>}<th className="num">Amount</th><th>Status</th><th>Submitted</th></tr></thead>
              <tbody>
                {rows.slice(0, 6).map((r) => (
                  <tr key={r.request_number} onClick={() => navigate(`/requests/${r.request_number}`)}>
                    <td><Link to={`/requests/${r.request_number}`} className="mono" onClick={(e) => e.stopPropagation()}>{r.request_number}</Link></td>
                    <td><div className="cell-title">{r.title}</div><div className="small muted">{r.vendor_name}</div></td>
                    <td>{r.request_type}</td>
                    {me?.is_admin && <td>{r.requester_name}</td>}
                    <td className="num">{money(r.amount, r.currency)} <ExpenseTag value={r.expense_class} /></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="muted">{datePT(r.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
