import { NavLink, Outlet, Link } from "react-router";
import { FilePlus2, FlaskConical, LayoutDashboard, ListChecks, LogOut, Settings2 } from "lucide-react";
import logoWhite from "../assets/GES-logo-white.png"; // white logo on the dark header; imported so Vite fingerprints it
import { initials } from "../format";
import { ErrorBox, PageLoader, useMe } from "./ui";

export default function Layout() {
  const { data: me, isLoading, error } = useMe();

  if (isLoading) return <PageLoader />;
  if (error || !me) return <div className="page"><ErrorBox error={error} /></div>;

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="brand" aria-label="Purchasing Request Portal home">
            <img src={logoWhite} alt="GES" />
            <span className="brand__divider" />
            <span className="brand__title">
              Purchasing Request Portal
              <small>Procurement intake</small>
            </span>
          </Link>

          <nav className="nav" aria-label="Main">
            <NavLink to="/" end><LayoutDashboard size={17} aria-hidden /><span>Dashboard</span></NavLink>
            <NavLink to="/new"><FilePlus2 size={17} aria-hidden /><span>New request</span></NavLink>
            <NavLink to="/requests"><ListChecks size={17} aria-hidden /><span>{me.is_admin ? "Requests" : "My requests"}</span></NavLink>
            {me.is_admin && <NavLink to="/admin"><Settings2 size={17} aria-hidden /><span>Admin</span></NavLink>}
          </nav>

          <div className="user">
            {me.is_admin && <span className="role-chip">Admin</span>}
            <div className="user__meta">
              <div className="user__name">{me.name}</div>
              <div className="user__email">{me.email}</div>
            </div>
            <div className="user__avatar" aria-hidden>{initials(me.name)}</div>
            <a className="icon-btn" href="/.auth/logout?post_logout_redirect_uri=/" title="Sign out" aria-label="Sign out">
              <LogOut size={18} />
            </a>
          </div>
        </div>
      </header>

      {me.demo_mode && (
        <div className="demo-banner" role="status">
          <FlaskConical size={15} aria-hidden /> Test environment: sample approver list.{" "}
          {me.email_live ? "New submissions DO send a real email to the Purchasing mailbox." : "No emails are sent to Purchasing."}
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <footer className="app-footer">© {new Date().getFullYear()} GES · Purchasing Request Portal · Questions? Reply to your confirmation email.</footer>
    </>
  );
}
