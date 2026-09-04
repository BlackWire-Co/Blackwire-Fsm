import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { usePortalAuth } from "./PortalAuthContext";

const NAV = [
  { to: "/portal", label: "Appointments", end: true },
  { to: "/portal/estimates", label: "Estimates" },
  { to: "/portal/invoices", label: "Invoices" },
  { to: "/portal/messages", label: "Messages" },
  { to: "/portal/documents", label: "Documents" },
];

export default function PortalLayout() {
  const { customer, logout } = usePortalAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  return (
    <div className="app-shell">
      <div className="mobile-topbar">
        <button className="hamburger-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>☰</button>
        <div className="sidebar-brand" style={{ padding: 0, border: "none", marginBottom: 0 }}>
          BlackWire<span className="tag">Your Account</span>
        </div>
      </div>

      {navOpen && <div className="nav-overlay" onClick={() => setNavOpen(false)} />}

      <aside className={"sidebar" + (navOpen ? " open" : "")}>
        <div className="sidebar-brand">
          BlackWire
          <span className="tag">Your Account</span>
        </div>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>{customer?.firstName} {customer?.lastName}</div>
          <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
