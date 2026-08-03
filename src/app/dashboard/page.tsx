"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { parsePhoneNumber, parseBranches } from "@/lib/utils";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


interface Lead {
  id: number;
  name: string;
  phone: string;
  email?: string;
  city: string;
  adname?: string;
  branch?: string;
  followUpDate1?: string;
  followUpDate2?: string;
  remark: string | null;
  status: string;
  createdAt: string;
}

interface Stats {
  total: number;
  pending?: number;
  live?: number;
  lost?: number;
  open?: number;
  closedSuccessful?: number;
  closedUnsuccessful?: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const formatStatusLabel = (st: string) => {
  if (st === 'pending' || st === 'created') return 'Pending Lead';
  if (st === 'live' || st === 'closed_successful') return 'Live Lead';
  if (st === 'lost' || st === 'closed_unsuccessful') return 'Lost Lead';
  return st.replace('_', ' ');
};

const toISTDateString = (isoString?: string | null) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d_part = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d_part}`;
};

const getTodayISTString = () => {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d_part = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d_part}`;
};

const getYesterdayISTString = () => {
  const d = new Date(Date.now() - 86400000);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d_part = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d_part}`;
};

const get7DaysAgoISTString = () => {
  const d = new Date(Date.now() - 6 * 86400000);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d_part = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d_part}`;
};

const getFirstDayOfMonthISTString = () => {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' });
  const parts = formatter.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return `${y}-${m}-01`;
};

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, live: 0, lost: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState("");
  const [tempEndDate, setTempEndDate] = useState("");
  const [primaryOrder, setPrimaryOrder] = useState<"desc" | "asc">("desc");
  const [secondaryField, setSecondaryField] = useState("name");
  const [secondaryOrder, setSecondaryOrder] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const isTodayActive = startDate === getTodayISTString() && endDate === getTodayISTString();

  const handleToggleToday = () => {
    if (isTodayActive) {
      setStartDate("");
      setEndDate("");
    } else {
      const todayStr = getTodayISTString();
      setStartDate(todayStr);
      setEndDate(todayStr);
    }
    setPagination(p => ({ ...p, page: 1 }));
  };

  const openDateModal = () => {
    setTempStartDate(startDate);
    setTempEndDate(endDate);
    setDateModalOpen(true);
  };

  const handleApplyDateRange = () => {
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
    setPagination(p => ({ ...p, page: 1 }));
    setDateModalOpen(false);
  };

  const handleClearDateRange = () => {
    setStartDate("");
    setEndDate("");
    setTempStartDate("");
    setTempEndDate("");
    setPagination(p => ({ ...p, page: 1 }));
    setDateModalOpen(false);
  };

  // Remark modal
  const [remarkModal, setRemarkModal] = useState<Lead | null>(null);
  const [remarkText, setRemarkText] = useState("");
  const [remarkLoading, setRemarkLoading] = useState(false);

  // Delete modal
  const [deleteModal, setDeleteModal] = useState<Lead | null>(null);
  const [deleteFromSheet, setDeleteFromSheet] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Active update counter to pause polling while user operations are processing
  const updatingCountRef = useRef(0);
  const activeFetchIdRef = useRef(0);
  const isFetchingRef = useRef(false);
  const prefetchCache = useRef<Record<string, any>>({});

  const startUpdating = () => {
    updatingCountRef.current++;
  };

  const stopUpdating = () => {
    updatingCountRef.current = Math.max(0, updatingCountRef.current - 1);
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleHeaderClick = (field: string) => {
    if (field === "createdAt") {
      setPrimaryOrder(prev => (prev === "desc" ? "asc" : "desc"));
    } else {
      if (secondaryField === field) {
        setSecondaryOrder(prev => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSecondaryField(field);
        setSecondaryOrder("asc");
      }
    }
    setPagination(p => ({ ...p, page: 1 }));
  };

  const [apiBranches, setApiBranches] = useState<string[]>([]);

  const fetchBranchesList = useCallback(async () => {
    try {
      const res = await fetch("/api/branches");
      const data = await res.json();
      if (res.ok && Array.isArray(data.branches)) {
        setApiBranches(data.branches);
      }
    } catch {
      // fallback
    }
  }, []);

  const fetchLeads = useCallback(async (force = false) => {
    if (updatingCountRef.current > 0 && !force) {
      return; // Stop polling while data updates are in progress
    }
    
    const fetchId = ++activeFetchIdRef.current;
    
    try {
      const params = new URLSearchParams();
      params.set("page", pagination.page.toString());
      params.set("limit", "20");
      params.set("primaryOrder", primaryOrder);
      params.set("secondaryField", secondaryField);
      params.set("secondaryOrder", secondaryOrder);
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (branchFilter) params.set("branch", branchFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const cacheKey = params.toString();
      const cachedData = prefetchCache.current[cacheKey];

      if (cachedData && !force) {
        setLeads(cachedData.leads);
        setStats(cachedData.stats);
        setPagination(prev => {
          if (prev.total !== cachedData.pagination.total || prev.totalPages !== cachedData.pagination.totalPages) {
             return { ...prev, total: cachedData.pagination.total, totalPages: cachedData.pagination.totalPages };
          }
          return prev;
        });
        setLoading(false);
      }

      isFetchingRef.current = true;
      const res = await fetch(`/api/leads?${cacheKey}`);
      const data = await res.json();

      if (res.ok) {
        prefetchCache.current[cacheKey] = data;
      }

      if (activeFetchIdRef.current !== fetchId) {
        return; // Ignore stale response
      }

      if (res.ok) {
        setLeads(data.leads);
        setStats(data.stats);
        
        // Only update pagination if it actually changes total pages/records
        // This prevents the page jumping from 2 to 1 back to 2 during polling
        setPagination(prev => {
          if (prev.total !== data.pagination.total || prev.totalPages !== data.pagination.totalPages) {
             return { ...prev, total: data.pagination.total, totalPages: data.pagination.totalPages };
          }
          return prev;
        });

        // Prefetch adjacent pages
        const prefetchParams = new URLSearchParams(cacheKey);
        const currentPage = pagination.page;
        
        const prefetchPage = (p: number) => {
          prefetchParams.set("page", p.toString());
          const pKey = prefetchParams.toString();
          if (!prefetchCache.current[pKey]) {
            fetch(`/api/leads?${pKey}`).then(r => r.json()).then(d => {
              if (!d.error) prefetchCache.current[pKey] = d;
            }).catch(() => {});
          }
        };

        prefetchPage(currentPage + 1);
        if (currentPage > 1) prefetchPage(currentPage - 1);
      }
    } catch {
      showToast("Failed to fetch leads", "error");
    } finally {
      setLoading(false);
      if (activeFetchIdRef.current === fetchId) {
        isFetchingRef.current = false;
      }
    }
  }, [pagination.page, search, statusFilter, branchFilter, startDate, endDate, primaryOrder, secondaryField, secondaryOrder]);

  useEffect(() => {
    fetchBranchesList();
    setTimeout(() => fetchLeads(), 0);

    const handleLeadsUpdated = () => {
      fetchBranchesList();
      fetchLeads();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("crm-leads-updated", handleLeadsUpdated);
    }

    // Live auto-refresh dashboard data every 10 seconds (paused while updating)
    const autoRefreshInterval = setInterval(() => {
      if (updatingCountRef.current === 0 && !isFetchingRef.current) {
        fetchLeads();
      }
    }, 10000);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("crm-leads-updated", handleLeadsUpdated);
      }
      clearInterval(autoRefreshInterval);
    };
  }, [fetchLeads, fetchBranchesList]);

  
  const fetchAllFilteredLeads = async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "100000");
      params.set("primaryOrder", primaryOrder);
      params.set("secondaryField", secondaryField);
      params.set("secondaryOrder", secondaryOrder);
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (branchFilter) params.set("branch", branchFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      if (res.ok) {
        return data.leads;
      }
      return null;
    } catch {
      return null;
    }
  };

  const branches = useMemo(() => {
    const unique = new Set<string>(apiBranches);
    leads.forEach(l => {
      if (l.branch) {
        parseBranches(l.branch).forEach(b => unique.add(b));
      }
    });
    return Array.from(unique).sort();
  }, [leads, apiBranches]);

  const displayedLeads = useMemo(() => {
    if (!branchFilter) return leads;
    return leads.filter(l => l.branch && parseBranches(l.branch).includes(branchFilter));
  }, [leads, branchFilter]);

  const handleExportExcel = async () => {
    setExportLoading(true);
    const allLeads = await fetchAllFilteredLeads();
    if (!allLeads || allLeads.length === 0) {
      showToast("No data to export", "error");
      setExportLoading(false);
      return;
    }

    const exportLeads = allLeads.filter((l: Lead) => {
      if (!branchFilter) return true;
      return l.branch && parseBranches(l.branch).includes(branchFilter);
    });

    if (exportLeads.length === 0) {
      showToast("No data to export", "error");
      setExportLoading(false);
      return;
    }

    const exportData = exportLeads.map((l: Lead) => ({
      Name: l.name,
      Phone: l.phone,
      Email: l.email || "-",
      City: l.city || "-",
      "Ad Name": l.adname || "-",
      Branch: l.branch ? parseBranches(l.branch).join(", ") : "-",
      "Follow Up 1": toISTDateString(l.followUpDate1) || "-",
      "Follow Up 2": toISTDateString(l.followUpDate2) || "-",
      "Created At": formatDate(l.createdAt),
      Status: formatStatusLabel(l.status),
      Remark: l.remark || "-"
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    
    const cols = Object.keys(exportData[0]).map(() => ({ wch: 15 }));
    worksheet['!cols'] = cols;

    XLSX.writeFile(workbook, "SGA_Skoda_Leads.xlsx");
    setExportLoading(false);
    showToast("Excel exported successfully");
  };

  const handleExportPDF = async () => {
    setExportLoading(true);
    const allLeads = await fetchAllFilteredLeads();
    if (!allLeads || allLeads.length === 0) {
      showToast("No data to export", "error");
      setExportLoading(false);
      return;
    }

    const exportLeads = allLeads.filter((l: Lead) => {
      if (!branchFilter) return true;
      return l.branch && parseBranches(l.branch).includes(branchFilter);
    });

    if (exportLeads.length === 0) {
      showToast("No data to export", "error");
      setExportLoading(false);
      return;
    }

    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("SGA Skoda Leads Report", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const tableColumn = ["Name", "Phone", "City", "Ad Name", "Branch", "Follow Up 1", "Follow Up 2", "Status"];
    const tableRows: (string | number)[][] = [];

    exportLeads.forEach((l: Lead) => {
      tableRows.push([
        l.name,
        l.phone,
        l.city || "-",
        l.adname || "-",
        l.branch ? parseBranches(l.branch).join(", ") : "-",
        toISTDateString(l.followUpDate1) || "-",
        toISTDateString(l.followUpDate2) || "-",
        formatStatusLabel(l.status),
        new Date(l.createdAt).toLocaleDateString()
      ]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save("SGA_Skoda_Leads.pdf");
    setExportLoading(false);
    showToast("PDF exported successfully");
  };

  const handleSync = async () => {
    setSyncing(true);
    startUpdating();
    activeFetchIdRef.current++; // Invalidate in-flight background fetches
    prefetchCache.current = {}; // Clear stale prefetched pages
    try {
      const res = await fetch("/api/sheets/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        let msg = `Synced ${data.synced} new lead(s)`;
        if (data.duplicates > 0) msg += `, updated ${data.duplicates} existing`;
        if (data.skippedLowQuality > 0) msg += ` (${data.skippedLowQuality} empty rows skipped)`;
        if (data.skippedDuplicates > 0) msg += ` (${data.skippedDuplicates} identical sheet duplicates skipped)`;
        showToast(msg);
        fetchLeads(true);
      } else {
        showToast(data.error || "Sync failed", "error");
      }
    } catch {
      showToast("Sync failed", "error");
    } finally {
      setSyncing(false);
      stopUpdating();
    }
  };

  const handleFollowUpUpdate = async (lead: Lead, field: 'followUpDate1' | 'followUpDate2', dateStr: string) => {
    const prevLeads = [...leads];
    startUpdating();
    activeFetchIdRef.current++;
    prefetchCache.current = {};

    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, [field]: dateStr || null } : l));

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: dateStr || null }),
      });
      if (res.ok) {
        showToast("Follow-up date updated");
      } else {
        showToast("Failed to update date", "error");
        setLeads(prevLeads);
      }
    } catch {
      showToast("Failed to update date", "error");
      setLeads(prevLeads);
    } finally {
      stopUpdating();
    }
  };

  const handleStatusChange = async (lead: Lead, newStatus: string) => {
    const oldStatus = lead.status;
    const normOld = (oldStatus === 'created' ? 'pending' : oldStatus === 'closed_successful' ? 'live' : oldStatus === 'closed_unsuccessful' ? 'lost' : oldStatus) as 'pending' | 'live' | 'lost';
    const normNew = (newStatus === 'created' ? 'pending' : newStatus === 'closed_successful' ? 'live' : newStatus === 'closed_unsuccessful' ? 'lost' : newStatus) as 'pending' | 'live' | 'lost';

    if (normOld === normNew) return;

    // Snapshot previous state to revert if API request fails
    const prevLeads = [...leads];
    const prevStats = { ...stats };

    startUpdating(); // PAUSE polling while update request is processing
    activeFetchIdRef.current++; // Invalidate any in-flight requests so they don't overwrite this optimistic update
    prefetchCache.current = {}; // Clear stale cache
    
    // 1. Optimistically update leads list in table immediately
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));

    // 2. Optimistically update stats counters immediately!
    setStats(prev => {
      const updated = { ...prev };
      if (normOld === 'pending') updated.pending = Math.max(0, (updated.pending ?? 0) - 1);
      if (normOld === 'live') updated.live = Math.max(0, (updated.live ?? 0) - 1);
      if (normOld === 'lost') updated.lost = Math.max(0, (updated.lost ?? 0) - 1);

      if (normNew === 'pending') updated.pending = (updated.pending ?? 0) + 1;
      if (normNew === 'live') updated.live = (updated.live ?? 0) + 1;
      if (normNew === 'lost') updated.lost = (updated.lost ?? 0) + 1;

      return updated;
    });

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showToast(`Status updated to ${formatStatusLabel(newStatus)}`);
        // KEEP the optimistic change! Do NOT revert!
      } else {
        showToast("Failed to update status", "error");
        // REVERT back if failed!
        setLeads(prevLeads);
        setStats(prevStats);
      }
    } catch {
      showToast("Failed to update status", "error");
      // REVERT back if failed!
      setLeads(prevLeads);
      setStats(prevStats);
    } finally {
      stopUpdating(); // RESUME polling after update completes (success/failure)
    }
  };

  const handleAddRemark = async () => {
    if (!remarkModal || !remarkText.trim()) return;
    const isPending = remarkModal.status === "pending" || remarkModal.status === "created";
    setRemarkLoading(true);

    const prevLeads = [...leads];
    const prevStats = { ...stats };

    startUpdating(); // PAUSE polling while adding remark
    activeFetchIdRef.current++; // Invalidate in-flight requests
    prefetchCache.current = {};

    // Optimistically update table row and stats counters
    setLeads(prev => prev.map(l => l.id === remarkModal.id ? {
      ...l,
      remark: remarkText.trim(),
      status: isPending ? "live" : l.status
    } : l));

    if (isPending) {
      setStats(prev => ({
        ...prev,
        pending: Math.max(0, (prev.pending ?? 0) - 1),
        live: (prev.live ?? 0) + 1,
      }));
    }

    try {
      const res = await fetch(`/api/leads/${remarkModal.id}/remark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remark: remarkText.trim() }),
      });
      if (res.ok) {
        showToast("Remark added successfully");
        setRemarkModal(null);
        setRemarkText("");
        // KEEP the optimistic change!
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to add remark", "error");
        // REVERT back on failure!
        setLeads(prevLeads);
        setStats(prevStats);
      }
    } catch {
      showToast("Failed to add remark", "error");
      // REVERT back on failure!
      setLeads(prevLeads);
      setStats(prevStats);
    } finally {
      setRemarkLoading(false);
      stopUpdating(); // RESUME polling after remark update completes
    }
  };

  const handleDeleteLead = async () => {
    if (!deleteModal) return;
    setDeleteLoading(true);
    const targetLead = deleteModal;
    const prevLeads = [...leads];
    const prevStats = { ...stats };

    startUpdating(); // PAUSE polling while deleting lead
    activeFetchIdRef.current++; // Invalidate in-flight requests
    prefetchCache.current = {};

    // Optimistically remove lead from state
    setLeads(prev => prev.filter(l => l.id !== targetLead.id));
    const targetStatus = (targetLead.status === 'created' ? 'pending' : targetLead.status === 'closed_successful' ? 'live' : targetLead.status === 'closed_unsuccessful' ? 'lost' : targetLead.status) as 'pending' | 'live' | 'lost';

    setStats(prev => {
      const updated = { ...prev, total: Math.max(0, (prev.total ?? 0) - 1) };
      if (targetStatus === 'pending') updated.pending = Math.max(0, (updated.pending ?? 0) - 1);
      if (targetStatus === 'live') updated.live = Math.max(0, (updated.live ?? 0) - 1);
      if (targetStatus === 'lost') updated.lost = Math.max(0, (updated.lost ?? 0) - 1);
      return updated;
    });

    try {
      const res = await fetch(`/api/leads/${targetLead.id}?deleteFromSheet=${deleteFromSheet}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast(deleteFromSheet ? "Lead deleted from DB & Google Sheet" : "Lead deleted from DB");
        setDeleteModal(null);
        // KEEP the optimistic change!
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to delete lead", "error");
        // REVERT back on failure!
        setLeads(prevLeads);
        setStats(prevStats);
      }
    } catch {
      showToast("Failed to delete lead", "error");
      // REVERT back on failure!
      setLeads(prevLeads);
      setStats(prevStats);
    } finally {
      setDeleteLoading(false);
      stopUpdating(); // RESUME polling after deletion completes
    }
  };

  const openRemarkModal = (lead: Lead) => {
    setRemarkModal(lead);
    setRemarkText(lead.remark || "");
  };

  const openDeleteModal = (lead: Lead) => {
    setDeleteModal(lead);
    setDeleteFromSheet(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="page-actions" style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={handleExportExcel} disabled={exportLoading}>
            {exportLoading ? <><span className="spinner" style={{width: 14, height: 14}}/> Exporting...</> : "Export Excel"}
          </button>
          <button className="btn btn-ghost" onClick={handleExportPDF} disabled={exportLoading}>
            {exportLoading ? <><span className="spinner" style={{width: 14, height: 14}}/> Exporting...</> : "Export PDF"}
          </button>

          <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? <><span className="spinner" /> Syncing...</> : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Sync from Sheet
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Leads</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Leads</div>
          <div className="stat-value open">{stats.pending ?? stats.open ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Live Leads</div>
          <div className="stat-value success">{stats.live ?? stats.closedSuccessful ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Lost Leads</div>
          <div className="stat-value fail">{stats.lost ?? stats.closedUnsuccessful ?? 0}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search by name, phone, city..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending Leads</option>
          <option value="live">Live Leads</option>
          <option value="lost">Lost Leads</option>
        </select>
        <select
          value={branchFilter}
          onChange={(e) => { setBranchFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
        >
          <option value="">All Branches</option>
          {branches.map((b: string) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select
          value={primaryOrder}
          onChange={(e) => { setPrimaryOrder(e.target.value as "desc" | "asc"); setPagination(p => ({ ...p, page: 1 })); }}
          title="Sort by time"
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>

        {/* Today Lead Button */}
        <button
          className={`btn ${isTodayActive ? "btn-primary" : "btn-ghost"}`}
          onClick={handleToggleToday}
          title="Extract Today's Leads"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Today's Leads
        </button>

        {/* Date Range Calendar Button */}
        <button
          className={`btn ${(startDate || endDate) && !isTodayActive ? "btn-primary" : "btn-ghost"}`}
          onClick={openDateModal}
          title="Select Date Range"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          {startDate || endDate
            ? (startDate === endDate ? startDate : `${startDate || "Start"} → ${endDate || "End"}`)
            : "Date Range"}
        </button>

        {/* Clear Date Filter Chip */}
        {(startDate || endDate) && (
          <button
            className="btn btn-ghost"
            onClick={() => { setStartDate(""); setEndDate(""); setPagination(p => ({ ...p, page: 1 })); }}
            title="Clear date filter"
            style={{ padding: "6px 12px", fontSize: 13, background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.2)" }}
          >
            ✕ Clear Date
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass-card">
        {loading ? (
          <div className="loading-overlay"><span className="spinner" /> Loading leads...</div>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <h3>No Leads Found</h3>
            <p>Sync from Google Sheets or adjust your filters</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleHeaderClick("name")} style={{ cursor: "pointer", userSelect: "none" }} title="Click to sort by Name">
                    Name {secondaryField === "name" ? (secondaryOrder === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th>Phone</th>
                  <th onClick={() => handleHeaderClick("city")} style={{ cursor: "pointer", userSelect: "none" }} title="Click to sort by City">
                    City {secondaryField === "city" ? (secondaryOrder === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th onClick={() => handleHeaderClick("adname")} style={{ cursor: "pointer", userSelect: "none" }} title="Click to sort by Ad Name">
                    Ad Name {secondaryField === "adname" ? (secondaryOrder === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th onClick={() => handleHeaderClick("branch")} style={{ cursor: "pointer", userSelect: "none" }} title="Click to sort by Branch">
                    Branch {secondaryField === "branch" ? (secondaryOrder === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th onClick={() => handleHeaderClick("followUpDate1")} style={{ cursor: "pointer", userSelect: "none" }} title="Click to sort by Follow Up">
                    Follow Up {secondaryField === "followUpDate1" ? (secondaryOrder === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th onClick={() => handleHeaderClick("createdAt")} style={{ cursor: "pointer", userSelect: "none" }} title="Click to sort by Created At">
                    Created At {primaryOrder === "desc" ? "↓" : "↑"}
                  </th>
                  <th onClick={() => handleHeaderClick("status")} style={{ cursor: "pointer", userSelect: "none" }} title="Click to sort by Status">
                    Status {secondaryField === "status" ? (secondaryOrder === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th>Remark</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: "40px" }}>
                      No leads found.
                    </td>
                  </tr>
                ) : (
                  displayedLeads.map((lead: Lead) => (
                    <tr key={lead.id}>
                    <td style={{ fontWeight: 600 }}>{lead.name}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13 }}>{parsePhoneNumber(lead.phone)}</td>
                    <td>{lead.city || "—"}</td>
                    <td>{lead.adname || "—"}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {lead.branch ? parseBranches(lead.branch).map((b, idx) => (
                          <span key={idx} style={{ background: "rgba(0,0,0,0.05)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600 }}>
                            {b}
                          </span>
                        )) : "—"}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "12px", color: "var(--text-secondary)", width: "12px" }}>1.</span>
                          <input 
                            type="date" 
                            value={toISTDateString(lead.followUpDate1)} 
                            onChange={(e) => handleFollowUpUpdate(lead, 'followUpDate1', e.target.value)}
                            className="status-select"
                            style={{ border: "1px solid var(--border)", background: "transparent", cursor: "pointer", padding: "2px 6px", fontSize: "13px" }}
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "12px", color: "var(--text-secondary)", width: "12px" }}>2.</span>
                          <input 
                            type="date" 
                            value={toISTDateString(lead.followUpDate2)} 
                            onChange={(e) => handleFollowUpUpdate(lead, 'followUpDate2', e.target.value)}
                            className="status-select"
                            style={{ border: "1px solid var(--border)", background: "transparent", cursor: "pointer", padding: "2px 6px", fontSize: "13px" }}
                          />
                        </div>
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{formatDate(lead.createdAt)}</td>
                    <td>
                      <select
                        className={`status-select ${
                          (lead.status === "pending" || lead.status === "created") ? "status-pending" :
                          (lead.status === "live" || lead.status === "closed_successful") ? "status-live" : "status-lost"
                        }`}
                        value={lead.status === 'created' ? 'pending' : lead.status === 'closed_successful' ? 'live' : lead.status === 'closed_unsuccessful' ? 'lost' : lead.status}
                        onChange={(e) => handleStatusChange(lead, e.target.value)}
                      >
                        <option value="pending">Pending Lead</option>
                        <option value="live">Live Lead</option>
                        <option value="lost">Lost Lead</option>
                      </select>
                    </td>
                    <td className="remark-cell">
                      {lead.remark ? (
                        <span className="remark-text" title={lead.remark}>{lead.remark}</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button className="add-remark-btn" onClick={() => openRemarkModal(lead)}>
                          {lead.remark ? "Edit" : "Add"} Remark
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ color: "#ef4444", padding: "6px 8px", borderRadius: 6 }}
                          onClick={() => openDeleteModal(lead)}
                          title="Delete lead"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15, display: "block" }}>
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
            disabled={pagination.page <= 1}
          >
            ← Prev
          </button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button
            onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
            disabled={pagination.page >= pagination.totalPages}
          >
            Next →
          </button>
        </div>
      )}

      {/* Remark Modal */}
      {remarkModal && (
        <div className="modal-overlay" onClick={() => setRemarkModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{remarkModal.remark ? "Edit" : "Add"} Remark</h2>
            <p>
              For <strong>{remarkModal.name}</strong> ({parsePhoneNumber(remarkModal.phone)})
              {(remarkModal.status === "pending" || remarkModal.status === "created") && <><br /><small style={{ color: "var(--status-created)" }}>Adding a remark will automatically change status to Live Lead</small></>}
            </p>
            <textarea
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
              placeholder="Enter your remark..."
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setRemarkModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddRemark} disabled={remarkLoading || !remarkText.trim()}>
                {remarkLoading ? <><span className="spinner" /> Saving...</> : "Save Remark"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: "#ef4444" }}>Delete Lead</h2>
            <p>
              Are you sure you want to delete lead for <strong>{deleteModal.name}</strong> ({parsePhoneNumber(deleteModal.phone)})?
            </p>
            
            <div style={{ margin: "16px 0", display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="deleteOption"
                  checked={!deleteFromSheet}
                  onChange={() => setDeleteFromSheet(false)}
                />
                <span><strong>Delete from DB only</strong> (Keep row in Google Sheet)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="deleteOption"
                  checked={deleteFromSheet}
                  onChange={() => setDeleteFromSheet(true)}
                />
                <span><strong>Delete from DB & Google Sheet</strong> (Clear row from Google Sheet)</span>
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: "#ef4444", borderColor: "#ef4444" }}
                onClick={handleDeleteLead}
                disabled={deleteLoading}
              >
                {deleteLoading ? <><span className="spinner" /> Deleting...</> : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Filter Modal */}
      {dateModalOpen && (
        <div className="modal-overlay" onClick={() => setDateModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" style={{ width: 20, height: 20 }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Select Date Range
              </h2>
              <button className="btn btn-ghost" onClick={() => setDateModalOpen(false)} style={{ padding: "4px 8px", fontSize: 16 }}>✕</button>
            </div>

            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 16 }}>
              Filter leads created within a specific timeframe
            </p>

            {/* Quick Presets */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const today = getTodayISTString();
                  setTempStartDate(today);
                  setTempEndDate(today);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const yest = getYesterdayISTString();
                  setTempStartDate(yest);
                  setTempEndDate(yest);
                }}
              >
                Yesterday
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setTempStartDate(get7DaysAgoISTString());
                  setTempEndDate(getTodayISTString());
                }}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setTempStartDate(getFirstDayOfMonthISTString());
                  setTempEndDate(getTodayISTString());
                }}
              >
                This Month
              </button>
            </div>

            {/* Custom Inputs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  From Date
                </label>
                <input
                  type="date"
                  value={tempStartDate}
                  onChange={(e) => setTempStartDate(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  To Date
                </label>
                <input
                  type="date"
                  value={tempEndDate}
                  onChange={(e) => setTempEndDate(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 14 }}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="modal-actions" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleClearDateRange}
              >
                Clear Range
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setDateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleApplyDateRange}
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}
