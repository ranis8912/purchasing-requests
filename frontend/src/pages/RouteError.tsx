import { Link, useRouteError } from "react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";

/** Shown instead of React Router's default screen when a page crashes. */
export default function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return (
    <div className="page">
      <div className="card" style={{ padding: 28, maxWidth: 640 }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 0 }}>
          <AlertTriangle size={24} aria-hidden /> Something went wrong
        </h1>
        <p>This page hit an unexpected error. Reloading usually fixes it, especially right after the portal was updated.</p>
        <p className="small muted mono">{message}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} aria-hidden /> Reload
          </button>
          <Link to="/" className="btn btn-secondary">Go to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
