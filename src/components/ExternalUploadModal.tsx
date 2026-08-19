"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

interface ExternalUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

interface ColumnOption {
  index: number;
  label: string;
  sample: string;
}

const CRM_FIELDS = [
  { key: "name", label: "Customer Name", required: true, icon: "👤", hints: ["name", "full name", "client", "customer", "lead name", "prospect"] },
  { key: "phone", label: "Phone Number", required: true, icon: "📞", hints: ["phone", "mobile", "contact", "cell", "number", "tel"] },
  { key: "branch", label: "Branch", required: false, icon: "📍", hints: ["branch", "showroom", "outlet", "dealer", "location"] },
  { key: "email", label: "Email Address", required: false, icon: "✉️", hints: ["email", "e-mail", "mail"] },
  { key: "city", label: "City / Place", required: false, icon: "🏙️", hints: ["city", "town", "place", "district", "address"] },
  { key: "assignedConsultant", label: "Assigned Consultant", required: false, icon: "🧑‍💼", hints: ["consultant", "executive", "advisor", "rep", "sales rep", "assigned"] },
  { key: "status", label: "Lead Status", required: false, icon: "📊", hints: ["status", "stage", "lead status", "disposition"] },
  { key: "adname", label: "Campaign / Ad Name", required: false, icon: "📢", hints: ["ad", "campaign", "ad name", "adset", "creative", "utm"] },
  { key: "platform", label: "Platform / Source", required: false, icon: "🌐", hints: ["platform", "source", "channel", "publisher", "medium"] },
  { key: "testDrive", label: "Test Drive", required: false, icon: "🚗", hints: ["test drive", "td", "testdrive", "demo"] },
  { key: "remark", label: "Remark / Notes", required: false, icon: "📝", hints: ["remark", "notes", "comment", "feedback", "description"] },
  { key: "createdAt", label: "Created Date", required: false, icon: "📅", hints: ["date", "created", "timestamp", "time", "created at"] },
];

export function ExternalUploadModal({ isOpen, onClose, onSuccess }: ExternalUploadModalProps) {
  const [sourceType, setSourceType] = useState<"file" | "drive" | "link">("file");

  // Step state: 1 = choose source, 2 = preview & map
  const [step, setStep] = useState<1 | 2>(1);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileWorkbook, setFileWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [fileSheetNames, setFileSheetNames] = useState<string[]>([]);
  const [selectedFileSheet, setSelectedFileSheet] = useState<string>("");

  // Google Drive State
  const [spreadsheets, setSpreadsheets] = useState<{ id: string; name: string }[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string>("");
  const [driveSheetNames, setDriveSheetNames] = useState<string[]>([]);
  const [selectedDriveSheet, setSelectedDriveSheet] = useState<string>("");
  const [loadingDrive, setLoadingDrive] = useState<boolean>(false);
  const [loadingDriveSheets, setLoadingDriveSheets] = useState<boolean>(false);

  // Google Link State
  const [googleUrl, setGoogleUrl] = useState<string>("");
  const [linkSpreadsheetId, setLinkSpreadsheetId] = useState<string>("");
  const [linkSheetNames, setLinkSheetNames] = useState<string[]>([]);
  const [selectedLinkSheet, setSelectedLinkSheet] = useState<string>("");
  const [loadingLinkSheets, setLoadingLinkSheets] = useState<boolean>(false);

  // Parsed Sheet Data & Preview
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [allParsedRows, setAllParsedRows] = useState<(string | number)[][]>([]);
  const [totalRowsCount, setTotalRowsCount] = useState<number>(0);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);

  // Visual Mapping State: fieldKey -> columnIndex (-1 = unmapped)
  const [mapping, setMapping] = useState<Record<string, number>>({});

  // Default/Fallback Platform State
  const [defaultPlatform, setDefaultPlatform] = useState<string>("Instagram");
  const [customPlatform, setCustomPlatform] = useState<string>("");

  // Importing State
  const [importing, setImporting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch Google Spreadsheets if user chooses Drive
  const fetchDriveSpreadsheets = useCallback(async () => {
    setLoadingDrive(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/sheets/list");
      const data = await res.json();
      if (res.ok && Array.isArray(data.spreadsheets)) {
        setSpreadsheets(data.spreadsheets);
      } else {
        setErrorMsg(data.error || "No Google spreadsheets found. Link Google account in Settings.");
      }
    } catch {
      setErrorMsg("Failed to connect to Google Drive");
    } finally {
      setLoadingDrive(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && sourceType === "drive" && spreadsheets.length === 0) {
      fetchDriveSpreadsheets();
    }
  }, [isOpen, sourceType, spreadsheets.length, fetchDriveSpreadsheets]);

  // Handle spreadsheet selection in Drive mode
  const handleDriveSpreadsheetChange = async (spreadsheetId: string) => {
    setSelectedDriveId(spreadsheetId);
    setSelectedDriveSheet("");
    setDriveSheetNames([]);
    if (!spreadsheetId) return;

    setLoadingDriveSheets(true);
    try {
      const res = await fetch(`/api/sheets/list?spreadsheetId=${spreadsheetId}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.sheets)) {
        setDriveSheetNames(data.sheets);
        if (data.sheets.length > 0) setSelectedDriveSheet(data.sheets[0]);
      }
    } catch {
      setErrorMsg("Failed to fetch sheet tabs for selected spreadsheet");
    } finally {
      setLoadingDriveSheets(false);
    }
  };

  // Handle URL change in Link mode
  const handleGoogleUrlChange = async (url: string) => {
    setGoogleUrl(url);
    setErrorMsg(null);
    const clean = url.trim();
    const match = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const id = match ? match[1] : clean.length > 20 && !clean.includes("/") ? clean : "";

    setLinkSpreadsheetId(id);
    setLinkSheetNames([]);
    setSelectedLinkSheet("");

    if (id) {
      setLoadingLinkSheets(true);
      try {
        const res = await fetch(`/api/sheets/list?spreadsheetId=${id}`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.sheets)) {
          setLinkSheetNames(data.sheets);
          if (data.sheets.length > 0) setSelectedLinkSheet(data.sheets[0]);
        } else {
          setErrorMsg(data.error || "Could not access Google Sheet. Verify sharing settings.");
        }
      } catch {
        setErrorMsg("Failed to connect to Google Sheet with provided link");
      } finally {
        setLoadingLinkSheets(false);
      }
    }
  };

  // Handle Local File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        setFileWorkbook(workbook);
        setFileSheetNames(workbook.SheetNames);
        if (workbook.SheetNames.length > 0) {
          setSelectedFileSheet(workbook.SheetNames[0]);
        }
      } catch (err: any) {
        setErrorMsg(`Failed to parse file: ${err?.message || "Invalid Excel/CSV format"}`);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Auto-detect mappings based on header keywords and sample data
  const autoDetectMapping = (rawHeaders: string[], samples: string[][]) => {
    const newMapping: Record<string, number> = {};
    const usedCols = new Set<number>();

    const normalizedHeaders = rawHeaders.map((h, i) => ({
      index: i,
      clean: (h || "").toLowerCase().replace(/[^a-z0-9]/g, " "),
    }));

    CRM_FIELDS.forEach((field) => {
      let matchedIndex = -1;

      // Check header name match
      for (const hint of field.hints) {
        const match = normalizedHeaders.find(
          (h) => !usedCols.has(h.index) && (h.clean === hint || h.clean.includes(hint))
        );
        if (match) {
          matchedIndex = match.index;
          break;
        }
      }

      // Sniff phone if missing
      if (matchedIndex === -1 && field.key === "phone") {
        for (let col = 0; col < rawHeaders.length; col++) {
          if (usedCols.has(col)) continue;
          const isPhoneSample = samples.some((r) => {
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
      } else {
        newMapping[field.key] = -1;
      }
    });

    setMapping(newMapping);
  };

  // Proceed to Step 2: Load Preview & Generate Visual Mappings
  const handleProceedToMapping = async () => {
    setErrorMsg(null);
    setLoadingPreview(true);

    try {
      if (sourceType === "file") {
        if (!fileWorkbook || !selectedFileSheet) {
          setErrorMsg("Please select a valid Excel or CSV file");
          setLoadingPreview(false);
          return;
        }
        const worksheet = fileWorkbook.Sheets[selectedFileSheet];
        const rows: (string | number)[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        if (!rows || rows.length <= 1) {
          setErrorMsg("The selected file contains no lead records");
          setLoadingPreview(false);
          return;
        }

        const rawHeaders = (rows[0] || []).map((h) => String(h || "").trim());
        const preview = rows.slice(1, 6).map((r) => rawHeaders.map((_, colIdx) => String(r[colIdx] ?? "")));

        setHeaders(rawHeaders);
        setPreviewRows(preview);
        setAllParsedRows(rows);
        setTotalRowsCount(rows.length - 1);

        autoDetectMapping(rawHeaders, preview);
        setStep(2);
      } else {
        // Google Drive or Google Link
        const targetId = sourceType === "drive" ? selectedDriveId : linkSpreadsheetId;
        const targetSheet = sourceType === "drive" ? selectedDriveSheet : selectedLinkSheet;

        if (!targetId || !targetSheet) {
          setErrorMsg("Please select both spreadsheet and sheet tab");
          setLoadingPreview(false);
          return;
        }

        const res = await fetch(`/api/sheets/preview?spreadsheetId=${encodeURIComponent(targetId)}&sheetName=${encodeURIComponent(targetSheet)}`);
        const data = await res.json();

        if (!res.ok) {
          setErrorMsg(data.error || "Failed to fetch sheet preview");
          setLoadingPreview(false);
          return;
        }

        if (!data.headers || data.headers.length === 0) {
          setErrorMsg("Sheet appears empty or has no header row");
          setLoadingPreview(false);
          return;
        }

        setHeaders(data.headers);
        setPreviewRows(data.previewRows || []);
        setAllParsedRows([]); // Server handles fetch
        setTotalRowsCount(data.totalRows || 0);

        autoDetectMapping(data.headers, data.previewRows || []);
        setStep(2);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to load sheet preview");
    } finally {
      setLoadingPreview(false);
    }
  };

  // Submit and Import Leads
  const handleImportLeads = async () => {
    // Validate required fields
    if (mapping.name === undefined || mapping.name < 0) {
      setErrorMsg("Please select a column for 'Customer Name'");
      return;
    }
    if (mapping.phone === undefined || mapping.phone < 0) {
      setErrorMsg("Please select a column for 'Phone Number'");
      return;
    }

    setImporting(true);
    setErrorMsg(null);

    try {
      const selectedPlatform = defaultPlatform === "custom" ? customPlatform.trim() : defaultPlatform;
      let payload: any = { mapping, defaultPlatform: selectedPlatform || "Unknown" };

      if (sourceType === "file") {
        payload.rows = allParsedRows;
      } else {
        payload.spreadsheetId = sourceType === "drive" ? selectedDriveId : linkSpreadsheetId;
        payload.sheetName = sourceType === "drive" ? selectedDriveSheet : selectedLinkSheet;
      }

      const res = await fetch("/api/sheets/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Import failed. Please review mapping.");
        setImporting(false);
        return;
      }

      onSuccess(data.message || `Successfully imported ${data.synced} leads! (Skipped ${data.skipped} duplicates)`);
      handleClose();
    } catch {
      setErrorMsg("Network error occurred during import");
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedFile(null);
    setFileWorkbook(null);
    setFileSheetNames([]);
    setGoogleUrl("");
    setDefaultPlatform("Instagram");
    setCustomPlatform("");
    setHeaders([]);
    setPreviewRows([]);
    setAllParsedRows([]);
    setMapping({});
    setErrorMsg(null);
    setImporting(false);
    onClose();
  };

  if (!isOpen) return null;

  // Build column options for visual dropdowns
  const columnOptions: ColumnOption[] = headers.map((header, idx) => {
    const colLetter = String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? Math.floor(idx / 26) : "");
    const sample = previewRows[0]?.[idx] || "";
    return {
      index: idx,
      label: `Col ${colLetter}: ${header || `Column ${idx + 1}`}`,
      sample: sample.length > 25 ? `${sample.slice(0, 22)}...` : sample,
    };
  });

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal"
        style={{
          maxWidth: step === 1 ? "680px" : "1050px",
          width: "95%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          transition: "max-width 0.25s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "8px",
                background: "linear-gradient(135deg, var(--primary), var(--primary-dark))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontSize: "18px",
              }}
            >
              📥
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
                {step === 1 ? "Upload & Import External Leads" : "Preview & Visual Column Mapping"}
              </h2>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                {step === 1
                  ? "Choose an Excel/CSV file, pick from Google Drive, or paste a Google Sheet link"
                  : `Previewing ${totalRowsCount} rows • Map columns to SGA Skoda CRM fields`}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleClose} style={{ fontSize: "18px", padding: "4px 8px" }}>
            ✕
          </button>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
              fontSize: "13px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>⚠️ {errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div style={{ overflowY: "auto", flex: 1, paddingRight: "4px" }}>
          {step === 1 ? (
            <div>
              {/* Source Switcher Tabs */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                  background: "var(--bg-card)",
                  padding: "4px",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  marginBottom: "20px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSourceType("file")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "7px",
                    border: "none",
                    background: sourceType === "file" ? "var(--primary)" : "transparent",
                    color: sourceType === "file" ? "#ffffff" : "var(--text-secondary)",
                    fontWeight: sourceType === "file" ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    fontSize: "13px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>📁</span> Excel / CSV File
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType("drive")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "7px",
                    border: "none",
                    background: sourceType === "drive" ? "var(--primary)" : "transparent",
                    color: sourceType === "drive" ? "#ffffff" : "var(--text-secondary)",
                    fontWeight: sourceType === "drive" ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    fontSize: "13px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>📊</span> Google Drive
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType("link")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "7px",
                    border: "none",
                    background: sourceType === "link" ? "var(--primary)" : "transparent",
                    color: sourceType === "link" ? "#ffffff" : "var(--text-secondary)",
                    fontWeight: sourceType === "link" ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    fontSize: "13px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>🔗</span> Google Sheet Link
                </button>
              </div>

              {/* Source Option 1: File Upload */}
              {sourceType === "file" && (
                <div>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: "2px dashed var(--border)",
                      borderRadius: "12px",
                      padding: "36px 20px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: selectedFile ? "rgba(16, 185, 129, 0.05)" : "var(--bg-card)",
                      borderColor: selectedFile ? "var(--primary)" : "var(--border)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".xlsx,.xls,.csv"
                      style={{ display: "none" }}
                    />
                    <div style={{ fontSize: "36px", marginBottom: "10px" }}>📄</div>
                    {selectedFile ? (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>
                          {selectedFile.name}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                          {(selectedFile.size / 1024).toFixed(1)} KB • Click to choose another file
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
                          Click to browse or drag & drop Excel / CSV file
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                          Supports .xlsx, .xls, and .csv files with custom headers
                        </div>
                      </div>
                    )}
                  </div>

                  {fileSheetNames.length > 1 && (
                    <div style={{ marginTop: "16px" }}>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                        Select Sheet Tab:
                      </label>
                      <select
                        className="select-input"
                        value={selectedFileSheet}
                        onChange={(e) => setSelectedFileSheet(e.target.value)}
                        style={{ width: "100%", padding: "10px" }}
                      >
                        {fileSheetNames.map((sheet) => (
                          <option key={sheet} value={sheet}>
                            {sheet}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Source Option 2: Google Drive */}
              {sourceType === "drive" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                      Select Google Spreadsheet:
                    </label>
                    {loadingDrive ? (
                      <div style={{ padding: "12px", fontSize: "13px", color: "var(--text-muted)" }}>
                        <span className="spinner" /> Loading Google Drive spreadsheets...
                      </div>
                    ) : (
                      <select
                        className="select-input"
                        value={selectedDriveId}
                        onChange={(e) => handleDriveSpreadsheetChange(e.target.value)}
                        style={{ width: "100%", padding: "10px" }}
                      >
                        <option value="">-- Choose a Spreadsheet --</option>
                        {spreadsheets.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {selectedDriveId && (
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                        Select Sheet Tab:
                      </label>
                      {loadingDriveSheets ? (
                        <div style={{ padding: "10px", fontSize: "13px", color: "var(--text-muted)" }}>
                          <span className="spinner" /> Loading sheet tabs...
                        </div>
                      ) : (
                        <select
                          className="select-input"
                          value={selectedDriveSheet}
                          onChange={(e) => setSelectedDriveSheet(e.target.value)}
                          style={{ width: "100%", padding: "10px" }}
                        >
                          <option value="">-- Choose a Tab --</option>
                          {driveSheetNames.map((tab) => (
                            <option key={tab} value={tab}>
                              {tab}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Source Option 3: Google Link */}
              {sourceType === "link" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                      Paste Google Sheet Link or Spreadsheet ID:
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit"
                      value={googleUrl}
                      onChange={(e) => handleGoogleUrlChange(e.target.value)}
                      style={{ width: "100%", padding: "10px 14px" }}
                    />
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Make sure the Google Account linked in Settings has read access to this sheet.
                    </div>
                  </div>

                  {linkSpreadsheetId && (
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                        Select Sheet Tab:
                      </label>
                      {loadingLinkSheets ? (
                        <div style={{ padding: "10px", fontSize: "13px", color: "var(--text-muted)" }}>
                          <span className="spinner" /> Fetching sheet tabs...
                        </div>
                      ) : (
                        <select
                          className="select-input"
                          value={selectedLinkSheet}
                          onChange={(e) => setSelectedLinkSheet(e.target.value)}
                          style={{ width: "100%", padding: "10px" }}
                        >
                          {linkSheetNames.map((tab) => (
                            <option key={tab} value={tab}>
                              {tab}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Step 2: Preview & Visual Column Mapping */
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Data Preview Table */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                    🔍 Data Preview (First 5 Rows):
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Found <strong>{headers.length} columns</strong> • <strong>{totalRowsCount} lead rows</strong>
                  </div>
                </div>

                <div
                  className="table-container"
                  style={{
                    maxHeight: "180px",
                    overflow: "auto",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                  }}
                >
                  <table style={{ minWidth: "100%", fontSize: "12px" }}>
                    <thead>
                      <tr>
                        {headers.map((h, i) => {
                          const colLetter = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");
                          return (
                            <th key={i} style={{ padding: "8px 12px", whiteSpace: "nowrap", background: "var(--bg-darker)" }}>
                              <span style={{ fontSize: "10px", color: "var(--primary)", fontWeight: 800, marginRight: "4px" }}>
                                [{colLetter}]
                              </span>
                              {h || `Column ${i + 1}`}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {headers.map((_, cIdx) => (
                            <td
                              key={cIdx}
                              style={{
                                padding: "6px 12px",
                                whiteSpace: "nowrap",
                                maxWidth: "200px",
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

              {/* Default / Fallback Platform Selection */}
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  background: "rgba(59, 130, 246, 0.04)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>🌐</span>
                      <span>Default Platform / Lead Source:</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                      If a lead doesn&apos;t have a platform column mapped or detected in the file, assign this platform:
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      className="select-input"
                      value={defaultPlatform}
                      onChange={(e) => setDefaultPlatform(e.target.value)}
                      style={{ padding: "8px 12px", fontSize: "13px", borderRadius: "6px", minWidth: "160px", fontWeight: 600 }}
                    >
                      <option value="Instagram">Instagram</option>
                      <option value="Facebook">Facebook</option>
                      <option value="Google Ads">Google Ads</option>
                      <option value="Meta">Meta</option>
                      <option value="Chatbot">Chatbot</option>
                      <option value="Website">Website</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Walk-in">Walk-in</option>
                      <option value="Unknown">Unknown</option>
                      <option value="custom">✏️ Custom Platform...</option>
                    </select>
                    {defaultPlatform === "custom" && (
                      <input
                        type="text"
                        className="input"
                        placeholder="Enter platform name..."
                        value={customPlatform}
                        onChange={(e) => setCustomPlatform(e.target.value)}
                        style={{ padding: "8px 12px", fontSize: "13px", borderRadius: "6px", width: "180px" }}
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Visual Mapping Controls */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div>
                    <span style={{ fontSize: "14px", fontWeight: 700 }}>Map CRM Fields to Sheet Columns:</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "8px" }}>
                      (Select which column matches each field)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => autoDetectMapping(headers, previewRows)}
                    style={{ fontSize: "12px", color: "var(--primary)" }}
                  >
                    ⚡ Auto-Detect Mappings
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {CRM_FIELDS.map((field) => {
                    const mappedCol = mapping[field.key] ?? -1;
                    const isMapped = mappedCol >= 0;
                    const sampleValue = isMapped ? previewRows[0]?.[mappedCol] : "";

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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <label style={{ fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>{field.icon}</span>
                            <span>{field.label}</span>
                            {field.required && <span style={{ color: "#ef4444" }}>*</span>}
                          </label>
                          {isMapped && (
                            <span style={{ fontSize: "10px", color: "#10b981", fontWeight: 700 }}>
                              ✓ Mapped
                            </span>
                          )}
                        </div>

                        <select
                          className="select-input"
                          value={mappedCol}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setMapping((prev) => ({ ...prev, [field.key]: val }));
                          }}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: "12px",
                            borderRadius: "6px",
                          }}
                        >
                          <option value={-1}>— Skip / Not in Sheet —</option>
                          {columnOptions.map((opt) => (
                            <option key={opt.index} value={opt.index}>
                              {opt.label} {opt.sample ? `(${opt.sample})` : ""}
                            </option>
                          ))}
                        </select>

                        {isMapped && sampleValue && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              marginTop: "4px",
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
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "16px",
            paddingTop: "12px",
            borderTop: "1px solid var(--border)",
          }}
        >
          {step === 2 ? (
            <button className="btn btn-ghost" onClick={() => setStep(1)} disabled={importing}>
              ← Back to File Selection
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn btn-ghost" onClick={handleClose} disabled={importing}>
              Cancel
            </button>

            {step === 1 ? (
              <button
                className="btn btn-primary"
                onClick={handleProceedToMapping}
                disabled={
                  loadingPreview ||
                  (sourceType === "file" && !selectedFile) ||
                  (sourceType === "drive" && (!selectedDriveId || !selectedDriveSheet)) ||
                  (sourceType === "link" && (!linkSpreadsheetId || !selectedLinkSheet))
                }
              >
                {loadingPreview ? (
                  <>
                    <span className="spinner" /> Loading Preview...
                  </>
                ) : (
                  "Preview & Map Columns →"
                )}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleImportLeads}
                disabled={importing || (mapping.name ?? -1) < 0 || (mapping.phone ?? -1) < 0}
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
                  fontWeight: 700,
                }}
              >
                {importing ? (
                  <>
                    <span className="spinner" /> Importing Leads...
                  </>
                ) : (
                  `Import Leads (${totalRowsCount} rows)`
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
