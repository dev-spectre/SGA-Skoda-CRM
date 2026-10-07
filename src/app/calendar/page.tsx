"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { parsePhoneNumber, parseBranches } from "@/lib/utils";
import { FollowUpItem, getFollowUpInputsState, formatToDDMMYYYY } from "@/lib/followup";

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
  followUpCount?: number;
  followUps?: FollowUpItem[];
  remark: string | null;
  createdAt: string;
  assignedConsultant?: string | null;
  testDrive?: string | null;
  handledBy?: string | null;
}

interface ConsultantItem {
  id: number;
  name: string;
  branch: string;
  leadsCount?: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

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

const getMonthKey = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' });
  const parts = formatter.formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return `${y}-${m}`;
};

// In-memory caches for ultra-fast instant UI navigation and minimal data egress
const monthCountsCache: Record<string, { counts: Record<string, number>; timestamp: number }> = {};
const datePageCache: Record<string, { [page: number]: { leads: Lead[]; total: number; totalPages: number }; timestamp: number }> = {};
const CACHE_TTL = 120000; // 2 minutes

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const todayStr = useMemo(() => getTodayISTString(), []);
  const [selectedDate, setSelectedDate] = useState<string>(() => todayStr);
  const [page, setPage] = useState(1);
  const [leads, setLeads] = useState<Lead[]>(() => datePageCache[todayStr]?.[1]?.leads || []);
  const [pagination, setPagination] = useState<Pagination>(() => {
    const cached = datePageCache[todayStr]?.[1];
    return cached
      ? { page: 1, limit: PAGE_SIZE, total: cached.total, totalPages: cached.totalPages }
      : { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 };
  });
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>(() => monthCountsCache[getMonthKey(new Date())]?.counts || {});
  const [loadingLeads, setLoadingLeads] = useState(() => !datePageCache[todayStr]?.[1]);
  const [accessRestricted, setAccessRestricted] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [timelineLead, setTimelineLead] = useState<Lead | null>(null);
  const [consultantsList, setConsultantsList] = useState<ConsultantItem[]>([]);

  useEffect(() => {
    fetch("/api/consultants")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.consultants)) {
          setConsultantsList(data.consultants);
        }
      })
      .catch(err => console.error("Failed to load consultants", err));
  }, []);

  const activeMonthKey = useMemo(() => getMonthKey(currentDate), [currentDate]);

  // Fetch month follow-up count aggregation (lightweight ~200 bytes)
  const fetchMonthCounts = useCallback(async (monthKey: string, force = false) => {
    if (!force && monthCountsCache[monthKey] && Date.now() - monthCountsCache[monthKey].timestamp < CACHE_TTL) {
      setMonthCounts(monthCountsCache[monthKey].counts);
      return;
    }

    try {
      const res = await fetch(`/api/leads/calendar-counts?month=${monthKey}`);
      if (res.ok) {
        const data = await res.json();
        const counts = data.counts || {};
        monthCountsCache[monthKey] = { counts, timestamp: Date.now() };
        setMonthCounts(counts);
      }
    } catch (err) {
      console.error("Failed to fetch calendar counts", err);
    }
  }, []);

  // Fetch paginated leads for selected date (max 20 leads per page)
  const fetchLeadsForSelectedDate = useCallback(async (dateStr: string, pageNum: number, force = false) => {
    const cachedDate = datePageCache[dateStr];
    const cachedPage = cachedDate?.[pageNum];

    if (!force && cachedPage && Date.now() - cachedDate.timestamp < CACHE_TTL) {
      setLeads(cachedPage.leads);
      setPagination({
        page: pageNum,
        limit: PAGE_SIZE,
        total: cachedPage.total,
        totalPages: cachedPage.totalPages,
      });
      setLoadingLeads(false);
      return;
    }

    setLoadingLeads(true);
    try {
      const res = await fetch(`/api/leads?followUpDate=${dateStr}&page=${pageNum}&limit=${PAGE_SIZE}&fields=calendar&skipStats=true`);
      const data = await res.json();
      if (res.status === 403) {
        setAccessRestricted(true);
        setLeads([]);
      } else if (res.ok) {
        const incomingLeads = data.leads || [];
        const total = data.pagination?.total ?? incomingLeads.length;
        const totalPages = data.pagination?.totalPages ?? Math.ceil(total / PAGE_SIZE);

        if (!datePageCache[dateStr]) {
          datePageCache[dateStr] = { timestamp: Date.now() };
        }
        datePageCache[dateStr].timestamp = Date.now();
        datePageCache[dateStr][pageNum] = {
          leads: incomingLeads,
          total,
          totalPages,
        };

        setLeads(incomingLeads);
        setPagination({
          page: pageNum,
          limit: PAGE_SIZE,
          total,
          totalPages,
        });

        // Also sync month count if not present
        setMonthCounts(prev => {
          if (prev[dateStr] === total) return prev;
          const updated = { ...prev, [dateStr]: total };
          if (monthCountsCache[activeMonthKey]) {
            monthCountsCache[activeMonthKey].counts = updated;
          }
          return updated;
        });
      }
    } catch (err) {
      console.error("Failed to fetch follow-up leads for date", err);
    } finally {
      setLoadingLeads(false);
    }
  }, [activeMonthKey]);

  useEffect(() => {
    fetchMonthCounts(activeMonthKey);
  }, [activeMonthKey, fetchMonthCounts]);

  useEffect(() => {
    fetchLeadsForSelectedDate(selectedDate, page);
  }, [selectedDate, page, fetchLeadsForSelectedDate]);

  useEffect(() => {
    const handleLeadsUpdated = () => {
      if (document.visibilityState === 'visible') {
        fetchMonthCounts(activeMonthKey, true);
        fetchLeadsForSelectedDate(selectedDate, page, true);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('crm-leads-updated', handleLeadsUpdated);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-leads-updated', handleLeadsUpdated);
      }
    };
  }, [activeMonthKey, selectedDate, page, fetchMonthCounts, fetchLeadsForSelectedDate]);

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setPage(1);
  };

  const updateLeadInState = (id: number, updates: Partial<Lead>) => {
    setLeads(prev => {
      const next = prev.map(l => l.id === id ? { ...l, ...updates } : l);
      if (datePageCache[selectedDate]?.[page]) {
        datePageCache[selectedDate][page].leads = next;
      }
      return next;
    });
    setTimelineLead(prev => (prev && prev.id === id ? { ...prev, ...updates } : prev));
  };

  const getConsultantGroupsForLead = (lead: Lead) => {
    const leadBranches = lead.branch
      ? parseBranches(lead.branch).map(b => b.toLowerCase().trim())
      : [];
    const rawLeadBranch = (lead.branch || '').toLowerCase().replace(/[_-]/g, ' ').trim();

    const isBranchMatching = (branchName: string) => {
      if (!branchName || branchName.toLowerCase() === 'other' || branchName.toLowerCase() === 'unassigned') {
        return false;
      }
      if (leadBranches.length === 0 && !rawLeadBranch) {
        return false;
      }
      const bLower = branchName.toLowerCase().trim();
      return (
        leadBranches.includes(bLower) ||
        leadBranches.some(lb => lb === bLower || lb.includes(bLower) || bLower.includes(lb)) ||
        (rawLeadBranch !== '' && (rawLeadBranch.includes(bLower) || bLower.includes(rawLeadBranch)))
      );
    };

    const groupMap = new Map<string, Map<string, ConsultantItem>>();

    const addConsultantToBranch = (branch: string, c: ConsultantItem) => {
      const cleanBranch = branch.trim() || 'Other';
      if (!groupMap.has(cleanBranch)) {
        groupMap.set(cleanBranch, new Map());
      }
      const map = groupMap.get(cleanBranch)!;
      const nameKey = c.name.toLowerCase().trim();
      if (!map.has(nameKey)) {
        map.set(nameKey, c);
      }
    };

    consultantsList.forEach(c => {
      if (!c.branch || !c.branch.trim()) {
        addConsultantToBranch('Other', c);
      } else {
        const parsed = parseBranches(c.branch);
        if (parsed.length > 0) {
          parsed.forEach(b => addConsultantToBranch(b, c));
        } else {
          addConsultantToBranch(c.branch.trim(), c);
        }
      }
    });

    if (lead.assignedConsultant && lead.assignedConsultant.trim()) {
      const assignedName = lead.assignedConsultant.trim();
      const assignedLower = assignedName.toLowerCase();
      let foundInAnyGroup = false;
      for (const m of groupMap.values()) {
        if (m.has(assignedLower)) {
          foundInAnyGroup = true;
          break;
        }
      }

      if (!foundInAnyGroup) {
        const leadParsed = parseBranches(lead.branch);
        const targetBranch = leadParsed.length > 0 ? leadParsed[0] : (lead.branch?.trim() || 'Other');
        addConsultantToBranch(targetBranch, {
          id: -1,
          name: assignedName,
          branch: targetBranch
        });
      }
    }

    const matchingGroups: { branch: string; consultants: ConsultantItem[] }[] = [];
    const otherGroups: { branch: string; consultants: ConsultantItem[] }[] = [];
    let otherUnassignedGroup: { branch: string; consultants: ConsultantItem[] } | null = null;

    groupMap.forEach((cMap, branchName) => {
      const list = Array.from(cMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) return;

      if (branchName.toLowerCase() === 'other' || branchName.toLowerCase() === 'unassigned') {
        otherUnassignedGroup = { branch: branchName, consultants: list };
      } else if (isBranchMatching(branchName)) {
        matchingGroups.push({ branch: branchName, consultants: list });
      } else {
        otherGroups.push({ branch: branchName, consultants: list });
      }
    });

    const result = [
      ...matchingGroups.sort((a, b) => a.branch.localeCompare(b.branch)),
      ...otherGroups.sort((a, b) => a.branch.localeCompare(b.branch)),
    ];
    if (otherUnassignedGroup) {
      result.push(otherUnassignedGroup);
    }
    return result;
  };

  const handleStatusChange = async (lead: Lead, newStatus: string) => {
    const oldStatus = lead.status;
    const normOld = (oldStatus === 'created' ? 'not_contacted' : oldStatus === 'closed_successful' ? 'live' : oldStatus === 'closed_unsuccessful' ? 'lost' : oldStatus);
    const normNew = (newStatus === 'created' ? 'not_contacted' : newStatus === 'closed_successful' ? 'live' : newStatus === 'closed_unsuccessful' ? 'lost' : newStatus);
    if (normNew === normOld) return;

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

  const handleAssignedConsultantUpdate = async (lead: Lead, consultantName: string) => {
    const oldVal = lead.assignedConsultant;
    updateLeadInState(lead.id, { assignedConsultant: consultantName || null });
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedConsultant: consultantName || null }),
      });
      if (res.ok) {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm-leads-updated'));
      } else {
        updateLeadInState(lead.id, { assignedConsultant: oldVal });
      }
    } catch {
      updateLeadInState(lead.id, { assignedConsultant: oldVal });
    }
  };

  const handleTestDriveUpdate = async (lead: Lead, testDriveStatus: string) => {
    const oldVal = lead.testDrive;
    updateLeadInState(lead.id, { testDrive: testDriveStatus });
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testDrive: testDriveStatus }),
      });
      if (res.ok) {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm-leads-updated'));
      } else {
        updateLeadInState(lead.id, { testDrive: oldVal });
      }
    } catch {
      updateLeadInState(lead.id, { testDrive: oldVal });
    }
  };

  const checkLeadMatchesSelectedDate = (updatedFollowUps: FollowUpItem[], legacyDate1?: string | null, legacyDate2?: string | null) => {
    if (updatedFollowUps.some(f => toISTDateString(typeof f.date === 'string' ? f.date : f.date.toISOString()) === selectedDate)) {
      return true;
    }
    if (legacyDate1 && toISTDateString(legacyDate1) === selectedDate) return true;
    if (legacyDate2 && toISTDateString(legacyDate2) === selectedDate) return true;
    return false;
  };

  const syncFollowUpChangesToState = (
    lead: Lead,
    updatedFollowUps: FollowUpItem[],
    firstDate: string | null,
    latestDate: string | null
  ) => {
    const stillMatches = checkLeadMatchesSelectedDate(updatedFollowUps, firstDate, latestDate);

    setTimelineLead(prev => {
      if (prev && prev.id === lead.id) {
        return {
          ...prev,
          followUps: updatedFollowUps,
          followUpCount: updatedFollowUps.length,
          followUpDate1: firstDate,
          followUpDate2: latestDate,
        };
      }
      return prev;
    });

    if (!stillMatches) {
      setLeads(prev => {
        const next = prev.filter(l => l.id !== lead.id);
        const newTotal = Math.max(0, pagination.total - 1);
        const newTotalPages = Math.ceil(newTotal / PAGE_SIZE);
        setPagination(p => ({ ...p, total: newTotal, totalPages: newTotalPages }));

        if (datePageCache[selectedDate]?.[page]) {
          datePageCache[selectedDate][page].leads = next;
          datePageCache[selectedDate][page].total = newTotal;
          datePageCache[selectedDate][page].totalPages = newTotalPages;
        }

        setMonthCounts(mc => ({
          ...mc,
          [selectedDate]: Math.max(0, (mc[selectedDate] || 1) - 1),
        }));

        return next;
      });
    } else {
      updateLeadInState(lead.id, {
        followUps: updatedFollowUps,
        followUpCount: updatedFollowUps.length,
        followUpDate1: firstDate,
        followUpDate2: latestDate,
      });
    }
  };

  const handleFollowUpStepChange = async (lead: Lead, step: number, dateStr: string) => {
    if (!dateStr) {
      handleClearFollowUp(lead, step);
      return;
    }

    const currentFollowUps = lead.followUps ? [...lead.followUps] : [];
    const dateWithTime = `${dateStr}T12:00:00Z`;
    const existingIdx = currentFollowUps.findIndex(f => f.step === step);
    if (existingIdx >= 0) {
      currentFollowUps[existingIdx] = { ...currentFollowUps[existingIdx], date: dateWithTime };
    } else {
      currentFollowUps.push({ step, date: dateWithTime });
    }
    currentFollowUps.sort((a, b) => a.step - b.step);

    const firstDate = currentFollowUps[0]?.date ? (typeof currentFollowUps[0].date === 'string' ? currentFollowUps[0].date : currentFollowUps[0].date.toISOString()) : null;
    const latestDate = currentFollowUps.length > 1
      ? (typeof currentFollowUps[currentFollowUps.length - 1].date === 'string' ? (currentFollowUps[currentFollowUps.length - 1].date as string) : (currentFollowUps[currentFollowUps.length - 1].date as Date).toISOString())
      : null;

    syncFollowUpChangesToState(lead, currentFollowUps, firstDate, latestDate);

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateFollowUp: { step, date: dateStr } }),
      });
      if (res.ok) {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm-leads-updated'));
      } else {
        fetchLeadsForSelectedDate(selectedDate, page, true);
      }
    } catch {
      fetchLeadsForSelectedDate(selectedDate, page, true);
    }
  };

  const handleAddNewFollowUp = async (lead: Lead, targetStep: number, dateStr: string) => {
    if (!dateStr) return;

    const currentFollowUps = lead.followUps ? [...lead.followUps] : [];
    const dateWithTime = `${dateStr}T12:00:00Z`;
    currentFollowUps.push({ step: targetStep, date: dateWithTime });
    currentFollowUps.sort((a, b) => a.step - b.step);

    const firstDate = currentFollowUps[0]?.date ? (typeof currentFollowUps[0].date === 'string' ? currentFollowUps[0].date : currentFollowUps[0].date.toISOString()) : null;
    const latestDate = currentFollowUps.length > 1
      ? (typeof currentFollowUps[currentFollowUps.length - 1].date === 'string' ? (currentFollowUps[currentFollowUps.length - 1].date as string) : (currentFollowUps[currentFollowUps.length - 1].date as Date).toISOString())
      : null;

    syncFollowUpChangesToState(lead, currentFollowUps, firstDate, latestDate);

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newFollowUpDate: { date: dateStr, step: targetStep } }),
      });
      if (res.ok) {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm-leads-updated'));
      } else {
        fetchLeadsForSelectedDate(selectedDate, page, true);
      }
    } catch {
      fetchLeadsForSelectedDate(selectedDate, page, true);
    }
  };

  const handleClearFollowUp = async (lead: Lead, step: number) => {
    const currentFollowUps = (lead.followUps ? [...lead.followUps] : [])
      .filter(f => f.step !== step)
      .map((f, i) => ({ ...f, step: i + 1 }));

    const firstDate = currentFollowUps.length > 0
      ? (typeof currentFollowUps[0].date === 'string' ? currentFollowUps[0].date : currentFollowUps[0].date.toISOString())
      : null;
    const latestDate = currentFollowUps.length > 1
      ? (typeof currentFollowUps[currentFollowUps.length - 1].date === 'string' ? (currentFollowUps[currentFollowUps.length - 1].date as string) : (currentFollowUps[currentFollowUps.length - 1].date as Date).toISOString())
      : null;

    syncFollowUpChangesToState(lead, currentFollowUps, firstDate, latestDate);

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteFollowUpStep: step }),
      });
      if (res.ok) {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm-leads-updated'));
      } else {
        fetchLeadsForSelectedDate(selectedDate, page, true);
      }
    } catch {
      fetchLeadsForSelectedDate(selectedDate, page, true);
    }
  };

  const { daysInMonth, startDayOfMonth } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOfMonth = new Date(year, month, 1).getDay();
    return { daysInMonth, startDayOfMonth };
  }, [currentDate]);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const today = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(getTodayISTString());
    setPage(1);
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return '';
    try {
      const d = new Date(`${selectedDate}T12:00:00Z`);
      return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const renderCells = () => {
    const cells = [];
    const totalCells = Math.ceil((startDayOfMonth + daysInMonth) / 7) * 7;
    const todayStr = getTodayISTString();
    
    for (let i = 0; i < totalCells; i++) {
      const day = i - startDayOfMonth + 1;
      const isCurrentMonth = day > 0 && day <= daysInMonth;
      const yyyy = year;
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const isSelected = dateStr === selectedDate;
      const isToday = isCurrentMonth && dateStr === todayStr;

      const scheduledCount = isCurrentMonth ? (monthCounts[dateStr] || 0) : 0;
      const hasFollowUps = scheduledCount > 0;

      cells.push(
        <div 
          key={i} 
          onClick={() => {
            if (isCurrentMonth) {
              handleSelectDate(dateStr);
            }
          }}
          style={{ 
            height: "56px", 
            maxHeight: "56px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            borderRight: "1px solid var(--border)", 
            borderBottom: "1px solid var(--border)",
            padding: "5px 7px",
            background: isSelected 
              ? "rgba(37, 99, 235, 0.08)" 
              : hasFollowUps
              ? "rgba(37, 99, 235, 0.02)"
              : isCurrentMonth ? "transparent" : "rgba(0,0,0,0.02)",
            outline: isSelected ? "2px solid var(--primary, #2563eb)" : "none",
            outlineOffset: "-2px",
            opacity: isCurrentMonth ? 1 : 0.35,
            overflow: "hidden",
            cursor: isCurrentMonth ? "pointer" : "default",
            transition: "background 0.15s ease, outline 0.15s ease",
            position: "relative"
          }}
        >
          {isCurrentMonth && (
            <div style={{ 
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              height: "100%",
            }}>
              <div style={{ 
                fontWeight: 700, 
                width: 24,
                height: 24,
                minHeight: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: isToday ? "var(--primary-light, #3b82f6)" : isSelected ? "var(--primary, #2563eb)" : "transparent",
                color: (isToday || isSelected) ? "#fff" : "var(--text-primary)",
                fontSize: 12,
                flexShrink: 0
              }}>
                {day}
              </div>
              {hasFollowUps && (
                <span 
                  title={`${scheduledCount} follow-up(s) scheduled`}
                  style={{ 
                    fontSize: 10, 
                    fontWeight: 700, 
                    background: isSelected ? "var(--primary, #2563eb)" : "rgba(37, 99, 235, 0.14)", 
                    color: isSelected ? "#fff" : "var(--primary, #2563eb)", 
                    padding: "2px 6px", 
                    borderRadius: "10px",
                    letterSpacing: "0.2px"
                  }}
                >
                  {scheduledCount}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }
    return cells;
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Follow-Up Calendar</h1>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
            Select any date to view scheduled leads. Badge shows follow-up count.
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-ghost" onClick={today} style={{ padding: "6px 12px", fontSize: 13 }}>Today</button>
          <button className="btn btn-ghost" onClick={prevMonth} style={{ padding: "6px 10px", fontSize: 13 }}>&lt;</button>
          <h2 style={{ minWidth: 160, textAlign: "center", margin: 0, fontSize: 16 }}>{monthName} {year}</h2>
          <button className="btn btn-ghost" onClick={nextMonth} style={{ padding: "6px 10px", fontSize: 13 }}>&gt;</button>
        </div>
      </div>

      {/* Calendar Month Grid */}
      <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ display: "flex", flexDirection: "column", minWidth: "560px" }}>
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(7, 1fr)", 
              borderBottom: "1px solid var(--border)",
              background: "rgba(0,0,0,0.02)"
            }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={{ padding: "8px", textAlign: "center", fontWeight: 600, fontSize: 12, borderRight: "1px solid var(--border)" }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {renderCells()}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Date Follow-Ups Section */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            Follow-Ups for {formattedSelectedDate}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ 
              fontSize: 13, 
              fontWeight: 600, 
              background: "var(--card-bg, #f3f4f6)", 
              padding: "4px 12px", 
              borderRadius: "16px",
              border: "1px solid var(--border)" 
            }}>
              {pagination.total} Follow-Up{pagination.total === 1 ? '' : 's'} Total
            </span>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          {loadingLeads ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
              <span className="spinner" /> Loading follow-ups for {formattedSelectedDate}...
            </div>
          ) : accessRestricted ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--status-lost)" }}>
              Access restricted to follow-up leads.
            </div>
          ) : leads.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 32 }}>
              No follow-ups scheduled for <strong>{formattedSelectedDate}</strong>.
              <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>Click any date on the calendar above to view its scheduled follow-ups.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {leads.map(lead => {
                  const isF1 = lead.followUpDate1 && toISTDateString(lead.followUpDate1) === selectedDate;
                  const isF2 = lead.followUpDate2 && toISTDateString(lead.followUpDate2) === selectedDate;
                  const { count, input1, input2 } = getFollowUpInputsState(lead.followUps, {
                    followUpDate1: lead.followUpDate1,
                    followUpDate2: lead.followUpDate2,
                  });

                  return (
                    <div 
                      key={lead.id} 
                      style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "flex-start", 
                        flexWrap: "wrap",
                        gap: "16px",
                        background: "#fff", 
                        padding: "20px", 
                        borderRadius: "12px",
                        border: "1px solid var(--border)",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                        marginBottom: "4px"
                      }}
                    >
                      <div style={{ flex: "1 1 280px", minWidth: 0, paddingRight: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>{lead.name}</div>
                          {lead.handledBy && (
                            <span style={{ fontSize: "11px", background: "rgba(0,0,0,0.06)", padding: "2px 8px", borderRadius: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
                              Handled by {lead.handledBy}
                            </span>
                          )}
                          <select 
                            value={lead.status === 'created' ? 'not_contacted' : lead.status === 'closed_successful' ? 'live' : lead.status === 'closed_unsuccessful' ? 'lost' : lead.status} 
                            onChange={(e) => handleStatusChange(lead, e.target.value)}
                            className={`status-select status-${(lead.status === 'not_contacted' || lead.status === 'created') ? 'not_contacted' : lead.status === 'pending' ? 'pending' : lead.status === 'callback' ? 'callback' : (lead.status === 'live' || lead.status === 'closed_successful') ? 'live' : 'lost'}`}
                            style={{ padding: "4px 12px", fontSize: "12px", borderRadius: "16px", cursor: "pointer" }}
                          >
                            <option value="not_contacted">Not Contacted</option>
                            <option value="pending">Contacted</option>
                            <option value="callback">Callback</option>
                            <option value="live">Completed</option>
                            <option value="lost">Lost</option>
                          </select>
                        </div>
                        
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", marginBottom: 16 }}>
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
                            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{formatToDDMMYYYY(lead.createdAt)}</span>
                          </div>
                        </div>

                        {/* Test Drive & Consultant Operational Controls */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: lead.remark ? 16 : 0, alignItems: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600 }}>Test Drive</span>
                            <select
                              className={`status-select ${
                                (lead.testDrive === "Scheduled" || lead.testDrive === "Yes")
                                  ? "td-scheduled"
                                  : lead.testDrive === "Completed"
                                  ? "td-completed"
                                  : lead.testDrive === "Cancelled"
                                  ? "td-cancelled"
                                  : "td-not_scheduled"
                              }`}
                              style={{ padding: "4px 10px", fontSize: "12px", borderRadius: "16px", cursor: "pointer" }}
                              value={
                                lead.testDrive === "Yes"
                                  ? "Scheduled"
                                  : lead.testDrive === "No"
                                  ? "Not Scheduled"
                                  : lead.testDrive || "Not Scheduled"
                              }
                              onChange={(e) => handleTestDriveUpdate(lead, e.target.value)}
                            >
                              <option value="Not Scheduled">Not Scheduled</option>
                              <option value="Scheduled">Scheduled</option>
                              <option value="Completed">Completed</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", fontWeight: 600 }}>Assigned Consultant</span>
                            <select
                              className="status-select"
                              style={{ padding: "4px 10px", fontSize: "12px", borderRadius: "16px", cursor: "pointer" }}
                              value={lead.assignedConsultant || ""}
                              onChange={(e) => handleAssignedConsultantUpdate(lead, e.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {getConsultantGroupsForLead(lead).map((group) => (
                                <optgroup key={group.branch} label={group.branch}>
                                  {group.consultants.map((c) => (
                                    <option key={`${group.branch}-${c.id}-${c.name}`} value={c.name}>
                                      {c.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                        </div>
                        
                        {lead.remark && (
                          <div style={{ marginTop: 12, background: "rgba(0,0,0,0.02)", borderLeft: "3px solid var(--primary-light)", padding: "12px 16px", borderRadius: "0 8px 8px 0", fontSize: 14, color: "var(--text-secondary)", fontStyle: "italic", lineHeight: "1.5" }}>
                            "{lead.remark}"
                          </div>
                        )}
                      </div>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start", flex: "1 1 240px", minWidth: 0, width: "100%", maxWidth: "100%" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            {isF1 && <span style={{ background: "var(--primary-light)", color: "#fff", padding: "3px 10px", borderRadius: "20px", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>1st Follow Up</span>}
                            {isF2 && <span style={{ background: "var(--primary)", color: "#fff", padding: "3px 10px", borderRadius: "20px", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>2nd Follow Up</span>}
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setTimelineLead(lead)}
                            style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", height: "auto" }}
                            title="View Follow-Up Timeline"
                          >
                            🕒 Timeline ({count})
                          </button>
                        </div>
                        
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", marginTop: "auto" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.02)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.05)", transition: "all 0.2s ease" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", minWidth: "20px" }}>{input1.label}</span>
                            <input 
                              type="date" 
                              value={input1.isoDate} 
                              onChange={(e) => {
                                if (input1.exists) {
                                  handleFollowUpStepChange(lead, input1.step, e.target.value);
                                } else {
                                  handleAddNewFollowUp(lead, input1.step, e.target.value);
                                }
                              }}
                              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "13px", outline: "none", flex: 1, color: "var(--text-primary)", fontWeight: 500, fontFamily: "inherit" }}
                            />
                            {input1.exists && (
                              <button
                                type="button"
                                onClick={() => handleClearFollowUp(lead, input1.step)}
                                title={`Clear ${input1.label}`}
                                style={{ border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", padding: "0 4px", fontSize: "15px", lineHeight: 1 }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.02)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.05)", transition: "all 0.2s ease" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", minWidth: "20px" }}>{input2.label}</span>
                            <input 
                              type="date" 
                              value={input2.isoDate} 
                              onChange={(e) => handleAddNewFollowUp(lead, input2.step, e.target.value)}
                              placeholder="Add follow-up"
                              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "13px", outline: "none", flex: 1, color: "var(--text-primary)", fontWeight: 500, fontFamily: "inherit" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {pagination.totalPages > 1 && (
                <div 
                  className="pagination" 
                  style={{ 
                    display: "flex", 
                    justifyContent: "center", 
                    alignItems: "center", 
                    gap: 12, 
                    marginTop: 20,
                    paddingTop: 16,
                    borderTop: "1px solid var(--border)"
                  }}
                >
                  <button
                    className="btn btn-ghost"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || loadingLeads}
                    style={{ padding: "6px 14px", fontSize: 13 }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                    Page {page} of {pagination.totalPages} ({pagination.total} leads)
                  </span>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages || loadingLeads}
                    style={{ padding: "6px 14px", fontSize: 13 }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Selected Lead Modal */}
      {selectedLead && (
        <div className="modal-overlay" onClick={() => setSelectedLead(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Lead Details</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              <div><strong>Name:</strong> {selectedLead.name}</div>
              <div><strong>Phone:</strong> {parsePhoneNumber(selectedLead.phone)}</div>
              <div><strong>Status:</strong> {selectedLead.status}</div>
              {selectedLead.remark && <div><strong>Remark:</strong> {selectedLead.remark}</div>}
              {selectedLead.followUpDate1 && <div><strong>Follow Up 1:</strong> {formatToDDMMYYYY(selectedLead.followUpDate1)}</div>}
              {selectedLead.followUpDate2 && <div><strong>Follow Up 2:</strong> {formatToDDMMYYYY(selectedLead.followUpDate2)}</div>}
            </div>
            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button className="btn btn-primary" onClick={() => setSelectedLead(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Modal */}
      {timelineLead && (
        <div className="modal-overlay" onClick={() => setTimelineLead(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, width: "90%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Follow-Up Timeline</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                  {timelineLead.name} ({parsePhoneNumber(timelineLead.phone)})
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setTimelineLead(null)}
                style={{ fontSize: 18, padding: "4px 8px", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
              {(() => {
                const followUps: FollowUpItem[] = timelineLead.followUps ? [...timelineLead.followUps].sort((a, b) => a.step - b.step) : [];
                if (followUps.length === 0) {
                  if (timelineLead.followUpDate1) {
                    followUps.push({ step: 1, date: timelineLead.followUpDate1 });
                  }
                  if (timelineLead.followUpDate2) {
                    followUps.push({ step: 2, date: timelineLead.followUpDate2 });
                  }
                }
                if (followUps.length === 0) {
                  return (
                    <div style={{ textAlign: "center", padding: 24, color: "var(--text-secondary)", fontSize: 13 }}>
                      No follow-up steps recorded for this lead.
                    </div>
                  );
                }
                return followUps.map((f) => (
                  <div
                    key={f.step}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "rgba(0,0,0,0.02)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "var(--primary, #0072bc)",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        F{f.step}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {formatToDDMMYYYY(f.date)}
                        </div>
                        {f.createdAt && (
                          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            Added: {formatToDDMMYYYY(f.createdAt)}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleClearFollowUp(timelineLead, f.step)}
                      title={`Delete Follow Up Step ${f.step}`}
                      style={{
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        background: "rgba(239, 68, 68, 0.08)",
                        color: "#ef4444",
                        cursor: "pointer",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      × Delete
                    </button>
                  </div>
                ));
              })()}
            </div>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setTimelineLead(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
