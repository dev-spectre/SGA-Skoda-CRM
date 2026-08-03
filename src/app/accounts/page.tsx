"use client";

import { useState, useEffect, useCallback } from "react";

interface UserAccount {
  id: number;
  username: string;
  role: string;
  assignedBranch: string | null;
  createdAt: string;
}

export default function AccountsPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalUser, setEditModalUser] = useState<UserAccount | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<UserAccount | null>(null);

  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [assignedBranch, setAssignedBranch] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (res.ok && data.user) {
        setCurrentUserRole(data.user.role);
        setCurrentUserId(data.user.userId);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/branches");
      const data = await res.json();
      if (res.ok && Array.isArray(data.branches)) {
        setBranches(data.branches);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok && Array.isArray(data.users)) {
        setUsers(data.users);
      } else if (res.status === 403) {
        showToast("Access denied. Admin rights required.", "error");
      }
    } catch {
      showToast("Failed to fetch user accounts", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
    fetchBranches();
    fetchUsers();
  }, [fetchCurrentUser, fetchBranches, fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      showToast("Username and password are required", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          role,
          assignedBranch: assignedBranch ? assignedBranch : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("User account created successfully!");
        setCreateModalOpen(false);
        setUsername("");
        setPassword("");
        setRole("USER");
        setAssignedBranch("");
        fetchUsers();
      } else {
        showToast(data.error || "Failed to create user", "error");
      }
    } catch {
      showToast("Failed to create user account", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalUser) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editModalUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim() ? password.trim() : undefined,
          role,
          assignedBranch: assignedBranch ? assignedBranch : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("User account updated successfully!");
        setEditModalUser(null);
        setUsername("");
        setPassword("");
        fetchUsers();
      } else {
        showToast(data.error || "Failed to update user", "error");
      }
    } catch {
      showToast("Failed to update user account", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteModalUser) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${deleteModalUser.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        showToast("User account deleted successfully!");
        setDeleteModalUser(null);
        fetchUsers();
      } else {
        showToast(data.error || "Failed to delete user", "error");
      }
    } catch {
      showToast("Failed to delete user account", "error");
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = () => {
    setUsername("");
    setPassword("");
    setRole("USER");
    setAssignedBranch("");
    setCreateModalOpen(true);
  };

  const openEditModal = (user: UserAccount) => {
    setEditModalUser(user);
    setUsername(user.username);
    setPassword(""); // leave blank unless updating
    setRole(user.role);
    setAssignedBranch(user.assignedBranch || "");
  };

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.assignedBranch && u.assignedBranch.toLowerCase().includes(q))
    );
  });

  const totalAdmins = users.filter((u) => u.role === "ADMIN").length;
  const totalStaff = users.filter((u) => u.role !== "ADMIN").length;
  const totalRestricted = users.filter((u) => u.assignedBranch !== null).length;

  if (loading) {
    return <div className="loading-overlay"><span className="spinner" /> Loading user accounts...</div>;
  }

  if (currentUserRole !== "ADMIN") {
    return (
      <div className="settings-page" style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2>Access Restricted</h2>
        <p style={{ color: "var(--text-muted)", marginTop: 8 }}>
          Only Administrator accounts have permission to manage system accounts and user access.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-page" style={{ maxWidth: "1200px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Accounts & Roles</h1>
          <p className="page-desc" style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 14 }}>
            Manage staff accounts, assign specific branch permissions, and control lead deletion capabilities.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16 }}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create New Account
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total Accounts</div>
          <div className="stat-value" style={{ color: "var(--text-primary)" }}>{users.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Administrators</div>
          <div className="stat-value success">{totalAdmins}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Staff Users</div>
          <div className="stat-value open">{totalStaff}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Branch Restricted</div>
          <div className="stat-value" style={{ color: "#2563eb" }}>{totalRestricted}</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="filter-bar" style={{ marginBottom: 20 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
          <input
            type="text"
            placeholder="Search by username, role, or branch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", paddingLeft: 38 }}
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, pointerEvents: "none" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {/* Users Table matching Leads Dashboard styling */}
      <div className="glass-card" style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
        <div className="table-container">
          <table className="leads-table" style={{ background: "#ffffff" }}>
            <thead>
              <tr style={{ background: "rgba(16, 185, 129, 0.03)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Account
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Role & Privileges
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Assigned Branch Scope
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Created Date
                </th>
                <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase", textAlign: "right" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 20px" }}>
                    No accounts found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.15)" }}>
                    <td style={{ padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: u.role === "ADMIN" ? "rgba(16, 185, 129, 0.1)" : "rgba(37, 99, 235, 0.1)",
                            color: u.role === "ADMIN" ? "#059669" : "#2563eb",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: 14,
                            border: `1px solid ${u.role === "ADMIN" ? "rgba(16, 185, 129, 0.2)" : "rgba(37, 99, 235, 0.2)"}`,
                          }}
                        >
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
                            {u.username}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>User ID: #{u.id}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "16px 18px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 12px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: u.role === "ADMIN" ? "rgba(16, 185, 129, 0.12)" : "rgba(37, 99, 235, 0.12)",
                          color: u.role === "ADMIN" ? "#059669" : "#2563eb",
                          border: `1px solid ${u.role === "ADMIN" ? "rgba(16, 185, 129, 0.25)" : "rgba(37, 99, 235, 0.25)"}`,
                        }}
                      >
                        {u.role === "ADMIN" ? "👑 Admin (Full Access)" : "👤 Staff User (Soft Delete)"}
                      </span>
                    </td>

                    <td style={{ padding: "16px 18px" }}>
                      {u.assignedBranch ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            background: "#f1f5f9",
                            color: "#334155",
                            border: "1px solid #cbd5e1",
                            textTransform: "capitalize",
                          }}
                        >
                          📍 {u.assignedBranch.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 500,
                            background: "rgba(16, 185, 129, 0.08)",
                            color: "#059669",
                            border: "1px solid rgba(16, 185, 129, 0.2)",
                          }}
                        >
                          🌐 All Branches Unrestricted
                        </span>
                      )}
                    </td>

                    <td style={{ padding: "16px 18px", fontSize: "13px", color: "var(--text-muted)" }}>
                      {new Date(u.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    <td style={{ padding: "16px 18px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(u)} style={{ borderRadius: 6 }}>
                          Edit
                        </button>
                        {u.id !== currentUserId && (
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteModalUser(u)} style={{ borderRadius: 6 }}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Account Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460, background: "#ffffff", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "var(--text-primary)" }}>Create New User Account</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              Staff users soft-delete leads into hiding without affecting database records, and can be scoped to a single branch.
            </p>
            <form onSubmit={handleCreateUser}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Username / Email *
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. john_coimbatore"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter secure password"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Account Role *
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px" }}
                  >
                    <option value="USER">Staff User (Soft-delete only)</option>
                    <option value="ADMIN">Administrator (Full Access)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Assigned Branch (Optional Scope)
                  </label>
                  <select
                    value={assignedBranch}
                    onChange={(e) => setAssignedBranch(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px" }}
                  >
                    <option value="">All Branches (Unrestricted Access)</option>
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b.replace(/_/g, " ").toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {editModalUser && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460, background: "#ffffff", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "var(--text-primary)" }}>Edit Account — {editModalUser.username}</h2>
            <form onSubmit={handleEditUser}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Reset Password (Optional)
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank to keep existing password"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Account Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px" }}
                  >
                    <option value="USER">Staff User (Soft-delete only)</option>
                    <option value="ADMIN">Administrator (Full Access)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Assigned Branch Scope
                  </label>
                  <select
                    value={assignedBranch}
                    onChange={(e) => setAssignedBranch(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px" }}
                  >
                    <option value="">All Branches (Unrestricted Access)</option>
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b.replace(/_/g, " ").toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditModalUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalUser && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420, background: "#ffffff", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>Delete Account</h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Are you sure you want to delete account <strong>{deleteModalUser.username}</strong>? This action cannot be undone.
            </p>
            <div className="modal-actions" style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setDeleteModalUser(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteUser} disabled={saving}>
                {saving ? "Deleting..." : "Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
