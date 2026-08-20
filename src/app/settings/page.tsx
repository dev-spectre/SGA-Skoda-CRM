"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { registerWebPushSubscription, getWebPushSubscription, unsubscribeWebPush } from "@/components/NotificationInit";

interface SettingsData {
  notificationInterval: number;
  backgroundNotificationsEnabled?: boolean;
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

interface ColumnOption {
  index: number;
  label: string;
  sample: string;
}

const CRM_SETTINGS_FIELDS = [
  { key: "name", label: "Customer Name", required: true, icon: "👤", hints: ["name", "full name", "client", "customer", "lead name", "prospect"] },
  { key: "phone", label: "Phone Number", required: true, icon: "📞", hints: ["phone", "mobile", "contact", "cell", "number", "tel"] },
  { key: "branch", label: "Branch", required: false, icon: "📍", hints: ["branch", "showroom", "outlet", "dealer", "location"] },
  { key: "city", label: "City / Location", required: false, icon: "🏙️", hints: ["city", "town", "place", "district", "address"] },
  { key: "platform", label: "Platform / Source", required: false, icon: "🌐", hints: ["platform", "source", "channel", "publisher", "medium"] },
  { key: "adname", label: "Campaign / Ad Name", required: false, icon: "📢", hints: ["ad", "campaign", "ad name", "adset", "creative", "utm"] },
  { key: "status", label: "Lead Status", required: false, icon: "📊", hints: ["status", "stage", "lead status", "disposition"] },
  { key: "remark", label: "Remark / Notes", required: false, icon: "📝", hints: ["remark", "notes", "comment", "feedback", "description"] },
  { key: "createdAt", label: "Created Date", required: false, icon: "📅", hints: ["date", "created", "timestamp", "time", "created at"] },
  { key: "followUpDate1", label: "Follow Up Date 1", required: false, icon: "⏰", hints: ["follow up 1", "followup 1", "next follow up 1", "date 1"] },
  { key: "followUpDate2", label: "Follow Up Date 2", required: false, icon: "⏰", hints: ["follow up 2", "followup 2", "next follow up 2", "date 2"] },
];

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
  const [interval, setInterval_] = useState(15);
  const [bgNotificationsEnabled, setBgNotificationsEnabled] = useState(true);
  const [webPushEnabled, setWebPushEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);

  // Live Sheet Preview State
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetPreviewRows, setSheetPreviewRows] = useState<string[][]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Column mapping: fieldKey -> columnIndex
  const [mapping, setMapping] = useState<{ [key: string]: number }>({
    name: 0,
    phone: 1,
    city: 2,
    createdAt: 3,
    remark: 4,
    status: 5,
    adname: 6,
    branch: 7,
    followUpDate1: 8,
    followUpDate2: 9,
    platform: 10,
  });

  const [userRole, setUserRole] = useState<string>("USER");
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const isAdmin = userRole === "ADMIN" || userRole === "SUPERADMIN" || isSuperAdmin;

  // Webhook state (Superadmin only)
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptDetails, setShowScriptDetails] = useState(false);

  // Duplicate leads state
  const [duplicateScanStats, setDuplicateScanStats] = useState<{
    totalLeadsScanned: number;
    duplicateCount: number;
    uniqueCount: number;
    groupsCount: number;
  } | null>(null);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  const [deduplicateModalOpen, setDeduplicateModalOpen] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const generateAppsScriptCode = (url: string) => `/**
 * ==========================================================
 *  SGA SKODA CRM — REAL-TIME GOOGLE SHEET WEBHOOK
 * ==========================================================
 * Automatically triggers instant data fetch of new leads
 * directly into your SGA Skoda CRM when added to this sheet.
 *
 * SETUP GUIDE:
 * 1. In Google Sheets: Click Extensions > Apps Script
 * 2. Paste this entire code into 'Code.gs' and click Save (💾)
 * 3. Click the Clock icon (Triggers) on the left sidebar
 * 4. Click '+ Add Trigger' (bottom right) and select:
 *    - Function: onSpreadsheetChange
 *    - Event source: From spreadsheet
 *    - Event type: On change (or On form submit)
 * 5. Save and authorize permissions.
 * ==========================================================
 */

var CRM_WEBHOOK_URL = "${url || "https://YOUR_DOMAIN/api/webhooks/sheets"}";

function onSpreadsheetChange(e) {
  try {
    var payload = JSON.stringify({
      event: "sheet_change",
      changeType: e ? e.changeType : "edit",
      timestamp: new Date().toISOString()
    });

    var options = {
      method: "post",
      contentType: "application/json",
      payload: payload,
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(CRM_WEBHOOK_URL, options);
    Logger.log("CRM Webhook response: " + response.getContentText());
  } catch (err) {
    Logger.log("CRM Webhook error: " + err.toString());
  }
}

function onFormSubmit(e) {
  try {
    var payload = JSON.stringify({
      event: "form_submit",
      values: e ? e.values : null,
      timestamp: new Date().toISOString()
    });

    var options = {
      method: "post",
      contentType: "application/json",
      payload: payload,
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(CRM_WEBHOOK_URL, options);
    Logger.log("CRM Form Submit Webhook response: " + response.getContentText());
  } catch (err) {
    Logger.log("CRM Form Submit Webhook error: " + err.toString());
  }
}
`;

  const handleCopyWebhook = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    showToast("Webhook URL copied to clipboard!");
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  const handleCopyScript = () => {
    const code = generateAppsScriptCode(webhookUrl);
    navigator.clipboard.writeText(code);
    setCopiedScript(true);
    showToast("Google Apps Script code copied to clipboard!");
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    try {
      const res = await fetch("/api/webhooks/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "settings_test", timestamp: new Date().toISOString() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`⚡ Webhook success: ${data.message || 'Synced and active!'}`);
        fetchSettings();
      } else {
        showToast(data.error || "Failed to trigger webhook", "error");
      }
    } catch {
      showToast("Webhook test failed (network error)", "error");
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleScanDuplicates = async () => {
    setScanningDuplicates(true);
    try {
      const res = await fetch("/api/leads/deduplicate");
      const data = await res.json();
      if (res.ok) {
        setDuplicateScanStats(data);
        if (data.duplicateCount > 0) {
          showToast(`Found ${data.duplicateCount} duplicate lead(s) across ${data.groupsCount} group(s).`);
        } else {
          showToast("No duplicate leads found in database!");
        }
      } else {
        showToast(data.error || "Failed to scan duplicate leads", "error");
      }
    } catch {
      showToast("Failed to scan duplicates", "error");
    } finally {
      setScanningDuplicates(false);
    }
  };

  const handleExecuteDeduplicate = async () => {
    setDeletingDuplicates(true);
    try {
      const res = await fetch("/api/leads/deduplicate", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setDeduplicateModalOpen(false);
        setDuplicateScanStats({
          totalLeadsScanned: data.totalLeadsScanned,
          duplicateCount: 0,
          uniqueCount: data.uniqueCount,
          groupsCount: 0,
        });
        showToast(data.message || `Deleted ${data.duplicateCount} duplicate lead(s)!`);
      } else {
        showToast(data.error || "Failed to delete duplicate leads", "error");
      }
    } catch {
      showToast("Failed to delete duplicates", "error");
    } finally {
      setDeletingDuplicates(false);
    }
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          if (data.user.role) setUserRole(data.user.role);
          const isSuper = Boolean(
            data.user.isSuperAdmin ||
            data.user.role === "SUPERADMIN" ||
            data.user.username === "sudo"
          );
          setIsSuperAdmin(isSuper);
        }
      })
      .catch(() => {});

    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/webhooks/sheets`);
    }

    getWebPushSubscription().then((sub) => setWebPushEnabled(!!sub));

    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success === "google_linked") setTimeout(() => showToast("Google account linked successfully!"), 0);
    if (error) setTimeout(() => showToast(`OAuth error: ${error}`, "error"), 0);
  }, [searchParams]);

  const fetchSpreadsheets = async () => {
    try {
      const res = await fetch("/api/sheets/list");
      const data = await res.json();
      if (res.ok) {
        setSpreadsheets(data.spreadsheets || []);
      }
    } catch {
      /* silently fail */
    }
  };

  const fetchSheetPreview = useCallback(async (spreadsheetId: string, sheetName: string) => {
    if (!spreadsheetId || !sheetName) {
      setSheetHeaders([]);
      setSheetPreviewRows([]);
      return;
    }
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/sheets/preview?spreadsheetId=${encodeURIComponent(spreadsheetId)}&sheetName=${encodeURIComponent(sheetName)}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.headers)) {
        setSheetHeaders(data.headers);
        setSheetPreviewRows(data.previewRows || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const fetchSheetNames = useCallback(
    async (spreadsheetId: string) => {
      setLoadingSheets(true);
      try {
        const res = await fetch(`/api/sheets/list?spreadsheetId=${spreadsheetId}`);
        const data = await res.json();
        if (res.ok) {
          setSheetNames(data.sheets || []);
        }
      } catch {
        /* silently fail */
      } finally {
        setLoadingSheets(false);
      }
    },
    []
  );

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setIsGoogleLinked(data.isGoogleLinked);
        setGoogleAccountEmail(data.googleAccountEmail || null);
        setInterval_(data.settings.notificationInterval || 15);
        setBgNotificationsEnabled(data.settings.backgroundNotificationsEnabled ?? true);
        if (data.settings.selectedSpreadsheetId) {
          setSelectedSpreadsheet(data.settings.selectedSpreadsheetId);
          setSelectedSheet(data.settings.selectedSheetName || "");
          fetchSheetNames(data.settings.selectedSpreadsheetId);
          if (data.settings.selectedSheetName) {
            fetchSheetPreview(data.settings.selectedSpreadsheetId, data.settings.selectedSheetName);
          }
        }
        if (data.settings.columnMapping) {
          try {
            const parsed = JSON.parse(data.settings.columnMapping);
            setMapping((prev) => ({ ...prev, ...parsed }));
          } catch {
            /* use defaults */
          }
        }
        if (data.isGoogleLinked) {
          fetchSpreadsheets();
        }
      }
    } catch {
      showToast("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, [fetchSheetNames, fetchSheetPreview]);

  useEffect(() => {
    setTimeout(() => fetchSettings(), 0);
  }, [fetchSettings]);

  const handleSpreadsheetChange = (id: string) => {
    setSelectedSpreadsheet(id);
    setSelectedSheet("");
    setSheetNames([]);
    setSheetHeaders([]);
    setSheetPreviewRows([]);
    if (id) fetchSheetNames(id);
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (selectedSpreadsheet && sheetName) {
      fetchSheetPreview(selectedSpreadsheet, sheetName);
    }
  };

  const handleSaveSheet = async () => {
    if (!selectedSpreadsheet || !selectedSheet) return;
    setSaving(true);
    try {
      const spreadsheet = spreadsheets.find((s: Spreadsheet) => s.id === selectedSpreadsheet);
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

  // Local auto-detection based on current sheet headers & preview
  const handleAutoDetectLocal = () => {
    if (sheetHeaders.length === 0) {
      showToast("No sheet headers loaded to auto-detect", "error");
      return;
    }

    const newMapping: { [key: string]: number } = { ...mapping };
    const usedCols = new Set<number>();

    const normalizedHeaders = sheetHeaders.map((h, i) => ({
      index: i,
      clean: (h || "").toLowerCase().replace(/[^a-z0-9]/g, " "),
    }));

    CRM_SETTINGS_FIELDS.forEach((field) => {
      let matchedIndex = -1;

      for (const hint of field.hints) {
        const match = normalizedHeaders.find(
          (h) => !usedCols.has(h.index) && (h.clean === hint || h.clean.includes(hint))
        );
        if (match) {
          matchedIndex = match.index;
          break;
        }
      }

      if (matchedIndex === -1 && field.key === "phone") {
        for (let col = 0; col < sheetHeaders.length; col++) {
          if (usedCols.has(col)) continue;
          const isPhoneSample = sheetPreviewRows.some((r) => {
            const digits = (r[col] || "").replace(/\D/g, "");
            return digits.length >= 10 && digits.length <= 15;
          });
          if (isPhoneSample) {
            matchedIndex = col;
            break;
          }
        }
      }

      if (matchedIndex !== -1) {
        newMapping[field.key] = matchedIndex;
        usedCols.add(matchedIndex);
      }
    });

    setMapping(newMapping);
    showToast("Columns auto-detected based on header names!");
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
        if (settings?.selectedSpreadsheetId && settings?.selectedSheetName) {
          fetchSheetPreview(settings.selectedSpreadsheetId, settings.selectedSheetName);
        }
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
        showToast("Column mapping saved successfully!");
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
    return (
      <div className="loading-overlay">
        <span className="spinner" /> Loading settings...
      </div>
    );
  }

  // Generate column options
  const columnOptions: ColumnOption[] =
    sheetHeaders.length > 0
      ? sheetHeaders.map((header, idx) => {
          const colLetter = String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? Math.floor(idx / 26) : "");
          const sample = sheetPreviewRows[0]?.[idx] || "";
          return {
            index: idx,
            label: `Col ${colLetter}: ${header || `Column ${idx + 1}`}`,
            sample: sample.length > 25 ? `${sample.slice(0, 22)}...` : sample,
          };
        })
      : Array.from({ length: 26 }, (_, idx) => {
          const colLetter = String.fromCharCode(65 + idx);
          return {
            index: idx,
            label: `Col ${colLetter} (Column ${idx + 1})`,
            sample: "",
          };
        });

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <p className="page-desc">Configure your Google Sheets connection, notifications, and column mapping.</p>

      {!isAdmin && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: "var(--radius-sm)",
            padding: "14px 18px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#dc2626",
            fontSize: 14,
          }}
        >
          <span style={{ fontSize: 20 }}>🔒</span>
          <div>
            <strong>Read-Only Mode:</strong> Only administrators can edit Google Sheet integration and column mappings.
          </div>
        </div>
      )}

      {/* Google Integration */}
      <div className="settings-section">
        <h2>Google Account Integration</h2>
        <p className="section-desc">Connect your Google account to automatically sync leads from Google Sheets.</p>

        <div className="settings-row">
          <div>
            <label style={{ display: "block", fontWeight: 600 }}>Connection Status</label>
            <span style={{ fontSize: 13, color: isGoogleLinked ? "#10b981" : "var(--text-muted)" }}>
              {isGoogleLinked
                ? `🟢 Connected ${googleAccountEmail ? `(${googleAccountEmail})` : ""}`
                : "⚪ Not connected"}
            </span>
          </div>
          <div>
            {isGoogleLinked ? (
              <a href="/api/auth/google" className={`btn btn-secondary ${!isAdmin ? "disabled" : ""}`}>
                Reconnect Google Account
              </a>
            ) : (
              <a href="/api/auth/google" className={`btn btn-primary ${!isAdmin ? "disabled" : ""}`}>
                Connect Google Account
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Spreadsheet Selection */}
      {isGoogleLinked && (
        <div className="settings-section">
          <h2>Select Google Spreadsheet</h2>
          <p className="section-desc">Choose the spreadsheet and tab containing your CRM leads.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Spreadsheet:</label>
              <select
                className="select-input"
                value={selectedSpreadsheet}
                onChange={(e) => handleSpreadsheetChange(e.target.value)}
                disabled={!isAdmin || saving}
                style={{ width: "100%", padding: 10 }}
              >
                <option value="">-- Select a spreadsheet --</option>
                {spreadsheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedSpreadsheet && (
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Sheet Tab:</label>
                {loadingSheets ? (
                  <div style={{ padding: 8, fontSize: 13, color: "var(--text-muted)" }}>
                    <span className="spinner" /> Loading tabs...
                  </div>
                ) : (
                  <select
                    className="select-input"
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    disabled={!isAdmin || saving}
                    style={{ width: "100%", padding: 10 }}
                  >
                    <option value="">-- Select a tab --</option>
                    {sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
              {selectedSpreadsheet && (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${selectedSpreadsheet}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Open Google Sheet
                </a>
              )}
              <button
                className="btn btn-primary"
                onClick={handleSaveSheet}
                disabled={!isAdmin || !selectedSpreadsheet || !selectedSheet || saving}
              >
                {isAdmin ? "Save Selection" : "🔒 Admin Only"}
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

      {/* Superadmin Real-Time Google Sheet Webhook */}
      {isSuperAdmin && (
        <div
          className="settings-section"
          style={{
            border: "1.5px solid rgba(59, 130, 246, 0.35)",
            background: "linear-gradient(180deg, rgba(59, 130, 246, 0.04) 0%, rgba(59, 130, 246, 0.01) 100%)",
            borderRadius: "var(--radius)",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 4px 20px rgba(59, 130, 246, 0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>⚡</span>
              <div>
                <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>Instant Sheet Webhook</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "3px 10px",
                      borderRadius: 12,
                      background: "rgba(59, 130, 246, 0.15)",
                      color: "#2563eb",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                    }}
                  >
                    Superadmin
                  </span>
                </h2>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleTestWebhook}
              disabled={testingWebhook}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
            >
              {testingWebhook ? (
                <>
                  <span className="spinner" /> Triggering Webhook...
                </>
              ) : (
                <>
                  <span>⚡</span> Test Webhook Sync
                </>
              )}
            </button>
          </div>

          <p className="section-desc" style={{ marginBottom: 16 }}>
            Paste this webhook into your Google Sheet&apos;s <strong>Google Apps Script</strong>. When a new lead row is added, it will trigger an instant data fetch in real time without waiting for background polling.
          </p>

          {/* Webhook URL Input & Copy */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Webhook Endpoint URL:
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                readOnly
                value={webhookUrl || (typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/sheets` : "/api/webhooks/sheets")}
                style={{
                  flex: 1,
                  minWidth: 280,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontFamily: "monospace",
                  background: "var(--bg-dark)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleCopyWebhook}
                style={{ minWidth: 170, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600 }}
              >
                {copiedWebhook ? "✓ Copied Webhook URL!" : "📋 Copy Webhook URL"}
              </button>
            </div>
          </div>

          {/* Google Apps Script Code Accordion / Box */}
          <div
            style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 8,
              padding: 16,
              color: "#e2e8f0",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>📜</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#93c5fd" }}>Google Apps Script (Code.gs)</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setShowScriptDetails(!showScriptDetails)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: 12,
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: "4px 8px",
                  }}
                >
                  {showScriptDetails ? "Hide Instructions" : "Setup Instructions (60s)"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleCopyScript}
                  style={{ fontSize: 12, padding: "4px 12px", fontWeight: 600 }}
                >
                  {copiedScript ? "✓ Copied Script Code!" : "📋 Copy Apps Script Code"}
                </button>
              </div>
            </div>

            {/* Step-by-step Setup instructions */}
            {showScriptDetails && (
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.9)",
                  borderRadius: 6,
                  padding: "12px 16px",
                  marginBottom: 12,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "#cbd5e1",
                  borderLeft: "3px solid #3b82f6",
                }}
              >
                <strong style={{ color: "#ffffff", display: "block", marginBottom: 4 }}>How to Install in 4 Simple Steps:</strong>
                <ol style={{ margin: "0 0 0 18px", padding: 0 }}>
                  <li>In your Google Sheet, click <strong>Extensions › Apps Script</strong> in the top menu bar.</li>
                  <li>Replace any existing text in <code>Code.gs</code> by pasting the script code below, then click <strong>Save (💾)</strong>.</li>
                  <li>In the left sidebar, click the <strong>Triggers (Alarm Clock ⏰)</strong> icon › click <strong>+ Add Trigger</strong> (bottom right).</li>
                  <li>Choose: <em>Function:</em> <strong>onSpreadsheetChange</strong>, <em>Event source:</em> <strong>From spreadsheet</strong>, <em>Event type:</em> <strong>On change</strong> (or <strong>On form submit</strong>).</li>
                  <li>Click <strong>Save</strong> and authorize Google permissions. New leads will now instantly ingest into CRM!</li>
                </ol>
              </div>
            )}

            <pre
              style={{
                margin: 0,
                padding: "12px 14px",
                background: "#020617",
                borderRadius: 6,
                fontSize: 12,
                fontFamily: "monospace",
                overflowX: "auto",
                maxHeight: 220,
                lineHeight: 1.4,
                color: "#38bdf8",
              }}
            >
              <code>{generateAppsScriptCode(webhookUrl)}</code>
            </pre>
          </div>
        </div>
      )}

      {/* Visual Column Mapping */}
      <div className="settings-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2>Visual Column Mapping</h2>
            <p className="section-desc" style={{ margin: 0 }}>
              Select which sheet column corresponds to each CRM field. Preview live data from your linked Google Sheet.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {sheetHeaders.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleAutoDetectLocal}
                disabled={!isAdmin || saving}
                style={{ fontSize: 12, color: "var(--primary)" }}
              >
                ⚡ Auto-Detect Mappings
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleAutoMap}
              disabled={!isAdmin || saving || !settings?.selectedSpreadsheetId}
            >
              {isAdmin ? "Auto-Map via Google" : "🔒 Admin Only"}
            </button>
          </div>
        </div>

        {/* Live Sheet Preview (if headers available) */}
        {loadingPreview ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            <span className="spinner" /> Loading live sheet preview...
          </div>
        ) : sheetHeaders.length > 0 ? (
          <div style={{ marginTop: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                🔍 Live Sheet Preview (First 5 Rows):
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Found <strong>{sheetHeaders.length} columns</strong>
              </div>
            </div>

            <div
              className="table-container"
              style={{
                maxHeight: 180,
                overflow: "auto",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
              }}
            >
              <table style={{ minWidth: "100%", fontSize: 12 }}>
                <thead>
                  <tr>
                    {sheetHeaders.map((h, i) => {
                      const colLetter = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");
                      return (
                        <th key={i} style={{ padding: "8px 12px", whiteSpace: "nowrap", background: "var(--bg-darker)" }}>
                          <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 800, marginRight: 4 }}>
                            [{colLetter}]
                          </span>
                          {h || `Column ${i + 1}`}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sheetPreviewRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {sheetHeaders.map((_, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: "6px 12px",
                            whiteSpace: "nowrap",
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {row[cIdx] || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              background: "rgba(59, 130, 246, 0.06)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              color: "var(--text-secondary)",
              fontSize: 12,
              marginTop: 16,
              marginBottom: 16,
            }}
          >
            💡 <strong>Tip:</strong> Connect and select a Google Sheet above to view live column names and sample data preview. Default column letters (A, B, C...) are shown below.
          </div>
        )}

        {/* Visual Mapping Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          {CRM_SETTINGS_FIELDS.map((field) => {
            const mappedCol = mapping[field.key] ?? -1;
            const isMapped = mappedCol >= 0;
            const sampleValue = isMapped && sheetPreviewRows.length > 0 ? sheetPreviewRows[0]?.[mappedCol] : "";

            return (
              <div
                key={field.key}
                style={{
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: `1px solid ${
                    field.required && !isMapped
                      ? "rgba(239, 68, 68, 0.5)"
                      : isMapped
                      ? "rgba(16, 185, 129, 0.4)"
                      : "var(--border)"
                  }`,
                  background: isMapped ? "rgba(16, 185, 129, 0.03)" : "var(--bg-card)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{field.icon}</span>
                    <span>{field.label}</span>
                    {field.required && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  {isMapped && (
                    <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700 }}>
                      ✓ Mapped
                    </span>
                  )}
                </div>

                <select
                  className="select-input"
                  value={mappedCol}
                  disabled={!isAdmin || saving}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setMapping((prev) => ({ ...prev, [field.key]: val }));
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                  }}
                >
                  <option value={-1}>— Skip / Unmapped —</option>
                  {columnOptions.map((opt) => (
                    <option key={opt.index} value={opt.index}>
                      {opt.label} {opt.sample ? `(${opt.sample})` : ""}
                    </option>
                  ))}
                </select>

                {isMapped && sampleValue && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    Sample: <strong style={{ color: "var(--text-secondary)" }}>{sampleValue}</strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, gap: 12 }}>
          <button
            className="btn btn-primary"
            onClick={handleSaveMapping}
            disabled={!isAdmin || saving}
            style={{
              padding: "10px 20px",
              fontWeight: 700,
            }}
          >
            {isAdmin ? (saving ? "Saving..." : "💾 Save Mapping") : "🔒 Admin Only"}
          </button>
        </div>
      </div>

      {/* Notifications & Polling Interval */}
      <div className="settings-section">
        <h2>Background Sheet Polling & Web Push Notifications</h2>
        <p className="section-desc">
          Configure safety-net background sheet sync frequency and browser/mobile push notifications for unclosed leads and follow-ups.
        </p>

        <div className="settings-row" style={{ marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontWeight: 600 }}>Web Push Status</label>
            <span style={{ fontSize: 12, color: webPushEnabled ? "var(--accent-color)" : "var(--text-muted)" }}>
              {webPushEnabled ? "🟢 Web Push is ACTIVE for this browser/device." : "⚪ Web Push is DISABLED for this browser/device."}
            </span>
          </div>
          <button
            className={`btn btn-sm ${webPushEnabled ? "btn-secondary" : "btn-primary"}`}
            onClick={async () => {
              if (webPushEnabled) {
                const ok = await unsubscribeWebPush();
                if (ok) {
                  setWebPushEnabled(false);
                  showToast("Web Push notifications disabled for this device");
                } else {
                  showToast("Failed to disable Web Push", "error");
                }
              } else {
                if (typeof window !== "undefined" && "Notification" in window) {
                  const perm = await Notification.requestPermission();
                  if (perm === "granted") {
                    const sub = await registerWebPushSubscription(interval);
                    if (sub) {
                      setWebPushEnabled(true);
                      await fetch("/api/settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ backgroundNotificationsEnabled: true, notificationInterval: interval }),
                      });
                      showToast("Web Push notifications enabled for this device!");
                    } else {
                      showToast("Failed to register Web Push", "error");
                    }
                  } else {
                    showToast("Notification permission denied in browser", "error");
                  }
                } else {
                  showToast("Web Push is not supported in this browser", "error");
                }
              }
            }}
          >
            {webPushEnabled ? "Disable Web Push" : "Enable Web Push"}
          </button>
        </div>

        {/* Polling & Notification Interval Control */}
        <div className="settings-row">
          <div>
            <label style={{ display: "block", fontWeight: 600 }}>Background Sheet Polling Interval (minutes)</label>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Periodic safety-net sync frequency with Google Sheets (Recommended: 15–60 mins when Google Apps Script Webhook is active).
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {[15, 30, 60, 120].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`btn btn-sm ${interval === preset ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => setInterval_(preset)}
                  disabled={!isAdmin}
                >
                  {preset}m
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="1440"
                value={interval}
                onChange={(e) => setInterval_(parseInt(e.target.value) || 15)}
                disabled={!isAdmin}
                style={{ width: 75, padding: "4px 8px", fontSize: 13 }}
                title="Custom interval in minutes"
              />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>min</span>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  await handleSaveInterval();
                  if (webPushEnabled) {
                    await registerWebPushSubscription(interval);
                  }
                  showToast(`Background polling interval updated to ${interval} minute(s)!`);
                }}
                disabled={!isAdmin || saving}
              >
                {isAdmin ? "Save Interval" : "🔒 Admin Only"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone - Superadmin Only */}
      {isSuperAdmin && (
        <div
          className="settings-section"
          style={{
            border: "1px solid rgba(239, 68, 68, 0.35)",
            background: "rgba(239, 68, 68, 0.02)",
            borderRadius: "var(--radius)",
            marginTop: 36,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <h2 style={{ color: "var(--danger)", margin: 0 }}>Danger Zone</h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: "rgba(168, 85, 247, 0.12)",
                color: "#a855f7",
                border: "1px solid rgba(168, 85, 247, 0.25)",
                padding: "2px 8px",
                borderRadius: 999,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Superadmin Only
            </span>
          </div>
          <p className="section-desc" style={{ marginBottom: 20 }}>
            Destructive and irreversible database operations. Accessible only to Superadmin.
          </p>

          <div
            style={{
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: 8,
              padding: 16,
              background: "var(--bg-card)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div style={{ maxWidth: 540 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>👥</span>
                <span>Delete Duplicate Leads</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0", lineHeight: 1.5 }}>
                Scans all leads in the database and permanently removes duplicate entries (matching by 10-digit phone number or customer details). The most complete, active record is preserved and merged.
              </p>
              {duplicateScanStats && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: duplicateScanStats.duplicateCount > 0 ? "var(--danger)" : "#10b981",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{duplicateScanStats.duplicateCount > 0 ? "⚠️" : "✓"}</span>
                  <span>
                    {duplicateScanStats.duplicateCount > 0
                      ? `Found ${duplicateScanStats.duplicateCount} duplicate lead(s) across ${duplicateScanStats.groupsCount} customer group(s) (${duplicateScanStats.uniqueCount} unique leads).`
                      : `No duplicate leads found (${duplicateScanStats.totalLeadsScanned} unique leads).`}
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleScanDuplicates}
                disabled={scanningDuplicates || deletingDuplicates}
              >
                {scanningDuplicates ? (
                  <>
                    <span className="spinner" /> Scanning...
                  </>
                ) : (
                  "🔍 Scan Duplicates"
                )}
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setDeduplicateModalOpen(true)}
                disabled={scanningDuplicates || deletingDuplicates}
                style={{ fontWeight: 600 }}
              >
                {deletingDuplicates ? (
                  <>
                    <span className="spinner" /> Deleting...
                  </>
                ) : (
                  "🗑️ Delete Duplicate Leads"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Duplicates Confirmation Modal */}
      {isSuperAdmin && deduplicateModalOpen && (
        <div className="modal-overlay" onClick={() => !deletingDuplicates && setDeduplicateModalOpen(false)}>
          <div
            className="modal"
            style={{ maxWidth: 460, background: "var(--bg-card)", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: "var(--text-primary)" }}>
                Delete Duplicate Leads?
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                This action will scan all leads in the database and delete redundant duplicate records matching on phone number and customer details.
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, background: "rgba(239, 68, 68, 0.06)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(239, 68, 68, 0.15)" }}>
                💡 <strong>Safety Guarantee:</strong> The most complete and active record (with consultant allocations, remarks, and follow-up dates) will be preserved, and any missing fields will be merged before duplicate removal.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setDeduplicateModalOpen(false)}
                disabled={deletingDuplicates}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleExecuteDeduplicate}
                disabled={deletingDuplicates}
                style={{ minWidth: 160 }}
              >
                {deletingDuplicates ? (
                  <>
                    <span className="spinner" /> Deleting Duplicates...
                  </>
                ) : (
                  "Yes, Delete Duplicates"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="loading-overlay">
          <span className="spinner" /> Loading settings...
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
