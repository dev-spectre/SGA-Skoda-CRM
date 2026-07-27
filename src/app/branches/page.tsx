"use client";

import { useState, useEffect, useCallback } from "react";

interface Branch {
  id: number;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({ name: "", address: "", latitude: "", longitude: "", status: "active" });
  const [isSaving, setIsSaving] = useState(false);

  const [deleteModal, setDeleteModal] = useState<Branch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/branches?t=${Date.now()}`);
      const data = await res.json();
      if (res.ok) setBranches(data.branches);
    } catch {
      showToast("Failed to fetch branches", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTimeout(() => fetchBranches(), 0);
  }, [fetchBranches]);

  const openAddModal = () => {
    setEditingBranch(null);
    setFormData({ name: "", address: "", latitude: "", longitude: "", status: "active" });
    setIsModalOpen(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      address: branch.address,
      latitude: branch.latitude ? branch.latitude.toString() : "",
      longitude: branch.longitude ? branch.longitude.toString() : "",
      status: branch.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.address) {
      showToast("Name and address are required", "error");
      return;
    }
    setIsSaving(true);
    try {
      const url = editingBranch ? `/api/branches/${editingBranch.id}` : "/api/branches";
      const method = editingBranch ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        showToast(`Branch ${editingBranch ? "updated" : "added"} successfully`);
        setIsModalOpen(false);
        fetchBranches();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to save branch", "error");
      }
    } catch {
      showToast("Failed to save branch", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/branches/${deleteModal.id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Branch deleted successfully");
        setDeleteModal(null);
        fetchBranches();
      } else {
        showToast("Failed to delete branch", "error");
      }
    } catch {
      showToast("Failed to delete branch", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Branches</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openAddModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Branch
          </button>
        </div>
      </div>

      <div className="glass-card">
        {loading ? (
          <div className="loading-overlay"><span className="spinner" /> Loading branches...</div>
        ) : branches.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <h3>No Branches Found</h3>
            <p>Click &quot;Add Branch&quot; to create a new branch location.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Branch Name</th>
                  <th>Address</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch: Branch) => (
                  <tr key={branch.id}>
                    <td style={{ fontWeight: 600 }}>{branch.name}</td>
                    <td style={{ maxWidth: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={branch.address}>
                      {branch.address}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 13 }}>{branch.latitude || "—"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13 }}>{branch.longitude || "—"}</td>
                    <td>
                      <span className={`status-badge ${branch.status === 'active' ? 'closed_successful' : 'closed_unsuccessful'}`}>
                        {branch.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="add-remark-btn" onClick={() => openEditModal(branch)}>Edit</button>
                        <button className="btn btn-ghost" style={{ color: "#ef4444", padding: "4px 8px", borderRadius: 6 }} onClick={() => setDeleteModal(branch)}>
                           Delete
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

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingBranch ? "Edit Branch" : "Add Branch"}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
              <div className="mapping-grid" style={{ gridTemplateColumns: "1fr" }}>
                <label>Branch Name *
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. SGA Skoda Sowripalayam" />
                </label>
                <label>Address *
                  <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Full address" />
                </label>
              </div>
              <div className="mapping-grid">
                <label>Latitude
                  <input type="number" step="any" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} placeholder="e.g. 11.0168" />
                </label>
                <label>Longitude
                  <input type="number" step="any" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} placeholder="e.g. 76.9558" />
                </label>
              </div>
              <div className="mapping-grid" style={{ gridTemplateColumns: "1fr" }}>
                <label>Status
                  <select
                    className="status-select"
                    style={{ width: "100%", padding: "8px 12px", marginTop: 4, height: 38 }}
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || !formData.name || !formData.address}>
                {isSaving ? <><span className="spinner" /> Saving...</> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: "#ef4444" }}>Delete Branch</h2>
            <p>Are you sure you want to delete <strong>{deleteModal.name}</strong>? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ backgroundColor: "#ef4444", borderColor: "#ef4444", color: "#fff" }} onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <><span className="spinner" /> Deleting...</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}
