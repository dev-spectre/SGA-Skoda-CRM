"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface UserActivityStat {
  userId: number;
  username: string;
  role: string;
  assignedBranch: string | null;
  assignedPlatform: string | null;
  allowExternalUpload: boolean;
  total: number;
  notContacted: number;
  pending: number;
  live: number;
  lost: number;
  testDriveYes: number;
  testDriveNo: number;
  externalUploaded: number;
  lastUploadAt: string | null;
  changesCount: number;
  lastActiveAt: string | null;
}

interface AuditLog {
  id: number;
  leadId: number;
  userId: number | null;
  username: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  details: string | null;
  createdAt: string;
  lead?: {
    id: number;
    name: string;
    phone: string;
    city: string;
    branch: string;
    platform: string | null;
    status: string;
    assignedConsultant: string | null;
    testDrive: string | null;
  };
  user?: {
    id: number;
    username: string;
    role: string;
    assignedBranch: string | null;
  };
}

interface LeadItem {
  id: number;
  name: string;
  phone: string;
  city: string;
  adname: string;
  branch: string;
  platform: string | null;
  status: string;
  testDrive: string | null;
  assignedConsultant: string | null;
  handledBy?: string | null;
  followUpDate1: string | null;
  followUpDate2: string | null;
  remark: string | null;
  source: string;
  uploadedById: number | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    activities: number;
  };
}

interface UserSessionProfile {
  userId: number;
  username: string;
  role: string;
  assignedBranch: string | null;
  assignedPlatform: string | null;
  isSuperAdmin?: boolean;
}

export default function UserActivityPage() {
  const [currentUser, setCurrentUser] = useState<UserSessionProfile | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "explorer" | "logs">("users");

  // Overview states
  const [activityStats, setActivityStats] = useState<UserActivityStat[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [userSearch, setUserSearch] = useState("");

  // Explorer states (Handled / Uploaded Leads)
  const [selectedUser, setSelectedUser] = useState<UserActivityStat | null>(null);
  const [explorerType, setExplorerType] = useState<"handled" | "uploaded">("handled");
  const [explorerStatus, setExplorerStatus] = useState("all");
  const [explorerSearch, setExplorerSearch] = useState("");
  const [explorerLeads, setExplorerLeads] = useState<LeadItem[]>([]);
  const [loadingExplorer, setLoadingExplorer] = useState(false);
  const [explorerPage, setExplorerPage] = useState(1);
  const [explorerTotalPages, setExplorerTotalPages] = useState(1);
  const [explorerTotalCount, setExplorerTotalCount] = useState(0);

  // Live Audit Logs states (Superadmin only)
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logUserFilter, setLogUserFilter] = useState<string>("all");
  const [logActionFilter, setLogActionFilter] = useState<string>("all");
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logTotalCount, setLogTotalCount] = useState(0);

  // Lead History Modal (Superadmin only)
  const [historyModalLead, setHistoryModalLead] = useState<LeadItem | null>(null);
  const [leadHistoryLogs, setLeadHistoryLogs] = useState<AuditLog[]>([]);
  const [loadingHistoryLogs, setLoadingHistoryLogs] = useState(false);

  // Auto refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const isSuperAdmin = Boolean(
    currentUser?.isSuperAdmin ||
    currentUser?.role === "SUPERADMIN" ||
    currentUser?.userId === -1 ||
    currentUser?.username?.toLowerCase() === "sudo"
  );

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (res.ok && data.user) {
        setCurrentUser(data.user);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch("/api/admin/activity");
      const data = await res.json();
      if (res.ok && data.activity) {
        setActivityStats(data.activity);
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      console.error("Failed to load user activity summary", err);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchExplorerLeads = useCallback(async () => {
    setLoadingExplorer(true);
    try {
      const params = new URLSearchParams();
      if (selectedUser) params.set("userId", String(selectedUser.userId));
      params.set("type", explorerType);
      if (explorerStatus !== "all") params.set("status", explorerStatus);
      if (explorerSearch.trim()) params.set("search", explorerSearch.trim());
      params.set("page", String(explorerPage));
      params.set("limit", "25");

      const res = await fetch(`/api/admin/activity/handled-leads?${params.toString()}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.leads)) {
        setExplorerLeads(data.leads);
        if (data.pagination) {
          setExplorerTotalPages(data.pagination.totalPages || 1);
          setExplorerTotalCount(data.pagination.total || 0);
        }
      }
    } catch (err) {
      console.error("Failed to load explorer leads", err);
    } finally {
      setLoadingExplorer(false);
    }
  }, [selectedUser, explorerType, explorerStatus, explorerSearch, explorerPage]);

  const fetchAuditLogs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      if (logUserFilter !== "all") params.set("userId", logUserFilter);
      if (logActionFilter !== "all") params.set("action", logActionFilter);
      if (logSearch.trim()) params.set("search", logSearch.trim());
      params.set("page", String(logPage));
      params.set("limit", "25");

      const res = await fetch(`/api/admin/activity/logs?${params.toString()}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.logs)) {
        setLogs(data.logs);
        if (data.pagination) {
          setLogTotalPages(data.pagination.totalPages || 1);
          setLogTotalCount(data.pagination.total || 0);
        }
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      console.error("Failed to load audit logs", err);
    } finally {
      setLoadingLogs(false);
    }
  }, [isSuperAdmin, logUserFilter, logActionFilter, logSearch, logPage]);

  const openLeadHistoryModal = async (lead: LeadItem) => {
    if (!isSuperAdmin) return;
    setHistoryModalLead(lead);
    setLoadingHistoryLogs(true);
    try {
      const res = await fetch(`/api/admin/activity/logs?leadId=${lead.id}&limit=100`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.logs)) {
        setLeadHistoryLogs(data.logs);
      } else {
        setLeadHistoryLogs([]);
      }
    } catch {
      setLeadHistoryLogs([]);
    } finally {
      setLoadingHistoryLogs(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchOverview();
  }, [fetchCurrentUser, fetchOverview]);

  useEffect(() => {
    if (activeTab === "explorer") {
      fetchExplorerLeads();
    }
  }, [activeTab, fetchExplorerLeads]);

  useEffect(() => {
    if (activeTab === "logs" && isSuperAdmin) {
      fetchAuditLogs();
    }
  }, [activeTab, isSuperAdmin, fetchAuditLogs]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      if (activeTab === "users") fetchOverview();
      else if (activeTab === "explorer") fetchExplorerLeads();
      else if (activeTab === "logs" && isSuperAdmin) fetchAuditLogs();
    }, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, activeTab, isSuperAdmin, fetchOverview, fetchExplorerLeads, fetchAuditLogs]);

  const handleInspectUser = (user: UserActivityStat, type: "handled" | "uploaded" = "handled") => {
    setSelectedUser(user);
    setExplorerType(type);
    setExplorerPage(1);
    setActiveTab("explorer");
  };

  const handleFilterUserLogs = (user: UserActivityStat) => {
    if (!isSuperAdmin) return;
    setLogUserFilter(String(user.userId));
    setLogPage(1);
    setActiveTab("logs");
  };

  const filteredUsers = activityStats.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.assignedPlatform && u.assignedPlatform.toLowerCase().includes(q))
    );
  });

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const formatFullDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "STATUS_CHANGE":
        return { label: "Status Update", color: "#2563eb", bg: "rgba(37, 99, 235, 0.1)" };
      case "REMARK_UPDATE":
        return { label: "Remark Added", color: "#059669", bg: "rgba(16, 185, 129, 0.1)" };
      case "FOLLOWUP_DATE_1":
      case "FOLLOWUP_DATE_2":
        return { label: "Follow-up Set", color: "#d97706", bg: "rgba(217, 119, 6, 0.1)" };
      case "CONSULTANT_ASSIGN":
        return { label: "Consultant Assigned", color: "#7c3aed", bg: "rgba(124, 58, 237, 0.1)" };
      case "TEST_DRIVE":
        return { label: "Test Drive", color: "#ec4899", bg: "rgba(236, 72, 153, 0.1)" };
      case "EXTERNAL_UPLOAD":
        return { label: "External Upload", color: "#0284c7", bg: "rgba(2, 132, 199, 0.1)" };
      default:
        return { label: action.replace(/_/g, " "), color: "var(--text-secondary)", bg: "rgba(148, 163, 184, 0.15)" };
    }
  };

  const getActionDescription = (action: string, oldValue?: string | null, newValue?: string | null): string => {
    const fmt = (v?: string | null) => (v || "").replace(/_/g, " ");
    switch (action) {
      case "STATUS_CHANGE":
        return `Changed status from "${fmt(oldValue)}" to "${fmt(newValue)}"`;
      case "REMARK_UPDATE":
        if (!newValue) return "Cleared remark";
        return `Added remark: "${newValue.length > 80 ? newValue.slice(0, 80) + "…" : newValue}"`;
      case "FOLLOWUP_DATE_1":
        return newValue ? `Set Follow-up 1 date to ${newValue}` : "Removed Follow-up 1 date";
      case "FOLLOWUP_DATE_2":
        return newValue ? `Set Follow-up 2 date to ${newValue}` : "Removed Follow-up 2 date";
      case "CONSULTANT_ASSIGN":
        return newValue ? `Assigned consultant to "${newValue}"` : "Unassigned consultant";
      case "TEST_DRIVE":
        return newValue ? `Updated Test Drive to "${newValue}"` : "Cleared Test Drive";
      case "EXTERNAL_UPLOAD":
        return `Uploaded lead via external import`;
      default:
        return `Modified lead (${action.replace(/_/g, " ")})`;
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "not_contacted" || s === "created") {
      return { label: "Not Contacted", bg: "#f8fafc", color: "#475569", border: "#cbd5e1" };
    }
    if (s === "pending") {
      return { label: "Contacted", bg: "#fffbeb", color: "#b45309", border: "#fde68a" };
    }
    if (s === "live" || s === "closed_successful") {
      return { label: "Completed", bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" };
    }
    if (s === "lost" || s === "closed_unsuccessful") {
      return { label: "Lost", bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" };
    }
    return { label: status, bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };
  };

  if (currentUser && currentUser.role !== "ADMIN" && currentUser.role !== "SUPERADMIN") {
    return (
      <div style={{ textAlign: "center", padding: "100px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(239, 68, 68, 0.1)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "#ef4444" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: "var(--text-primary)" }}>
          Administrator Access Required
        </h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 460, margin: "0 auto 24px auto", fontSize: 14 }}>
          User Activity monitoring, user matrix, and lead portfolio tracking are restricted to Administrators.
        </p>
        <Link href="/dashboard" className="btn btn-primary">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="settings-page" style={{ maxWidth: "1350px", margin: "0 auto", paddingBottom: "60px" }}>
      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)", marginTop: 4 }}>
            User Activity Tracker
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>
            Monitor leads handled by each user member, lead status distributions, and lead uploads.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>


          {/* <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="btn btn-secondary btn-sm"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              background: autoRefresh ? "rgba(16, 185, 129, 0.1)" : undefined,
              borderColor: autoRefresh ? "rgba(16, 185, 129, 0.4)" : undefined,
              color: autoRefresh ? "#059669" : undefined,
            }}
            title="Auto-refresh activity stream every 15 seconds"
          >
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: autoRefresh ? "#10b981" : "#94a3b8" }} />
            {autoRefresh ? "Live Auto-Refresh ON" : "Live Auto-Refresh OFF"}
          </button> */}

          <button
            onClick={() => {
              if (activeTab === "users") fetchOverview();
              else if (activeTab === "explorer") fetchExplorerLeads();
              else if (activeTab === "logs" && isSuperAdmin) fetchAuditLogs();
            }}
            className="btn btn-primary btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            Refresh Data
          </button>

          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Updated: {lastRefreshedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).toLocaleUpperCase()}
          </span>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid var(--border)",
          marginBottom: "24px",
          background: "var(--bg-card)",
          borderRadius: "10px 10px 0 0",
          padding: "4px 8px 0 8px",
        }}
      >
        <button
          onClick={() => setActiveTab("users")}
          style={{
            padding: "12px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "users" ? "3px solid var(--primary)" : "3px solid transparent",
            color: activeTab === "users" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "users" ? 700 : 500,
            cursor: "pointer",
            fontSize: "14px",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          Activity Overview
        </button>

        <button
          onClick={() => {
            setActiveTab("explorer");
            if (!selectedUser && activityStats.length > 0) {
              setSelectedUser(activityStats[0]);
            }
          }}
          style={{
            padding: "12px 18px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "explorer" ? "3px solid var(--primary)" : "3px solid transparent",
            color: activeTab === "explorer" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "explorer" ? 700 : 500,
            cursor: "pointer",
            fontSize: "14px",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Leads Viewer
          {selectedUser && (
            <span style={{ fontSize: 11, background: "rgba(16, 185, 129, 0.12)", color: "#059669", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
              {selectedUser.username}
            </span>
          )}
        </button>

        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab("logs")}
            style={{
              padding: "12px 18px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "logs" ? "3px solid var(--primary)" : "3px solid transparent",
              color: activeTab === "logs" ? "var(--primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "logs" ? 700 : 500,
              cursor: "pointer",
              fontSize: "14px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            Live Audit & Change Log
          </button>
        )}
      </div>

      {/* ========================================================== */}
      {/* TAB 1: USERS OVERVIEW & HANDLED LEADS MATRIX */}
      {/* ========================================================== */}
      {activeTab === "users" && (
        <>
          {/* Search Bar */}
          <div className="filter-bar" style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
              <input
                type="text"
                placeholder="Search user by username, role, or platform..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
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

          {/* User Activity Table without Branch Scope */}
          <div className="glass-card" style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
            <div className="table-container">
              <table className="leads-table" style={{ background: "#ffffff", width: "100%" }}>
                <thead>
                  <tr style={{ background: "rgba(16, 185, 129, 0.03)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      User
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Handled Leads
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase", minWidth: 360 }}>
                      Status Distribution
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Test Drives
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Uploads
                    </th>
                    {isSuperAdmin && (
                      <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Audit Changes
                      </th>
                    )}
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Last Active
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase", textAlign: "right" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingOverview ? (
                    <tr>
                      <td colSpan={isSuperAdmin ? 8 : 7} style={{ textAlign: "center", padding: "48px 20px" }}>
                        <span className="spinner" style={{ marginRight: 8 }} /> Loading user activity data...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={isSuperAdmin ? 8 : 7} style={{ textAlign: "center", color: "var(--text-muted)", padding: "48px 20px" }}>
                        No user found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const totalStatus = u.notContacted + u.pending + u.live + u.lost;
                      const hasLeads = totalStatus > 0;
                      const pNotContacted = hasLeads ? Math.round((u.notContacted / totalStatus) * 100) : 0;
                      const pPending = hasLeads ? Math.round((u.pending / totalStatus) * 100) : 0;
                      const pLive = hasLeads ? Math.round((u.live / totalStatus) * 100) : 0;
                      const pLost = hasLeads ? Math.round((u.lost / totalStatus) * 100) : 0;

                      return (
                        <tr key={u.userId} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.15)" }}>
                          {/* Staff Member */}
                          <td style={{ padding: "16px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div
                                style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: "50%",
                                  background: u.role === "ADMIN" ? "rgba(16, 185, 129, 0.12)" : "rgba(37, 99, 235, 0.12)",
                                  color: u.role === "ADMIN" ? "#059669" : "#2563eb",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: 15,
                                  border: `1px solid ${u.role === "ADMIN" ? "rgba(16, 185, 129, 0.3)" : "rgba(37, 99, 235, 0.3)"}`,
                                }}
                              >
                                {u.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                                  {u.username}
                                </div>
                                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: "1px 6px",
                                      borderRadius: 4,
                                      background: u.role === "ADMIN" ? "rgba(16, 185, 129, 0.15)" : "rgba(37, 99, 235, 0.15)",
                                      color: u.role === "ADMIN" ? "#059669" : "#2563eb",
                                    }}
                                  >
                                    {u.role}
                                  </span>
                                  {u.assignedPlatform && (
                                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                      • {u.assignedPlatform}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Handled Leads Count */}
                          <td style={{ padding: "16px 18px" }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>
                              {u.total.toLocaleString()}
                            </div>
                          </td>

                          {/* Improved Status Distribution */}
                          <td style={{ padding: "16px 18px" }}>
                            {hasLeads ? (
                              <div>
                                {/* Multi-segmented Progress Bar */}
                                <div
                                  style={{
                                    display: "flex",
                                    height: 10,
                                    borderRadius: 6,
                                    overflow: "hidden",
                                    background: "#e2e8f0",
                                    marginBottom: 8,
                                    border: "1px solid rgba(0,0,0,0.05)",
                                  }}
                                >
                                  {u.notContacted > 0 && (
                                    <div
                                      style={{ width: `${pNotContacted}%`, background: "#64748b", transition: "width 0.3s ease" }}
                                      title={`Not Contacted: ${u.notContacted} (${pNotContacted}%)`}
                                    />
                                  )}
                                  {u.pending > 0 && (
                                    <div
                                      style={{ width: `${pPending}%`, background: "#f59e0b", transition: "width 0.3s ease" }}
                                      title={`Contacted: ${u.pending} (${pPending}%)`}
                                    />
                                  )}
                                  {u.live > 0 && (
                                    <div
                                      style={{ width: `${pLive}%`, background: "#10b981", transition: "width 0.3s ease" }}
                                      title={`Completed: ${u.live} (${pLive}%)`}
                                    />
                                  )}
                                  {u.lost > 0 && (
                                    <div
                                      style={{ width: `${pLost}%`, background: "#ef4444", transition: "width 0.3s ease" }}
                                      title={`Lost: ${u.lost} (${pLost}%)`}
                                    />
                                  )}
                                </div>

                                {/* Status Badges Grid */}
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 10px", fontSize: 11 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#64748b", flexShrink: 0 }} />
                                    <span style={{ color: "var(--text-secondary)" }}>Not Contacted:</span>
                                    <span style={{ fontWeight: 700, color: "#475569" }}>{u.notContacted}</span>
                                    <span style={{ color: "var(--text-muted)", fontSize: 10 }}>({pNotContacted}%)</span>
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                                    <span style={{ color: "var(--text-secondary)" }}>Contacted:</span>
                                    <span style={{ fontWeight: 700, color: "#b45309" }}>{u.pending}</span>
                                    <span style={{ color: "var(--text-muted)", fontSize: 10 }}>({pPending}%)</span>
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                                    <span style={{ color: "var(--text-secondary)" }}>Completed:</span>
                                    <span style={{ fontWeight: 700, color: "#047857" }}>{u.live}</span>
                                    <span style={{ color: "var(--text-muted)", fontSize: 10 }}>({pLive}%)</span>
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                                    <span style={{ color: "var(--text-secondary)" }}>Lost:</span>
                                    <span style={{ fontWeight: 700, color: "#b91c1c" }}>{u.lost}</span>
                                    <span style={{ color: "var(--text-muted)", fontSize: 10 }}>({pLost}%)</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>0 leads handled</span>
                            )}
                          </td>

                          {/* Test Drives */}
                          <td style={{ padding: "16px 18px" }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>
                              <span style={{ color: "#059669" }}>{u.testDriveYes}</span>{" "}
                              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>/ {u.testDriveNo}</span>
                            </div>
                          </td>

                          {/* External Uploads */}
                          <td style={{ padding: "16px 18px" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: u.externalUploaded > 0 ? "#7c3aed" : "var(--text-muted)" }}>
                              {u.externalUploaded}
                            </div>
                            {u.lastUploadAt && (
                              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                Last: {formatRelativeTime(u.lastUploadAt)}
                              </div>
                            )}
                          </td>

                          {/* Audit Changes Count (Superadmin only) */}
                          {isSuperAdmin && (
                            <td style={{ padding: "16px 18px" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "3px 8px",
                                  borderRadius: 12,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: u.changesCount > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)",
                                  color: u.changesCount > 0 ? "#059669" : "var(--text-muted)",
                                }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                </svg>
                                {u.changesCount}
                              </span>
                            </td>
                          )}

                          {/* Last Active */}
                          <td style={{ padding: "16px 18px" }}>
                            <div
                              style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500, cursor: "pointer" }}
                              title={formatFullDate(u.lastActiveAt)}
                            >
                              {formatRelativeTime(u.lastActiveAt)}
                            </div>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "16px 18px", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleInspectUser(u, "handled")}
                                style={{ fontSize: 12, padding: "5px 10px" }}
                                title="Inspect leads handled by this user"
                              >
                                View Leads
                              </button>

                              {u.externalUploaded > 0 && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleInspectUser(u, "uploaded")}
                                  style={{ fontSize: 12, padding: "5px 10px", color: "#7c3aed" }}
                                  title="View external leads uploaded by this user"
                                >
                                  Uploads ({u.externalUploaded})
                                </button>
                              )}

                              {isSuperAdmin && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleFilterUserLogs(u)}
                                  style={{ fontSize: 12, padding: "5px 10px" }}
                                  title="View activity change history (Superadmin)"
                                >
                                  Log
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================== */}
      {/* TAB 2: HANDLED & UPLOADED LEADS VIEWER */}
      {/* ========================================================== */}
      {activeTab === "explorer" && (
        <>
          {/* Sub-Header & Controls */}
          <div className="card" style={{ marginBottom: 20, background: "#ffffff", padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              {/* User Selection */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>User</span>
                <select
                  value={selectedUser ? String(selectedUser.userId) : ""}
                  onChange={(e) => {
                    const u = activityStats.find((s) => s.userId === parseInt(e.target.value));
                    setSelectedUser(u || null);
                    setExplorerPage(1);
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--primary)",
                    fontWeight: 700,
                    fontSize: 14,
                    background: "#ffffff",
                    color: "var(--text-primary)",
                  }}
                >
                  {activityStats.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.username} ({u.role})
                    </option>
                  ))}
                </select>

                {/* Switch between Handled and Uploaded */}
                <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 8, padding: 3, border: "1px solid var(--border)" }}>
                  <button
                    onClick={() => {
                      setExplorerType("handled");
                      setExplorerPage(1);
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "none",
                      fontSize: 13,
                      fontWeight: explorerType === "handled" ? 700 : 500,
                      background: explorerType === "handled" ? "#ffffff" : "transparent",
                      color: explorerType === "handled" ? "var(--primary)" : "var(--text-secondary)",
                      boxShadow: explorerType === "handled" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    Leads Handled ({selectedUser?.total || 0})
                  </button>

                  <button
                    onClick={() => {
                      setExplorerType("uploaded");
                      setExplorerPage(1);
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "none",
                      fontSize: 13,
                      fontWeight: explorerType === "uploaded" ? 700 : 500,
                      background: explorerType === "uploaded" ? "#ffffff" : "transparent",
                      color: explorerType === "uploaded" ? "var(--primary)" : "var(--text-secondary)",
                      boxShadow: explorerType === "uploaded" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    Uploaded ({selectedUser?.externalUploaded || 0})
                  </button>
                </div>
              </div>

              {/* Status Filter and Search */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select
                  value={explorerStatus}
                  onChange={(e) => {
                    setExplorerStatus(e.target.value);
                    setExplorerPage(1);
                  }}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}
                >
                  <option value="all">All Statuses</option>
                  <option value="not_contacted">Not Contacted</option>
                  <option value="pending">Contacted</option>
                  <option value="live">Completed</option>
                  <option value="lost">Lost</option>
                </select>

                <div style={{ position: "relative", minWidth: 200 }}>
                  <input
                    type="text"
                    placeholder="Search leads..."
                    value={explorerSearch}
                    onChange={(e) => {
                      setExplorerSearch(e.target.value);
                      setExplorerPage(1);
                    }}
                    style={{ padding: "8px 12px", paddingLeft: 32, borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}
                  />
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2"
                    style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, pointerEvents: "none" }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Leads Table */}
          <div className="glass-card" style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
            <div className="table-container">
              <table className="leads-table" style={{ background: "#ffffff", width: "100%" }}>
                <thead>
                  <tr style={{ background: "rgba(16, 185, 129, 0.03)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Lead Name & Contact
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Branch / Platform
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Status
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Assigned Consultant
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Test Drive
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Follow-ups / Remarks
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      {explorerType === "uploaded" ? "Uploaded Date" : "Last Updated"}
                    </th>
                    {isSuperAdmin && (
                      <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase", textAlign: "right" }}>
                        Audit History
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loadingExplorer ? (
                    <tr>
                      <td colSpan={isSuperAdmin ? 8 : 7} style={{ textAlign: "center", padding: "48px 20px" }}>
                        <span className="spinner" style={{ marginRight: 8 }} /> Loading leads for {selectedUser?.username}...
                      </td>
                    </tr>
                  ) : explorerLeads.length === 0 ? (
                    <tr>
                      <td colSpan={isSuperAdmin ? 8 : 7} style={{ textAlign: "center", color: "var(--text-muted)", padding: "48px 20px" }}>
                        No {explorerType} leads found for {selectedUser?.username || "selected user"} with current filters.
                      </td>
                    </tr>
                  ) : (
                    explorerLeads.map((lead) => {
                      const badge = getStatusBadge(lead.status);

                      return (
                        <tr key={lead.id} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.15)" }}>
                          {/* Name & Contact */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{lead.name}</div>
                            {lead.handledBy && (
                              <div style={{ marginTop: 3 }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "1px 7px",
                                    borderRadius: "10px",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    background: "rgba(37, 99, 235, 0.08)",
                                    color: "#2563eb",
                                    border: "1px solid rgba(37, 99, 235, 0.2)",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={`Handled by ${lead.handledBy}`}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                  </svg>
                                  Handled by {lead.handledBy}
                                </span>
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, color: "var(--text-muted)" }}>
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                              </svg>
                              {lead.phone}
                            </div>
                            {lead.city && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                  <circle cx="12" cy="10" r="3"></circle>
                                </svg>
                                {lead.city}
                              </div>
                            )}
                          </td>

                          {/* Branch / Platform */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontWeight: 600, fontSize: 13, textTransform: "capitalize" }}>
                              {lead.branch ? lead.branch.replace(/_/g, " ") : "—"}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {lead.platform && !/^\d{4}-\d{2}-\d{2}$/.test(lead.platform) ? lead.platform : "Primary Sheet"}
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: "14px 18px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "4px 10px",
                                borderRadius: 16,
                                fontSize: 12,
                                fontWeight: 700,
                                background: badge.bg,
                                color: badge.color,
                                border: `1px solid ${badge.border}`,
                              }}
                            >
                              {badge.label}
                            </span>
                          </td>

                          {/* Assigned Consultant */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{lead.assignedConsultant || "—"}</div>
                          </td>

                          {/* Test Drive */}
                          <td style={{ padding: "14px 18px" }}>
                            {lead.testDrive && lead.testDrive !== "Not Scheduled" && lead.testDrive !== "No" ? (
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: 4 }}>
                                {lead.testDrive}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
                            )}
                          </td>

                          {/* Follow-up / Remarks */}
                          <td style={{ padding: "14px 18px", maxWidth: 220 }}>
                            {lead.remark && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={lead.remark}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, flexShrink: 0, color: "var(--text-muted)" }}>
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                </svg>
                                {lead.remark}
                              </div>
                            )}
                            {lead.followUpDate1 && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#d97706", marginTop: 2 }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
                                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                  <line x1="16" y1="2" x2="16" y2="6"></line>
                                  <line x1="8" y1="2" x2="8" y2="6"></line>
                                  <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                                F1: {new Date(lead.followUpDate1).toLocaleDateString("en-IN")}
                              </div>
                            )}
                          </td>

                          {/* Date */}
                          <td style={{ padding: "14px 18px", fontSize: 12, color: "var(--text-muted)" }}>
                            {explorerType === "uploaded" && lead.uploadedAt ? (
                              <div>{formatRelativeTime(lead.uploadedAt)}</div>
                            ) : (
                              <div>{formatRelativeTime(lead.updatedAt)}</div>
                            )}
                          </td>

                          {/* Actions (Superadmin only) */}
                          {isSuperAdmin && (
                            <td style={{ padding: "14px 18px", textAlign: "right" }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => openLeadHistoryModal(lead)}
                                style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                View History
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {explorerTotalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Showing {explorerLeads.length} of {explorerTotalCount} leads
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={explorerPage <= 1}
                    onClick={() => setExplorerPage(explorerPage - 1)}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 13, display: "flex", alignItems: "center", padding: "0 8px" }}>
                    Page {explorerPage} of {explorerTotalPages}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={explorerPage >= explorerTotalPages}
                    onClick={() => setExplorerPage(explorerPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================== */}
      {/* TAB 3: LIVE AUDIT & CHANGE LOG FEED (SUPERADMIN ONLY) */}
      {/* ========================================================== */}
      {activeTab === "logs" && isSuperAdmin && (
        <>
          {/* Filter Bar */}
          <div className="filter-bar" style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
              <input
                type="text"
                placeholder="Search audit changes by lead name, phone, user, or details..."
                value={logSearch}
                onChange={(e) => {
                  setLogSearch(e.target.value);
                  setLogPage(1);
                }}
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

            <select
              value={logUserFilter}
              onChange={(e) => {
                setLogUserFilter(e.target.value);
                setLogPage(1);
              }}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "#ffffff" }}
            >
              <option value="all">All Users</option>
              {activityStats.map((u) => (
                <option key={u.userId} value={String(u.userId)}>
                  {u.username} ({u.role})
                </option>
              ))}
            </select>

            <select
              value={logActionFilter}
              onChange={(e) => {
                setLogActionFilter(e.target.value);
                setLogPage(1);
              }}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, background: "#ffffff" }}
            >
              <option value="all">All Action Types</option>
              <option value="STATUS_CHANGE">Status Changes</option>
              <option value="REMARK_UPDATE">Remark Updates</option>
              <option value="FOLLOWUP_DATE_1">Follow-up 1 Updates</option>
              <option value="FOLLOWUP_DATE_2">Follow-up 2 Updates</option>
              <option value="CONSULTANT_ASSIGN">Consultant Assignments</option>
              <option value="TEST_DRIVE">Test Drive Updates</option>
              <option value="EXTERNAL_UPLOAD">External Uploads</option>
            </select>
          </div>

          {/* Audit Logs Table */}
          <div className="glass-card" style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
            <div className="table-container">
              <table className="leads-table" style={{ background: "#ffffff", width: "100%" }}>
                <thead>
                  <tr style={{ background: "rgba(16, 185, 129, 0.03)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Timestamp
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      User
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Lead Affected
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Action Type
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Change Details (Diff)
                    </th>
                    <th style={{ padding: "14px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase", textAlign: "right" }}>
                      Inspect Lead
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "48px 20px" }}>
                        <span className="spinner" style={{ marginRight: 8 }} /> Loading audit change stream...
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: "48px 20px" }}>
                        No audit change logs found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const actionBadge = getActionBadge(log.action);

                      return (
                        <tr key={log.id} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.15)" }}>
                          {/* Timestamp */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                              {formatRelativeTime(log.createdAt)}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {formatFullDate(log.createdAt)}
                            </div>
                          </td>

                          {/* Staff Member */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "50%",
                                  background: "rgba(37, 99, 235, 0.1)",
                                  color: "#2563eb",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: 12,
                                }}
                              >
                                {log.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span style={{ fontWeight: 700, fontSize: 13 }}>{log.username}</span>
                                {log.user?.assignedBranch && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-muted)" }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                      <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                    {log.user.assignedBranch.replace(/_/g, " ")}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Lead Affected */}
                          <td style={{ padding: "14px 18px" }}>
                            {log.lead ? (
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                                  {log.lead.name}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10, color: "var(--text-muted)" }}>
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                  </svg>
                                  {log.lead.phone}
                                </div>
                                {log.lead.branch && (
                                  <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
                                    {log.lead.branch.replace(/_/g, " ")}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Lead #{log.leadId}</div>
                            )}
                          </td>

                          {/* Action Type */}
                          <td style={{ padding: "14px 18px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "3px 10px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 700,
                                background: actionBadge.bg,
                                color: actionBadge.color,
                              }}
                            >
                              {actionBadge.label}
                            </span>
                          </td>

                          {/* Change Details */}
                          <td style={{ padding: "14px 18px", maxWidth: 360 }}>
                            <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                              {getActionDescription(log.action, log.oldValue, log.newValue)}
                            </div>

                            {/* Diff visualization */}
                            {log.oldValue && log.newValue && log.oldValue !== log.newValue && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11 }}>
                                <span style={{ padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#b91c1c" }}>
                                  {log.oldValue}
                                </span>
                                <span style={{ color: "var(--text-muted)" }}>➔</span>
                                <span style={{ padding: "1px 6px", borderRadius: 4, background: "#dcfce7", color: "#15803d", fontWeight: 600 }}>
                                  {log.newValue}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Inspect Lead Action */}
                          <td style={{ padding: "14px 18px", textAlign: "right" }}>
                            {log.lead && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => openLeadHistoryModal(log.lead as LeadItem)}
                                style={{ fontSize: 12, padding: "4px 10px" }}
                              >
                                History
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Logs Pagination */}
            {logTotalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Showing {logs.length} of {logTotalCount} audit events
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={logPage <= 1}
                    onClick={() => setLogPage(logPage - 1)}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 13, display: "flex", alignItems: "center", padding: "0 8px" }}>
                    Page {logPage} of {logTotalPages}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={logPage >= logTotalPages}
                    onClick={() => setLogPage(logPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================== */}
      {/* MODAL: SINGLE LEAD AUDIT & CHANGE TIMELINE (SUPERADMIN ONLY) */}
      {/* ========================================================== */}
      {historyModalLead && isSuperAdmin && (
        <div className="modal-overlay" onClick={() => setHistoryModalLead(null)}>
          <div
            className="modal"
            style={{ maxWidth: 750, width: "95%", background: "#ffffff", borderRadius: 14, padding: 24, boxShadow: "var(--shadow)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase" }}>
                  Lead Modification Timeline
                </span>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", margin: "4px 0" }}>
                  {historyModalLead.name}
                </h2>
                <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                    {historyModalLead.phone}
                  </span>
                  {historyModalLead.branch && (
                    <span>• {historyModalLead.branch.replace(/_/g, " ")}</span>
                  )}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setHistoryModalLead(null)} style={{ fontSize: 16 }}>
                ✕
              </button>
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
              {loadingHistoryLogs ? (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <span className="spinner" /> Loading change history...
                </div>
              ) : leadHistoryLogs.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(148, 163, 184, 0.15)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12, color: "var(--text-muted)" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                  </div>
                  <div>No previous audit modifications recorded for this lead yet.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>New changes made by user will automatically appear here.</div>
                </div>
              ) : (
                <div style={{ position: "relative", paddingLeft: 24, borderLeft: "2px solid #e2e8f0", marginLeft: 12 }}>
                  {leadHistoryLogs.map((h) => {
                    const badge = getActionBadge(h.action);

                    return (
                      <div key={h.id} style={{ marginBottom: 20, position: "relative" }}>
                        {/* Timeline Dot */}
                        <div
                          style={{
                            position: "absolute",
                            left: -31,
                            top: 4,
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: badge.color,
                            border: "2px solid #ffffff",
                            boxShadow: "0 0 0 2px " + badge.bg,
                          }}
                        />

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{h.username}</span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "1px 6px",
                                borderRadius: 4,
                                background: badge.bg,
                                color: badge.color,
                              }}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatFullDate(h.createdAt)}</span>
                        </div>

                        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{h.details}</div>

                        {h.oldValue && h.newValue && h.oldValue !== h.newValue && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11 }}>
                            <span style={{ padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#b91c1c" }}>
                              {h.oldValue}
                            </span>
                            <span>➔</span>
                            <span style={{ padding: "1px 6px", borderRadius: 4, background: "#dcfce7", color: "#15803d", fontWeight: 600 }}>
                              {h.newValue}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-secondary" onClick={() => setHistoryModalLead(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
