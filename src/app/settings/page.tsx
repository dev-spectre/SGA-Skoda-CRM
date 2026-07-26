"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface SettingsData {
  notificationInterval: number;
  selectedSpreadsheetId: string | null;
  selectedSpreadsheetName: string | null;
  selectedSheetName: string | null;
  columnMapping: string | null;
  lastSyncAt: string | null;
  googleAccountEmail?: string | null;
}

interface Spreadsheet {
  id: string;
  name: string;
  modifiedTime: string;
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [googleAccountEmail, setGoogleAccountEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState("");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [interval, setInterval_] = useState(5);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);

  // Column mapping
  const [mapping, setMapping] = useState({
    name: 0, phone: 1, city: 2, zipCode: 3, platform: 4, createdAt: 5, remark: 6, status: 7,
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    // Check for OAuth callback messages
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success === "google_linked") showToast("Google account linked successfully!");
    if (error) showToast(`OAuth error: ${error}`, "error");
  }, [searchParams]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setIsGoogleLinked(data.isGoogleLinked);
        setGoogleAccountEmail(data.googleAccountEmail || null);
        setInterval_(data.settings.notificationInterval || 5);
        if (data.settings.selectedSpreadsheetId) {
          setSelectedSpreadsheet(data.settings.selectedSpreadsheetId);
          setSelectedSheet(data.settings.selectedSheetName || "");
        }
        if (data.settings.columnMapping) {
          try {
            setMapping(JSON.parse(data.settings.columnMapping));
          } catch { /* use defaults */ }
        }
        // Load spreadsheets if Google is linked
        if (data.isGoogleLinked) {
          fetchSpreadsheets();
        }
      }
    } catch {
      showToast("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchSpreadsheets = async () => {
    try {
      const res = await fetch("/api/sheets/list");
      const data = await res.json();
      if (res.ok) {
        setSpreadsheets(data.spreadsheets || []);
      }
    } catch { /* silently fail */ }
  };

  const fetchSheetNames = async (spreadsheetId: string) => {
    setLoadingSheets(true);
    try {
      const res = await fetch(`/api/sheets/list?spreadsheetId=${spreadsheetId}`);
      const data = await res.json();
      if (res.ok) {
        setSheetNames(data.sheets || []);
      }
    } catch { /* silently fail */ }
    finally { setLoadingSheets(false); }
  };

  const handleSpreadsheetChange = (id: string) => {
    setSelectedSpreadsheet(id);
    setSelectedSheet("");
    setSheetNames([]);
    if (id) fetchSheetNames(id);
  };

  const handleSaveSheet = async () => {
    if (!selectedSpreadsheet || !selectedSheet) return;
    setSaving(true);
    try {
      const spreadsheet = spreadsheets.find(s => s.id === selectedSpreadsheet);
      const res = await fetch("/api/sheets/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: selectedSpreadsheet,
          spreadsheetName: spreadsheet?.name || "",
          sheetName: selectedSheet,
        }),
      });
      if (res.ok) {
        showToast("Sheet selection saved! Syncing good quality leads...");
        await fetch("/api/sheets/sync", { method: "POST" });
        showToast("Columns auto-mapped and quality leads synced!");
        fetchSettings();
      } else {
        showToast("Failed to save selection", "error");
      }
    } catch {
      showToast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAutoMap = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sheets/automap", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setMapping(data.mapping);
        showToast("Columns mapped! Syncing quality leads...");
        await fetch("/api/sheets/sync", { method: "POST" });
        showToast("Columns intelligently mapped and quality leads synced!");
      } else {
        showToast("Failed to auto-map columns", "error");
      }
    } catch {
      showToast("Failed to auto-map", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInterval = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationInterval: interval }),
      });
      if (res.ok) {
        showToast("Notification interval updated!");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("notification-settings-updated"));
        }
      } else {
        showToast("Failed to update", "error");
      }
    } catch {
      showToast("Failed to update", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMapping = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: mapping }),
      });
      if (res.ok) {
        showToast("Column mapping saved!");
      } else {
        showToast("Failed to save mapping", "error");
      }
    } catch {
      showToast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading-overlay"><span className="spinner" /> Loading settings...</div>;
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <p className="page-desc">Configure your Google Sheets connection, notifications, and column mapping.</p>

      {/* Google Account */}
      <div className="settings-section">
        <h2>Google Account</h2>
        <p className="section-desc">Link your Google account to access and synchronize Google Sheets.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="settings-row" style={{ alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isGoogleLinked ? (
                <span className="connected-badge">Connected</span>
              ) : (
                <span className="not-connected-badge">Not Connected</span>
              )}
            </div>
            <a href="/api/auth/google" className="btn btn-primary">
              {isGoogleLinked ? "Reconnect Account" : "Link Google Account"}
            </a>
          </div>

          {isGoogleLinked && (
            <div style={{
              background: "rgba(0, 200, 83, 0.06)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 14
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(0, 200, 83, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                  Connected Google Account Email
                </div>
                <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 600, marginTop: 2 }}>
                  {googleAccountEmail ? (
                    <span style={{ color: "var(--primary-light)" }}>{googleAccountEmail}</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                      Email not cached — please reconnect account to refresh profile
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sheet Selection */}
      {isGoogleLinked && (
        <div className="settings-section">
          <h2>Sheet Selection</h2>
          <p className="section-desc">
            Select which Google Sheet to track for leads.
            {settings?.selectedSpreadsheetName && (
              <> Currently tracking: <strong>{settings.selectedSpreadsheetName}</strong> → <strong>{settings.selectedSheetName}</strong></>
            )}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="settings-row">
              <label>Spreadsheet</label>
              <select
                value={selectedSpreadsheet}
                onChange={(e) => handleSpreadsheetChange(e.target.value)}
                style={{ flex: 1, minWidth: 250 }}
              >
                <option value="">Select a spreadsheet...</option>
                {spreadsheets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {selectedSpreadsheet && (
              <div className="settings-row">
                <label>Sheet</label>
                {loadingSheets ? (
                  <span className="spinner" />
                ) : (
                  <select
                    value={selectedSheet}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    style={{ flex: 1, minWidth: 250 }}
                  >
                    <option value="">Select a sheet...</option>
                    {sheetNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveSheet}
                disabled={!selectedSpreadsheet || !selectedSheet || saving}
              >
                Save Selection
              </button>
            </div>
          </div>
          {settings?.lastSyncAt && (
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12 }}>
              Last synced: {new Date(settings.lastSyncAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>
      )}

      {/* Column Mapping */}
      <div className="settings-section">
        <h2>Column Mapping</h2>
        <p className="section-desc">Map your Google Sheet columns to CRM fields. Use 0-indexed column numbers (A=0, B=1, C=2, etc.)</p>
        <div className="mapping-grid">
          {Object.entries(mapping).map(([key, value]) => (
            <label key={key}>
              <span>{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
              <input
                type="number"
                min="0"
                value={value}
                onChange={(e) => setMapping(m => ({ ...m, [key]: parseInt(e.target.value) || 0 }))}
              />
            </label>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, gap: 12 }}>
          <button className="btn btn-secondary" onClick={handleAutoMap} disabled={saving || !settings?.selectedSpreadsheetId}>
            Auto-Map Columns
          </button>
          <button className="btn btn-primary" onClick={handleSaveMapping} disabled={saving}>
            Save Mapping
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="settings-section">
        <h2>Notifications</h2>
        <p className="section-desc">Configure desktop notification interval for unclosed leads.</p>
        <div className="settings-row" style={{ marginBottom: 16 }}>
          <label>Check interval (minutes)</label>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="number"
              min="1"
              max="1440"
              value={interval}
              onChange={(e) => setInterval_(parseInt(e.target.value) || 5)}
              style={{ width: 100 }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSaveInterval} disabled={saving}>
              Save
            </button>
          </div>
        </div>
        <div className="settings-row">
          <label>Browser Notifications</label>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => {
                const isDisabled = localStorage.getItem('browser_notifications') === 'disabled';
                if (isDisabled) {
                  localStorage.removeItem('browser_notifications');
                  if (typeof window !== 'undefined' && 'Notification' in window) {
                    Notification.requestPermission();
                  }
                  showToast("Browser notifications enabled");
                } else {
                  localStorage.setItem('browser_notifications', 'disabled');
                  showToast("Browser notifications disabled");
                }
                // Force re-render to update button text
                setSaving(s => !s);
                setTimeout(() => setSaving(s => !s), 10);
              }}
            >
              {typeof window !== 'undefined' && localStorage.getItem('browser_notifications') === 'disabled' 
                ? "Enable Browser Notifications" 
                : "Disable Browser Notifications"}
            </button>
          </div>
        </div>
      </div>

      {/* Webhooks & Instant Sync */}
      <div className="settings-section">
        <h2>Webhooks & Instant Automation</h2>
        <p className="section-desc">Automate instant lead checks using background polling or HTTP webhooks.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13, background: "var(--bg-hover)", padding: 16, borderRadius: 8 }}>
          <div>
            <strong>1. Automatic Background Polling (Active)</strong>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)" }}>
              The CRM automatically background-syncs your Google Sheet every <strong>{interval} minute(s)</strong> and notifies you immediately when new leads arrive.
            </p>
          </div>
          <hr style={{ borderColor: "var(--border-color)", margin: "8px 0" }} />
          <div>
            <strong>2. Sheet Trigger Webhook URL</strong>
            <p style={{ margin: "4px 0 8px", color: "var(--text-muted)" }}>
              Send a POST request to this endpoint to trigger an instant sheet sync anytime:
            </p>
            <code style={{ background: "var(--bg-main)", padding: "6px 12px", borderRadius: 4, display: "block", color: "var(--text-main)" }}>
              {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/sheets
            </code>
          </div>
          <hr style={{ borderColor: "var(--border-color)", margin: "8px 0" }} />
          <div>
            <strong>3. Single Lead Ingestion Webhook URL</strong>
            <p style={{ margin: "4px 0 8px", color: "var(--text-muted)" }}>
              Send a POST JSON payload (e.g. from Meta Ads / Zapier / Make) to immediately create a lead and trigger notifications:
            </p>
            <code style={{ background: "var(--bg-main)", padding: "6px 12px", borderRadius: 4, display: "block", color: "var(--text-main)" }}>
              {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/lead
            </code>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="loading-overlay"><span className="spinner" /> Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
