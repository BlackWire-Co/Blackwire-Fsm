import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";

const ROLES = ["ADMIN", "OFFICE", "TECHNICIAN"] as const;

function RoleCheckboxes({ value, onChange }: { value: string[]; onChange: (roles: string[]) => void }) {
  function toggle(role: string) {
    onChange(value.includes(role) ? value.filter((r) => r !== role) : [...value, role]);
  }
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {ROLES.map((r) => (
        <label key={r} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13.5 }}>
          <input type="checkbox" checked={value.includes(r)} onChange={() => toggle(r)} style={{ width: "auto" }} />
          {r}
        </label>
      ))}
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "", roles: ["TECHNICIAN"] as string[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editingRolesFor, setEditingRolesFor] = useState<string | null>(null);
  const [editingRoles, setEditingRoles] = useState<string[]>([]);

  function load() {
    api("/auth/users").then(setUsers);
  }
  useEffect(() => { load(); }, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.roles.length === 0) {
      setError("Select at least one role");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/users", { method: "POST", body: form });
      setForm({ email: "", password: "", firstName: "", lastName: "", roles: ["TECHNICIAN"] });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message || "Could not create user");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: any) {
    await api(`/auth/users/${u.id}`, { method: "PATCH", body: { active: !u.active } });
    load();
  }

  async function saveRoles(id: string) {
    if (editingRoles.length === 0) {
      alert("A user needs at least one role");
      return;
    }
    await api(`/auth/users/${id}`, { method: "PATCH", body: { roles: editingRoles } });
    setEditingRolesFor(null);
    load();
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    await api(`/auth/users/${resetTarget}/reset-password`, { method: "POST", body: { password: newPassword } });
    setResetTarget(null);
    setNewPassword("");
    alert("Password reset. Share the new password with the user securely.");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <div className="sub">
            Admin, office, and technician accounts - a user can hold more than one role,
            useful for a solo operator covering every job themselves.
          </div>
        </div>
        <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New User"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createUser} className="card" style={{ marginBottom: 20 }}>
          <div className="grid cols-2">
            <div className="field">
              <label>First name</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div className="field">
              <label>Last name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="field">
              <label>Temporary password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required />
            </div>
          </div>
          <div className="field">
            <label>Roles</label>
            <RoleCheckboxes value={form.roles} onChange={(roles) => setForm({ ...form, roles })} />
          </div>
          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create User"}</button>
          {error && <div className="error-text">{error}</div>}
        </form>
      )}

      <div className="table-scroll"><table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Roles</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.firstName} {u.lastName}</td>
              <td>{u.email}</td>
              <td>
                {editingRolesFor === u.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                    <RoleCheckboxes value={editingRoles} onChange={setEditingRoles} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn primary" onClick={() => saveRoles(u.id)}>Save</button>
                      <button className="btn ghost" onClick={() => setEditingRolesFor(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn ghost"
                    onClick={() => { setEditingRolesFor(u.id); setEditingRoles(u.roles); }}
                  >
                    {u.roles.join(", ")}
                  </button>
                )}
              </td>
              <td>{u.active ? "Active" : "Deactivated"}</td>
              <td style={{ display: "flex", gap: 8 }}>
                <button className="btn ghost" onClick={() => setResetTarget(u.id)}>Reset password</button>
                <button className={u.active ? "btn danger" : "btn ghost"} onClick={() => toggleActive(u)}>
                  {u.active ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {resetTarget && (
        <form onSubmit={submitReset} className="card" style={{ marginTop: 16, maxWidth: 340 }}>
          <h3>Set a new password</h3>
          <div className="field">
            <input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" type="submit">Save</button>
            <button className="btn ghost" type="button" onClick={() => setResetTarget(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
