"use client";

import { useState, useEffect, useCallback } from "react";

interface UserAccount {
  id: number;
  username: string;
  role: string;
  assignedBranch: string | null;
  assignedPlatform: string | null;
  allowExternalUpload: boolean;
  createdAt: string;
}

export default function AccountsPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "activity">("users");
  const [userActivity, setUserActivity] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [viewUploadedUser, setViewUploadedUser] = useState<any | null>(null);
  const [uploadedLeads, setUploadedLeads] = useState<any[]>([]);
  const [loadingUploadedLeads, setLoadingUploadedLeads] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalUser, setEditModalUser] = useState<UserAccount | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<UserAccount | null>(null);

  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [assignedBranch, setAssignedBranch] = useState("");
  const [assignedPlatform, setAssignedPlatform] = useState("");
  const [allowExternalUpload, setAllowExternalUpload] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (res.ok && data.user) {
        setCurrentUserRole(data.user.role);
        setCurrentUserId(data.user.userId);
        setIsSuperAdminUser(Boolean(data.user.isSuperAdmin || data.user.role === "SUPERADMIN"));
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

  const fetchPlatforms = useCallback(async () => {
    try {
      const res = await fetch("/api/platforms");
      const data = await res.json();
      if (res.ok && Array.isArray(data.platforms)) {
        setPlatforms(data.platforms);
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
    fetchPlatforms();
    fetchUsers();
  }, [fetchCurrentUser, fetchBranches, fetchPlatforms, fetchUsers]);

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
          assignedPlatform: assignedPlatform ? assignedPlatform : null,
          allowExternalUpload,
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
        setAssignedPlatform("");
        setAllowExternalUpload(false);
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
          assignedPlatform: assignedPlatform ? assignedPlatform : null,
          allowExternalUpload,
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
    setAssignedPlatform("");
    setAllowExternalUpload(false);
    setCreateModalOpen(true);
  };

  const openEditModal = (user: UserAccount) => {
    setEditModalUser(user);
    setUsername(user.username);
    setPassword(""); // leave blank unless updating
    setRole(user.role);
    setAssignedBranch(user.assignedBranch || "");
    setAssignedPlatform(user.assignedPlatform || "");
    setAllowExternalUpload(user.allowExternalUpload);
  };

  const handleImpersonate = async (user: UserAccount) => {
    if (!confirm(`Switch to impersonating user "${user.username}" (${user.role})? You will view the CRM with their exact permissions and can exit anytime.`)) {
      return;
    }
    try {
      const res = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: user.id }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/dashboard";
      } else {
        showToast(data.error || "Failed to impersonate user", "error");
      }
    } catch {
      showToast("An error occurred during impersonation", "error");
    }
  };

  const filteredUsers = users.filter((u) => {

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.assignedBranch && u.assignedBranch.toLowerCase().includes(q)) ||
      (u.assignedPlatform && u.assignedPlatform.toLowerCase().includes(q))
    );
  });

  const totalAdmins = users.filter((u) => u.role === "ADMIN").length;
  const totalStaff = users.filter((u) => u.role !== "ADMIN").length;
  const totalRestricted = users.filter((u) => u.assignedBranch !== null || u.assignedPlatform !== null).length;

  if (loading) {
    return <div className="loading-overlay"><span className="spinner" /> Loading user accounts...</div>;
  }




  const fetchUserActivity = async () => {
    setLoadingActivity(true);
    try {
      const res = await fetch("/api/admin/activity");
      const data = await res.json();
      if (res.ok && data.activity) {
        setUserActivity(data.activity);
      }
    } catch {
      showToast("Failed to load user activity", "error");
    } finally {
      setLoadingActivity(false);
    }
  };

  const fetchUploadedLeads = async (userId: number) => {
    setLoadingUploadedLeads(true);
    try {
      const res = await fetch(`/api/leads?uploadedById=${userId}&limit=1000`);
      const data = await res.json();
      if (res.ok && data.leads) {
        setUploadedLeads(data.leads.filter((l: any) => l.source === 'External Upload' && l.uploadedById === userId));
      }
    } catch {
      showToast("Failed to load uploaded leads", "error");
    } finally {
      setLoadingUploadedLeads(false);
    }
  };

  const handleTabChange = (tab: "users" | "activity") => {
    setActiveTab(tab);
    if (tab === "activity") {
      fetchUserActivity();
    }
  };

  return (
    <div className="settings-page" style={{ maxWidth: "1200px" }}>
      {/* Header Tabs */}
      <div style={{ display: "flex", gap: "20px", borderBottom: "1px solid var(--border)", marginBottom: "24px" }}>
        <button
          onClick={() => handleTabChange("users")}
          style={{
            padding: "12px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "users" ? "2px solid var(--primary)" : "2px solid transparent",
            color: activeTab === "users" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "users" ? 700 : 500,
            cursor: "pointer",
            fontSize: "15px"
          }}
        >
          User Accounts
        </button>
        <button
          onClick={() => handleTabChange("activity")}
          style={{
            padding: "12px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "activity" ? "2px solid var(--primary)" : "2px solid transparent",
            color: activeTab === "activity" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "activity" ? 700 : 500,
            cursor: "pointer",
            fontSize: "15px"
          }}
        >
          User Activity
        </button>
      </div>

      {activeTab === "users" ? (
        <>
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
                  Assigned Platform Scope
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
                          📍 {(u.assignedBranch || "").replace(/_/g, " ")}
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

                    <td style={{ padding: "16px 18px" }}>
                      {u.assignedPlatform ? (
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
                          🖥️ {u.assignedPlatform}
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
                          🌐 All Platforms Unrestricted
                        </span>
                      )}
                    </td>

                    <td 
                      style={{ padding: "16px 18px", fontSize: "13px", color: "var(--text-muted)", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                      title={new Date(u.createdAt).toLocaleString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                    >
                      {new Date(u.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    <td style={{ padding: "16px 18px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                        {(currentUserRole === "SUPERADMIN" || isSuperAdminUser) && u.id !== currentUserId && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleImpersonate(u)}
                            style={{
                              borderRadius: 6,
                              background: "linear-gradient(135deg, rgba(147, 51, 234, 0.15), rgba(79, 70, 229, 0.15))",
                              border: "1px solid rgba(147, 51, 234, 0.4)",
                              color: "#9333ea",
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4
                            }}
                            title={`Impersonate ${u.username}`}
                          >
                            <span>🎭</span> Impersonate
                          </button>
                        )}
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
        </>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Account User</th>
                  <th>Role</th>
                  <th>Total Leads</th>
                  <th>Not Contacted</th>
                  <th>Follow-up</th>
                  <th>Completed</th>
                  <th>Lost</th>
                  <th>Test Drive (Y/N)</th>
                  <th>External Uploads</th>
                  <th>Last Upload</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingActivity ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", padding: "40px" }}>Loading activity...</td>
                  </tr>
                ) : userActivity.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", padding: "40px" }}>No activity data found.</td>
                  </tr>
                ) : (
                  userActivity.map((stat, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>
                        <div>{stat.username}</div>
                        {stat.assignedBranch ? (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize", marginTop: 2 }}>
                            📍 {stat.assignedBranch.replace(/_/g, " ")}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            🌐 All Branches
                          </div>
                        )}
                      </td>

                      <td>
                        <span style={{
                          display: "inline-flex", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                          background: stat.role === "ADMIN" ? "rgba(139, 92, 246, 0.1)" : "rgba(59, 130, 246, 0.1)",
                          color: stat.role === "ADMIN" ? "#7c3aed" : "#2563eb",
                        }}>
                          {stat.role}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{stat.total}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{stat.notContacted}</td>
                      <td style={{ color: "var(--status-pending)" }}>{stat.pending}</td>
                      <td style={{ color: "var(--status-live)" }}>{stat.live}</td>
                      <td style={{ color: "var(--status-lost)" }}>{stat.lost}</td>
                      <td style={{ fontSize: 13 }}>
                        <span style={{ color: "var(--status-live)" }}>{stat.testDriveYes}</span> / <span style={{ color: "var(--status-lost)" }}>{stat.testDriveNo}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--primary)" }}>{stat.externalUploaded}</td>
                      <td style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        {stat.lastUploadAt ? new Date(stat.lastUploadAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setViewUploadedUser(stat); fetchUploadedLeads(stat.userId); }}>
                          View Uploads
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View Uploaded Leads Modal */}
      {viewUploadedUser && (
        <div className="modal-overlay" onClick={() => setViewUploadedUser(null)}>
          <div className="modal" style={{ maxWidth: 900, width: "95%" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Uploaded Leads: <span style={{ color: "var(--primary)" }}>{viewUploadedUser.username}</span></h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewUploadedUser(null)}>✕</button>
            </div>
            
            <div className="table-container" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <table style={{ minWidth: 800 }}>
                <thead>
                  <tr>
                    <th>Lead Name</th>
                    <th>Phone</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Test Drive</th>
                    <th>Consultant</th>
                    <th>Uploaded Date</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUploadedLeads ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "40px" }}>Loading leads...</td>
                    </tr>
                  ) : uploadedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "40px" }}>No external uploads found for this user.</td>
                    </tr>
                  ) : (
                    uploadedLeads.map((lead, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{lead.name}</td>
                        <td style={{ fontFamily: "monospace" }}>{lead.phone}</td>
                        <td>{lead.platform && !/^\d{4}-\d{2}-\d{2}$/.test(lead.platform) ? lead.platform : "Unknown"}</td>
                        <td>
                          <span className={`status-select status-${lead.status === 'created' ? 'not_contacted' : lead.status === 'closed_successful' ? 'live' : lead.status === 'closed_unsuccessful' ? 'lost' : lead.status}`} style={{ display: "inline-block", padding: "2px 6px", fontSize: 12 }}>
                            {lead.status === 'pending' ? 'Contacted' : (lead.status === 'not_contacted' || lead.status === 'created') ? 'Not Contacted' : (lead.status === 'live' || lead.status === 'closed_successful') ? 'Completed' : (lead.status === 'lost' || lead.status === 'closed_unsuccessful') ? 'Lost' : lead.status.replace("_", " ")}
                          </span>
                        </td>
                        <td>{lead.testDrive || "—"}</td>
                        <td>{lead.assignedConsultant || "—"}</td>
                        <td style={{ fontSize: 12 }}>{new Date(lead.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
                    <option value="USER">Staff User</option>
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

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Assigned Platform (Optional Scope)
                  </label>
                  <select
                    value={assignedPlatform}
                    onChange={(e) => setAssignedPlatform(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px" }}
                  >
                    <option value="">All Platforms (Unrestricted Access)</option>
                    {platforms.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={allowExternalUpload}
                      onChange={(e) => setAllowExternalUpload(e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    Allow External Data Upload
                  </label>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, marginLeft: 24 }}>
                    If enabled, this staff user can upload external Google Sheets data.
                  </p>
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
                    <option value="USER">Staff User</option>
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

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Assigned Platform (Optional Scope)
                  </label>
                  <select
                    value={assignedPlatform}
                    onChange={(e) => setAssignedPlatform(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px" }}
                  >
                    <option value="">All Platforms (Unrestricted Access)</option>
                    {platforms.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={allowExternalUpload}
                      onChange={(e) => setAllowExternalUpload(e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    Allow External Data Upload
                  </label>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, marginLeft: 24 }}>
                    If enabled, this staff user can upload external Google Sheets data.
                  </p>
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
