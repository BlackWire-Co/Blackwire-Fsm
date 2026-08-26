import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { to: "/", label: "Dashboard", end: true, roles: ["ADMIN", "OFFICE", "TECHNICIAN"] },
  { to: "/schedule", label: "Schedule", roles: ["ADMIN", "OFFICE"] },
  { to: "/jobs", label: "Jobs", roles: ["ADMIN", "OFFICE", "TECHNICIAN"] },
  { to: "/customers", label: "Customers", roles: ["ADMIN", "OFFICE", "TECHNICIAN"] },
  { to: "/messages", label: "Messages", roles: ["ADMIN", "OFFICE"] },
  { to: "/estimates", label: "Estimates", roles: ["ADMIN", "OFFICE"] },
  { to: "/invoices", label: "Invoices", roles: ["ADMIN", "OFFICE"] },
  { to: "/pricebook", label: "Price Book", roles: ["ADMIN", "OFFICE"] },
  { to: "/settings/templates", label: "Email Templates", roles: ["ADMIN"] },
  { to: "/settings/notification-log", label: "Notification Log", roles: ["ADMIN"] },
  { to: "/reports", label: "Reports", roles: ["ADMIN", "OFFICE"] },
  { to: "/settings", label: "Settings", roles: ["ADMIN"] },
  { to: "/settings/users", label: "Users", roles: ["ADMIN"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const nav = NAV.filter((item) => !user || item.roles.some((r) => user.roles.includes(r as any)));

  // Close the mobile drawer automatically whenever the route changes, so
  // tapping a link doesn't leave the overlay open behind the new page.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  return (
    <div className="app-shell">
      <div className="mobile-topbar">
        <button className="hamburger-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>☰</button>
        <div className="sidebar-brand" style={{ padding: 0, border: "none", marginBottom: 0 }}>
          BlackWire<span className="tag">FSM</span>
        </div>
      </div>

      {navOpen && <div className="nav-overlay" onClick={() => setNavOpen(false)} />}

      <aside className={"sidebar" + (navOpen ? " open" : "")}>
        <div className="sidebar-brand">
          BlackWire
          <span className="tag">FSM</span>
        </div>
        <nav>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>{user?.firstName} {user?.lastName}</div>
          <div style={{ opacity: 0.7, marginBottom: 10 }}>{user?.roles.join(" · ")}</div>
          <ThemeToggle />
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
