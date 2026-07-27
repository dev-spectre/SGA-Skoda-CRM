"use client";

import { useState, useEffect, useCallback } from "react";
import { parsePhoneNumber } from "@/lib/utils";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


interface Lead {
  id: number;
  name: string;
  phone: string;
  email?: string;
  city: string;
  zipCode: string;
  platform: string;
  remark: string | null;
  status: string;
  createdAt: string;
}

interface Stats {
  total: number;
  open: number;
  closedSuccessful: number;
  closedUnsuccessful: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, open: 0, closedSuccessful: 0, closedUnsuccessful: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  // Remark modal
  const [remarkModal, setRemarkModal] = useState<Lead | null>(null);
  const [remarkText, setRemarkText] = useState("");
  const [remarkLoading, setRemarkLoading] = useState(false);

  // Delete modal
  const [deleteModal, setDeleteModal] = useState<Lead | null>(null);
  const [deleteFromSheet, setDeleteFromSheet] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", pagination.page.toString());
      params.set("limit", "20");
      params.set("sort", sortOrder);
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();

      if (res.ok) {
        setLeads(data.leads);
        setStats(data.stats);
        setPagination(data.pagination);
      }
    } catch {
      showToast("Failed to fetch leads", "error");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, search, statusFilter, sortOrder]);

  useEffect(() => {
    fetchLeads();

    const handleLeadsUpdated = () => {
      fetchLeads();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("crm-leads-updated", handleLeadsUpdated);
    }

    // Live auto-refresh dashboard data every 10 seconds
    const autoRefreshInterval = setInterval(() => {
      fetchLeads();
    }, 10000);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("crm-leads-updated", handleLeadsUpdated);
      }
      clearInterval(autoRefreshInterval);
    };
  }, [fetchLeads]);

  
  const fetchAllFilteredLeads = async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "100000");
      params.set("sort", sortOrder);
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

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

  const handleExportExcel = async () => {
    setExportLoading(true);
    const allLeads = await fetchAllFilteredLeads();
    if (!allLeads || allLeads.length === 0) {
      showToast("No data to export", "error");
      setExportLoading(false);
      return;
    }

    const exportData = allLeads.map((l: Lead) => ({
      Name: l.name,
      Phone: l.phone,
      Email: l.email || "-",
      City: l.city || "-",
      "Zip Code": l.zipCode || "-",
      Platform: l.platform || "-",
      "Created At": formatDate(l.createdAt),
      Status: l.status.replace("_", " "),
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

    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("SGA Skoda Leads Report", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const tableColumn = ["Name", "Phone", "City", "Zip", "Status", "Date"];
    const tableRows: any[] = [];

    allLeads.forEach((l: Lead) => {
      tableRows.push([
        l.name,
        l.phone,
        l.city || "-",
        l.zipCode || "-",
        l.status.replace("_", " "),
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
    try {
      const res = await fetch("/api/sheets/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        let msg = `Synced ${data.synced} new lead(s)`;
        if (data.duplicates > 0) msg += `, updated ${data.duplicates} existing`;
        if (data.skippedLowQuality > 0) msg += ` (${data.skippedLowQuality} empty rows skipped)`;
        showToast(msg);
        fetchLeads();
      } else {
        showToast(data.error || "Sync failed", "error");
      }
    } catch {
      showToast("Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleClearDbData = async () => {
    if (!confirm("Are you sure you want to clear all leads from the local database? This will not delete data from your Google Sheet.")) return;
    try {
      const res = await fetch("/api/leads", { method: "DELETE" });
      if (res.ok) {
        showToast("Cleared all database leads");
        fetchLeads();
      } else {
        showToast("Failed to clear database leads", "error");
      }
    } catch {
      showToast("Failed to clear database leads", "error");
    }
  };

  const handleStatusChange = async (lead: Lead, newStatus: string) => {
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showToast(`Status updated to ${newStatus.replace("_", " ")}`);
        fetchLeads();
      } else {
        showToast("Failed to update status", "error");
      }
    } catch {
      showToast("Failed to update status", "error");
    }
  };

  const handleAddRemark = async () => {
    if (!remarkModal || !remarkText.trim()) return;
    setRemarkLoading(true);
    try {
      const res = await fetch(`/api/leads/${remarkModal.id}/remark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remark: remarkText }),
      });
      if (res.ok) {
        showToast("Remark added successfully");
        setRemarkModal(null);
        setRemarkText("");
        fetchLeads();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to add remark", "error");
      }
    } catch {
      showToast("Failed to add remark", "error");
    } finally {
      setRemarkLoading(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!deleteModal) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/leads/${deleteModal.id}?deleteFromSheet=${deleteFromSheet}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast(deleteFromSheet ? "Lead deleted from DB & Google Sheet" : "Lead deleted from DB");
        setDeleteModal(null);
        fetchLeads();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to delete lead", "error");
      }
    } catch {
      showToast("Failed to delete lead", "error");
    } finally {
      setDeleteLoading(false);
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
          {/* <button className="btn btn-ghost" style={{ color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }} onClick={handleClearDbData}>
            Clear DB Data
          </button> */}
          
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
          <div className="stat-label">Open</div>
          <div className="stat-value open">{stats.open}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Closed Successful</div>
          <div className="stat-value success">{stats.closedSuccessful}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Closed Unsuccessful</div>
          <div className="stat-value fail">{stats.closedUnsuccessful}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search by name, phone, city, zip..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
        >
          <option value="">All Statuses</option>
          <option value="created">Open / Created</option>
          <option value="closed_successful">Closed Successful</option>
          <option value="closed_unsuccessful">Closed Unsuccessful</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => { setSortOrder(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
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
                  <th>Name</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Zip Code</th>
                  <th>Platform</th>
                  <th>Created At</th>
                  <th>Status</th>
                  <th>Remark</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: 600 }}>{lead.name}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13 }}>{parsePhoneNumber(lead.phone)}</td>
                    <td>{lead.city || "—"}</td>
                    <td>{lead.zipCode || "—"}</td>
                    <td>{lead.platform || "—"}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{formatDate(lead.createdAt)}</td>
                    <td>
                      <select
                        className="status-select"
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead, e.target.value)}
                        style={{
                          color: lead.status === "created" ? "var(--status-created)" :
                                 lead.status === "closed_successful" ? "var(--status-success)" : "var(--status-fail)"
                        }}
                      >
                        <option value="created">Created</option>
                        <option value="closed_successful">Closed Successful</option>
                        <option value="closed_unsuccessful">Closed Unsuccessful</option>
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
                ))}
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
              {remarkModal.status === "created" && <><br /><small style={{ color: "var(--status-created)" }}>Adding a remark will automatically close this lead as successful</small></>}
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

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}
