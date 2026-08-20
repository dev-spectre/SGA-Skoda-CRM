"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import BranchConsultantPicker from "@/components/BranchConsultantPicker";


interface PerformanceStat {
  id: number;
  consultant: string;
  branch?: string;
  total: number;
  notContacted: number;
  pending: number;
  live: number;
  lost: number;
  testDriveYes: number;
  testDriveNo: number;
}

interface ConsultantRecord {
  id: number;
  name: string;
  branch: string;
  leadsCount?: number;
  createdAt: string;
}

const formatTestDriveRate = (yesCount: number, totalCount: number) => {
  if (totalCount <= 0) return { pctStr: "0%", ratioStr: "(0/0)", fullStr: "0% (0/0)" };
  const rawPct = (yesCount / totalCount) * 100;
  const pctStr = (rawPct % 1 === 0 ? rawPct.toFixed(0) : rawPct.toFixed(2)) + "%";
  const ratioStr = `(${yesCount}/${totalCount})`;
  return { pctStr, ratioStr, fullStr: `${pctStr} ${ratioStr}` };
};

export default function ConsultantsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"performance" | "manage">("performance");
  const [stats, setStats] = useState<PerformanceStat[]>([]);
  const [consultants, setConsultants] = useState<ConsultantRecord[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingConsultants, setLoadingConsultants] = useState(false);
  const [userRole, setUserRole] = useState<string>("USER");
  const [accessDenied, setAccessDenied] = useState(false);

  // Filters for Performance tab
  const [searchPerf, setSearchPerf] = useState("");
  const [branchFilterPerf, setBranchFilterPerf] = useState("");
  const [consultantFilterPerf, setConsultantFilterPerf] = useState("");
  const [sortFieldPerf, setSortFieldPerf] = useState<string>("testDriveRate");
  const [sortOrderPerf, setSortOrderPerf] = useState<"asc" | "desc">("desc");

  // Filters for Manage tab
  const [searchManage, setSearchManage] = useState("");
  const [branchFilterManage, setBranchFilterManage] = useState("");
  const [consultantFilterManage, setConsultantFilterManage] = useState("");


  // Add Consultant Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newConsultantName, setNewConsultantName] = useState("");
  const [newConsultantBranch, setNewConsultantBranch] = useState("");
  const [customBranchInput, setCustomBranchInput] = useState("");
  const [isCustomBranch, setIsCustomBranch] = useState(false);
  const [savingConsultant, setSavingConsultant] = useState(false);

  // Edit Consultant Modal State
  const [editModalConsultant, setEditModalConsultant] = useState<ConsultantRecord | null>(null);
  const [editConsultantName, setEditConsultantName] = useState("");
  const [editConsultantBranch, setEditConsultantBranch] = useState("");
  const [customEditBranchInput, setCustomEditBranchInput] = useState("");
  const [isCustomEditBranch, setIsCustomEditBranch] = useState(false);
  const [updatingConsultant, setUpdatingConsultant] = useState(false);

  // Delete Consultant Modal State
  const [deleteModalConsultant, setDeleteModalConsultant] = useState<ConsultantRecord | null>(null);
  const [deletingConsultant, setDeletingConsultant] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);


  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPerformanceData = useCallback(async () => {
    try {
      const perfRes = await fetch("/api/leads/performance");
      if (perfRes.ok) {
        const perfData = await perfRes.json();
        setStats(perfData.performance || []);
      } else if (perfRes.status === 403) {
        setAccessDenied(true);
      }
    } catch (e) {
      console.error("Failed to load consultant performance data:", e);
    }
  }, []);

  const fetchConsultantsList = useCallback(async () => {
    setLoadingConsultants(true);
    try {
      const res = await fetch("/api/consultants");
      if (res.ok) {
        const data = await res.json();
        setConsultants(data.consultants || []);
      }
    } catch (e) {
      console.error("Failed to fetch consultants:", e);
    } finally {
      setLoadingConsultants(false);
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/branches");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.branches)) {
          setBranches(data.branches);
        }
      }
    } catch (e) {
      console.error("Failed to fetch branches:", e);
    }
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (meData.user) {
        setUserRole(meData.user.role);
        if (meData.user.role !== "ADMIN" && meData.user.role !== "SUPERADMIN") {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
      }

      await Promise.all([
        fetchPerformanceData(),
        fetchConsultantsList(),
        fetchBranches(),
      ]);
    } catch (e) {
      console.error("Initialization error:", e);
    } finally {
      setLoading(false);
    }
  };



  useEffect(() => {
    fetchInitialData();
  }, []);

  const registeredConsultantsSet = useMemo(() => {
    return new Set(consultants.map((c) => c.name.toLowerCase().trim()));
  }, [consultants]);

  // Performance Tab Filtered Stats (strictly for registered consultants in Manage tab)
  const filteredPerformanceStats = useMemo(() => {
    return stats.filter((s) => {
      // Must be present in Manage Consultants list
      if (!registeredConsultantsSet.has(s.consultant.toLowerCase().trim())) {
        return false;
      }
      if (searchPerf.trim()) {
        const query = searchPerf.trim().toLowerCase();
        if (!s.consultant.toLowerCase().includes(query)) return false;
      }
      if (consultantFilterPerf) {
        if (consultantFilterPerf === "Unassigned") {
          if (s.consultant !== "Unassigned") return false;
        } else {
          if (s.consultant.toLowerCase() !== consultantFilterPerf.toLowerCase()) return false;
        }
      }
      if (branchFilterPerf) {
        if (s.consultant === "Unassigned") return false;
        if (!s.branch || !s.branch.toLowerCase().includes(branchFilterPerf.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [stats, registeredConsultantsSet, searchPerf, branchFilterPerf, consultantFilterPerf]);

  const sortedPerformanceStats = useMemo(() => {
    const list = [...filteredPerformanceStats];
    list.sort((a, b) => {
      if (a.consultant === "Unassigned") return 1;
      if (b.consultant === "Unassigned") return -1;

      let valA: number | string = 0;
      let valB: number | string = 0;

      if (sortFieldPerf === "testDriveRate") {
        valA = a.total > 0 ? a.testDriveYes / a.total : 0;
        valB = b.total > 0 ? b.testDriveYes / b.total : 0;
      } else if (sortFieldPerf === "total") {
        valA = a.total;
        valB = b.total;
      } else if (sortFieldPerf === "notContacted") {
        valA = a.notContacted;
        valB = b.notContacted;
      } else if (sortFieldPerf === "pending") {
        valA = a.pending;
        valB = b.pending;
      } else if (sortFieldPerf === "live") {
        valA = a.live;
        valB = b.live;
      } else if (sortFieldPerf === "lost") {
        valA = a.lost;
        valB = b.lost;
      } else if (sortFieldPerf === "branch") {
        valA = (a.branch || "").toLowerCase();
        valB = (b.branch || "").toLowerCase();
      } else {
        valA = a.consultant.toLowerCase();
        valB = b.consultant.toLowerCase();
      }

      if (valA < valB) return sortOrderPerf === "asc" ? -1 : 1;
      if (valA > valB) return sortOrderPerf === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredPerformanceStats, sortFieldPerf, sortOrderPerf]);



  const performanceAggregates = useMemo(() => {
    return filteredPerformanceStats.reduce(
      (acc, curr) => {
        acc.totalConsultants += curr.consultant !== "Unassigned" ? 1 : 0;
        acc.totalLeads += curr.total;
        acc.notContacted += curr.notContacted;
        acc.pending += curr.pending;
        acc.live += curr.live;
        acc.lost += curr.lost;
        acc.testDriveYes += curr.testDriveYes;
        acc.testDriveNo += curr.testDriveNo;
        return acc;
      },
      {
        totalConsultants: 0,
        totalLeads: 0,
        notContacted: 0,
        pending: 0,
        live: 0,
        lost: 0,
        testDriveYes: 0,
        testDriveNo: 0,
      }
    );
  }, [filteredPerformanceStats]);

  // Manage Tab Filtered Consultants
  const filteredConsultants = useMemo(() => {
    return consultants.filter((c) => {
      if (searchManage.trim()) {
        const query = searchManage.trim().toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesBranch = c.branch.toLowerCase().includes(query);
        if (!matchesName && !matchesBranch) return false;
      }
      if (consultantFilterManage) {
        if (c.name.toLowerCase() !== consultantFilterManage.toLowerCase()) return false;
      }
      if (branchFilterManage) {
        if (!c.branch || !c.branch.toLowerCase().includes(branchFilterManage.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [consultants, searchManage, branchFilterManage, consultantFilterManage]);


  const uniqueBranchesCount = useMemo(() => {
    const set = new Set(consultants.map((c) => c.branch.trim().toLowerCase()).filter(Boolean));
    return set.size;
  }, [consultants]);

  const handleOpenAddModal = () => {
    setNewConsultantName("");
    setNewConsultantBranch(branches.length > 0 ? branches[0] : "");
    setCustomBranchInput("");
    setIsCustomBranch(false);
    setAddModalOpen(true);
  };

  const handleCreateConsultant = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = newConsultantName.trim();
    const finalBranch = (isCustomBranch ? customBranchInput : newConsultantBranch).trim();

    if (!finalName) {
      showToast("Please enter consultant name", "error");
      return;
    }
    if (!finalBranch) {
      showToast("Please select or specify a branch", "error");
      return;
    }

    setSavingConsultant(true);
    try {
      const res = await fetch("/api/consultants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalName, branch: finalBranch }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Consultant "${finalName}" added successfully to ${finalBranch}`);
        setAddModalOpen(false);
        setNewConsultantName("");
        setNewConsultantBranch("");
        setCustomBranchInput("");
        await Promise.all([fetchConsultantsList(), fetchPerformanceData(), fetchBranches()]);
      } else {
        showToast(data.error || "Failed to add consultant", "error");
      }
    } catch {
      showToast("An error occurred while adding consultant", "error");
    } finally {
      setSavingConsultant(false);
    }
  };

  const handleOpenEditModal = (consultant: ConsultantRecord) => {
    setEditModalConsultant(consultant);
    setEditConsultantName(consultant.name);
    if (branches.includes(consultant.branch)) {
      setEditConsultantBranch(consultant.branch);
      setIsCustomEditBranch(false);
      setCustomEditBranchInput("");
    } else {
      setEditConsultantBranch(consultant.branch);
      setIsCustomEditBranch(true);
      setCustomEditBranchInput(consultant.branch);
    }
  };

  const handleUpdateConsultant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalConsultant) return;
    const finalName = editConsultantName.trim();
    const finalBranch = (isCustomEditBranch ? customEditBranchInput : editConsultantBranch).trim();

    if (!finalName) {
      showToast("Please enter consultant name", "error");
      return;
    }
    if (!finalBranch) {
      showToast("Please select or specify a branch", "error");
      return;
    }

    setUpdatingConsultant(true);
    try {
      const res = await fetch(`/api/consultants/${editModalConsultant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalName, branch: finalBranch }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Consultant "${finalName}" updated successfully!`);
        setEditModalConsultant(null);
        await Promise.all([fetchConsultantsList(), fetchPerformanceData(), fetchBranches()]);
      } else {
        showToast(data.error || "Failed to update consultant", "error");
      }
    } catch {
      showToast("Failed to update consultant", "error");
    } finally {
      setUpdatingConsultant(false);
    }
  };

  const handleDeleteConsultant = async () => {

    if (!deleteModalConsultant) return;

    setDeletingConsultant(true);
    try {
      const res = await fetch(`/api/consultants/${deleteModalConsultant.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Consultant "${deleteModalConsultant.name}" removed successfully`);
        setDeleteModalConsultant(null);
        await Promise.all([fetchConsultantsList(), fetchPerformanceData()]);
      } else {
        showToast(data.error || "Failed to delete consultant", "error");
      }
    } catch {
      showToast("An error occurred while deleting consultant", "error");
    } finally {
      setDeletingConsultant(false);
    }
  };

  const handleViewConsultantLeads = (consultantName: string, testDriveOption: string = "") => {
    const encConsultant = encodeURIComponent(consultantName);
    const tdParam = `&testDrive=${encodeURIComponent(testDriveOption)}`;
    if (consultantName === "Unassigned") {
      router.push(`/dashboard?consultant=Unassigned${tdParam}`);
    } else {
      router.push(`/dashboard?consultant=${encConsultant}${tdParam}`);
    }
  };


  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="glass-card" style={{ padding: "40px", textAlign: "center", maxWidth: "500px", margin: "60px auto" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Access Restricted</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px" }}>
          Consultant management and performance monitoring is reserved for Administrators.
        </p>
        <button className="btn btn-primary" onClick={() => router.push("/dashboard")}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  const aggregateTd = formatTestDriveRate(performanceAggregates.testDriveYes, performanceAggregates.totalLeads);

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            padding: "12px 20px",
            borderRadius: "8px",
            background: toast.type === "success" ? "#059669" : "#dc2626",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "14px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <span>{toast.type === "success" ? "✓" : "⚠"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header with Navigation Tabs */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>Consultants</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
              Manage sales consultants, branch assignments, and review lead conversion performance.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            {activeTab === "manage" && (
              <button className="btn btn-primary" onClick={handleOpenAddModal} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16 }}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Consultant
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => {
                fetchPerformanceData();
                fetchConsultantsList();
                fetchBranches();
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Section Tabs Switcher */}
        <div style={{ display: "flex", gap: "24px", borderBottom: "1.5px solid var(--border)", marginTop: "20px" }}>
          <button
            onClick={() => setActiveTab("performance")}
            style={{
              padding: "12px 18px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "performance" ? "3px solid var(--primary)" : "3px solid transparent",
              color: activeTab === "performance" ? "var(--primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "performance" ? 700 : 500,
              cursor: "pointer",
              fontSize: "15px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Performance Overview
          </button>
          <button
            onClick={() => setActiveTab("manage")}
            style={{
              padding: "12px 18px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "manage" ? "3px solid var(--primary)" : "3px solid transparent",
              color: activeTab === "manage" ? "var(--primary)" : "var(--text-secondary)",
              fontWeight: activeTab === "manage" ? 700 : 500,
              cursor: "pointer",
              fontSize: "15px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Manage Consultants
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                background: activeTab === "manage" ? "rgba(16, 185, 129, 0.15)" : "var(--border)",
                color: activeTab === "manage" ? "var(--primary)" : "var(--text-secondary)",
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              {consultants.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: PERFORMANCE OVERVIEW (Default) */}
      {activeTab === "performance" && (
        <>
          {/* Summary Cards */}
          <div className="stats-grid" style={{ marginBottom: "24px" }}>
            <div className="stat-card">
              <div className="stat-label">Active Consultants</div>
              <div className="stat-value" style={{ color: "#3b82f6" }}>{performanceAggregates.totalConsultants}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Assigned</div>
              <div className="stat-value">{performanceAggregates.totalLeads}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Not Contacted</div>
              <div className="stat-value" style={{ color: "#475569" }}>{performanceAggregates.notContacted}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Contacted</div>
              <div className="stat-value open" style={{ color: "#d97706" }}>{performanceAggregates.pending}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Completed</div>
              <div className="stat-value success" style={{ color: "#059669" }}>{performanceAggregates.live}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Test Drive Rate</div>
              <div className="stat-value" style={{ color: "#16a34a", display: "flex", alignItems: "baseline", gap: 6 }}>
                <span>{aggregateTd.pctStr}</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>{aggregateTd.ratioStr}</span>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="glass-card overflow-visible" style={{ padding: "16px 20px", marginBottom: "24px", overflow: "visible", position: "relative", zIndex: 100 }}>
            <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "240px", position: "relative" }}>
                <input
                  type="text"
                  placeholder="Search by consultant name..."
                  value={searchPerf}
                  onChange={(e) => setSearchPerf(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 14px 9px 36px",
                    borderRadius: "8px",
                    border: "1.5px solid var(--border)",
                    fontSize: "13px",
                    outline: "none",
                  }}
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

              <div>
                <BranchConsultantPicker
                  branches={branches}
                  consultants={consultants}
                  selectedBranch={branchFilterPerf}
                  selectedConsultant={consultantFilterPerf}
                  onChange={({ branch, consultant }) => {
                    setBranchFilterPerf(branch);
                    setConsultantFilterPerf(consultant);
                  }}
                  placeholder="All Branches & Consultants"
                  showUnassigned={true}
                />
              </div>

              <div>
                <select
                  value={`${sortFieldPerf}-${sortOrderPerf}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split("-") as [string, "asc" | "desc"];
                    setSortFieldPerf(field);
                    setSortOrderPerf(order);
                  }}
                  style={{
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1.5px solid var(--border)",
                    fontSize: "13px",
                    background: "#ffffff",
                    color: "var(--text-primary)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <option value="testDriveRate-desc">Sort: Test Drive Rate (High → Low)</option>
                  <option value="testDriveRate-asc">Sort: Test Drive Rate (Low → High)</option>
                  <option value="name-asc">Sort: Consultant Name (A → Z)</option>
                  <option value="total-desc">Sort: Total Leads (High → Low)</option>
                  <option value="live-desc">Sort: Completed Leads (High → Low)</option>
                </select>
              </div>

              {(searchPerf || branchFilterPerf || consultantFilterPerf) && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setSearchPerf("");
                    setBranchFilterPerf("");
                    setConsultantFilterPerf("");
                  }}
                >
                  Clear Filters
                </button>
              )}

            </div>
          </div>

          {/* Performance Table */}
          <div className="glass-card" style={{ padding: "20px" }}>
            <div className="table-container">
              <table style={{ minWidth: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    <th
                      onClick={() => {
                        setSortFieldPerf("name");
                        setSortOrderPerf(sortFieldPerf === "name" && sortOrderPerf === "asc" ? "desc" : "asc");
                      }}
                      style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", userSelect: "none" }}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span>Consultant Name</span>
                        {sortFieldPerf === "name" && <span style={{ fontSize: 11 }}>{sortOrderPerf === "asc" ? "↑" : "↓"}</span>}
                      </div>
                    </th>
                    <th style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13 }}>Assigned Branch</th>
                    <th
                      onClick={() => {
                        setSortFieldPerf("total");
                        setSortOrderPerf(sortFieldPerf === "total" && sortOrderPerf === "desc" ? "asc" : "desc");
                      }}
                      style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", userSelect: "none" }}
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span>Total Leads</span>
                        {sortFieldPerf === "total" && <span style={{ fontSize: 11 }}>{sortOrderPerf === "desc" ? "↓" : "↑"}</span>}
                      </div>
                    </th>
                    <th style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13, color: "#475569" }}>Not Contacted</th>
                    <th style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13, color: "#b45309" }}>Contacted</th>
                    <th style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13, color: "#047857" }}>Completed</th>
                    <th style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13, color: "#b91c1c" }}>Lost</th>
                    <th
                      onClick={() => {
                        setSortFieldPerf("testDriveRate");
                        setSortOrderPerf(sortFieldPerf === "testDriveRate" && sortOrderPerf === "desc" ? "asc" : "desc");
                      }}
                      style={{
                        padding: "12px 14px",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        userSelect: "none",
                        color: sortFieldPerf === "testDriveRate" ? "#047857" : "var(--text-primary)",
                      }}
                      title="Click to sort by Test Drive Rate"
                    >
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span>Test Drive Rate</span>
                        {sortFieldPerf === "testDriveRate" && (
                          <span style={{ fontSize: 12, fontWeight: 800 }}>{sortOrderPerf === "desc" ? "↓" : "↑"}</span>
                        )}
                      </div>
                    </th>
                    <th style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPerformanceStats.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
                        No consultant records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    sortedPerformanceStats.map((stat) => {
                      const isUnassigned = stat.consultant === "Unassigned";
                      const tdInfo = formatTestDriveRate(stat.testDriveYes, stat.total);

                      return (
                        <tr key={stat.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: "50%",
                                  background: isUnassigned ? "rgba(100, 116, 139, 0.15)" : "rgba(16, 185, 129, 0.15)",
                                  color: isUnassigned ? "#475569" : "#059669",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: 13,
                                  border: `1px solid ${isUnassigned ? "rgba(100, 116, 139, 0.25)" : "rgba(16, 185, 129, 0.3)"}`,
                                }}
                              >
                                {isUnassigned ? "?" : stat.consultant.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 14, color: isUnassigned ? "var(--text-secondary)" : "var(--text-primary)" }}>
                                  {stat.consultant}
                                </div>
                                {isUnassigned && (
                                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Unallocated leads</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "14px" }}>
                            {stat.branch ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "3px 10px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  background: "#f1f5f9",
                                  color: "#334155",
                                  border: "1px solid #cbd5e1",
                                }}
                              >
                                {stat.branch}
                              </span>
                            ) : isUnassigned ? (
                              <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>—</span>
                            ) : (
                              <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>Not Assigned</span>
                            )}
                          </td>
                          <td style={{ padding: "14px", fontWeight: 700, fontSize: 14 }}>{stat.total}</td>
                          <td style={{ padding: "14px" }}>
                            <span className="status-select status-not_contacted" style={{ padding: "3px 8px", fontSize: 12 }}>
                              {stat.notContacted}
                            </span>
                          </td>
                          <td style={{ padding: "14px" }}>
                            <span className="status-select status-pending" style={{ padding: "3px 8px", fontSize: 12 }}>
                              {stat.pending}
                            </span>
                          </td>
                          <td style={{ padding: "14px" }}>
                            <span className="status-select status-live" style={{ padding: "3px 8px", fontSize: 12 }}>
                              {stat.live}
                            </span>
                          </td>
                          <td style={{ padding: "14px" }}>
                            <span className="status-select status-lost" style={{ padding: "3px 8px", fontSize: 12 }}>
                              {stat.lost}
                            </span>
                          </td>
                          <td style={{ padding: "14px", fontSize: 13 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <div>
                                <span style={{ fontWeight: 700, color: stat.testDriveYes > 0 ? "#16a34a" : "var(--text-primary)" }}>
                                  {tdInfo.pctStr}
                                </span>
                                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6, fontWeight: 500 }}>
                                  {tdInfo.ratioStr}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleViewConsultantLeads(stat.consultant, "Scheduled,Completed")}
                                title="View Scheduled & Completed Test Drives"
                                style={{
                                  border: "1px solid rgba(16, 185, 129, 0.3)",
                                  background: "#ecfdf5",
                                  color: "#047857",
                                  borderRadius: "6px",
                                  padding: "3px 6px",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "#10b981";
                                  e.currentTarget.style.color = "#ffffff";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "#ecfdf5";
                                  e.currentTarget.style.color = "#047857";
                                }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: "14px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => handleViewConsultantLeads(stat.consultant, "Scheduled")}
                                title="View Scheduled Test Drive Leads"
                                style={{ fontSize: 12, padding: "5px 10px" }}
                              >
                                Scheduled
                              </button>
                         
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleViewConsultantLeads(stat.consultant, "")}
                                title="View All Leads for this consultant"
                                style={{ fontSize: 12, padding: "5px 10px" }}
                              >
                                All Leads
                              </button>
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

      {/* TAB 2: MANAGE CONSULTANTS (Add / Remove) */}
      {activeTab === "manage" && (
        <>
          {/* Summary Cards */}
          <div className="stats-grid" style={{ marginBottom: "24px" }}>
            <div className="stat-card">
              <div className="stat-label">Total Consultants</div>
              <div className="stat-value" style={{ color: "var(--primary)" }}>{consultants.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Branches Covered</div>
              <div className="stat-value" style={{ color: "#3b82f6" }}>{uniqueBranchesCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active Assigned Leads</div>
              <div className="stat-value success">
                {consultants.reduce((sum, c) => sum + (c.leadsCount || 0), 0)}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="glass-card overflow-visible" style={{ padding: "16px 20px", marginBottom: "24px", overflow: "visible", position: "relative", zIndex: 100 }}>
            <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "240px", position: "relative" }}>
                <input
                  type="text"
                  placeholder="Search by consultant name or branch..."
                  value={searchManage}
                  onChange={(e) => setSearchManage(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 14px 9px 36px",
                    borderRadius: "8px",
                    border: "1.5px solid var(--border)",
                    fontSize: "13px",
                    outline: "none",
                  }}
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

              <div>
                <BranchConsultantPicker
                  branches={branches}
                  consultants={consultants}
                  selectedBranch={branchFilterManage}
                  selectedConsultant={consultantFilterManage}
                  onChange={({ branch, consultant }) => {
                    setBranchFilterManage(branch);
                    setConsultantFilterManage(consultant);
                  }}
                  placeholder="All Branches & Consultants"
                  showUnassigned={false}
                />
              </div>

              {(searchManage || branchFilterManage || consultantFilterManage) && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setSearchManage("");
                    setBranchFilterManage("");
                    setConsultantFilterManage("");
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>


          {/* Consultants Management Table */}
          <div className="glass-card" style={{ padding: "20px" }}>
            <div className="table-container">
              <table style={{ minWidth: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    <th style={{ padding: "14px 16px", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      Consultant Name
                    </th>
                    <th style={{ padding: "14px 16px", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      Assigned Branch
                    </th>
                    <th style={{ padding: "14px 16px", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      Assigned Leads
                    </th>
                    <th style={{ padding: "14px 16px", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      Created Date
                    </th>
                    <th style={{ padding: "14px 16px", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", textAlign: "right" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingConsultants ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                        <span className="spinner" /> Loading consultants...
                      </td>
                    </tr>
                  ) : filteredConsultants.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "48px 20px", textAlign: "center" }}>
                        <div style={{ fontSize: "36px", marginBottom: "12px" }}>👥</div>
                        <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "6px" }}>
                          No consultants found
                        </div>
                        <p style={{ color: "var(--text-muted)", fontSize: "13px", maxWidth: "400px", margin: "0 auto 16px" }}>
                          {consultants.length === 0
                            ? "You haven't added any consultants yet. Click 'Add Consultant' to register your branch consultants."
                            : "No consultants matched your search filters."}
                        </p>
                        {consultants.length === 0 && (
                          <button className="btn btn-primary btn-sm" onClick={handleOpenAddModal}>
                            + Add First Consultant
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredConsultants.map((c) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: "rgba(16, 185, 129, 0.12)",
                                color: "var(--primary-dark)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: 14,
                                border: "1px solid rgba(16, 185, 129, 0.25)",
                              }}
                            >
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
                                {c.name}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>ID: #{c.id}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "16px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "4px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              background: "#f1f5f9",
                              color: "#334155",
                              border: "1px solid #cbd5e1",
                            }}
                          >
                            {c.branch}
                          </span>
                        </td>
                        <td style={{ padding: "16px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "3px 10px",
                              borderRadius: "20px",
                              fontSize: "12px",
                              fontWeight: 700,
                              background: (c.leadsCount || 0) > 0 ? "rgba(16, 185, 129, 0.12)" : "rgba(100, 116, 139, 0.1)",
                              color: (c.leadsCount || 0) > 0 ? "#059669" : "#64748b",
                            }}
                          >
                            {c.leadsCount || 0} {(c.leadsCount === 1 ? "lead" : "leads")}
                          </span>
                        </td>
                        <td style={{ padding: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
                          {new Date(c.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td style={{ padding: "16px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleOpenEditModal(c)}
                              title="Edit consultant details"
                              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              Edit
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeleteModalConsultant(c)}
                              title="Remove consultant"
                              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                              Remove
                            </button>
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
      )}

      {/* MODAL: ADD CONSULTANT */}
      {addModalOpen && (
        <div className="modal-overlay" onClick={() => setAddModalOpen(false)}>
          <div
            className="modal"
            style={{ maxWidth: 480, background: "#ffffff", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Add New Consultant</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddModalOpen(false)} style={{ fontSize: 16 }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              Consultants are assigned to specific branches and will appear for lead allocation under their branch.
            </p>

            <form onSubmit={handleCreateConsultant}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Consultant Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newConsultantName}
                    onChange={(e) => setNewConsultantName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Assigned Branch *
                  </label>
                  {!isCustomBranch ? (
                    <div>
                      <select
                        value={newConsultantBranch}
                        onChange={(e) => {
                          if (e.target.value === "__NEW__") {
                            setIsCustomBranch(true);
                          } else {
                            setNewConsultantBranch(e.target.value);
                          }
                        }}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "#ffffff" }}
                      >
                        {branches.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                        <option value="__NEW__">➕ Add Custom / New Branch...</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          required
                          value={customBranchInput}
                          onChange={(e) => setCustomBranchInput(e.target.value)}
                          placeholder="Type new branch name (e.g. Coimbatore)"
                          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setIsCustomBranch(false);
                            setCustomBranchInput("");
                          }}
                        >
                          Select Existing
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setAddModalOpen(false)}
                    disabled={savingConsultant}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingConsultant}
                    style={{ minWidth: 120 }}
                  >
                    {savingConsultant ? "Saving..." : "Add Consultant"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT CONSULTANT */}
      {editModalConsultant && (
        <div className="modal-overlay" onClick={() => setEditModalConsultant(null)}>
          <div
            className="modal"
            style={{ maxWidth: 480, background: "#ffffff", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Edit Consultant</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditModalConsultant(null)} style={{ fontSize: 16 }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              Update consultant details. Any leads assigned to this consultant will automatically reflect the updated name.
            </p>

            <form onSubmit={handleUpdateConsultant}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Consultant Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editConsultantName}
                    onChange={(e) => setEditConsultantName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}>
                    Assigned Branch *
                  </label>
                  {!isCustomEditBranch ? (
                    <div>
                      <select
                        value={editConsultantBranch}
                        onChange={(e) => {
                          if (e.target.value === "__NEW__") {
                            setIsCustomEditBranch(true);
                          } else {
                            setEditConsultantBranch(e.target.value);
                          }
                        }}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "#ffffff" }}
                      >
                        {branches.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                        <option value="__NEW__">➕ Add Custom / New Branch...</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          required
                          value={customEditBranchInput}
                          onChange={(e) => setCustomEditBranchInput(e.target.value)}
                          placeholder="Type new branch name (e.g. Coimbatore)"
                          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setIsCustomEditBranch(false);
                            setCustomEditBranchInput("");
                          }}
                        >
                          Select Existing
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditModalConsultant(null)}
                    disabled={updatingConsultant}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={updatingConsultant}
                    style={{ minWidth: 120 }}
                  >
                    {updatingConsultant ? "Saving Changes..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONSULTANT CONFIRMATION */}
      {deleteModalConsultant && (

        <div className="modal-overlay" onClick={() => setDeleteModalConsultant(null)}>
          <div
            className="modal"
            style={{ maxWidth: 440, background: "#ffffff", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: "36px", marginBottom: "8px" }}>⚠️</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: "var(--text-primary)" }}>
                Remove Consultant?
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                Are you sure you want to remove <strong>{deleteModalConsultant.name}</strong> ({deleteModalConsultant.branch})?
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                Existing lead allocation history will remain intact.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setDeleteModalConsultant(null)}
                disabled={deletingConsultant}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteConsultant}
                disabled={deletingConsultant}
                style={{ minWidth: 120 }}
              >
                {deletingConsultant ? "Removing..." : "Remove Consultant"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
