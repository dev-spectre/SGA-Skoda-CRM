"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";

export interface ConsultantOption {
  id?: number;
  name: string;
  branch: string;
  leadsCount?: number;
}

export interface BranchConsultantPickerProps {
  branches: string[];
  consultants: ConsultantOption[];
  selectedBranch: string;
  selectedConsultant: string;
  onChange: (selection: { branch: string; consultant: string }) => void;
  placeholder?: string;
  showUnassigned?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export default function BranchConsultantPicker({
  branches,
  consultants,
  selectedBranch,
  selectedConsultant,
  onChange,
  placeholder = "All Branches & Consultants",
  showUnassigned = true,
  style,
  className,
}: BranchConsultantPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null);
  const [hoveredTop, setHoveredTop] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [flyoutPlacement, setFlyoutPlacement] = useState<"right" | "left">("right");

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const branchesListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hoverLeaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Group consultants by branch
  const branchMap = useMemo(() => {
    const map = new Map<string, ConsultantOption[]>();

    // Initialize with all unique branches
    branches.forEach((b) => {
      const trimmed = b.trim();
      if (trimmed && !map.has(trimmed.toLowerCase())) {
        map.set(trimmed.toLowerCase(), []);
      }
    });

    // Add consultants into matching branch
    consultants.forEach((c) => {
      if (!c.branch) return;
      const key = c.branch.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(c);
    });

    return map;
  }, [branches, consultants]);

  // Clean list of unique branch display names (case-insensitively deduplicated)
  const uniqueBranchesList = useMemo(() => {
    const map = new Map<string, string>();

    const addBranch = (b: string) => {
      const trimmed = b.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) {
        map.set(key, trimmed === "Mtp" ? "MTP" : trimmed);
      } else {
        const existing = map.get(key)!;
        if (trimmed === "MTP" || (trimmed === trimmed.toUpperCase() && existing !== existing.toUpperCase())) {
          map.set(key, trimmed);
        }
      }
    };

    branches.forEach(addBranch);
    consultants.forEach((c) => {
      if (c.branch) addBranch(c.branch);
    });

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [branches, consultants]);


  // Filtered branches based on search query
  const filteredBranches = useMemo(() => {
    if (!searchTerm.trim()) return uniqueBranchesList;
    const query = searchTerm.toLowerCase().trim();
    return uniqueBranchesList.filter((b) => {
      const branchMatches = b.toLowerCase().includes(query);
      const hasMatchingConsultant = (branchMap.get(b.toLowerCase()) || []).some((c) =>
        c.name.toLowerCase().includes(query)
      );
      return branchMatches || hasMatchingConsultant;
    });
  }, [uniqueBranchesList, branchMap, searchTerm]);

  // Determine label to display on the trigger button
  const displayLabel = useMemo(() => {
    if (selectedConsultant === "Unassigned") {
      return "Unassigned Leads";
    }
    if (selectedBranch && selectedConsultant) {
      return `${selectedBranch} › ${selectedConsultant}`;
    }
    if (selectedConsultant) {
      return selectedConsultant;
    }
    if (selectedBranch) {
      return `${selectedBranch} (All)`;
    }
    return placeholder;
  }, [selectedBranch, selectedConsultant, placeholder]);

  const isFiltered = Boolean(selectedBranch || selectedConsultant);

  // Close on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHoveredBranch(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setHoveredBranch(null);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Update placement (right vs left) based on viewport space
  const updateFlyoutPlacement = useCallback(() => {
    if (!dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const spaceOnRight = window.innerWidth - rect.right;
    if (spaceOnRight < 270 && rect.left > 270) {
      setFlyoutPlacement("left");
    } else {
      setFlyoutPlacement("right");
    }
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
      updateFlyoutPlacement();
    } else {
      setSearchTerm("");
      setHoveredBranch(null);
    }
  }, [isOpen, updateFlyoutPlacement]);

  const handleBranchMouseEnter = useCallback((branch: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }

    if (dropdownRef.current) {
      const dropdownRect = dropdownRef.current.getBoundingClientRect();
      const itemRect = e.currentTarget.getBoundingClientRect();
      const relativeTop = itemRect.top - dropdownRect.top;
      setHoveredTop(Math.max(0, relativeTop));
      updateFlyoutPlacement();
    }
    setHoveredBranch(branch);
  }, [updateFlyoutPlacement]);

  const handleBranchMouseLeave = useCallback(() => {
    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoveredBranch(null);
    }, 200);
  }, []);

  const handleFlyoutMouseEnter = useCallback(() => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  }, []);

  const handleFlyoutMouseLeave = useCallback(() => {
    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoveredBranch(null);
    }, 200);
  }, []);

  const handleSelectAll = () => {
    onChange({ branch: "", consultant: "" });
    setIsOpen(false);
    setHoveredBranch(null);
  };

  const handleSelectUnassigned = () => {
    onChange({ branch: "", consultant: "Unassigned" });
    setIsOpen(false);
    setHoveredBranch(null);
  };

  const handleSelectBranchOnly = (branch: string) => {
    onChange({ branch, consultant: "" });
    setIsOpen(false);
    setHoveredBranch(null);
  };

  const handleSelectConsultant = (branch: string, consultantName: string) => {
    onChange({ branch, consultant: consultantName });
    setIsOpen(false);
    setHoveredBranch(null);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ branch: "", consultant: "" });
    setHoveredBranch(null);
  };

  const activeBranchConsultants = hoveredBranch
    ? branchMap.get(hoveredBranch.toLowerCase()) || []
    : [];

  return (
    <div
      ref={containerRef}
      className={`branch-consultant-picker ${className || ""}`}
      style={{
        position: "relative",
        display: "inline-block",
        minWidth: "220px",
        zIndex: isOpen ? 9999 : "auto",
        ...style,
      }}
    >

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          padding: "9px 12px",
          background: isFiltered ? "rgba(16, 185, 129, 0.06)" : "var(--bg-glass, #ffffff)",
          border: isFiltered ? "1.5px solid var(--primary, #10b981)" : "1.5px solid var(--border, #cbd5e1)",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: isFiltered ? 600 : 500,
          color: isFiltered ? "var(--text-primary, #0f172a)" : "var(--text-secondary, #475569)",
          cursor: "pointer",
          outline: "none",
          transition: "all 0.15s ease",
          boxShadow: isOpen ? "0 0 0 3px rgba(16, 185, 129, 0.15)" : "none",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={isFiltered ? "var(--primary, #10b981)" : "var(--text-muted, #94a3b8)"}
            strokeWidth="2"
            style={{ width: 16, height: 16, flexShrink: 0 }}
          >
            {selectedConsultant ? (
              <>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </>
            ) : (
              <>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </>
            )}
          </svg>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayLabel}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
          {isFiltered && (
            <span
              role="button"
              onClick={handleClear}
              title="Clear selection"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "rgba(100, 116, 139, 0.15)",
                color: "#64748b",
                fontSize: "11px",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(100, 116, 139, 0.15)")}
            >
              ✕
            </span>
          )}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              width: 14,
              height: 14,
              color: "var(--text-muted, #94a3b8)",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Dropdown Menu Container (overflow: visible ensures flyout floats outside without horizontal scrolling) */}
      {isOpen && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 9999,
            width: "260px",
            background: "#ffffff",
            borderRadius: "10px",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.08)",
            border: "1px solid var(--border, #e2e8f0)",

            padding: "8px",
            overflow: "visible",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Quick Search */}
          <div style={{ position: "relative", marginBottom: "6px" }}>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search branch or consultant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px 7px 28px",
                borderRadius: "6px",
                border: "1px solid var(--border, #cbd5e1)",
                fontSize: "12px",
                outline: "none",
                background: "#f8fafc",
              }}
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 13, height: 13 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Preset Actions */}
          {!searchTerm && (
            <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "4px", marginBottom: "4px" }}>
              <button
                type="button"
                onClick={handleSelectAll}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 10px",
                  borderRadius: "6px",
                  border: "none",
                  background: !selectedBranch && !selectedConsultant ? "rgba(16, 185, 129, 0.12)" : "transparent",
                  color: !selectedBranch && !selectedConsultant ? "var(--primary-dark, #059669)" : "var(--text-primary, #0f172a)",
                  fontWeight: !selectedBranch && !selectedConsultant ? 700 : 500,
                  fontSize: "12.5px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (selectedBranch || selectedConsultant) e.currentTarget.style.background = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  if (selectedBranch || selectedConsultant) e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🌐</span>
                  <span>All Branches & Consultants</span>
                </div>
                {!selectedBranch && !selectedConsultant && <span style={{ color: "var(--primary, #10b981)", fontSize: "13px" }}>✓</span>}
              </button>

              {showUnassigned && (
                <button
                  type="button"
                  onClick={handleSelectUnassigned}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: selectedConsultant === "Unassigned" ? "rgba(16, 185, 129, 0.12)" : "transparent",
                    color: selectedConsultant === "Unassigned" ? "var(--primary-dark, #059669)" : "var(--text-primary, #0f172a)",
                    fontWeight: selectedConsultant === "Unassigned" ? 700 : 500,
                    fontSize: "12.5px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedConsultant !== "Unassigned") e.currentTarget.style.background = "#f8fafc";
                  }}
                  onMouseLeave={(e) => {
                    if (selectedConsultant !== "Unassigned") e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>👤</span>
                    <span>Unassigned Leads</span>
                  </div>
                  {selectedConsultant === "Unassigned" && <span style={{ color: "var(--primary, #10b981)", fontSize: "13px" }}>✓</span>}
                </button>
              )}
            </div>
          )}

          {/* Section Header */}
          <div style={{ padding: "4px 10px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted, #94a3b8)" }}>
            Branches ({filteredBranches.length})
          </div>

          {/* Branches Scrollable List (overflowX: hidden prevents horizontal scrollbar inside list) */}
          <div
            ref={branchesListRef}
            style={{ maxHeight: "280px", overflowY: "auto", overflowX: "hidden" }}
          >
            {filteredBranches.length === 0 ? (
              <div style={{ padding: "16px 10px", textAlign: "center", color: "var(--text-muted, #94a3b8)", fontSize: "12px" }}>
                No branches or consultants match &ldquo;{searchTerm}&rdquo;
              </div>
            ) : (
              filteredBranches.map((branch) => {
                const branchConsultants = branchMap.get(branch.toLowerCase()) || [];
                const isBranchActive = selectedBranch.toLowerCase() === branch.toLowerCase();
                const isHovered = hoveredBranch?.toLowerCase() === branch.toLowerCase();

                return (
                  <div
                    key={branch}
                    onMouseEnter={(e) => handleBranchMouseEnter(branch, e)}
                    onMouseLeave={handleBranchMouseLeave}
                    onClick={() => handleSelectBranchOnly(branch)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      background: isHovered
                        ? "#f1f5f9"
                        : isBranchActive
                        ? "rgba(16, 185, 129, 0.08)"
                        : "transparent",
                      cursor: "pointer",
                      transition: "background 0.12s",
                      border: isBranchActive && !selectedConsultant ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <span style={{ fontSize: "13px" }}>🏢</span>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: isBranchActive ? 700 : 500,
                          color: isBranchActive ? "var(--primary-dark, #059669)" : "var(--text-primary, #0f172a)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {branch}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "10px",
                          background: branchConsultants.length > 0 ? "rgba(16, 185, 129, 0.12)" : "#f1f5f9",
                          color: branchConsultants.length > 0 ? "var(--primary-dark, #059669)" : "#94a3b8",
                        }}
                      >
                        {branchConsultants.length}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        style={{
                          width: 12,
                          height: 12,
                          color: isHovered ? "var(--primary, #10b981)" : "#94a3b8",
                          transform: isHovered ? "translateX(2px)" : "none",
                          transition: "transform 0.15s",
                        }}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Level 2 Side Popover (Rendered directly under dropdownRef, completely unclipped by scroll containers) */}
          {hoveredBranch && (
            <div
              onMouseEnter={handleFlyoutMouseEnter}
              onMouseLeave={handleFlyoutMouseLeave}
              style={{
                position: "absolute",
                top: Math.max(0, hoveredTop - 30),
                ...(flyoutPlacement === "right"
                  ? { left: "calc(100% + 6px)" }
                  : { right: "calc(100% + 6px)" }),
                width: "250px",
                background: "#ffffff",
                borderRadius: "10px",
                boxShadow: "0 12px 32px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(15, 23, 42, 0.08)",
                border: "1px solid var(--border, #e2e8f0)",
                padding: "8px",
                zIndex: 10000,
                animation: "fadeIn 0.12s ease-out",
              }}

            >
              {/* Invisible Bridge to prevent mouse leave during gap traversal */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  ...(flyoutPlacement === "right"
                    ? { left: "-10px", width: "12px" }
                    : { right: "-10px", width: "12px" }),
                  background: "transparent",
                }}
              />

              {/* Branch Flyout Header */}
              <div
                style={{
                  padding: "4px 8px 8px",
                  borderBottom: "1px solid #f1f5f9",
                  marginBottom: "6px",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
                  Branch
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                  {hoveredBranch}
                </div>
              </div>

              {/* Option: Select entire branch */}
              <button
                type="button"
                onClick={() => handleSelectBranchOnly(hoveredBranch)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 10px",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    selectedBranch.toLowerCase() === hoveredBranch.toLowerCase() && !selectedConsultant
                      ? "rgba(16, 185, 129, 0.12)"
                      : "transparent",
                  color:
                    selectedBranch.toLowerCase() === hoveredBranch.toLowerCase() && !selectedConsultant
                      ? "var(--primary-dark, #059669)"
                      : "var(--text-primary, #0f172a)",
                  fontWeight:
                    selectedBranch.toLowerCase() === hoveredBranch.toLowerCase() && !selectedConsultant
                      ? 700
                      : 600,
                  fontSize: "12.5px",
                  cursor: "pointer",
                  textAlign: "left",
                  marginBottom: "4px",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (selectedBranch.toLowerCase() !== hoveredBranch.toLowerCase() || selectedConsultant) {
                    e.currentTarget.style.background = "#f8fafc";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedBranch.toLowerCase() !== hoveredBranch.toLowerCase() || selectedConsultant) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>📁</span>
                  <span>All {hoveredBranch} Leads</span>
                </div>
                {selectedBranch.toLowerCase() === hoveredBranch.toLowerCase() && !selectedConsultant && (
                  <span style={{ color: "var(--primary, #10b981)", fontSize: "13px" }}>✓</span>
                )}
              </button>

              <div style={{ borderTop: "1px solid #f1f5f9", margin: "4px 0", paddingTop: "4px" }}>
                <div style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8" }}>
                  Consultants ({activeBranchConsultants.length})
                </div>
              </div>

              {/* List of Consultants under this branch */}
              <div style={{ maxHeight: "220px", overflowY: "auto" }}>
                {activeBranchConsultants.length === 0 ? (
                  <div style={{ padding: "12px 8px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                    No registered consultants for {hoveredBranch}
                  </div>
                ) : (
                  activeBranchConsultants.map((c) => {
                    const isConsultantActive =
                      selectedConsultant.toLowerCase() === c.name.toLowerCase() &&
                      (!selectedBranch || selectedBranch.toLowerCase() === hoveredBranch.toLowerCase());

                    return (
                      <button
                        key={`${c.id || c.name}-${hoveredBranch}`}
                        type="button"
                        onClick={() => handleSelectConsultant(hoveredBranch, c.name)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "7px 10px",
                          borderRadius: "6px",
                          border: "none",
                          background: isConsultantActive ? "rgba(16, 185, 129, 0.12)" : "transparent",
                          color: isConsultantActive ? "var(--primary-dark, #059669)" : "var(--text-primary, #0f172a)",
                          fontWeight: isConsultantActive ? 700 : 500,
                          fontSize: "12.5px",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isConsultantActive) e.currentTarget.style.background = "#f8fafc";
                        }}
                        onMouseLeave={(e) => {
                          if (!isConsultantActive) e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "var(--primary-dark, #059669)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "10px",
                              flexShrink: 0,
                            }}
                          >
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.name}
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {c.leadsCount !== undefined && (
                            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>
                              {c.leadsCount}L
                            </span>
                          )}
                          {isConsultantActive && (
                            <span style={{ color: "var(--primary, #10b981)", fontSize: "13px" }}>✓</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
