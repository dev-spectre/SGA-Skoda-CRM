"use client";

import { useState, useEffect, useMemo } from "react";
import { parsePhoneNumber, parseBranches } from "@/lib/utils";

interface Lead {
  id: number;
  name: string;
  phone: string;
  status: string;
  city?: string;
  branch?: string;
  adname?: string;
  followUpDate1?: string | null;
  followUpDate2?: string | null;
  remark: string | null;
  createdAt: string;
}

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

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessRestricted, setAccessRestricted] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const updateLeadInState = (id: number, updates: Partial<Lead>) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const handleStatusChange = async (lead: Lead, newStatus: string) => {
    const oldStatus = lead.status;
    const normOld = (oldStatus === 'created' ? 'not_contacted' : oldStatus === 'closed_successful' ? 'live' : oldStatus === 'closed_unsuccessful' ? 'lost' : oldStatus);
    if (newStatus === normOld) return;

    updateLeadInState(lead.id, { status: newStatus });
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm-leads-updated'));
    } catch {
      updateLeadInState(lead.id, { status: oldStatus });
    }
  };

  const handleFollowUpUpdate = async (lead: Lead, field: 'followUpDate1' | 'followUpDate2', dateStr: string) => {
    const oldVal = lead[field];
    const dateWithTime = dateStr ? `${dateStr}T12:00:00Z` : null;
    
    updateLeadInState(lead.id, { [field]: dateWithTime });

    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: dateStr || null })
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm-leads-updated'));
    } catch {
      updateLeadInState(lead.id, { [field]: oldVal });
    }
  };

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const res = await fetch("/api/leads?limit=100000"); // Fetch all leads for now
        const data = await res.json();
        if (res.status === 403) {
          setAccessRestricted(true);
        } else if (res.ok) {
          setLeads(data.leads || []);
        }
      } catch (err) {
        console.error("Failed to fetch leads", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeads();
  }, []);

  const { daysInMonth, startDayOfMonth } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOfMonth = new Date(year, month, 1).getDay();
    return { daysInMonth, startDayOfMonth };
  }, [currentDate]);

  const leadsByDate = useMemo(() => {
    const map = new Map<string, Lead[]>();
    leads.forEach(lead => {
      const dates = new Set<string>();
      if (lead.followUpDate1) dates.add(toISTDateString(lead.followUpDate1));
      if (lead.followUpDate2) dates.add(toISTDateString(lead.followUpDate2));
      
      dates.forEach(dateStr => {
        if (!map.has(dateStr)) map.set(dateStr, []);
        map.get(dateStr)!.push(lead);
      });
    });
    return map;
  }, [leads]);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const today = () => setCurrentDate(new Date());

  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  const renderCells = () => {
    const cells = [];
    const totalCells = Math.ceil((startDayOfMonth + daysInMonth) / 7) * 7;
    
    for (let i = 0; i < totalCells; i++) {
      const day = i - startDayOfMonth + 1;
      const isCurrentMonth = day > 0 && day <= daysInMonth;
      const yyyy = year;
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayLeads = isCurrentMonth ? leadsByDate.get(dateStr) || [] : [];
      
      const isToday = isCurrentMonth && dateStr === toISTDateString(new Date().toISOString());

      cells.push(
        <div 
          key={i} 
          style={{ 
            minHeight: "120px", 
            borderRight: "1px solid var(--border)", 
            borderBottom: "1px solid var(--border)",
            padding: "8px",
            background: isCurrentMonth ? "transparent" : "rgba(0,0,0,0.02)",
            opacity: isCurrentMonth ? 1 : 0.5
          }}
        >
          {isCurrentMonth && (
            <>
              <div style={{ 
                fontWeight: 600, 
                marginBottom: 8,
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: isToday ? "var(--primary-light)" : "transparent",
                color: isToday ? "#fff" : "var(--text-primary)",
              }}>
                {day}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {dayLeads.map((l, idx) => (
                  <div 
                    key={`${l.id}-${idx}`}
                    onClick={() => setSelectedLead(l)}
                    style={{
                      background: l.status === 'live' ? "rgba(16, 185, 129, 0.15)" : l.status === 'lost' ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)",
                      color: l.status === 'live' ? "var(--status-live)" : l.status === 'lost' ? "var(--status-lost)" : "var(--status-pending)",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      borderLeft: `3px solid ${l.status === 'live' ? "var(--status-live)" : l.status === 'lost' ? "var(--status-lost)" : "var(--status-pending)"}`
                    }}
                    title={l.name}
                  >
                    {l.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      );
    }
    return cells;
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <h1>Follow-Up Calendar</h1>
        <div className="page-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-ghost" onClick={today}>Today</button>
          <button className="btn btn-ghost" onClick={prevMonth} style={{ padding: "8px 12px" }}>&lt;</button>
          <h2 style={{ minWidth: 200, textAlign: "center", margin: 0 }}>{monthName} {year}</h2>
          <button className="btn btn-ghost" onClick={nextMonth} style={{ padding: "8px 12px" }}>&gt;</button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}><span className="spinner" /> Loading calendar...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(7, 1fr)", 
              borderBottom: "1px solid var(--border)",
              background: "rgba(0,0,0,0.02)"
            }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={{ padding: "12px", textAlign: "center", fontWeight: 600, fontSize: 13, borderRight: "1px solid var(--border)" }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {renderCells()}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 16 }}>Upcoming Follow-Ups</h2>
        <div className="glass-card" style={{ padding: 20, maxHeight: "500px", overflowY: "auto" }}>
          {Array.from(leadsByDate.keys()).sort().filter(date => new Date(date) >= new Date(new Date().setHours(0,0,0,0))).length === 0 ? (
            <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 20 }}>No upcoming follow-ups.</div>
          ) : (
            Array.from(leadsByDate.keys()).sort().filter(date => new Date(date) >= new Date(new Date().setHours(0,0,0,0))).map(date => (
              <div key={date} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 12 }}>
                  {new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {leadsByDate.get(date)!.map(lead => {
                    const isF1 = lead.followUpDate1 && toISTDateString(lead.followUpDate1) === date;
                    const isF2 = lead.followUpDate2 && toISTDateString(lead.followUpDate2) === date;
                    return (
                      <div 
                        key={lead.id} 
                        style={{ 
                          display: "flex", 
                          justifyContent: "space-between", 
                          alignItems: "flex-start", 
                          background: "#fff", 
                          padding: "20px", 
                          borderRadius: "12px",
                          border: "1px solid var(--border)",
                          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                          marginBottom: "16px"
                        }}
                      >
                        <div style={{ flex: 1, paddingRight: "24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>{lead.name}</div>
                            <select 
                              value={lead.status === 'created' ? 'not_contacted' : lead.status === 'closed_successful' ? 'live' : lead.status === 'closed_unsuccessful' ? 'lost' : lead.status} 
                              onChange={(e) => handleStatusChange(lead, e.target.value)}
                              className={`status-select status-${(lead.status === 'not_contacted' || lead.status === 'created') ? 'not_contacted' : lead.status === 'pending' ? 'pending' : (lead.status === 'live' || lead.status === 'closed_successful') ? 'live' : 'lost'}`}
                              style={{ padding: "4px 12px", fontSize: "12px", borderRadius: "16px", cursor: "pointer" }}
                            >
                              <option value="not_contacted">Not Contacted</option>
                              <option value="pending">Contacted</option>
                              <option value="live">Completed</option>
                              <option value="lost">Lost</option>
                            </select>
                          </div>
                          
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", marginBottom: 20 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600 }}>Phone</span>
                              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{parsePhoneNumber(lead.phone)}</span>
                            </div>
                            {lead.city && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600 }}>City</span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{lead.city}</span>
                              </div>
                            )}
                            {lead.branch && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600 }}>Branch</span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{parseBranches(lead.branch).join(', ')}</span>
                              </div>
                            )}
                            {lead.adname && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600 }}>Ad Name</span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{lead.adname}</span>
                              </div>
                            )}
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600 }}>Created</span>
                              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{new Date(lead.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          {lead.remark && (
                            <div style={{ background: "rgba(0,0,0,0.02)", borderLeft: "3px solid var(--primary-light)", padding: "12px 16px", borderRadius: "0 8px 8px 0", fontSize: 14, color: "var(--text-secondary)", fontStyle: "italic", lineHeight: "1.5" }}>
                              "{lead.remark}"
                            </div>
                          )}
                        </div>
                        
                        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-end", minWidth: "180px" }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            {isF1 && <span style={{ background: "var(--primary-light)", color: "#fff", padding: "4px 12px", borderRadius: "20px", fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>1st Follow Up</span>}
                            {isF2 && <span style={{ background: "var(--primary)", color: "#fff", padding: "4px 12px", borderRadius: "20px", fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>2nd Follow Up</span>}
                          </div>
                          
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", marginTop: "auto" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.02)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.05)", transition: "all 0.2s ease" }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", width: "16px" }}>F1</span>
                              <input 
                                type="date" 
                                value={toISTDateString(lead.followUpDate1)} 
                                onChange={(e) => handleFollowUpUpdate(lead, 'followUpDate1', e.target.value)}
                                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "13px", outline: "none", flex: 1, color: "var(--text-primary)", fontWeight: 500, fontFamily: "inherit" }}
                              />
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.02)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.05)", transition: "all 0.2s ease" }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", width: "16px" }}>F2</span>
                              <input 
                                type="date" 
                                value={toISTDateString(lead.followUpDate2)} 
                                onChange={(e) => handleFollowUpUpdate(lead, 'followUpDate2', e.target.value)}
                                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "13px", outline: "none", flex: 1, color: "var(--text-primary)", fontWeight: 500, fontFamily: "inherit" }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedLead && (
        <div className="modal-overlay" onClick={() => setSelectedLead(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Lead Details</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              <div><strong>Name:</strong> {selectedLead.name}</div>
              <div><strong>Phone:</strong> {parsePhoneNumber(selectedLead.phone)}</div>
              <div><strong>Status:</strong> {selectedLead.status}</div>
              {selectedLead.remark && <div><strong>Remark:</strong> {selectedLead.remark}</div>}
              {selectedLead.followUpDate1 && <div><strong>Follow Up 1:</strong> {new Date(selectedLead.followUpDate1).toLocaleDateString()}</div>}
              {selectedLead.followUpDate2 && <div><strong>Follow Up 2:</strong> {new Date(selectedLead.followUpDate2).toLocaleDateString()}</div>}
            </div>
            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button className="btn btn-primary" onClick={() => setSelectedLead(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
