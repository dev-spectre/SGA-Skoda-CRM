"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { parsePhoneNumber, parseBranches } from "@/lib/utils";
import { classifyLead, type LeadCategory } from "@/lib/classification";
import {
  formatToDDMMYYYY,
  getFollowUpInputsState,
  formatAllFollowUpsForExcel,
  type FollowUpItem,
} from "@/lib/followup";
import BranchConsultantPicker from "@/components/BranchConsultantPicker";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { ExternalUploadModal } from "@/components/ExternalUploadModal";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Lead {
  id: number;
  name: string;
  phone: string;
  city: string;
  adname?: string;
  branch?: string;
  followUpDate1?: string | null;
  followUpDate2?: string | null;
  followUpCount?: number;
  followUps?: FollowUpItem[];
  remark: string | null;
  status: string;
  createdAt: string;
  assignedConsultant?: string;
  handledBy?: string | null;
  testDrive?: string;
  platform?: string;
  source?: string;
  uploadedById?: number | null;
  uploadedBy?: { id?: number; username: string } | null;
  uploadedAt?: string | null;
  isBranchManual?: boolean;
  isOutOfState?: boolean;
  isInvalidPhone?: boolean;
  updatedAt?: string;
}

interface PerformanceStat {
  consultant: string;
  total: number;
  notContacted: number;
  pending: number;
  live: number;
  lost: number;
  testDriveYes: number;
  testDriveNo: number;
}

interface ConsultantItem {
  id: number;
  name: string;
  branch: string;
}

interface Stats {
  total: number;
  notContacted?: number;
  pending?: number;
  live?: number;
  lost?: number;
  callback?: number;
  open?: number;
  closedSuccessful?: number;
  closedUnsuccessful?: number;
  categories?: {
    valid: number;
    invalid: number;
    outside: number;
    all: number;
    priority: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const matchBranchFilter = (leadBranch: string | undefined, filter: string) => {
  if (!filter) return true;
  if (!leadBranch) return false;
  const filterTokens = filter.split(',').map(b => b.trim().toLowerCase()).filter(Boolean);
  if (filterTokens.length === 0) return true;
  const leadBranches = parseBranches(leadBranch).map(b => b.toLowerCase().trim());
  const rawLower = leadBranch.toLowerCase().trim();
  return filterTokens.some(ft =>
    leadBranches.some(lb => lb.includes(ft) || ft.includes(lb)) ||
    rawLower.includes(ft)
  );
};

const formatStatusLabel = (st: string) => {
  if (st === 'not_contacted' || st === 'created') return 'Not Contacted';
  if (st === 'pending') return 'Contacted';
  if (st === 'live' || st === 'closed_successful') return 'Completed';
  if (st === 'lost' || st === 'closed_unsuccessful') return 'Lost';
  if (st === 'callback') return 'Callback';
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

const PAGE_SIZE = 20;

// Persistent in-memory client caches (persists across page navigations in the same session)
const globalDashboardPageCache: Record<string, { [page: number]: Lead[]; total?: number; stats?: Stats; timestamp?: number }> = {};
let cachedBranchesList: string[] | null = null;
let cachedConsultantsList: ConsultantItem[] | null = null;
let cachedPerformanceStats: PerformanceStat[] | null = null;
let cachedUsersList: { id: number; username: string; role: string }[] | null = null;
let cachedMeUser: any = null;
const CACHE_TTL_METADATA = 120000; // 2 minutes TTL
let branchesFetchedAt = 0;
let consultantsFetchedAt = 0;
let performanceFetchedAt = 0;
let usersFetchedAt = 0;
let meUserFetchedAt = 0;

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, live: 0, lost: 0, categories: { valid: 0, invalid: 0, outside: 0, all: 0, priority: 0 } });
  const [category, setCategory] = useState<LeadCategory>("valid");
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [mounted, setMounted] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [consultantFilter, setConsultantFilter] = useState("");
  const [testDriveFilter, setTestDriveFilter] = useState("");
  const [uploaderFilter, setUploaderFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState("");
  const [tempEndDate, setTempEndDate] = useState("");

  const [primaryOrder, setPrimaryOrder] = useState<"desc" | "asc">("desc");
  const [secondaryField, setSecondaryField] = useState("");
  const [secondaryOrder, setSecondaryOrder] = useState<"asc" | "desc">("asc");

  const [username, setUsername] = useState<string>(() => cachedMeUser?.username || "");
  const [userRole, setUserRole] = useState<string>(() => cachedMeUser?.role || "USER");
  const [userAssignedBranch, setUserAssignedBranch] = useState<string | null>(() => cachedMeUser?.assignedBranch ?? null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(() => Boolean(cachedMeUser?.isSuperAdmin || cachedMeUser?.role === "SUPERADMIN" || cachedMeUser?.username === "sudo"));

  const [performanceStats, setPerformanceStats] = useState<PerformanceStat[]>(() => cachedPerformanceStats || []);
  const [consultantsList, setConsultantsList] = useState<ConsultantItem[]>(() => cachedConsultantsList || []);
  const [usersList, setUsersList] = useState<{ id: number; username: string; role: string }[]>(() => cachedUsersList || []);

  // Debounce search input by 350ms to avoid querying on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Restore saved filters from localStorage per authenticated user
  const restoreUserFilters = useCallback((userKey: string) => {
    try {
      const storageKey = userKey ? `crm_dashboard_filters_${userKey}` : "crm_dashboard_filters";
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.category === "string" && ["valid", "invalid", "outside", "all", "priority"].includes(parsed.category)) {
          setCategory(parsed.category as LeadCategory);
        }
        if (typeof parsed.search === "string") {
          setSearchInput(parsed.search);
          setSearch(parsed.search);
        }
        if (typeof parsed.statusFilter === "string") setStatusFilter(parsed.statusFilter);
        if (typeof parsed.branchFilter === "string") setBranchFilter(parsed.branchFilter);
        if (typeof parsed.consultantFilter === "string") setConsultantFilter(parsed.consultantFilter);
        if (typeof parsed.testDriveFilter === "string") setTestDriveFilter(parsed.testDriveFilter);
        if (typeof parsed.uploaderFilter === "string") setUploaderFilter(parsed.uploaderFilter);
        if (typeof parsed.platformFilter === "string") setPlatformFilter(parsed.platformFilter);
        if (typeof parsed.startDate === "string") setStartDate(parsed.startDate);

        if (typeof parsed.endDate === "string") setEndDate(parsed.endDate);
        if (parsed.primaryOrder === "asc" || parsed.primaryOrder === "desc") setPrimaryOrder(parsed.primaryOrder);
        if (typeof parsed.secondaryField === "string") setSecondaryField(parsed.secondaryField);
        if (parsed.secondaryOrder === "asc" || parsed.secondaryOrder === "desc") setSecondaryOrder(parsed.secondaryOrder);
      }
    } catch (e) {
      console.error("Error restoring filters from localStorage:", e);
    } finally {
      setMounted(true);
    }
  }, []);

  const [apiBranches, setApiBranches] = useState<string[]>(() => cachedBranchesList || []);

  const fetchBranchesList = useCallback(async (force = false) => {
    if (!force && cachedBranchesList && Date.now() - branchesFetchedAt < CACHE_TTL_METADATA) {
      setApiBranches(cachedBranchesList);
      return;
    }
    try {
      const res = await fetch("/api/branches");
      const data = await res.json();
      if (res.ok && Array.isArray(data.branches)) {
        cachedBranchesList = data.branches;
        branchesFetchedAt = Date.now();
        setApiBranches(data.branches);
      }
    } catch {
      // fallback
    }
  }, []);

  const fetchConsultantsList = useCallback(async (force = false) => {
    if (!force && cachedConsultantsList && Date.now() - consultantsFetchedAt < CACHE_TTL_METADATA) {
      setConsultantsList(cachedConsultantsList);
      return;
    }
    try {
      const res = await fetch("/api/consultants");
      const data = await res.json();
      if (res.ok && Array.isArray(data.consultants)) {
        cachedConsultantsList = data.consultants;
        consultantsFetchedAt = Date.now();
        setConsultantsList(data.consultants);
      }
    } catch {
      // fallback
    }
  }, []);

  const fetchPerformanceStats = useCallback(async (force = false) => {
    if (!force && cachedPerformanceStats && Date.now() - performanceFetchedAt < CACHE_TTL_METADATA) {
      setPerformanceStats(cachedPerformanceStats);
      return;
    }
    try {
      const res = await fetch("/api/leads/performance");
      const data = await res.json();
      if (res.ok && Array.isArray(data.performance)) {
        cachedPerformanceStats = data.performance;
        performanceFetchedAt = Date.now();
        setPerformanceStats(data.performance);
      }
    } catch {
      // silently fail
    }
  }, []);

  const updateBranchWindow = useCallback((incoming: { branch?: string }[]) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setApiBranches(prev => {
      const existing = new Set(prev.map(b => b.toLowerCase().trim()));
      const toAdd: string[] = [];
      for (const item of incoming) {
        if (item.branch && item.branch.trim() && !existing.has(item.branch.toLowerCase().trim())) {
          existing.add(item.branch.toLowerCase().trim());
          toAdd.push(item.branch.trim());
        }
      }
      return toAdd.length > 0 ? [...prev, ...toAdd].sort((a, b) => a.localeCompare(b)) : prev;
    });
  }, []);

  const fetchUsersList = useCallback(async (force = false) => {
    if (!force && cachedUsersList && Date.now() - usersFetchedAt < CACHE_TTL_METADATA) {
      setUsersList(cachedUsersList);
      return;
    }
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok && Array.isArray(data.users)) {
        cachedUsersList = data.users;
        usersFetchedAt = Date.now();
        setUsersList(data.users);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUsersList();
    fetchBranchesList();
    fetchConsultantsList();
    fetchPerformanceStats();

    const applyUser = (userObj: any) => {
      if (userObj.username) setUsername(userObj.username);
      if (userObj.role) setUserRole(userObj.role);
      if (userObj.assignedBranch !== undefined) setUserAssignedBranch(userObj.assignedBranch);
      const isSuper = Boolean(userObj.isSuperAdmin || userObj.role === "SUPERADMIN" || userObj.username === "sudo");
      setIsSuperAdmin(isSuper);
      if (userObj.role === "ADMIN" || userObj.role === "SUPERADMIN" || isSuper || userObj.allowExternalUpload) {
        setAllowExternalUpload(true);
      }
      restoreUserFilters(userObj.username);
    };

    if (cachedMeUser && Date.now() - meUserFetchedAt < CACHE_TTL_METADATA) {
      applyUser(cachedMeUser);
    } else {
      fetch("/api/auth/me")
        .then((res) => res.json())
        .then((data) => {
          if (data.user) {
            cachedMeUser = data.user;
            meUserFetchedAt = Date.now();
            applyUser(data.user);
          } else {
            restoreUserFilters("");
          }
        })
        .catch(() => {
          restoreUserFilters("");
        });
    }

    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const consultantParam = urlParams.get("consultant");
      const testDriveParam = urlParams.get("testDrive");
      const branchParam = urlParams.get("branch");
      const statusParam = urlParams.get("status");
      const uploaderParam = urlParams.get("uploader");

      if (consultantParam !== null) {
        setConsultantFilter(consultantParam);
        if (testDriveParam === null) {
          setTestDriveFilter("");
        }
      }
      if (testDriveParam !== null) setTestDriveFilter(testDriveParam);
      if (branchParam !== null) setBranchFilter(branchParam);
      if (statusParam !== null) setStatusFilter(statusParam);
      if (uploaderParam !== null) setUploaderFilter(uploaderParam);
    }
  }, [restoreUserFilters, fetchUsersList, fetchBranchesList, fetchConsultantsList, fetchPerformanceStats]);

  // Persist filter changes to localStorage per authenticated user
  useEffect(() => {
    if (!mounted) return;
    try {
      const storageKey = username ? `crm_dashboard_filters_${username}` : "crm_dashboard_filters";
      const filterData = {
        category,
        search,
        statusFilter,
        branchFilter,
        consultantFilter,
        testDriveFilter,
        uploaderFilter,
        platformFilter,
        startDate,

        endDate,
        primaryOrder,
        secondaryField,
        secondaryOrder,
      };
      localStorage.setItem(storageKey, JSON.stringify(filterData));
    } catch (e) {
      console.error("Failed to save dashboard filters to localStorage:", e);
    }
  }, [category, search, statusFilter, branchFilter, consultantFilter, testDriveFilter, uploaderFilter, platformFilter, startDate, endDate, primaryOrder, secondaryField, secondaryOrder, mounted, username]);

  const [loading, setLoading] = useState(true);
  const [accessRestricted, setAccessRestricted] = useState(false);
  const [allowExternalUpload, setAllowExternalUpload] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [externalSyncModalOpen, setExternalSyncModalOpen] = useState(false);
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
  const lastSyncTimestampRef = useRef<string | null>(null);

  const startUpdating = () => {
    updatingCountRef.current++;
  };

  const stopUpdating = () => {
    updatingCountRef.current = Math.max(0, updatingCountRef.current - 1);
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === "error" ? 5500 : 3000);
  };

  const handleHeaderClick = (field: string) => {
    if (field === "createdAt") {
      setSecondaryField("");
      setPrimaryOrder(prev => (prev === "desc" ? "asc" : "desc"));
    } else {
      if (secondaryField === field) {
        setSecondaryOrder(prev => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSecondaryField(field);
        setSecondaryOrder("asc");
      }
    }
  };

  const patchLeadInCache = useCallback((updated: Partial<Lead> & { id: number }) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
    for (const fKey of Object.keys(globalDashboardPageCache)) {
      const fObj = globalDashboardPageCache[fKey];
      if (!fObj) continue;
      for (const pKey of Object.keys(fObj)) {
        const idx = Number(pKey);
        if (!isNaN(idx) && Array.isArray(fObj[idx])) {
          fObj[idx] = fObj[idx].map(l => l.id === updated.id ? { ...l, ...updated } : l);
        }
      }
    }
  }, []);

  const removeLeadFromCache = useCallback((deletedId: number) => {
    setLeads(prev => prev.filter(l => l.id !== deletedId));
    for (const fKey of Object.keys(globalDashboardPageCache)) {
      const fObj = globalDashboardPageCache[fKey];
      if (!fObj) continue;
      for (const pKey of Object.keys(fObj)) {
        const idx = Number(pKey);
        if (!isNaN(idx) && Array.isArray(fObj[idx])) {
          fObj[idx] = fObj[idx].filter(l => l.id !== deletedId);
        }
      }
      if (fObj.total && fObj.total > 0) {
        fObj.total -= 1;
      }
    }
    setPagination(p => {
      const newTotal = Math.max(0, p.total - 1);
      return { ...p, total: newTotal, totalPages: Math.ceil(newTotal / PAGE_SIZE) };
    });
  }, []);

  const fetchLeads = useCallback(async (force = false) => {
    if (updatingCountRef.current > 0 && !force) {
      return; // Stop polling while data updates are in progress
    }

    const fetchId = ++activeFetchIdRef.current;

    try {
      const params = new URLSearchParams();
      params.set("primaryOrder", primaryOrder);
      if (secondaryField && secondaryField !== "createdAt") {
        params.set("secondaryField", secondaryField);
        params.set("secondaryOrder", secondaryOrder);
      }
      if (category && category !== "all") params.set("category", category);
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (branchFilter) params.set("branch", branchFilter);
      if (consultantFilter) params.set("consultant", consultantFilter);
      if (testDriveFilter) params.set("testDrive", testDriveFilter);
      if (uploaderFilter) {
        if (uploaderFilter === 'system') {
          params.set('source', 'System');
        } else if (uploaderFilter === 'external') {
          params.set('source', 'External Upload');
        } else if (uploaderFilter.startsWith('user:')) {
          params.set('uploader', uploaderFilter.replace('user:', ''));
        }
      }
      if (platformFilter) params.set("platform", platformFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const filterKey = params.toString();
      const currentPage = pagination.page;

      const cachedFilter = globalDashboardPageCache[filterKey];
      const cachedPage = cachedFilter?.[currentPage];

      if (cachedPage && !force) {
        setAccessRestricted(false);
        setLeads(cachedPage);
        if (cachedFilter.stats) setStats(cachedFilter.stats);
        if (cachedFilter.total !== undefined) {
          const totalPages = Math.ceil(cachedFilter.total / PAGE_SIZE);
          setPagination(prev => {
            if (prev.total !== cachedFilter.total || prev.totalPages !== totalPages) {
              return { ...prev, total: cachedFilter.total!, totalPages };
            }
            return prev;
          });
        }
        setLoading(false);
        return;
      }

      isFetchingRef.current = true;

      const requestParams = new URLSearchParams(filterKey);
      requestParams.set("page", currentPage.toString());
      requestParams.set("limit", PAGE_SIZE.toString());

      const hasStatsAlready = Boolean(cachedFilter?.stats);
      if (hasStatsAlready && currentPage > 1) {
        requestParams.set("skipStats", "true");
      }

      const res = await fetch(`/api/leads?${requestParams.toString()}`);
      const data = await res.json();

      if (activeFetchIdRef.current !== fetchId) {
        return; // Ignore stale response
      }

      if (res.status === 403) {
        setAccessRestricted(true);
        setLeads([]);
      } else if (res.ok) {
        setAccessRestricted(false);

        if (!globalDashboardPageCache[filterKey]) {
          globalDashboardPageCache[filterKey] = { timestamp: Date.now() };
        }

        const incomingLeads = data.leads || [];
        globalDashboardPageCache[filterKey][currentPage] = incomingLeads;
        globalDashboardPageCache[filterKey].timestamp = Date.now();

        if (data.stats) {
          const mergedStats: Stats = {
            ...(cachedFilter?.stats || {}),
            ...data.stats,
            categories: (data.stats.categories && data.stats.categories.all > 0)
              ? data.stats.categories
              : (cachedFilter?.stats?.categories || data.stats.categories || stats.categories),
          };
          globalDashboardPageCache[filterKey].stats = mergedStats;
          setStats(mergedStats);
        } else if (cachedFilter?.stats) {
          setStats(cachedFilter.stats);
        }

        if (data.pagination && data.pagination.total !== undefined && !hasStatsAlready) {
          globalDashboardPageCache[filterKey].total = data.pagination.total;
        }

        const currentTotal = globalDashboardPageCache[filterKey].total ?? (data.pagination?.total ?? 0);
        const totalPages = Math.ceil(currentTotal / PAGE_SIZE);

        setPagination(prev => {
          if (prev.total !== currentTotal || prev.totalPages !== totalPages) {
            return { ...prev, total: currentTotal, totalPages };
          }
          return prev;
        });

        setLeads(incomingLeads);

        if (Array.isArray(incomingLeads)) {
          updateBranchWindow(incomingLeads);
        }
        if (data.maxUpdatedAt) {
          lastSyncTimestampRef.current = data.maxUpdatedAt;
        } else if (Array.isArray(incomingLeads) && incomingLeads.length > 0) {
          let maxT = '';
          for (const l of incomingLeads) {
            const t = l.updatedAt || l.createdAt;
            if (t && t > maxT) maxT = t;
          }
          if (maxT) lastSyncTimestampRef.current = maxT;
        }
        if (data.userRole) {
          setUserRole(data.userRole);
        }

        if (data.assignedBranch !== undefined) setUserAssignedBranch(data.assignedBranch);
        if (data.allowExternalUpload !== undefined) {
          setAllowExternalUpload(Boolean(data.allowExternalUpload || data.userRole === "ADMIN" || data.userRole === "SUPERADMIN"));
        }
      }
    } catch {
      showToast("Failed to fetch leads", "error");
    } finally {
      setLoading(false);
      if (activeFetchIdRef.current === fetchId) {
        isFetchingRef.current = false;
      }
    }
  }, [pagination.page, category, search, statusFilter, branchFilter, consultantFilter, testDriveFilter, uploaderFilter, platformFilter, startDate, endDate, primaryOrder, secondaryField, secondaryOrder, updateBranchWindow]);


  const filterStateRef = useRef({
    category,
    search,
    statusFilter,
    branchFilter,
    consultantFilter,
    testDriveFilter,
    uploaderFilter,
    platformFilter,
    startDate,
    endDate,
    page: pagination.page,
    limit: pagination.limit,
    total: pagination.total,
  });

  useEffect(() => {
    filterStateRef.current = {
      category,
      search,
      statusFilter,
      branchFilter,
      consultantFilter,
      testDriveFilter,
      uploaderFilter,
      platformFilter,
      startDate,
      endDate,
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
    };
  }, [category, search, statusFilter, branchFilter, consultantFilter, testDriveFilter, uploaderFilter, platformFilter, startDate, endDate, pagination.page, pagination.limit, pagination.total]);

  useEffect(() => {
    fetchLeads();

    // Perform lightweight incremental check and patch changed leads in-place (no full DB egress)
    const performIncrementalCheck = async () => {
      if (document.visibilityState !== 'visible' || updatingCountRef.current > 0 || isFetchingRef.current) {
        return;
      }
      try {
        const f = filterStateRef.current;
        const checkParams = new URLSearchParams();
        if (lastSyncTimestampRef.current) {
          checkParams.set("since", lastSyncTimestampRef.current);
        }
        if (f.category && f.category !== "all") checkParams.set("category", f.category);
        if (f.search) checkParams.set("search", f.search);
        if (f.statusFilter) checkParams.set("status", f.statusFilter);
        if (f.branchFilter) checkParams.set("branch", f.branchFilter);
        if (f.consultantFilter) checkParams.set("consultant", f.consultantFilter);
        if (f.testDriveFilter) checkParams.set("testDrive", f.testDriveFilter);
        if (f.uploaderFilter) {
          if (f.uploaderFilter === "system") checkParams.set("source", "System");
          else if (f.uploaderFilter === "external") checkParams.set("source", "External Upload");
          else if (f.uploaderFilter.startsWith("user:")) checkParams.set("uploader", f.uploaderFilter.replace("user:", ""));
        }
        if (f.platformFilter) checkParams.set("platform", f.platformFilter);
        if (f.startDate) checkParams.set("startDate", f.startDate);
        if (f.endDate) checkParams.set("endDate", f.endDate);

        const res = await fetch(`/api/leads/check?${checkParams.toString()}`);
        if (!res.ok) return;

        const data = await res.json();

        // If nothing has changed, do NOTHING (0 additional network requests)
        if (!data.hasChanges) {
          if (data.lastUpdated) {
            lastSyncTimestampRef.current = data.lastUpdated;
          }
          return;
        }

        const prevSyncTimeStr = lastSyncTimestampRef.current;
        // Advance sync timestamp
        if (data.lastUpdated) {
          lastSyncTimestampRef.current = data.lastUpdated;
        }

        // 1. Immediately update dashboard stat cards with fresh counts
        if (data.stats) {
          setStats(prev => ({
            ...prev,
            ...data.stats,
            categories: data.stats.categories || prev?.categories,
          }));
        }

        // 2. Patch changed leads directly in-place without refetching from DB
        if (Array.isArray(data.changedLeads) && data.changedLeads.length > 0) {
          updateBranchWindow(data.changedLeads);

          for (const cl of data.changedLeads) {
            patchLeadInCache(cl);
          }

          // If on page 1 and there are TRULY NEW incoming leads (created since previous sync), prepend them in-place
          const prevSyncTime = prevSyncTimeStr ? new Date(prevSyncTimeStr).getTime() - 5000 : 0;
          setLeads(prevLeads => {
            const existingIds = new Set(prevLeads.map(l => l.id));
            const newlyCreatedLeads = data.changedLeads.filter((l: Lead) => {
              if (existingIds.has(l.id)) return false;
              if (!l.createdAt) return false;
              const createdTime = new Date(l.createdAt).getTime();
              const updatedTime = l.updatedAt ? new Date(l.updatedAt).getTime() : createdTime;
              const isNewlyCreated = Math.abs(updatedTime - createdTime) < 15000;
              return prevSyncTime > 0 && createdTime >= prevSyncTime && isNewlyCreated;
            });

            if (newlyCreatedLeads.length > 0 && filterStateRef.current.page === 1 && primaryOrder === 'desc' && !secondaryField) {
              newlyCreatedLeads.sort((a: Lead, b: Lead) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              return [...newlyCreatedLeads, ...prevLeads].slice(0, filterStateRef.current.limit || PAGE_SIZE);
            }

            return prevLeads;
          });

          // Update pagination total if count changed
          if (data.count !== undefined && data.count !== filterStateRef.current.total) {
            setPagination(p => ({ ...p, total: data.count, totalPages: Math.ceil(data.count / p.limit) }));
          }
        } else if (data.count !== undefined && data.count !== filterStateRef.current.total) {
          setPagination(p => ({ ...p, total: data.count, totalPages: Math.ceil(data.count / p.limit) }));
        }
      } catch {
        // silently ignore check errors
      }
    };

    const handleLeadsUpdated = () => {
      performIncrementalCheck();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("crm-leads-updated", handleLeadsUpdated);
    }

    // Smart auto-refresh: polls lightweight check API every 60s, pauses if tab hidden or updating
    const autoRefreshInterval = setInterval(performIncrementalCheck, 60000);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("crm-leads-updated", handleLeadsUpdated);
      }
      clearInterval(autoRefreshInterval);
    };
  }, [fetchLeads, updateBranchWindow, patchLeadInCache, primaryOrder]);


  const fetchAllFilteredLeads = async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "10000");
      params.set("export", "true");
      params.set("skipStats", "true");
      params.set("skipActivities", "true");
      params.set("primaryOrder", primaryOrder);
      params.set("secondaryField", secondaryField);
      params.set("secondaryOrder", secondaryOrder);
      if (statusFilter) params.set("status", statusFilter);
      if (category && category !== "all") params.set("category", category);
      if (search) params.set("search", search);
      if (branchFilter) params.set("branch", branchFilter);
      if (consultantFilter) params.set("consultant", consultantFilter);
      if (testDriveFilter) params.set("testDrive", testDriveFilter);
      if (uploaderFilter) {
        if (uploaderFilter === 'system') {
          params.set('source', 'System');
        } else if (uploaderFilter === 'external') {
          params.set('source', 'External Upload');
        } else if (uploaderFilter.startsWith('user:')) {
          params.set('uploader', uploaderFilter.replace('user:', ''));
        } else {
          params.set('uploader', uploaderFilter);
        }
      }
      if (platformFilter) params.set("platform", platformFilter);
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
    const branchMap = new Map<string, string>();
    const add = (b: string) => {
      if (!b) return;
      parseBranches(b).forEach(clean => {
        if (!clean) return;
        const key = clean.toLowerCase();
        if (!branchMap.has(key)) {
          branchMap.set(key, clean === "Mtp" ? "MTP" : clean);
        } else {
          const existing = branchMap.get(key)!;
          if (clean === "MTP" || (clean === clean.toUpperCase() && existing !== existing.toUpperCase())) {
            branchMap.set(key, clean);
          }
        }
      });
    };

    apiBranches.forEach(add);
    leads.forEach(l => {
      if (l.branch) add(l.branch);
    });
    return Array.from(branchMap.values()).sort((a, b) => a.localeCompare(b));
  }, [leads, apiBranches]);


  const handleCategoryChange = useCallback((newCat: LeadCategory) => {
    if (category === newCat) return;
    setCategory(newCat);
    setPagination(p => ({ ...p, page: 1 }));
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (newCat === "valid") {
        url.searchParams.delete("category");
      } else {
        url.searchParams.set("category", newCat);
      }
      window.history.replaceState({}, "", url.toString());
    }
  }, [category]);

  const categoryCounts = useMemo(() => {
    if (stats?.categories && stats.categories.all > 0) {
      return {
        valid: stats.categories.valid ?? 0,
        invalid: stats.categories.invalid ?? 0,
        outside: stats.categories.outside ?? 0,
        all: stats.categories.all ?? 0,
      };
    }

    for (const key of Object.keys(globalDashboardPageCache)) {
      const cStats = globalDashboardPageCache[key]?.stats;
      if (cStats?.categories && cStats.categories.all > 0) {
        return {
          valid: cStats.categories.valid ?? 0,
          invalid: cStats.categories.invalid ?? 0,
          outside: cStats.categories.outside ?? 0,
          all: cStats.categories.all ?? 0,
        };
      }
    }

    return {
      valid: stats?.categories?.valid ?? 0,
      invalid: stats?.categories?.invalid ?? 0,
      outside: stats?.categories?.outside ?? 0,
      all: stats?.categories?.all ?? pagination.total ?? 0,
    };
  }, [stats?.categories, pagination.total]);

  const getConsultantGroupsForLead = useCallback((lead: Lead) => {
    // 1. Parse lead branches
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

    // 2. Group consultants by branch
    const groupMap = new Map<string, Map<string, ConsultantItem>>(); // branchName -> Map(consultantNameLower -> ConsultantItem)

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

    // Populate from consultantsList
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

    // 3. Ensure currently assigned consultant is included if set
    if (lead.assignedConsultant && lead.assignedConsultant.trim()) {
      const assignedName = lead.assignedConsultant.trim();
      const assignedLower = assignedName.toLowerCase();

      // Check if already present in any branch
      let foundInAnyGroup = false;
      for (const m of groupMap.values()) {
        if (m.has(assignedLower)) {
          foundInAnyGroup = true;
          break;
        }
      }

      if (!foundInAnyGroup) {
        const existingInList = consultantsList.find(c => c.name.toLowerCase().trim() === assignedLower);
        if (existingInList && existingInList.branch) {
          const parsed = parseBranches(existingInList.branch);
          if (parsed.length > 0) {
            parsed.forEach(b => addConsultantToBranch(b, existingInList));
          } else {
            addConsultantToBranch(existingInList.branch.trim(), existingInList);
          }
        } else {
          // Place under lead's first branch if available, else 'Other'
          const leadParsed = parseBranches(lead.branch);
          const targetBranch = leadParsed.length > 0 ? leadParsed[0] : (lead.branch?.trim() || 'Other');
          addConsultantToBranch(targetBranch, {
            id: -1,
            name: assignedName,
            branch: targetBranch
          });
        }
      }
    }

    // 4. Construct sorted groups: matching first, then other branches alphabetically, then 'Other'
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

    matchingGroups.sort((a, b) => a.branch.localeCompare(b.branch));
    otherGroups.sort((a, b) => a.branch.localeCompare(b.branch));

    const result = [...matchingGroups, ...otherGroups];
    if (otherUnassignedGroup) {
      result.push(otherUnassignedGroup);
    }
    return result;
  }, [consultantsList]);

  const filteredConsultantsForFilterBar = useMemo(() => {
    const activeBranch = branchFilter || (userRole !== "ADMIN" ? userAssignedBranch : "");
    if (!activeBranch) {
      return consultantsList;
    }
    const cleanActive = activeBranch.toLowerCase().trim();
    return consultantsList.filter(c => {
      if (!c.branch) return false;
      const cBranch = c.branch.toLowerCase().trim();
      return cBranch.includes(cleanActive) || cleanActive.includes(cBranch);
    });
  }, [consultantsList, branchFilter, userRole, userAssignedBranch]);

  const displayedLeads = useMemo(() => {
    if (!branchFilter) return leads;
    return leads.filter(l => matchBranchFilter(l.branch, branchFilter));
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
      return matchBranchFilter(l.branch, branchFilter);
    });

    if (exportLeads.length === 0) {
      showToast("No data to export", "error");
      setExportLoading(false);
      return;
    }

    // Sort exported leads to match the table's current sort order
    exportLeads.sort((a: Lead, b: Lead) => {
      const dayA = toISTDateString(a.createdAt);
      const dayB = toISTDateString(b.createdAt);

      if (dayA !== dayB) {
        return primaryOrder === "desc" ? dayB.localeCompare(dayA) : dayA.localeCompare(dayB);
      }

      if (secondaryField) {
        const rawValA: any = a[secondaryField as keyof Lead];
        const rawValB: any = b[secondaryField as keyof Lead];

        if (secondaryField === "followUpDate1" || secondaryField === "followUpDate2" || secondaryField === "createdAt") {
          const tA = rawValA ? new Date(rawValA).getTime() : 0;
          const tB = rawValB ? new Date(rawValB).getTime() : 0;
          if (tA !== tB) {
            return secondaryOrder === "asc" ? tA - tB : tB - tA;
          }
        } else {
          const strA = (rawValA ?? "").toString().toLowerCase().trim();
          const strB = (rawValB ?? "").toString().toLowerCase().trim();
          if (strA !== strB) {
            return secondaryOrder === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
          }
        }
      }

      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) {
        return primaryOrder === "desc" ? timeB - timeA : timeA - timeB;
      }
      return (b.id ?? 0) - (a.id ?? 0);
    });

    const exportData = exportLeads.map((l: Lead) => ({
      Name: l.name,
      Phone: l.phone,
      City: l.city || "-",
      "Ad Name": l.adname || "-",
      Branch: l.branch ? parseBranches(l.branch).join(", ") : "-",
      "Assigned Consultant": l.assignedConsultant || "-",
      "Test Drive": l.testDrive || "-",
      "Follow Ups": formatAllFollowUpsForExcel(l.followUps, { followUpDate1: l.followUpDate1, followUpDate2: l.followUpDate2 }),
      "Created At": formatDate(l.createdAt),
      Status: formatStatusLabel(l.status),
      Remark: l.remark || "-"
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");

    // Apply vertical alignment and wrapText to all cells
    if (worksheet['!ref']) {
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          if (cell) {
            cell.s = {
              alignment: {
                vertical: "top",
                wrapText: true,
              },
            };
          }
        }
      }
    }

    const cols = Object.keys(exportData[0]).map((key) => {
      if (key === "Follow Ups") return { wch: 25 };
      if (key === "Remark") return { wch: 30 };
      if (key === "Name" || key === "Assigned Consultant") return { wch: 20 };
      return { wch: 15 };
    });
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
      return matchBranchFilter(l.branch, branchFilter);
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
    for (const k of Object.keys(globalDashboardPageCache)) delete globalDashboardPageCache[k]; // Clear stale prefetched pages on manual full sync
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
        if (data.isSessionExpired || data.error?.includes("Google session expired") || data.error?.includes("invalid grant")) {
          showToast("Google session expired. Please reconnect in Settings.", "error");
        } else {
          showToast(data.error || "Sync failed", "error");
        }
      }
    } catch {
      showToast("Sync failed", "error");
    } finally {
      setSyncing(false);
      stopUpdating();
    }
  };

  const toDateStringOrUndefined = (d?: Date | string | null): string | undefined => {
    if (!d) return undefined;
    return typeof d === "string" ? d : d.toISOString();
  };

  const handleFollowUpStepChange = async (lead: Lead, step: number, dateStr: string) => {
    if (!dateStr) {
      handleClearFollowUp(lead, step);
      return;
    }

    const prevLeads = [...leads];
    startUpdating();
    activeFetchIdRef.current++;

    const currentFollowUps = lead.followUps ? [...lead.followUps] : [];
    const existingIdx = currentFollowUps.findIndex(f => f.step === step);
    if (existingIdx >= 0) {
      currentFollowUps[existingIdx] = { ...currentFollowUps[existingIdx], date: dateStr };
    } else {
      currentFollowUps.push({ step, date: dateStr });
    }
    currentFollowUps.sort((a, b) => a.step - b.step);

    const firstDate = currentFollowUps[0]?.date || null;
    const latestDate = currentFollowUps.length > 1 ? currentFollowUps[currentFollowUps.length - 1]?.date : null;

    patchLeadInCache({
      id: lead.id,
      followUps: currentFollowUps,
      followUpCount: currentFollowUps.length,
      followUpDate1: toDateStringOrUndefined(firstDate),
      followUpDate2: toDateStringOrUndefined(latestDate),
    });

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateFollowUp: { step, date: dateStr },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Follow-up ${step} updated`);
        if (data.lead) {
          patchLeadInCache(data.lead);
        }
      } else {
        showToast(data.error || data.details || "Failed to update date", "error");
        setLeads(prevLeads);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update date", "error");
      setLeads(prevLeads);
    } finally {
      stopUpdating();
    }
  };

  const handleAddNewFollowUp = async (lead: Lead, targetStep: number, dateStr: string) => {
    if (!dateStr) return;

    const prevLeads = [...leads];
    startUpdating();
    activeFetchIdRef.current++;

    const currentFollowUps = lead.followUps ? [...lead.followUps] : [];
    currentFollowUps.push({ step: targetStep, date: dateStr });
    currentFollowUps.sort((a, b) => a.step - b.step);

    const firstDate = currentFollowUps[0]?.date || null;
    const latestDate = currentFollowUps.length > 1 ? currentFollowUps[currentFollowUps.length - 1]?.date : null;

    patchLeadInCache({
      id: lead.id,
      followUps: currentFollowUps,
      followUpCount: currentFollowUps.length,
      followUpDate1: toDateStringOrUndefined(firstDate),
      followUpDate2: toDateStringOrUndefined(latestDate),
    });

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newFollowUpDate: { date: dateStr, step: targetStep },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Follow-up ${targetStep} added`);
        if (data.lead) {
          patchLeadInCache(data.lead);
        }
      } else {
        showToast(data.error || data.details || "Failed to add follow-up", "error");
        setLeads(prevLeads);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to add follow-up", "error");
      setLeads(prevLeads);
    } finally {
      stopUpdating();
    }
  };

  const handleClearFollowUp = async (lead: Lead, step: number) => {
    const prevLeads = [...leads];
    startUpdating();
    activeFetchIdRef.current++;

    const currentFollowUps = (lead.followUps ? [...lead.followUps] : [])
      .filter(f => f.step !== step)
      .map((f, i) => ({ ...f, step: i + 1 }));

    const firstDate = currentFollowUps.length > 0 ? currentFollowUps[0].date : null;
    const latestDate = currentFollowUps.length > 1 ? currentFollowUps[currentFollowUps.length - 1].date : null;

    patchLeadInCache({
      id: lead.id,
      followUps: currentFollowUps,
      followUpCount: currentFollowUps.length,
      followUpDate1: toDateStringOrUndefined(firstDate),
      followUpDate2: toDateStringOrUndefined(latestDate),
    });

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deleteFollowUpStep: step,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Follow-up ${step} cleared`);
        if (data.lead) {
          patchLeadInCache(data.lead);
        }
      } else {
        showToast(data.error || data.details || "Failed to clear follow-up", "error");
        setLeads(prevLeads);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to clear follow-up", "error");
      setLeads(prevLeads);
    } finally {
      stopUpdating();
    }
  };

  const handleFollowUpUpdate = async (lead: Lead, field: 'followUpDate1' | 'followUpDate2', dateStr: string) => {
    const prevLeads = [...leads];
    startUpdating();
    activeFetchIdRef.current++;

    patchLeadInCache({ id: lead.id, [field]: dateStr || null });

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: dateStr || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("Follow-up date updated");
        if (data.lead) {
          patchLeadInCache(data.lead);
        }
      } else {
        showToast(data.error || data.details || "Failed to update date", "error");
        setLeads(prevLeads.map(l => (l.id === lead.id && data.handledBy) ? { ...l, handledBy: data.handledBy } : l));
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update date", "error");
      setLeads(prevLeads);
    } finally {
      stopUpdating();
    }
  };

  const handleStatusChange = async (lead: Lead, newStatus: string) => {
    const oldStatus = lead.status;
    const normOld = (oldStatus === 'created' ? 'not_contacted' : oldStatus === 'closed_successful' ? 'live' : oldStatus === 'closed_unsuccessful' ? 'lost' : oldStatus) as 'not_contacted' | 'pending' | 'live' | 'lost' | 'callback';
    const normNew = (newStatus === 'created' ? 'not_contacted' : newStatus === 'closed_successful' ? 'live' : newStatus === 'closed_unsuccessful' ? 'lost' : newStatus) as 'not_contacted' | 'pending' | 'live' | 'lost' | 'callback';

    if (normOld === normNew) return;

    // Snapshot previous state to revert if API request fails
    const prevLeads = [...leads];
    const prevStats = { ...stats };

    startUpdating(); // PAUSE polling while update request is processing
    activeFetchIdRef.current++; // Invalidate any in-flight requests so they don't overwrite this optimistic update

    // 1. Optimistically update leads list in table immediately
    const optimisticHandledBy = (normNew === 'not_contacted') ? null : (lead.handledBy || username || null);
    patchLeadInCache({ id: lead.id, status: newStatus, handledBy: optimisticHandledBy });

    // 2. Optimistically update stats counters immediately!
    setStats(prev => {
      const updated = { ...prev };
      if (normOld === 'not_contacted') updated.notContacted = Math.max(0, (updated.notContacted ?? 0) - 1);
      if (normOld === 'pending') updated.pending = Math.max(0, (updated.pending ?? 0) - 1);
      if (normOld === 'live') updated.live = Math.max(0, (updated.live ?? 0) - 1);
      if (normOld === 'lost') updated.lost = Math.max(0, (updated.lost ?? 0) - 1);
      if (normOld === 'callback') updated.callback = Math.max(0, (updated.callback ?? 0) - 1);

      if (normNew === 'not_contacted') updated.notContacted = (updated.notContacted ?? 0) + 1;
      if (normNew === 'pending') updated.pending = (updated.pending ?? 0) + 1;
      if (normNew === 'live') updated.live = (updated.live ?? 0) + 1;
      if (normNew === 'lost') updated.lost = (updated.lost ?? 0) + 1;
      if (normNew === 'callback') updated.callback = (updated.callback ?? 0) + 1;

      return updated;
    });

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Status updated to ${formatStatusLabel(newStatus)}`);
        if (data.lead) {
          patchLeadInCache(data.lead);
        }
      } else {
        showToast(data.error || data.details || "Failed to update status", "error");
        // REVERT back if failed, but immediately reflect locked handler
        setLeads(prevLeads.map(l => (l.id === lead.id && data.handledBy) ? { ...l, handledBy: data.handledBy } : l));
        setStats(prevStats);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to update status", "error");
      // REVERT back if failed!
      setLeads(prevLeads);
      setStats(prevStats);
    } finally {
      stopUpdating(); // RESUME polling after update completes (success/failure)
    }
  };

  const handleAddRemark = async () => {
    if (!remarkModal) return;
    const isPending = remarkModal.status === "not_contacted" || remarkModal.status === "created";
    setRemarkLoading(true);

    const prevLeads = [...leads];
    const prevStats = { ...stats };

    startUpdating(); // PAUSE polling while adding remark
    activeFetchIdRef.current++; // Invalidate in-flight requests

    // Optimistically update table row and stats counters
    patchLeadInCache({
      id: remarkModal.id,
      remark: remarkText.trim(),
      status: isPending ? "pending" : remarkModal.status,
      handledBy: remarkModal.handledBy || username || null,
    });

    if (isPending) {
      setStats(prev => {
        const updated = { ...prev };
        updated.notContacted = Math.max(0, (updated.notContacted ?? 0) - 1);
        updated.pending = (updated.pending ?? 0) + 1;
        return updated;
      });
    }

    try {
      const res = await fetch(`/api/leads/${remarkModal.id}/remark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remark: remarkText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("Remark added successfully");
        setRemarkModal(null);
        setRemarkText("");
        if (data.lead) {
          patchLeadInCache(data.lead);
        }
      } else {
        showToast(data.error || data.details || "Failed to add remark", "error");
        // REVERT back on failure, but immediately reflect locked handler
        setLeads(prevLeads.map(l => (l.id === remarkModal.id && data.handledBy) ? { ...l, handledBy: data.handledBy } : l));
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

  const handleAssignedConsultantUpdate = async (lead: Lead, value: string) => {
    const prevLeads = [...leads];
    startUpdating();
    activeFetchIdRef.current++;

    patchLeadInCache({ id: lead.id, assignedConsultant: value });

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedConsultant: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || data.details || "Failed to update consultant", "error");
        setLeads(prevLeads.map(l => (l.id === lead.id && data.handledBy) ? { ...l, handledBy: data.handledBy } : l));
      } else if (data.lead) {
        patchLeadInCache(data.lead);
      }
    } catch (err: any) {
      showToast(`Failed to update consultant: ${err.message || 'Network error'}`, "error");
      setLeads(prevLeads);
    } finally {
      stopUpdating();
    }
  };

  const handleTestDriveUpdate = async (lead: Lead, value: string) => {
    const prevLeads = [...leads];
    startUpdating();
    activeFetchIdRef.current++;

    patchLeadInCache({ id: lead.id, testDrive: value });

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testDrive: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || data.details || "Failed to update test drive", "error");
        setLeads(prevLeads.map(l => (l.id === lead.id && data.handledBy) ? { ...l, handledBy: data.handledBy } : l));
      } else if (data.lead) {
        patchLeadInCache(data.lead);
      }
    } catch (err: any) {
      showToast(`Failed to update test drive: ${err.message || 'Network error'}`, "error");
      setLeads(prevLeads);
    } finally {
      stopUpdating();
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

    // Optimistically remove lead from state and cache
    removeLeadFromCache(targetLead.id);
    const targetStatus = (targetLead.status === 'created' ? 'not_contacted' : targetLead.status === 'closed_successful' ? 'live' : targetLead.status === 'closed_unsuccessful' ? 'lost' : targetLead.status) as 'not_contacted' | 'pending' | 'live' | 'lost';

    setStats(prev => {
      const updated = { ...prev, total: Math.max(0, (prev.total ?? 0) - 1) };
      if (targetStatus === 'not_contacted') updated.notContacted = Math.max(0, (updated.notContacted ?? 0) - 1);
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
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const datePart = formatToDDMMYYYY(d);
      const timePart = d.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `${datePart} ${timePart}`;
    } catch {
      return dateStr;
    }
  };

  const getFullDateTooltip = (dateStr: string) => {
    if (!dateStr) return "No date available";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const datePart = formatToDDMMYYYY(d);
      const timePart = d.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      return `${datePart} ${timePart}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="page-actions" style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={handleExportExcel} disabled={exportLoading}>
            {exportLoading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Exporting...</> : "Export Excel"}
          </button>
          {/* <button className="btn btn-ghost" onClick={handleExportPDF} disabled={exportLoading}>
            {exportLoading ? <><span className="spinner" style={{width: 14, height: 14}}/> Exporting...</> : "Export PDF"}
          </button> */}

          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncing}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            {syncing ? <><span className="spinner" /> Syncing...</> : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18, flexShrink: 0, display: "block" }}>
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Sync from Sheet
              </>
            )}
          </button>

          {(allowExternalUpload || userRole === "ADMIN" || userRole === "SUPERADMIN" || isSuperAdmin) && (
            <button className="btn btn-secondary" onClick={() => setExternalSyncModalOpen(true)} disabled={syncing}>
              Upload External Leads
            </button>
          )}

        </div>
      </div>

      {/* Stats */}
      {(() => {
        const isFiltered = mounted && Boolean(searchInput || search || statusFilter || branchFilter || consultantFilter || testDriveFilter || uploaderFilter || startDate || endDate);
        return (

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Leads</div>
              <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{stats.total}</span>
                {isFiltered && (
                  <span
                    title="Filtered count active"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "3px 6px",
                      borderRadius: "6px",
                      background: "rgba(59, 130, 246, 0.12)",
                      color: "#3b82f6",
                      fontSize: "12px"
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </span>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Not Contacted</div>
              <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{stats.notContacted ?? 0}</span>
                {isFiltered && (
                  <span
                    title="Filtered count active"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "3px 6px",
                      borderRadius: "6px",
                      background: "rgba(34, 197, 94, 0.12)",
                      color: "#16a34a",
                      fontSize: "12px"
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </span>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Contacted</div>
              <div className="stat-value open" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{stats.pending ?? stats.open ?? 0}</span>
                {isFiltered && (
                  <span
                    title="Filtered count active"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "3px 6px",
                      borderRadius: "6px",
                      background: "rgba(234, 179, 8, 0.15)",
                      color: "#ca8a04",
                      fontSize: "12px"
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </span>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Completed</div>
              <div className="stat-value success" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{stats.live ?? stats.closedSuccessful ?? 0}</span>
                {isFiltered && (
                  <span
                    title="Filtered count active"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "3px 6px",
                      borderRadius: "6px",
                      background: "rgba(34, 197, 94, 0.15)",
                      color: "#16a34a",
                      fontSize: "12px"
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </span>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Lost</div>
              <div className="stat-value fail" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{stats.lost ?? stats.closedUnsuccessful ?? 0}</span>
                {isFiltered && (
                  <span
                    title="Filtered count active"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "3px 6px",
                      borderRadius: "6px",
                      background: "rgba(239, 68, 68, 0.15)",
                      color: "#dc2626",
                      fontSize: "12px"
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </span>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Conversion Rate</div>
              {(() => {
                const total = stats.total || 0;
                const completed = stats.live ?? stats.closedSuccessful ?? 0;
                const rate = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";
                return (
                  <div className="stat-value" style={{ color: "#059669", display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span>{rate}%</span>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
                      ({completed}/{total})
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}


      {/* Lead Category Switcher */}
      <div className="lead-category-bar-wrapper">
        <div className="lead-category-tabs" role="tablist" aria-label="Lead Categories">
          <button
            type="button"
            role="tab"
            aria-selected={category === "valid"}
            className={`lead-category-tab lead-category-tab--valid ${category === "valid" ? "active" : ""}`}
            onClick={() => handleCategoryChange("valid")}
            title="Tamil Nadu leads with valid phone numbers (Default)"
          >
            <span className="lead-category-tab-label">Valid (Tamil Nadu)</span>
            <span className="lead-category-badge">
              {categoryCounts.valid}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={category === "invalid"}
            className={`lead-category-tab lead-category-tab--invalid ${category === "invalid" ? "active" : ""}`}
            onClick={() => handleCategoryChange("invalid")}
            title="Leads with invalid phone numbers"
          >
            <span className="lead-category-tab-label">Invalid</span>
            <span className="lead-category-badge">
              {categoryCounts.invalid}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={category === "outside"}
            className={`lead-category-tab lead-category-tab--outside ${category === "outside" ? "active" : ""}`}
            onClick={() => handleCategoryChange("outside")}
            title="Leads located outside Tamil Nadu"
          >
            <span className="lead-category-tab-label">Outside</span>
            <span className="lead-category-badge">
              {categoryCounts.outside}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={category === "all"}
            className={`lead-category-tab lead-category-tab--all ${category === "all" ? "active" : ""}`}
            onClick={() => handleCategoryChange("all")}
            title="All registered leads across all categories"
          >
            <span className="lead-category-tab-label">All Leads</span>
            <span className="lead-category-badge">
              {categoryCounts.all}
            </span>
          </button>
        </div>

        {/* Category Scope Helper Description */}
        <div className="lead-category-indicator">
          {category === "valid" && (
            <span className="lead-category-hint valid">
              <span className="lead-category-hint-dot" />
              Showing <strong>Tamil Nadu</strong> leads with valid phone numbers (Default)
            </span>
          )}
          {category === "invalid" && (
            <span className="lead-category-hint invalid">
              <span className="lead-category-hint-dot" />
              Showing leads with <strong>invalid phone numbers</strong>
            </span>
          )}
          {category === "outside" && (
            <span className="lead-category-hint outside">
              <span className="lead-category-hint-dot" />
              Showing leads located <strong>outside Tamil Nadu</strong>
            </span>
          )}
          {category === "all" && (
            <span className="lead-category-hint all">
              <span className="lead-category-hint-dot" />
              Showing <strong>all</strong> registered leads across all categories
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="filter-search-row">
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <input
              type="text"
              placeholder="Search by name, phone, city..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPagination(p => ({ ...p, page: 1 }));
              }}
              style={{ width: "100%", paddingLeft: "36px" }}
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, pointerEvents: "none" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>

          <button
            type="button"
            className={`mobile-filter-btn btn ${showMobileFilters || (statusFilter || branchFilter || consultantFilter || testDriveFilter || uploaderFilter || platformFilter || startDate || endDate) ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            aria-label="Toggle filters"
            style={{ padding: "0 12px", height: 38, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>Filters</span>
            {(() => {
              const count = [statusFilter, branchFilter, consultantFilter, testDriveFilter, uploaderFilter, platformFilter, (startDate || endDate)].filter(Boolean).length;
              return count > 0 ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: "#ffffff",
                    color: "var(--primary-dark)",
                    borderRadius: 10,
                    padding: "1px 6px",
                    lineHeight: "14px",
                  }}
                >
                  {count}
                </span>
              ) : null;
            })()}
          </button>
        </div>

        <div className={`filter-items-wrapper ${showMobileFilters ? "expanded" : ""}`}>
          {/* Status Multi-Select Filter */}
          <MultiSelectDropdown
            label="Status"
            allLabel="All Statuses"
            value={statusFilter}
            options={[
              { label: "Not Contacted", value: "not_contacted" },
              { label: "Contacted", value: "pending" },
              { label: "Completed", value: "live" },
              { label: "Lost", value: "lost" },
            ]}
            onChange={(newVal) => {
              setStatusFilter(newVal);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          />

          {userRole === "ADMIN" || userRole === "SUPERADMIN" ? (
            <div>
              <BranchConsultantPicker
                branches={branches}
                consultants={consultantsList}
                selectedBranch={branchFilter}
                selectedConsultant={consultantFilter}
                onChange={({ branch, consultant }) => {
                  setBranchFilter(branch);
                  setConsultantFilter(consultant);
                  setPagination(p => ({ ...p, page: 1 }));
                }}
                placeholder="All Branches & Consultants"
                showUnassigned={true}
              />
            </div>
          ) : userAssignedBranch ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid var(--border)",
                fontSize: "13px",
                color: "var(--text-secondary)"
              }}
              title="Branch restricted by Admin"
            >
              <span>Branch: <strong style={{ textTransform: "capitalize", color: "var(--text-primary)" }}>{(userAssignedBranch || "").replace(/_/g, " ")}</strong></span>
            </div>
          ) : (
            <MultiSelectDropdown
              label="Branch"
              allLabel="All Branches"
              value={branchFilter}
              options={branches.map((b: string) => ({ label: b, value: b }))}
              onChange={(newVal) => {
                setBranchFilter(newVal);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
            />
          )}

          {/* Test Drive Multi-Select Filter */}
          <MultiSelectDropdown
            label="Test Drive"
            allLabel="All Test Drives"
            value={testDriveFilter}
            options={[
              { label: "Scheduled", value: "Scheduled" },
              { label: "Completed", value: "Completed" },
              { label: "Cancelled", value: "Cancelled" },
              { label: "Not Scheduled", value: "Not Scheduled" },
            ]}
            onChange={(newVal) => {
              setTestDriveFilter(newVal);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          />

          {/* Lead Source / Uploader Multi-Select Filter */}
          <MultiSelectDropdown
            label="Lead Source"
            allLabel="All Lead Sources"
            value={uploaderFilter}
            options={[
              { label: "Meta Ads", value: "system" },
              { label: "All External Uploads", value: "external" },
              ...(usersList && usersList.length > 0
                ? [
                    {
                      group: "Uploaded by User",
                      options: usersList.map((u) => ({
                        label: `${u.username} (${u.role})`,
                        value: `user:${u.username}`,
                      })),
                    },
                  ]
                : []),
            ]}
            onChange={(newVal) => {
              setUploaderFilter(newVal);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          />

          {/* Platform Multi-Select Filter */}
          <MultiSelectDropdown
            label="Platform"
            allLabel="All Platforms"
            value={platformFilter}
            options={[
              {
                group: "Meta Ads",
                options: [
                  { label: "Facebook", value: "Fb" },
                  { label: "Instagram", value: "Ig" },
                ],
              },
            ]}
            onChange={(newVal) => {
              setPlatformFilter(newVal);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          />

          {/* Date Filter Quick Pills / Custom Modal Trigger */}
          <button
            type="button"
            onClick={handleToggleToday}
            className={`btn ${isTodayActive ? "btn-primary" : "btn-ghost"}`}
            style={{ padding: "6px 14px", fontSize: 13, height: 38 }}
          >
            Today
          </button>

          <button
            type="button"
            onClick={openDateModal}
            className={`btn ${startDate || endDate ? "btn-primary" : "btn-ghost"}`}
            style={{ padding: "6px 14px", fontSize: 13, height: 38, display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {startDate || endDate
              ? (startDate === endDate ? formatToDDMMYYYY(startDate) : `${formatToDDMMYYYY(startDate) || "Start"} → ${formatToDDMMYYYY(endDate) || "End"}`)
              : "Date Range"}
          </button>

          {/* Clear Date Filter Chip */}
          {(searchInput || search || statusFilter || branchFilter || consultantFilter || testDriveFilter || uploaderFilter || platformFilter || startDate || endDate) && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setStatusFilter("");
                setBranchFilter("");
                setConsultantFilter("");
                setTestDriveFilter("");
                setUploaderFilter("");
                setPlatformFilter("");
                setStartDate("");
                setEndDate("");
                setPagination(p => ({ ...p, page: 1 }));
              }}
              style={{ padding: "6px 12px", fontSize: 13, background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.2)" }}
            >
              ✕ Clear Filters
            </button>
          )}
        </div>
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
          <>
            {/* Desktop Leads Table */}
            <div className="table-container desktop-leads-table">
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
                      Created At {!secondaryField || secondaryField === "createdAt" ? (primaryOrder === "desc" ? "↓" : "↑") : ""}
                    </th>
                    <th onClick={() => handleHeaderClick("status")} style={{ cursor: "pointer", userSelect: "none" }} title="Click to sort by Status">
                      Status {secondaryField === "status" ? (secondaryOrder === "asc" ? "↑" : "↓") : ""}
                    </th>
                    <th>Test Drive</th>
                    <th>Assigned To</th>
                    <th>Platform</th>
                    <th>Remark</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={13} style={{ textAlign: "center", padding: "40px" }}>
                        No leads found.
                      </td>
                    </tr>
                  ) : (
                    displayedLeads.map((lead: Lead) => {
                      const isLeadLocked = Boolean(
                        userRole !== "ADMIN" &&
                        userRole !== "SUPERADMIN" &&
                        !isSuperAdmin &&
                        lead.handledBy &&
                        username &&
                        lead.handledBy.trim().toLowerCase() !== username.trim().toLowerCase()
                      );

                      return (
                        <tr key={lead.id} style={isLeadLocked ? { background: "rgba(241, 245, 249, 0.35)" } : undefined}>
                          <td style={{ fontWeight: 600 }}>
                            <div title={lead.name || undefined}>
                              {lead.name ? (Array.from(lead.name).length > 35 ? Array.from(lead.name).slice(0, 35).join('') + "..." : lead.name) : ""}
                            </div>
                            {lead.handledBy && (
                              <div style={{ marginTop: 4 }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "1px 7px",
                                    borderRadius: "10px",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    background: isLeadLocked ? "rgba(239, 68, 68, 0.08)" : "rgba(37, 99, 235, 0.08)",
                                    color: isLeadLocked ? "#dc2626" : "#2563eb",
                                    border: `1px solid ${isLeadLocked ? "rgba(239, 68, 68, 0.2)" : "rgba(37, 99, 235, 0.2)"}`,
                                    whiteSpace: "nowrap",
                                  }}
                                  title={isLeadLocked ? `Locked by ${lead.handledBy} (Read only)` : `Handled by ${lead.handledBy}`}
                                >
                                  {isLeadLocked ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                      <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                  )}
                                  {isLeadLocked ? `Locked: ${lead.handledBy}` : `Handled by ${lead.handledBy}`}
                                </span>
                              </div>
                            )}
                          </td>
                          <td 
                            style={{ 
                              fontFamily: "monospace", 
                              color: (lead.phone || "").replace(/\D/g, '').length > 10 ? "red" : "inherit" 
                            }}
                            title={(lead.phone || "").replace(/\D/g, '').length > 15 ? lead.phone : undefined}
                          >
                            {(lead.phone || "").replace(/\D/g, '').length > 15 ? (lead.phone || "").slice(0, 15) + "..." : (lead.phone || "")}
                          </td>
                          <td title={lead.city || undefined}>
                            {lead.city ? (Array.from(lead.city).length > 20 ? Array.from(lead.city).slice(0, 20).join('') + "..." : lead.city) : "—"}
                          </td>
                          <td title={lead.adname || undefined} style={{ maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {lead.adname || "—"}
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", width: "max-content", maxWidth: "100%" }}>
                              {lead.branch ? parseBranches(lead.branch).map((b, idx) => (
                                <span key={idx} style={{ background: "rgba(0,0,0,0.05)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap", display: "inline-block" }}>
                                  {b}
                                </span>
                              )) : "—"}
                            </div>
                          </td>
                          <td>
                            {(() => {
                              const { input1, input2 } = getFollowUpInputsState(lead.followUps, {
                                followUpDate1: lead.followUpDate1,
                                followUpDate2: lead.followUpDate2,
                              });
                              return (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", minWidth: "20px", fontWeight: 600 }}>{input1.label}.</span>
                                    <input
                                      type="date"
                                      value={input1.isoDate}
                                      title={isLeadLocked ? `Locked by ${lead.handledBy}` : `${input1.label}: ${input1.dateStr || 'No date set'}`}
                                      onChange={(e) => {
                                        if (input1.exists) {
                                          handleFollowUpStepChange(lead, input1.step, e.target.value);
                                        } else {
                                          handleAddNewFollowUp(lead, input1.step, e.target.value);
                                        }
                                      }}
                                      disabled={isLeadLocked}
                                      className="status-select"
                                      style={{ border: "1px solid var(--border)", background: "transparent", cursor: isLeadLocked ? "not-allowed" : "pointer", opacity: isLeadLocked ? 0.6 : 1, padding: "2px 6px", fontSize: "13px" }}
                                    />
                                    {input1.exists && (
                                      <button
                                        type="button"
                                        onClick={() => handleClearFollowUp(lead, input1.step)}
                                        disabled={isLeadLocked}
                                        title={`Clear ${input1.label}`}
                                        style={{ border: "none", background: "transparent", color: "var(--text-secondary)", cursor: isLeadLocked ? "not-allowed" : "pointer", padding: "0 2px", fontSize: "14px", lineHeight: 1 }}
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", minWidth: "20px", fontWeight: 600 }}>{input2.label}.</span>
                                    <input
                                      type="date"
                                      value={input2.isoDate}
                                      title={isLeadLocked ? `Locked by ${lead.handledBy}` : `${input2.label}: Add follow up`}
                                      onChange={(e) => handleAddNewFollowUp(lead, input2.step, e.target.value)}
                                      disabled={isLeadLocked}
                                      className="status-select"
                                      style={{ border: "1px solid var(--border)", background: "transparent", cursor: isLeadLocked ? "not-allowed" : "pointer", opacity: isLeadLocked ? 0.6 : 1, padding: "2px 6px", fontSize: "13px" }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td style={{ cursor: "pointer" }} title={getFullDateTooltip(lead.createdAt)}>
                            {formatDate(lead.createdAt)}
                          </td>
                          <td>
                            <select
                              className={`status-select ${(lead.status === "not_contacted" || lead.status === "created") ? "status-not_contacted" :
                                lead.status === "pending" ? "status-pending" :
                                  (lead.status === "live" || lead.status === "closed_successful") ? "status-live" :
                                  lead.status === "callback" ? "status-callback" : "status-lost"
                                }`}
                              value={lead.status === 'created' ? 'not_contacted' : lead.status === 'closed_successful' ? 'live' : lead.status === 'closed_unsuccessful' ? 'lost' : lead.status}
                              onChange={(e) => handleStatusChange(lead, e.target.value)}
                              disabled={isLeadLocked}
                              style={isLeadLocked ? { opacity: 0.65, cursor: "not-allowed" } : undefined}
                              title={isLeadLocked ? `Locked by ${lead.handledBy}` : `Status: ${formatStatusLabel(lead.status)}`}
                            >
                              <option value="not_contacted">Not Contacted</option>
                              <option value="pending">Contacted</option>
                              <option value="live">Completed</option>
                              <option value="lost">Lost</option>
                            </select>
                          </td>
                          <td>
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
                              style={{ padding: "4px", ...(isLeadLocked ? { opacity: 0.65, cursor: "not-allowed" } : {}) }}
                              value={
                                lead.testDrive === "Yes"
                                  ? "Scheduled"
                                  : lead.testDrive === "No"
                                  ? "Not Scheduled"
                                  : lead.testDrive || "Not Scheduled"
                              }
                              onChange={(e) => handleTestDriveUpdate(lead, e.target.value)}
                              disabled={isLeadLocked}
                              title={isLeadLocked ? `Locked by ${lead.handledBy}` : undefined}
                            >
                              <option value="Not Scheduled">Not Scheduled</option>
                              <option value="Scheduled">Scheduled</option>
                              <option value="Completed">Completed</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </td>
                          <td>
                            <select
                              className="status-select"
                              style={{ padding: "4px", ...(isLeadLocked ? { opacity: 0.65, cursor: "not-allowed" } : {}) }}
                              value={lead.assignedConsultant || ""}
                              onChange={(e) => handleAssignedConsultantUpdate(lead, e.target.value)}
                              disabled={isLeadLocked}
                              title={isLeadLocked ? `Locked by ${lead.handledBy}` : undefined}
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
                          </td>
                          <td>
                            {(() => {
                              let plat = lead.platform && !/^\d{4}-\d{2}-\d{2}$/.test(lead.platform) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(lead.platform)
                                ? lead.platform.trim()
                                : "Unknown";

                              // Map DB values to friendly display names
                              if (plat === 'Fb') plat = 'Facebook';
                              else if (plat === 'Ig') plat = 'Instagram';
                              else if (plat && plat.toLowerCase() !== "unknown") {
                                plat = plat.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                              } else {
                                plat = "Unknown";
                              }

                              const uploader = lead.uploadedBy?.username;

                              return (
                                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                                  <span>{plat}</span>
                                  {uploader && (
                                    <span style={{ color: "var(--text-muted)", marginLeft: 5, fontSize: 12, fontWeight: 600 }}>
                                      ({uploader})
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="remark-cell">
                            {lead.remark ? (
                              <span className="remark-text" title={lead.remark} style={{ whiteSpace: "normal", wordBreak: "break-word", display: "block", maxWidth: "250px" }}>{lead.remark}</span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>—</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <button
                                className="add-remark-btn"
                                onClick={() => {
                                  if (isLeadLocked) {
                                    showToast(`This lead is currently handled by "${lead.handledBy}". You cannot modify this lead unless "${lead.handledBy}" changes its status back to Not Contacted.`, "error");
                                    return;
                                  }
                                  openRemarkModal(lead);
                                }}
                                disabled={isLeadLocked}
                                style={isLeadLocked ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                                title={isLeadLocked ? `Locked by ${lead.handledBy}` : undefined}
                              >
                                {lead.remark ? "Edit" : "Add"} Remark
                              </button>
                              {isSuperAdmin && (
                                <button
                                  className="btn btn-ghost"
                                  style={{ color: "#ef4444", padding: "6px 8px", borderRadius: 6 }}
                                  onClick={() => openDeleteModal(lead)}
                                  title="Delete lead (Superadmin only)"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15, display: "block" }}>
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Leads Cards View */}
            <div className="mobile-leads-cards">
              {displayedLeads.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 16px", color: "var(--text-muted)" }}>
                  No leads found.
                </div>
              ) : (
                displayedLeads.map((lead: Lead) => {
                  const isLeadLocked = Boolean(
                    userRole !== "ADMIN" &&
                    userRole !== "SUPERADMIN" &&
                    !isSuperAdmin &&
                    lead.handledBy &&
                    username &&
                    lead.handledBy.trim().toLowerCase() !== username.trim().toLowerCase()
                  );

                  const { input1, input2 } = getFollowUpInputsState(lead.followUps, {
                    followUpDate1: lead.followUpDate1,
                    followUpDate2: lead.followUpDate2,
                  });

                  let plat = lead.platform && !/^\d{4}-\d{2}-\d{2}$/.test(lead.platform) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(lead.platform)
                    ? lead.platform.trim()
                    : "Unknown";
                  if (plat === 'Fb') plat = 'Facebook';
                  else if (plat === 'Ig') plat = 'Instagram';
                  else if (plat && plat.toLowerCase() !== "unknown") {
                    plat = plat.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                  } else {
                    plat = "Unknown";
                  }
                  const uploader = lead.uploadedBy?.username;

                  return (
                    <div key={`mobile-card-${lead.id}`} className={`lead-mobile-card ${isLeadLocked ? "locked" : ""}`}>
                      {/* Header: Name + Handled By + Status */}
                      <div className="lead-mobile-card-header">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="lead-mobile-card-name" title={lead.name || undefined}>
                            {lead.name ? (Array.from(lead.name).length > 35 ? Array.from(lead.name).slice(0, 35).join('') + "..." : lead.name) : "Unnamed Lead"}
                          </div>
                          {lead.handledBy && (
                            <div style={{ marginTop: 4 }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "1px 7px",
                                  borderRadius: "10px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  background: isLeadLocked ? "rgba(239, 68, 68, 0.08)" : "rgba(37, 99, 235, 0.08)",
                                  color: isLeadLocked ? "#dc2626" : "#2563eb",
                                  border: `1px solid ${isLeadLocked ? "rgba(239, 68, 68, 0.2)" : "rgba(37, 99, 235, 0.2)"}`,
                                }}
                              >
                                {isLeadLocked ? (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}>
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                  </svg>
                                )}
                                {isLeadLocked ? `Locked: ${lead.handledBy}` : `Handled by ${lead.handledBy}`}
                              </span>
                            </div>
                          )}
                        </div>

                        <select
                          className={`status-select ${(lead.status === "not_contacted" || lead.status === "created") ? "status-not_contacted" :
                            lead.status === "pending" ? "status-pending" :
                              (lead.status === "live" || lead.status === "closed_successful") ? "status-live" :
                              lead.status === "callback" ? "status-callback" : "status-lost"
                            }`}
                          value={lead.status === 'created' ? 'not_contacted' : lead.status === 'closed_successful' ? 'live' : lead.status === 'closed_unsuccessful' ? 'lost' : lead.status}
                          onChange={(e) => handleStatusChange(lead, e.target.value)}
                          disabled={isLeadLocked}
                          style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "16px", cursor: isLeadLocked ? "not-allowed" : "pointer", flexShrink: 0 }}
                        >
                          <option value="not_contacted">Not Contacted</option>
                          <option value="pending">Contacted</option>
                          <option value="live">Completed</option>
                          <option value="lost">Lost</option>
                        </select>
                      </div>

                      {/* Meta Information Grid */}
                      <div className="lead-mobile-meta-grid">
                        <div className="lead-mobile-meta-item">
                          <span className="lead-mobile-meta-label">Phone</span>
                          <a
                            href={`tel:${lead.phone}`}
                            className="lead-mobile-meta-val"
                            style={{
                              color: (lead.phone || "").replace(/\D/g, '').length > 10 ? "#dc2626" : "var(--primary-dark)",
                              textDecoration: "none",
                              fontFamily: "monospace",
                              fontWeight: 600
                            }}
                          >
                            {lead.phone ? parsePhoneNumber(lead.phone) : "—"}
                          </a>
                        </div>

                        <div className="lead-mobile-meta-item">
                          <span className="lead-mobile-meta-label">City</span>
                          <span className="lead-mobile-meta-val" title={lead.city || undefined}>
                            {lead.city ? (Array.from(lead.city).length > 20 ? Array.from(lead.city).slice(0, 20).join('') + "..." : lead.city) : "—"}
                          </span>
                        </div>

                        <div className="lead-mobile-meta-item">
                          <span className="lead-mobile-meta-label">Branch</span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, overflow: "hidden" }}>
                            {lead.branch ? parseBranches(lead.branch).map((b, idx) => (
                              <span key={idx} style={{ background: "rgba(0,0,0,0.06)", padding: "1px 6px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {b}
                              </span>
                            )) : "—"}
                          </div>
                        </div>

                        <div className="lead-mobile-meta-item">
                          <span className="lead-mobile-meta-label">Source / Plat</span>
                          <span className="lead-mobile-meta-val" title={`${plat} ${uploader ? `(${uploader})` : ""}`}>
                            {plat} {uploader ? `(${uploader})` : ""}
                          </span>
                        </div>

                        {lead.adname && (
                          <div className="lead-mobile-meta-item" style={{ gridColumn: "span 2" }}>
                            <span className="lead-mobile-meta-label">Ad Name</span>
                            <span className="lead-mobile-meta-val" title={lead.adname}>{lead.adname}</span>
                          </div>
                        )}

                        <div className="lead-mobile-meta-item" style={{ gridColumn: "span 2" }}>
                          <span className="lead-mobile-meta-label">Created Date</span>
                          <span className="lead-mobile-meta-val" style={{ fontSize: "12px", color: "var(--text-secondary)" }} title={getFullDateTooltip(lead.createdAt)}>
                            {formatDate(lead.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Operational Inputs (Follow-ups, Test Drive, Assigned Consultant) */}
                      <div className="lead-mobile-controls-grid">
                        <div className="lead-mobile-control-item">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span className="lead-mobile-meta-label">{input1.label}</span>
                            {input1.exists && (
                              <button
                                type="button"
                                onClick={() => handleClearFollowUp(lead, input1.step)}
                                disabled={isLeadLocked}
                                title={`Clear ${input1.label}`}
                                style={{ border: "none", background: "transparent", color: "var(--text-secondary)", cursor: isLeadLocked ? "not-allowed" : "pointer", padding: "0 2px", fontSize: "14px", lineHeight: 1 }}
                              >
                                ×
                              </button>
                            )}
                          </div>
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
                            disabled={isLeadLocked}
                            className="status-select"
                            style={{ border: "1px solid var(--border)", background: "#fff", padding: "6px 8px", fontSize: "12px", width: "100%", borderRadius: 6 }}
                          />
                        </div>

                        <div className="lead-mobile-control-item">
                          <span className="lead-mobile-meta-label">{input2.label}</span>
                          <input
                            type="date"
                            value={input2.isoDate}
                            onChange={(e) => handleAddNewFollowUp(lead, input2.step, e.target.value)}
                            disabled={isLeadLocked}
                            className="status-select"
                            style={{ border: "1px solid var(--border)", background: "#fff", padding: "6px 8px", fontSize: "12px", width: "100%", borderRadius: 6 }}
                          />
                        </div>

                        <div className="lead-mobile-control-item">
                          <span className="lead-mobile-meta-label">Test Drive</span>
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
                            style={{ padding: "6px 8px", fontSize: "12px", width: "100%", borderRadius: 6, ...(isLeadLocked ? { opacity: 0.65, cursor: "not-allowed" } : {}) }}
                            value={
                              lead.testDrive === "Yes"
                                ? "Scheduled"
                                : lead.testDrive === "No"
                                ? "Not Scheduled"
                                : lead.testDrive || "Not Scheduled"
                            }
                            onChange={(e) => handleTestDriveUpdate(lead, e.target.value)}
                            disabled={isLeadLocked}
                          >
                            <option value="Not Scheduled">Not Scheduled</option>
                            <option value="Scheduled">Scheduled</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </div>

                        <div className="lead-mobile-control-item">
                          <span className="lead-mobile-meta-label">Assigned To</span>
                          <select
                            className="status-select"
                            style={{ padding: "6px 8px", fontSize: "12px", width: "100%", borderRadius: 6, ...(isLeadLocked ? { opacity: 0.65, cursor: "not-allowed" } : {}) }}
                            value={lead.assignedConsultant || ""}
                            onChange={(e) => handleAssignedConsultantUpdate(lead, e.target.value)}
                            disabled={isLeadLocked}
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

                      {/* Remark Callout */}
                      {lead.remark && (
                        <div className="lead-mobile-remark" title={lead.remark}>
                          "{lead.remark}"
                        </div>
                      )}

                      {/* Card Actions */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 2 }}>
                        <button
                          className="btn btn-ghost"
                          onClick={() => {
                            if (isLeadLocked) {
                              showToast(`This lead is currently handled by "${lead.handledBy}". You cannot modify this lead unless "${lead.handledBy}" changes its status back to Not Contacted.`, "error");
                              return;
                            }
                            openRemarkModal(lead);
                          }}
                          disabled={isLeadLocked}
                          style={{ flex: 1, padding: "8px 12px", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, borderColor: "var(--border)" }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          {lead.remark ? "Edit Remark" : "Add Remark"}
                        </button>

                        {isSuperAdmin && (
                          <button
                            className="btn btn-ghost"
                            style={{ color: "#ef4444", padding: "8px 12px", borderRadius: 8, borderColor: "rgba(239, 68, 68, 0.2)", background: "rgba(239, 68, 68, 0.05)" }}
                            onClick={() => openDeleteModal(lead)}
                            title="Delete lead (Superadmin only)"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
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
              {remarkModal.uploadedBy?.username && (
                <span style={{ display: "block", fontSize: 12, color: "#2563eb", marginTop: 4 }}>
                  👤 Uploaded by: <strong>{remarkModal.uploadedBy.username}</strong>
                  {remarkModal.uploadedAt && ` (${new Date(remarkModal.uploadedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })})`}
                </span>
              )}
              {(remarkModal.status === "not_contacted" || remarkModal.status === "created") && <><br /><small style={{ color: "var(--status-created)" }}>Adding a remark will automatically change status to Contacted</small></>}
            </p>
            <textarea
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
              placeholder="Enter your remark..."
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setRemarkModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddRemark} disabled={remarkLoading}>
                {remarkLoading ? <><span className="spinner" /> Saving...</> : "Save Remark"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal (Superadmin only) */}
      {deleteModal && isSuperAdmin && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: "#ef4444" }}>
              Delete Lead Permanently
            </h2>
            <p>
              Are you sure you want to permanently delete lead for <strong>{deleteModal.name}</strong> ({parsePhoneNumber(deleteModal.phone)})?
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

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: "#ef4444", borderColor: "#ef4444" }}
                onClick={handleDeleteLead}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <><span className="spinner" /> Deleting...</>
                ) : (
                  "Confirm Delete"
                )}
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

      {/* External Upload Modal */}
      <ExternalUploadModal
        isOpen={externalSyncModalOpen}
        onClose={() => setExternalSyncModalOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          fetchLeads(true);
        }}
      />


      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}
