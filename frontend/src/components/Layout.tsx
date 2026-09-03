import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { loadCustomCss } from "../customCss";
import ThemeToggle from "./ThemeToggle";

// Grouped instead of one flat 13-item list, so the sidebar reads as
// "where would this be" (Field Ops / Money / Admin) rather than a wall of
// links in build order. A group that ends up with zero visible items for
// the current user's roles (e.g. a Technician sees no "Money" items) is
// skipped entirely rather than rendering an empty heading.
const NAV_GROUPS = [
  {
    heading: "Field Ops",
    items: [
      { to: "/", label: "Dashboard", end: true, roles: ["ADMIN", "OFFICE", "TECHNICIAN"] },
      { to: "/schedule", label: "Schedule", roles: ["ADMIN", "OFFICE"] },
      { to: "/jobs", label: "Jobs", roles: ["ADMIN", "OFFICE", "TECHNICIAN"] },
      { to: "/customers", label: "Customers", roles: ["ADMIN", "OFFICE", "TECHNICIAN"] },
      { to: "/messages", label: "Messages", roles: ["ADMIN", "OFFICE"] },
    ],
  },
  {
    heading: "Money",
    items: [
      { to: "/estimates", label: "Estimates", roles: ["ADMIN", "OFFICE"] },
      { to: "/invoices", label: "Invoices", roles: ["ADMIN", "OFFICE"] },
      { to: "/pricebook", label: "Price Book", roles: ["ADMIN", "OFFICE"] },
      { to: "/reports", label: "Reports", roles: ["ADMIN", "OFFICE"] },
    ],
  },
  {
    heading: "Admin",
    items: [
      { to: "/settings", label: "Settings", roles: ["ADMIN"] },
      { to: "/settings/users", label: "Users", roles: ["ADMIN"] },
      { to: "/settings/templates", label: "Email Templates", roles: ["ADMIN"] },
      { to: "/settings/notification-log", label: "Notification Log", roles: ["ADMIN"] },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !user || item.roles.some((r) => user.roles.includes(r as any))),
  })).filter((group) => group.items.length > 0);

  // Close the mobile drawer automatically whenever the route changes, so
  // tapping a link doesn't leave the overlay open behind the new page.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  // Applies whatever custom CSS override an admin has saved in Settings.
  // Runs once per full load of the staff app (Settings itself re-applies
  // immediately on save, so a change is visible without a reload).
  useEffect(() => { loadCustomCss(api); }, []);

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
          {groups.map((group) => (
            <div key={group.heading} className="nav-group">
              <div className="nav-section-label">{group.heading}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
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
