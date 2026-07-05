import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Github,
  Info,
  Layers,
  LayoutDashboard,
  ListChecks,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  WalletCards
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { apiDelete, apiGet, apiPost, apiPut, uploadExcel } from "./api.js";
import { money, percent, profitTone, shortDate } from "./format.js";

const blankForm = {
  id: "",
  ledgerId: "",
  date: "",
  match: "",
  pick: "",
  stake: "",
  returnAmount: "",
  score: "",
  note: "",
  status: "未结算"
};

const statusOptions = ["全部", "命中", "亏损", "走水", "未结算"];
const trendGranularityOptions = [
  { value: "day", label: "日", prefix: "每日", countLabel: "记账日" },
  { value: "week", label: "周", prefix: "每周", countLabel: "记账周" },
  { value: "month", label: "月", prefix: "每月", countLabel: "记账月" },
  { value: "year", label: "年", prefix: "每年", countLabel: "记账年" }
];
const trendVisibleCounts = {
  day: 60,
  week: 16,
  month: 12,
  year: 12
};
const trendDayVisibleCountKey = "lottery-ledger-trend-day-visible-count";
const minTrendDayVisibleCount = 7;
const maxTrendDayVisibleCount = 60;
const profitColorModeKey = "lottery-ledger-profit-color-mode";
const animationModeKey = "lottery-ledger-animation-mode";
const recordsPageSizeKey = "lottery-ledger-records-page-size";
const themeColorKey = "lottery-ledger-theme-color";
const recordPageSizeOptions = [
  { value: "20", label: "20条" },
  { value: "40", label: "40条" },
  { value: "60", label: "60条" },
  { value: "80", label: "80条" },
  { value: "100", label: "100条" },
  { value: "all", label: "无限制" }
];
const themeOptions = [
  { value: "blue", label: "蓝色", swatch: "#2563eb" },
  { value: "pink", label: "粉色", swatch: "#ec4899" },
  { value: "gray", label: "深灰色", swatch: "#3f4652" },
  { value: "purple", label: "紫色", swatch: "#7c3aed" }
];
const settingsSections = [
  { value: "general", label: "通用", icon: SlidersHorizontal },
  { value: "appearance", label: "外观", icon: Palette },
  { value: "about", label: "关于", icon: Info }
];

export default function App() {
  const [ledgers, setLedgers] = useState([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState("all");
  const [activeSection, setActiveSection] = useState("overview");
  const [newLedgerName, setNewLedgerName] = useState("");
  const [importLedgerId, setImportLedgerId] = useState("");
  const [importLedgerName, setImportLedgerName] = useState("");
  const [importMode, setImportMode] = useState("replace");
  const [ledgerMenu, setLedgerMenu] = useState(null);
  const [renameLedgerTarget, setRenameLedgerTarget] = useState(null);
  const [renameLedgerName, setRenameLedgerName] = useState("");
  const [deleteLedgerTarget, setDeleteLedgerTarget] = useState(null);
  const [deleteLedgerConfirmName, setDeleteLedgerConfirmName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState("general");
  const [profitColorMode, setProfitColorMode] = useState(() => loadProfitColorMode());
  const [animationsEnabled, setAnimationsEnabled] = useState(() => loadAnimationPreference());
  const [recordsPageSize, setRecordsPageSize] = useState(() => loadRecordsPageSize());
  const [themeColor, setThemeColor] = useState(() => loadThemeColor());
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPageInput, setRecordsPageInput] = useState("1");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => getPrefersReducedMotion());
  const [dayTrendVisibleCount, setDayTrendVisibleCount] = useState(() => loadDayTrendVisibleCount());
  const [trendGranularity, setTrendGranularity] = useState("day");
  const [trendWindow, setTrendWindow] = useState({ startIndex: 0, endIndex: 0 });
  const [isTrendPanning, setIsTrendPanning] = useState(false);
  const [bets, setBets] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [filters, setFilters] = useState({ q: "", status: "全部", from: "", to: "" });
  const [form, setForm] = useState(() => ({ ...blankForm, date: today() }));
  const [selectedId, setSelectedId] = useState(null);
  const [noteTooltip, setNoteTooltip] = useState(null);
  const [pendingBetFocus, setPendingBetFocus] = useState(null);
  const [highlightedBet, setHighlightedBet] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);
  const noteTooltipTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const trendPanRef = useRef({ dragging: false, startX: 0, startWindow: { startIndex: 0, endIndex: 0 }, pixelsPerStep: 20, dragDirection: 1, wheelRemainder: 0 });
  const modalOpen = Boolean(settingsOpen || renameLedgerTarget || deleteLedgerTarget);
  const isRecordsUnlimited = recordsPageSize === "all";
  const numericRecordsPageSize = isRecordsUnlimited ? 0 : Number(recordsPageSize);
  const totalRecordPages = isRecordsUnlimited || !numericRecordsPageSize ? 1 : Math.max(1, Math.ceil(bets.length / numericRecordsPageSize));
  const safeRecordsPage = isRecordsUnlimited ? 1 : Math.min(Math.max(1, recordsPage), totalRecordPages);

  useEffect(() => {
    loadLedgers();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(profitColorModeKey, profitColorMode);
    } catch {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
  }, [profitColorMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(animationModeKey, animationsEnabled ? "on" : "off");
    } catch {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
    document.documentElement.dataset.appMotion = animationsEnabled ? "on" : "off";
  }, [animationsEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(recordsPageSizeKey, recordsPageSize);
    } catch {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
  }, [recordsPageSize]);

  useEffect(() => {
    try {
      window.localStorage.setItem(trendDayVisibleCountKey, String(dayTrendVisibleCount));
    } catch {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
  }, [dayTrendVisibleCount]);

  useEffect(() => {
    try {
      window.localStorage.setItem(themeColorKey, themeColor);
    } catch {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
    document.documentElement.dataset.appTheme = themeColor;
  }, [themeColor]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!modalOpen || typeof document === "undefined") return undefined;

    const { left, overflow, paddingRight, position, right, top, width } = document.body.style;
    const lockedScrollX = window.scrollX;
    const lockedScrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const preventBackgroundWheel = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const scrollable = target?.closest(".settings-main");
      if (!scrollable) {
        event.preventDefault();
        return;
      }

      const atTop = scrollable.scrollTop <= 0;
      const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
        event.preventDefault();
      }
    };

    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.left = `-${lockedScrollX}px`;
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    window.addEventListener("wheel", preventBackgroundWheel, { capture: true, passive: false });

    return () => {
      window.removeEventListener("wheel", preventBackgroundWheel, true);
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.left = left;
      document.body.style.right = right;
      document.body.style.width = width;
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      window.scrollTo(lockedScrollX, lockedScrollY);
    };
  }, [modalOpen]);

  useEffect(() => {
    const closeMenu = () => {
      setLedgerMenu(null);
      hideNoteTooltip();
    };
    const closeOnKey = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", closeOnKey);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", closeOnKey);
    };
  }, []);

  useEffect(() => {
    const sectionIds = ["overview", "ledger", "entry"];
    const updateActiveSection = () => {
      let current = "overview";
      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= 170) current = id;
      }
      setActiveSection(current);
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("hashchange", updateActiveSection);
    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("hashchange", updateActiveSection);
    };
  }, []);

  useEffect(() => {
    loadData(selectedLedgerId, filters);
  }, [selectedLedgerId, filters.q, filters.status, filters.from, filters.to]);

  useEffect(() => {
    setRecordsPage(1);
  }, [selectedLedgerId, filters.q, filters.status, filters.from, filters.to, recordsPageSize]);

  useEffect(() => {
    setRecordsPageInput(String(safeRecordsPage));
  }, [safeRecordsPage]);

  useEffect(() => {
    if (!pendingBetFocus) return;

    if (!isRecordsUnlimited && numericRecordsPageSize) {
      const targetIndex = bets.findIndex((bet) => bet.id === pendingBetFocus.id);
      const targetPage = targetIndex >= 0 ? Math.floor(targetIndex / numericRecordsPageSize) + 1 : 1;
      if (targetPage !== safeRecordsPage) {
        setRecordsPage(targetPage);
        return;
      }
    }

    const row = document.querySelector(`[data-bet-row-id="${pendingBetFocus.id}"]`);
    if (!row) return;

    hideNoteTooltip();
    setActiveSection("ledger");
    window.requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: getScrollBehavior(), block: "center", inline: "nearest" });
      pushHash("ledger");
      setHighlightedBet(pendingBetFocus);
      setPendingBetFocus(null);
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedBet((current) => (current?.token === pendingBetFocus.token ? null : current));
      }, 1800);
    });
  }, [bets, pendingBetFocus, animationsEnabled, isRecordsUnlimited, numericRecordsPageSize, safeRecordsPage]);

  useEffect(() => {
    return () => {
      window.clearTimeout(noteTooltipTimerRef.current);
      window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const selectedLedger = useMemo(
    () => (selectedLedgerId === "all" ? null : ledgers.find((ledger) => String(ledger.id) === String(selectedLedgerId))),
    [ledgers, selectedLedgerId]
  );
  const allLedgerStats = useMemo(
    () =>
      ledgers.reduce(
        (acc, ledger) => ({
          count: acc.count + ledger.count,
          totalStake: acc.totalStake + ledger.totalStake,
          totalProfit: acc.totalProfit + ledger.totalProfit
        }),
        { count: 0, totalStake: 0, totalProfit: 0 }
      ),
    [ledgers]
  );
  const defaultLedgerId = ledgers[0] ? String(ledgers[0].id) : "";
  const activeLedgerName = selectedLedger?.name || "全部账本";
  const projectedProfit = hasFilledAmount(form.returnAmount) ? Number(form.returnAmount || 0) - Number(form.stake || 0) : 0;
  const projectedStatus = computeBetStatus(form.stake, form.returnAmount);
  const summary = analytics?.summary || {};
  const daily = analytics?.daily || [];
  const trendData = useMemo(() => aggregateTrendData(daily, trendGranularity), [daily, trendGranularity]);
  const trendOption = trendGranularityOptions.find((option) => option.value === trendGranularity) || trendGranularityOptions[0];
  const trendGranularityIndex = Math.max(0, trendGranularityOptions.findIndex((option) => option.value === trendGranularity));
  const trendVisibleCount = trendGranularity === "day" ? dayTrendVisibleCount : trendVisibleCounts[trendGranularity] || trendVisibleCounts.week;
  const hasTrendWindow = trendData.length > trendVisibleCount;
  const visibleTrendData = useMemo(() => {
    if (!hasTrendWindow) return trendData;
    return trendData.slice(trendWindow.startIndex, trendWindow.endIndex + 1);
  }, [hasTrendWindow, trendData, trendWindow.startIndex, trendWindow.endIndex]);
  const trendRangeStyle = useMemo(() => {
    if (!hasTrendWindow || trendData.length <= 1) {
      return { "--range-left": "0%", "--range-right": "0%" };
    }
    const maxIndex = Math.max(1, trendData.length - 1);
    const start = Math.max(0, Math.min(maxIndex, trendWindow.startIndex));
    const end = Math.max(start, Math.min(maxIndex, trendWindow.endIndex));
    return {
      "--range-left": `${(start / maxIndex) * 100}%`,
      "--range-right": `${((maxIndex - end) / maxIndex) * 100}%`
    };
  }, [hasTrendWindow, trendData.length, trendWindow.startIndex, trendWindow.endIndex]);
  const trendRangeLabel = hasTrendWindow
    ? `${trendData[trendWindow.startIndex]?.periodLabel || ""} - ${trendData[trendWindow.endIndex]?.periodLabel || ""}`
    : "";
  const navActiveIndex = Math.max(0, ["overview", "ledger", "entry"].indexOf(activeSection));
  const statusActiveIndex = Math.max(0, statusOptions.indexOf(filters.status));
  const importModeIndex = importMode === "append" ? 1 : 0;
  const exportHref = useMemo(() => buildExportHref(filters, selectedLedgerId), [filters, selectedLedgerId]);
  const isProfitColorInverted = profitColorMode === "inverted";
  const activeThemeOption = themeOptions.find((option) => option.value === themeColor) || themeOptions[0];
  const activeSettingsSection = settingsSections.find((section) => section.value === settingsSection) || settingsSections[0];
  const motionMode = animationsEnabled ? "on" : "off";
  const chartAnimationActive = animationsEnabled && !prefersReducedMotion;
  const chartAnimationProps = {
    isAnimationActive: chartAnimationActive,
    animationBegin: 20,
    animationDuration: 560,
    animationEasing: "ease-in-out"
  };
  const visibleBets = useMemo(() => {
    if (isRecordsUnlimited || !numericRecordsPageSize) return bets;
    const start = (safeRecordsPage - 1) * numericRecordsPageSize;
    return bets.slice(start, start + numericRecordsPageSize);
  }, [bets, isRecordsUnlimited, numericRecordsPageSize, safeRecordsPage]);
  const paginationItems = useMemo(() => paginationRange(safeRecordsPage, totalRecordPages), [safeRecordsPage, totalRecordPages]);
  const placeholderRowCount =
    !isRecordsUnlimited && numericRecordsPageSize && visibleBets.length
      ? Math.max(0, numericRecordsPageSize - visibleBets.length)
      : 0;
  const visibleRecordStart = bets.length ? (safeRecordsPage - 1) * numericRecordsPageSize + 1 : 0;
  const visibleRecordEnd = isRecordsUnlimited ? bets.length : Math.min(bets.length, safeRecordsPage * numericRecordsPageSize);

  useEffect(() => {
    const endIndex = Math.max(0, trendData.length - 1);
    const startIndex = Math.max(0, trendData.length - trendVisibleCount);
    setTrendWindow({ startIndex, endIndex });
    trendPanRef.current.wheelRemainder = 0;
  }, [trendData.length, trendVisibleCount, trendGranularity, selectedLedgerId]);

  async function loadLedgers() {
    try {
      const payload = await apiGet("/api/ledgers");
      setLedgers(payload.ledgers);
      const firstLedgerId = payload.ledgers[0] ? String(payload.ledgers[0].id) : "";
      setImportLedgerId((next) =>
        next === "new" || payload.ledgers.some((ledger) => String(ledger.id) === String(next)) ? next : firstLedgerId || "new"
      );
      setForm((next) => (next.ledgerId ? next : { ...next, ledgerId: firstLedgerId }));
      return payload.ledgers;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }

  async function loadData(ledgerId = selectedLedgerId, activeFilters = filters) {
    try {
      setError("");
      const params = buildQuery(activeFilters, ledgerId);
      const analyticsParams = buildQuery({ q: "", status: "全部", from: "", to: "" }, ledgerId);
      const [betsPayload, analyticsPayload] = await Promise.all([
        apiGet("/api/bets", params),
        apiGet("/api/analytics", analyticsParams)
      ]);
      setBets(betsPayload.bets);
      setAnalytics(analyticsPayload);
    } catch (err) {
      setError(err.message);
    }
  }

  function chooseLedger(ledgerId) {
    const nextLedgerId = String(ledgerId);
    setSelectedLedgerId(nextLedgerId);
    setSelectedId(null);
    const entryLedgerId = nextLedgerId === "all" ? defaultLedgerId : nextLedgerId;
    setForm((next) => ({ ...blankForm, date: today(), ledgerId: entryLedgerId }));
    if (entryLedgerId) setImportLedgerId(entryLedgerId);
  }

  function toggleProfitColorMode() {
    setProfitColorMode((next) => (next === "inverted" ? "normal" : "inverted"));
  }

  function toggleAnimations() {
    setAnimationsEnabled((next) => !next);
  }

  function changeRecordsPageSize(value) {
    setRecordsPageSize(value);
    setRecordsPage(1);
  }

  function changeDayTrendVisibleCount(value) {
    setDayTrendVisibleCount(clampDayTrendVisibleCount(value));
  }

  function goToRecordsPage(page) {
    setRecordsPage(Math.max(1, Math.min(totalRecordPages, page)));
  }

  function jumpToRecordsPage(event) {
    event.preventDefault();
    const target = Number(recordsPageInput);
    if (!Number.isFinite(target)) {
      setRecordsPageInput(String(safeRecordsPage));
      return;
    }

    const nextPage = Math.max(1, Math.min(totalRecordPages, Math.round(target)));
    setRecordsPageInput(String(nextPage));
    goToRecordsPage(nextPage);
  }

  function clampTrendWindow(startIndex, windowSize = Math.min(trendVisibleCount, trendData.length)) {
    const safeSize = Math.max(1, windowSize);
    const maxStart = Math.max(0, trendData.length - safeSize);
    const start = Math.max(0, Math.min(maxStart, Math.round(startIndex)));
    return {
      startIndex: start,
      endIndex: Math.min(Math.max(0, trendData.length - 1), start + safeSize - 1)
    };
  }

  function shiftTrendWindow(delta) {
    if (!hasTrendWindow || !delta) return;
    setTrendWindow((current) => {
      const windowSize = Math.min(trendVisibleCount, trendData.length);
      return clampTrendWindow(current.startIndex + delta, windowSize);
    });
  }

  function handleTrendWheel(event) {
    if (!hasTrendWindow) return;
    const wheelDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (!wheelDelta) return;

    event.preventDefault();
    const pan = trendPanRef.current;
    pan.wheelRemainder += wheelDelta;
    const stepPixels = 34;
    const steps = Math.trunc(pan.wheelRemainder / stepPixels);
    if (!steps) return;
    pan.wheelRemainder -= steps * stepPixels;
    shiftTrendWindow(steps);
  }

  function handleTrendPointerDown(event) {
    if (!hasTrendWindow || event.button !== 0 || event.target.closest?.(".recharts-brush")) return;
    const width = event.currentTarget.getBoundingClientRect().width || 1;
    const isRangeDrag = event.currentTarget.classList.contains("trend-range");
    const stepCount = isRangeDrag ? Math.max(1, trendData.length - 1) : Math.max(1, trendVisibleCount);
    trendPanRef.current = {
      ...trendPanRef.current,
      dragging: true,
      startX: event.clientX,
      startWindow: trendWindow,
      pixelsPerStep: isRangeDrag ? width / stepCount : Math.max(8, width / stepCount),
      dragDirection: isRangeDrag ? -1 : 1
    };
    setIsTrendPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleTrendPointerMove(event) {
    const pan = trendPanRef.current;
    if (!pan.dragging || !hasTrendWindow) return;
    event.preventDefault();
    const delta = Math.round(((pan.startX - event.clientX) / pan.pixelsPerStep) * pan.dragDirection);
    const windowSize = pan.startWindow.endIndex - pan.startWindow.startIndex + 1 || Math.min(trendVisibleCount, trendData.length);
    setTrendWindow(clampTrendWindow(pan.startWindow.startIndex + delta, windowSize));
  }

  function stopTrendPointerPan(event) {
    if (!trendPanRef.current.dragging) return;
    trendPanRef.current.dragging = false;
    setIsTrendPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function openLedgerMenu(ledger, event) {
    event.preventDefault();
    event.stopPropagation();
    setLedgerMenu({
      ledger,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 120)
    });
  }

  async function createNewLedger(event) {
    event.preventDefault();
    const name = newLedgerName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const payload = await apiPost("/api/ledgers", { name });
      const ledgerId = String(payload.ledger.id);
      setNewLedgerName("");
      setSelectedLedgerId(ledgerId);
      setImportLedgerId(ledgerId);
      setForm((next) => ({ ...blankForm, date: today(), ledgerId }));
      await loadLedgers();
      await loadData(ledgerId, filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function editBet(bet) {
    hideNoteTooltip();
    setSelectedId(bet.id);
    setForm({
      id: bet.id,
      ledgerId: String(bet.ledgerId || defaultLedgerId),
      date: bet.date,
      match: bet.match,
      pick: bet.pick,
      stake: bet.stake,
      returnAmount: bet.status === "未结算" && Number(bet.returnAmount || 0) === 0 ? "" : bet.returnAmount,
      score: bet.score,
      note: bet.note,
      status: bet.status
    });
  }

  function resetForm(ledgerId = selectedLedgerId === "all" ? defaultLedgerId : selectedLedgerId) {
    setSelectedId(null);
    setForm({ ...blankForm, date: today(), ledgerId: String(ledgerId || defaultLedgerId) });
  }

  function scheduleBetTooltip(bet, event) {
    const payload = betTooltipPayload(bet, event);
    window.clearTimeout(noteTooltipTimerRef.current);
    if (!payload) {
      setNoteTooltip(null);
      return;
    }

    const position = noteTooltipPosition(event);
    noteTooltipTimerRef.current = window.setTimeout(() => {
      setNoteTooltip({ id: bet.id, ...payload, ...position });
    }, 450);
  }

  function scheduleLedgerNameTooltip(ledger, event) {
    const payload = ledgerNameTooltipPayload(ledger, event);
    window.clearTimeout(noteTooltipTimerRef.current);
    if (!payload) {
      setNoteTooltip(null);
      return;
    }

    const position = noteTooltipPosition(event);
    noteTooltipTimerRef.current = window.setTimeout(() => {
      setNoteTooltip({ id: `ledger-${ledger.id}`, ...payload, ...position });
    }, 450);
  }

  function moveLedgerNameTooltip(ledger, event) {
    const payload = ledgerNameTooltipPayload(ledger, event);
    const tooltipId = `ledger-${ledger.id}`;
    if (noteTooltip?.id === tooltipId) {
      if (!payload) {
        setNoteTooltip(null);
        return;
      }
      setNoteTooltip({ id: tooltipId, ...payload, ...noteTooltipPosition(event) });
      return;
    }

    scheduleLedgerNameTooltip(ledger, event);
  }

  function moveBetTooltip(bet, event) {
    const payload = betTooltipPayload(bet, event);
    if (noteTooltip?.id === bet.id) {
      if (!payload) {
        setNoteTooltip(null);
        return;
      }
      setNoteTooltip({ id: bet.id, ...payload, ...noteTooltipPosition(event) });
      return;
    }

    scheduleBetTooltip(bet, event);
  }

  function hideNoteTooltip() {
    window.clearTimeout(noteTooltipTimerRef.current);
    noteTooltipTimerRef.current = null;
    setNoteTooltip(null);
  }

  function noteTooltipPosition(event) {
    const width = 280;
    const gap = 14;
    const x = Math.max(12, Math.min(event.clientX + gap, window.innerWidth - width - 12));
    const y = Math.max(12, Math.min(event.clientY + gap, window.innerHeight - 120));
    return { x, y };
  }

  function betTooltipPayload(bet, event) {
    const target = event.target.closest?.("[data-tooltip-title][data-tooltip-value]");
    if (target && event.currentTarget.contains(target)) {
      const content = String(target.dataset.tooltipValue || "").trim();
      if (!content) return null;
      return {
        title: target.dataset.tooltipTitle || "完整信息",
        content
      };
    }

    const note = String(bet.note || "").trim();
    if (!note) return null;
    return {
      title: "备注",
      content: note
    };
  }

  function ledgerNameTooltipPayload(ledger, event) {
    const target = event.currentTarget;
    const content = String(ledger?.name || "").trim();
    if (!content || target.scrollWidth <= target.clientWidth + 1) return null;
    return {
      title: "账本完整名称",
      content
    };
  }

  function goToNewBet(event) {
    event?.preventDefault();
    resetForm();
    setActiveSection("entry");
    window.requestAnimationFrame(() => {
      document.getElementById("entry")?.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
      pushHash("entry");
    });
  }

  function showStatusInLedger(status) {
    hideNoteTooltip();
    setFilters((next) => ({ ...next, status }));
    setActiveSection("ledger");
    window.requestAnimationFrame(() => {
      document.getElementById("ledger")?.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
      pushHash("ledger");
    });
  }

  function focusBetInLedger(bet) {
    if (!bet?.id) return;
    hideNoteTooltip();
    setHighlightedBet(null);
    setPendingBetFocus({ id: bet.id, token: Date.now() });
    setFilters((next) => ({ ...next, status: "全部" }));
    setActiveSection("ledger");
    window.requestAnimationFrame(() => {
      document.getElementById("ledger")?.scrollIntoView({ behavior: getScrollBehavior(), block: "start" });
      pushHash("ledger");
    });
  }

  function getScrollBehavior() {
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    return animationsEnabled && !prefersReducedMotion ? "smooth" : "auto";
  }

  function pushHash(id) {
    if (window.location.hash !== `#${id}`) {
      window.history.pushState(null, "", `#${id}`);
    }
  }

  async function saveBet(event) {
    event.preventDefault();
    if (!form.ledgerId) {
      setError("请先选择账本");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        ledgerId: Number(form.ledgerId),
        stake: Number(form.stake || 0),
        returnAmount: hasFilledAmount(form.returnAmount) ? Number(form.returnAmount) : "",
        status: projectedStatus
      };
      if (form.id) {
        await apiPut(`/api/bets/${form.id}`, payload);
      } else {
        await apiPost("/api/bets", payload);
      }
      resetForm(form.ledgerId);
      await Promise.all([loadLedgers(), loadData(selectedLedgerId, filters)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selectedId) return;
    if (!window.confirm("删除这条投注记录？")) return;
    setBusy(true);
    try {
      await apiDelete(`/api/bets/${selectedId}`);
      resetForm();
      await Promise.all([loadLedgers(), loadData(selectedLedgerId, filters)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openRenameLedger(ledger) {
    setLedgerMenu(null);
    setRenameLedgerTarget(ledger);
    setRenameLedgerName(ledger.name);
  }

  async function confirmRenameLedger() {
    if (!renameLedgerTarget) return;
    const name = renameLedgerName.trim();
    if (!name || name === renameLedgerTarget.name) {
      setRenameLedgerTarget(null);
      setRenameLedgerName("");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = await apiPut(`/api/ledgers/${renameLedgerTarget.id}`, { name });
      setLedgers((next) => next.map((ledger) => (ledger.id === payload.ledger.id ? { ...ledger, ...payload.ledger } : ledger)));
      setRenameLedgerTarget(null);
      setRenameLedgerName("");
      await Promise.all([loadLedgers(), loadData(selectedLedgerId, filters)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openDeleteLedger(ledger) {
    setLedgerMenu(null);
    setDeleteLedgerTarget(ledger);
    setDeleteLedgerConfirmName("");
  }

  async function confirmDeleteLedger() {
    if (!deleteLedgerTarget) return;
    if (deleteLedgerConfirmName.trim() !== deleteLedgerTarget.name) return;
    setBusy(true);
    setError("");
    try {
      await apiDelete(`/api/ledgers/${deleteLedgerTarget.id}?confirmName=${encodeURIComponent(deleteLedgerConfirmName.trim())}`);
      const remainingLedgers = ledgers.filter((item) => item.id !== deleteLedgerTarget.id);
      const nextImportLedgerId = remainingLedgers[0] ? String(remainingLedgers[0].id) : "new";
      setSelectedLedgerId("all");
      setImportLedgerId(nextImportLedgerId);
      setSelectedId(null);
      setForm({ ...blankForm, date: today(), ledgerId: remainingLedgers[0] ? String(remainingLedgers[0].id) : "" });
      setDeleteLedgerTarget(null);
      setDeleteLedgerConfirmName("");
      await loadLedgers();
      await loadData("all", filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const ledgerName = importLedgerId === "new" ? importLedgerName.trim() : "";
    const ledger = ledgers.find((item) => String(item.id) === String(importLedgerId));
    const targetName = ledgerName || ledger?.name;
    if (!targetName) {
      setError("请选择导入目标账本");
      return;
    }

    const actionText = importMode === "append" ? "追加到" : "覆盖";
    if (!window.confirm(`确认将 ${file.name} ${actionText}「${targetName}」账本？`)) return;

    setBusy(true);
    setError("");
    try {
      const result = await uploadExcel(file, {
        mode: importMode,
        ledgerId: ledgerName ? undefined : importLedgerId,
        ledgerName
      });
      const importedLedgerId = String(result.ledger.id);
      setImportLedgerName("");
      setImportLedgerId(importedLedgerId);
      setSelectedLedgerId(importedLedgerId);
      setForm((next) => ({ ...next, ledgerId: importedLedgerId }));
      await loadLedgers();
      await loadData(importedLedgerId, filters);
      setError(`已导入 ${result.imported} 条记录到「${result.ledger.name}」`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell" data-profit-colors={profitColorMode} data-motion={motionMode} data-theme={themeColor}>
      <aside className="sidebar">
        <div className="brand">
          <TrophyMark />
          <div>
            <strong>体彩投注账本</strong>
            <span>lottery-ledger</span>
          </div>
        </div>

        <nav className="nav" style={{ "--nav-indicator-y": `${navActiveIndex * 42}px` }}>
          <a className={`nav-item ${activeSection === "overview" ? "active" : ""}`} href="#overview" onClick={() => setActiveSection("overview")}><LayoutDashboard size={18} />总览</a>
          <a className={`nav-item ${activeSection === "ledger" ? "active" : ""}`} href="#ledger" onClick={() => setActiveSection("ledger")}><ListChecks size={18} />投注记录</a>
          <a className={`nav-item ${activeSection === "entry" ? "active" : ""}`} href="#entry" onClick={goToNewBet}><Plus size={18} />新增投注</a>
        </nav>

        <section className="ledger-switcher" aria-label="账本切换">
          <div className="side-heading">账本</div>
          <button type="button" className={`ledger-tab ${selectedLedgerId === "all" ? "active" : ""}`} onClick={() => chooseLedger("all")}>
            <span className="ledger-label"><Layers size={16} /><span className="ledger-name">全部账本</span></span>
            <em>{allLedgerStats.count} 单</em>
          </button>
          {ledgers.map((ledger) => (
            <div className={`ledger-row ${String(ledger.id) === String(selectedLedgerId) ? "active" : ""}`} key={ledger.id}>
              <button
                type="button"
                className="ledger-tab"
                data-testid={`ledger-row-${ledger.id}`}
                onClick={() => chooseLedger(ledger.id)}
                onContextMenu={(event) => openLedgerMenu(ledger, event)}
              >
                <span className="ledger-label">
                  <FileSpreadsheet size={16} />
                  <span
                    className="ledger-name"
                    onMouseEnter={(event) => scheduleLedgerNameTooltip(ledger, event)}
                    onMouseMove={(event) => moveLedgerNameTooltip(ledger, event)}
                    onMouseLeave={hideNoteTooltip}
                  >
                    {ledger.name}
                  </span>
                </span>
                <em className={profitTone(ledger.totalProfit)}>{money(ledger.totalProfit)}</em>
              </button>
            </div>
          ))}
          <form className="new-ledger" onSubmit={createNewLedger}>
            <input
              value={newLedgerName}
              onChange={(event) => setNewLedgerName(event.target.value)}
              placeholder="新账本名称"
              maxLength="40"
            />
            <button type="submit" title="新建账本" disabled={busy || !newLedgerName.trim()}><Plus size={16} /></button>
          </form>
        </section>

        <div className="sidebar-foot">
          <div>
            <span>数据存储</span>
            <strong>SQLite 持久化</strong>
          </div>
          <div className="sidebar-foot-meta">
            <div className="sidebar-foot-actions">
              <button
                type="button"
                className="foot-icon-button"
                onClick={() => {
                  setSettingsSection("general");
                  setSettingsOpen(true);
                }}
                aria-label="打开设置"
                title="设置"
              >
                <Settings size={18} />
              </button>
              <a
                className="foot-icon-button"
                href="https://github.com/zolegi"
                target="_blank"
                rel="noreferrer"
                aria-label="打开 GitHub 个人主页"
                title="GitHub 个人主页"
              >
                <Github size={18} />
              </a>
            </div>
            <span className="app-version">版本 1.0</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="page-title">
            <p className="overline">Sports Lottery Ledger</p>
            <h1>体彩投注账本</h1>
            <span>{selectedLedgerId === "all" ? "查看全部账本的投入、结余与回报率" : `当前账本：${activeLedgerName}`}</span>
          </div>
          <div className="top-actions">
            <div className="import-controls">
              <select value={importLedgerId} onChange={(event) => setImportLedgerId(event.target.value)} aria-label="导入目标账本">
                {ledgers.map((ledger) => <option value={ledger.id} key={ledger.id}>{ledger.name}</option>)}
                <option value="new">新建账本...</option>
              </select>
              {importLedgerId === "new" ? (
                <input
                  value={importLedgerName}
                  onChange={(event) => setImportLedgerName(event.target.value)}
                  placeholder="导入为新账本"
                  maxLength="40"
                />
              ) : null}
              <div className="segmented small" style={{ "--segment-count": 2, "--segment-offset": `${importModeIndex * 100}%` }}>
                <button type="button" title="覆盖：先清空目标账本，再导入文件里的记录" className={importMode === "replace" ? "selected" : ""} onClick={() => setImportMode("replace")}>覆盖</button>
                <button type="button" title="追加：保留目标账本已有记录，把文件里的记录加进去" className={importMode === "append" ? "selected" : ""} onClick={() => setImportMode("append")}>追加</button>
              </div>
            </div>
            <input ref={fileInputRef} className="hidden-input" type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
            <button className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <Upload size={16} />导入
            </button>
            <a className="primary-button" href={exportHref}>
              <Download size={16} />导出
            </a>
          </div>
        </header>

        {error ? <div className={error.startsWith("已导入") ? "notice success" : "notice"}>{error}</div> : null}

        <section id="overview" className="kpi-grid">
          <KpiCard icon={<WalletCards size={19} />} label="总投入" value={money(summary.totalStake)} />
          <KpiCard icon={<FileSpreadsheet size={19} />} label="总返还" value={money(summary.totalReturn)} />
          <KpiCard icon={<TrendingUp size={19} />} label="累计盈亏" value={money(summary.totalProfit)} tone={profitTone(summary.totalProfit)} />
          <KpiCard icon={<Target size={19} />} label="当前结余" value={money(summary.currentBalance)} tone={profitTone(summary.currentBalance)} />
          <KpiCard icon={<ListChecks size={19} />} label="回报率" value={percent(summary.roi)} />
          <KpiCard icon={<TrendingUp size={19} />} label="利润率" value={percent(summary.profitRate)} tone={profitTone(summary.profitRate)} />
        </section>

        <section className="dashboard-grid">
          <div className="panel chart-panel">
            <div className="panel-title">
              <div>
                <span>趋势</span>
                <h2>{trendOption.prefix}利润、累计结余、投入与回报率</h2>
              </div>
              <div className="legend-note">{trendData.length} 个{trendOption.countLabel}</div>
            </div>
            <div
              className={["chart-wrap", hasTrendWindow ? "pannable" : "", isTrendPanning ? "is-panning" : ""].filter(Boolean).join(" ")}
              data-testid="trend-chart-wrap"
              data-trend-start={trendWindow.startIndex}
              data-trend-end={trendWindow.endIndex}
              data-trend-total={trendData.length}
              onWheel={handleTrendWheel}
              onPointerDown={handleTrendPointerDown}
              onPointerMove={handleTrendPointerMove}
              onPointerUp={stopTrendPointerPan}
              onPointerCancel={stopTrendPointerPan}
              onPointerLeave={stopTrendPointerPan}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleTrendData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e8edf4" vertical={false} />
                  <XAxis dataKey="periodLabel" tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="money" tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} width={58} />
                  <YAxis yAxisId="ratio" orientation="right" tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" verticalAlign="bottom" wrapperStyle={{ fontSize: 12, color: "#344054", lineHeight: "18px" }} />
                  <Bar
                    yAxisId="money"
                    dataKey="stake"
                    name={`${trendOption.prefix}投入`}
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                    barSize={24}
                    {...chartAnimationProps}
                  />
                  <Line
                    yAxisId="money"
                    type="monotone"
                    dataKey="profit"
                    name={`${trendOption.prefix}利润`}
                    stroke="#0f9f6e"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    {...chartAnimationProps}
                  />
                  <Line
                    yAxisId="money"
                    type="monotone"
                    dataKey="cumulativeProfit"
                    name="累计结余"
                    stroke="#111827"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    {...chartAnimationProps}
                  />
                  <Line
                    yAxisId="ratio"
                    type="monotone"
                    dataKey="roi"
                    name="回报率"
                    stroke="#e8a600"
                    strokeWidth={2.4}
                    dot={false}
                    {...chartAnimationProps}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {hasTrendWindow ? (
              <div
                className={["trend-range", isTrendPanning ? "is-panning" : ""].filter(Boolean).join(" ")}
                style={trendRangeStyle}
                title={trendRangeLabel}
                aria-label={`趋势范围 ${trendRangeLabel}`}
                onWheel={handleTrendWheel}
                onPointerDown={handleTrendPointerDown}
                onPointerMove={handleTrendPointerMove}
                onPointerUp={stopTrendPointerPan}
                onPointerCancel={stopTrendPointerPan}
                onPointerLeave={stopTrendPointerPan}
              >
                <div className="trend-range-track">
                  <span className="trend-range-window">
                    <span className="trend-range-handle start" />
                    <span className="trend-range-handle end" />
                  </span>
                </div>
              </div>
            ) : null}
            <div className="trend-display-settings">
              <span>趋势图显示</span>
              <div className="segmented trend-segmented" style={{ "--segment-count": trendGranularityOptions.length, "--segment-offset": `${trendGranularityIndex * 100}%` }}>
                {trendGranularityOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    data-testid={`trend-granularity-${option.value}`}
                    className={trendGranularity === option.value ? "selected" : ""}
                    onClick={() => setTrendGranularity(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label
                className={["trend-day-window-control", trendGranularity === "day" ? "is-visible" : ""].filter(Boolean).join(" ")}
                aria-hidden={trendGranularity !== "day"}
              >
                <span>每屏</span>
                <strong>{dayTrendVisibleCount}天</strong>
                <input
                  type="range"
                  min={minTrendDayVisibleCount}
                  max={maxTrendDayVisibleCount}
                  value={dayTrendVisibleCount}
                  style={{ "--day-window-progress": `${((dayTrendVisibleCount - minTrendDayVisibleCount) / (maxTrendDayVisibleCount - minTrendDayVisibleCount)) * 100}%` }}
                  onInput={(event) => changeDayTrendVisibleCount(event.target.value)}
                  onChange={(event) => changeDayTrendVisibleCount(event.target.value)}
                  disabled={trendGranularity !== "day"}
                  tabIndex={trendGranularity === "day" ? undefined : -1}
                  data-testid="trend-day-window"
                  aria-label="日趋势每屏显示天数"
                />
              </label>
            </div>
          </div>

          <aside className="panel insight-panel">
            <div className="panel-title compact">
              <div>
                <span>分布</span>
                <h2>结果状态</h2>
              </div>
            </div>
            <div className="status-stack">
              {(analytics?.statusDistribution || []).map((item) => (
                <button type="button" className="status-row" key={item.status} onClick={() => showStatusInLedger(item.status)}>
                  <span className={`status-chip ${statusClass(item.status)}`}>{item.status}</span>
                  <strong>{item.count} 单</strong>
                  <em className={profitTone(item.profit)}>{money(item.profit)}</em>
                </button>
              ))}
            </div>
            <div className="split-list">
              <MiniList title="最高盈利" items={analytics?.topWins || []} tone="positive" onItemSelect={focusBetInLedger} />
              <MiniList title="最大亏损" items={analytics?.topLosses || []} tone="negative" onItemSelect={focusBetInLedger} />
            </div>
          </aside>
        </section>

        <section className="filters">
          <div className="search-box">
            <Search size={17} />
            <input
              value={filters.q}
              onChange={(event) => setFilters((next) => ({ ...next, q: event.target.value }))}
              placeholder="搜索账本、场次、投注内容、比分、备注"
            />
          </div>
          <label className="date-filter"><CalendarDays size={16} /><input type="date" value={filters.from} onChange={(event) => setFilters((next) => ({ ...next, from: event.target.value }))} /></label>
          <label className="date-filter"><CalendarDays size={16} /><input type="date" value={filters.to} onChange={(event) => setFilters((next) => ({ ...next, to: event.target.value }))} /></label>
          <div className="segmented" style={{ "--segment-count": statusOptions.length, "--segment-offset": `${statusActiveIndex * 100}%` }}>
            {statusOptions.map((status) => (
              <button type="button" key={status} className={filters.status === status ? "selected" : ""} onClick={() => setFilters((next) => ({ ...next, status }))}>
                {status}
              </button>
            ))}
          </div>
        </section>

        <section className="ledger-layout">
          <div
            id="ledger"
            className={`panel table-panel ${!isRecordsUnlimited && bets.length ? "limited-records" : ""}`}
          >
            <div className="panel-title">
              <div>
                <span>明细</span>
                <h2>投注记录</h2>
              </div>
              <button className="ghost-button" onClick={goToNewBet}><Plus size={16} />新增投注</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>账本</th>
                    <th>日期</th>
                    <th>场次</th>
                    <th>投注内容</th>
                    <th>投入</th>
                    <th>返还</th>
                    <th>利润</th>
                    <th>比分</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBets.length ? visibleBets.map((bet) => (
                    <tr
                      key={bet.id}
                      data-bet-row-id={bet.id}
                      className={[
                        selectedId === bet.id ? "selected-row" : "",
                        highlightedBet?.id === bet.id ? "flash-row" : ""
                      ].filter(Boolean).join(" ")}
                      onClick={() => editBet(bet)}
                      onMouseEnter={(event) => scheduleBetTooltip(bet, event)}
                      onMouseMove={(event) => moveBetTooltip(bet, event)}
                      onMouseLeave={hideNoteTooltip}
                    >
                      <td><TooltipText label="账本" value={bet.ledgerName} className="ledger-pill" /></td>
                      <td><TooltipText label="日期" value={bet.date} /></td>
                      <td className="wide"><TooltipText label="场次" value={bet.match} /></td>
                      <td className="wide preserve"><TooltipText label="投注内容" value={bet.pick} /></td>
                      <td><TooltipText label="投入" value={money(bet.stake)} /></td>
                      <td><TooltipText label="返还" value={money(bet.returnAmount)} /></td>
                      <td className={profitTone(bet.profit)}><TooltipText label="利润" value={money(bet.profit)} /></td>
                      <td className="wide"><TooltipText label="比分" value={bet.score} /></td>
                      <td><TooltipText label="状态" value={bet.status} className={`status-chip ${statusClass(bet.status)}`} /></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="9">
                        <div className="empty-state">当前筛选没有投注记录</div>
                      </td>
                    </tr>
                  )}
                  {placeholderRowCount
                    ? Array.from({ length: placeholderRowCount }, (_, index) => (
                      <tr className="placeholder-row" aria-hidden="true" key={`placeholder-${safeRecordsPage}-${index}`}>
                        <td colSpan="9">&nbsp;</td>
                      </tr>
                    ))
                    : null}
                </tbody>
              </table>
            </div>
            {!isRecordsUnlimited && bets.length ? (
              <nav className="records-pagination" aria-label="投注记录分页">
                <button
                  type="button"
                  className="pagination-nav"
                  disabled={safeRecordsPage <= 1}
                  onClick={() => goToRecordsPage(safeRecordsPage - 1)}
                >
                  <ChevronLeft size={15} />上一页
                </button>
                <div className="pagination-pages">
                  {paginationItems.map((item) =>
                    typeof item === "number" ? (
                      <button
                        type="button"
                        key={item}
                        className={`pagination-page ${item === safeRecordsPage ? "active" : ""}`}
                        aria-current={item === safeRecordsPage ? "page" : undefined}
                        onClick={() => goToRecordsPage(item)}
                      >
                        {item}
                      </button>
                    ) : (
                      <span className="pagination-ellipsis" key={item}>...</span>
                    )
                  )}
                </div>
                <button
                  type="button"
                  className="pagination-nav"
                  disabled={safeRecordsPage >= totalRecordPages}
                  onClick={() => goToRecordsPage(safeRecordsPage + 1)}
                >
                  下一页<ChevronRight size={15} />
                </button>
                <form className="pagination-jump" onSubmit={jumpToRecordsPage} noValidate>
                  <span>跳至</span>
                  <input
                    type="number"
                    min="1"
                    max={totalRecordPages}
                    value={recordsPageInput}
                    onChange={(event) => setRecordsPageInput(event.target.value)}
                    onBlur={() => {
                      if (!recordsPageInput) setRecordsPageInput(String(safeRecordsPage));
                    }}
                    data-testid="records-page-jump-input"
                    aria-label="输入投注记录页码"
                  />
                  <span>页</span>
                  <button
                    type="submit"
                    disabled={totalRecordPages <= 1}
                    data-testid="records-page-jump-submit"
                  >
                    跳转
                  </button>
                </form>
                <span className="pagination-summary">
                  {visibleRecordStart}-{visibleRecordEnd} / {bets.length} 条
                </span>
              </nav>
            ) : null}
          </div>

          <form id="entry" className="panel entry-panel" onSubmit={saveBet}>
            <div className="panel-title">
              <div>
                <span>{form.id ? "编辑" : "表单"}</span>
                <h2>{form.id ? "编辑投注" : "新增投注"}</h2>
              </div>
              <button type="button" className="icon-button" data-testid="reset-form" onClick={() => resetForm()} title="清空表单"><RotateCcw size={17} /></button>
            </div>

            <label>所属账本
              <select data-testid="entry-ledger" required value={form.ledgerId} onChange={(event) => setFormField("ledgerId", event.target.value)}>
                {ledgers.map((ledger) => <option value={ledger.id} key={ledger.id}>{ledger.name}</option>)}
              </select>
            </label>
            <label>日期<input data-testid="entry-date" required type="date" value={form.date} onChange={(event) => setFormField("date", event.target.value)} /></label>
            <label>场次<textarea data-testid="entry-match" required rows="3" value={form.match} onChange={(event) => setFormField("match", event.target.value)} /></label>
            <label>投注内容<textarea data-testid="entry-pick" rows="4" value={form.pick} onChange={(event) => setFormField("pick", event.target.value)} /></label>
            <div className="form-pair">
              <label>投入<input data-testid="entry-stake" required min="0" step="0.01" type="number" value={form.stake} onChange={(event) => setFormField("stake", event.target.value)} /></label>
              <label>返还<input data-testid="entry-return" min="0" step="0.01" type="number" value={form.returnAmount} onChange={(event) => setFormField("returnAmount", event.target.value)} /></label>
            </div>
            <div className={`profit-preview ${profitTone(projectedProfit)}`}>
              <span>自动利润</span>
              <strong>{money(projectedProfit)}</strong>
            </div>
            <label>实际比分<textarea data-testid="entry-score" rows="3" value={form.score} onChange={(event) => setFormField("score", event.target.value)} /></label>
            <div className="form-pair">
              <label>状态
                <div data-testid="entry-status" className="status-preview">
                  <span className={`status-chip ${statusClass(projectedStatus)}`}>{projectedStatus}</span>
                </div>
              </label>
              <label>备注<input data-testid="entry-note" value={form.note} onChange={(event) => setFormField("note", event.target.value)} /></label>
            </div>
            <div className="form-actions">
              <button className="primary-button" data-testid="save-entry" disabled={busy} type="submit"><Save size={16} />{form.id ? "保存修改" : "保存记录"}</button>
              <button className="danger-button" data-testid="delete-entry" disabled={!selectedId || busy} type="button" onClick={removeSelected}><Trash2 size={16} />删除</button>
            </div>
          </form>
        </section>
      </main>

      {noteTooltip ? (
        <div className="note-tooltip" style={{ left: noteTooltip.x, top: noteTooltip.y }} role="tooltip">
          <span>{noteTooltip.title}</span>
          <p>{noteTooltip.content}</p>
        </div>
      ) : null}

      {ledgerMenu ? (
        <div
          className="context-menu"
          data-testid="ledger-context-menu"
          style={{ left: ledgerMenu.x, top: ledgerMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          <button type="button" role="menuitem" data-testid="rename-ledger-menu-item" onClick={() => openRenameLedger(ledgerMenu.ledger)}>
            <Pencil size={15} />重命名账本
          </button>
          <button type="button" role="menuitem" data-testid="delete-ledger-menu-item" className="danger-menu-item" onClick={() => openDeleteLedger(ledgerMenu.ledger)}>
            <Trash2 size={15} />删除账本
          </button>
        </div>
      ) : null}

      {renameLedgerTarget ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="rename-ledger-title">
            <div className="panel-title">
              <div>
                <span>重命名账本</span>
                <h2 id="rename-ledger-title">{renameLedgerTarget.name}</h2>
              </div>
            </div>
            <p>输入新的账本名称。</p>
            <input
              autoFocus
              data-testid="rename-ledger-name"
              value={renameLedgerName}
              onChange={(event) => setRenameLedgerName(event.target.value)}
              maxLength="40"
            />
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setRenameLedgerTarget(null)}>取消</button>
              <button
                type="button"
                className="primary-button"
                data-testid="confirm-rename-ledger"
                disabled={busy || !renameLedgerName.trim()}
                onClick={confirmRenameLedger}
              >
                <Save size={16} />保存
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteLedgerTarget ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-ledger-title">
            <div className="panel-title">
              <div>
                <span>删除账本</span>
                <h2 id="delete-ledger-title">{deleteLedgerTarget.name}</h2>
              </div>
            </div>
            <p>
              账本内 {deleteLedgerTarget.count} 条投注记录会一起删除。请输入完整账本名称完成二次确认。
            </p>
            <input
              autoFocus
              data-testid="delete-ledger-confirm-name"
              value={deleteLedgerConfirmName}
              onChange={(event) => setDeleteLedgerConfirmName(event.target.value)}
              placeholder={deleteLedgerTarget.name}
            />
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setDeleteLedgerTarget(null)}>取消</button>
              <button
                type="button"
                className="danger-button"
                data-testid="confirm-delete-ledger"
                disabled={busy || deleteLedgerConfirmName.trim() !== deleteLedgerTarget.name}
                onClick={confirmDeleteLedger}
              >
                <Trash2 size={16} />删除账本
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
            <aside className="settings-sidebar" aria-label="设置分类">
              <h2 className="settings-sidebar-title">设置</h2>
              <nav className="settings-nav">
                {settingsSections.map(({ value, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={value}
                    className={settingsSection === value ? "active" : ""}
                    aria-current={settingsSection === value ? "page" : undefined}
                    onClick={() => setSettingsSection(value)}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </nav>
            </aside>

            <section className="settings-main">
              <header className="settings-main-header">
                <span>偏好</span>
                <h2 id="settings-title">{activeSettingsSection.label}</h2>
              </header>

              {settingsSection === "general" ? (
                <div className="settings-pane">
                  <section className="settings-group">
                    <div className="settings-row settings-row-stack records-page-size-row">
                      <div className="settings-copy">
                        <span>投注记录显示</span>
                        <strong>{recordsPageSize === "all" ? "无限制" : `每页 ${recordsPageSize} 条`}</strong>
                      </div>
                      <div className="record-page-size-options" aria-label="投注记录每页显示数量">
                        {recordPageSizeOptions.map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            className={recordsPageSize === option.value ? "active" : ""}
                            aria-pressed={recordsPageSize === option.value}
                            onClick={() => changeRecordsPageSize(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}

              {settingsSection === "appearance" ? (
                <div className="settings-pane">
                  <section className="settings-group">
                    <div className="settings-row">
                      <div className="settings-copy">
                        <span>盈亏颜色</span>
                        <strong>{isProfitColorInverted ? "盈利红 / 亏损绿" : "盈利绿 / 亏损红"}</strong>
                      </div>
                      <button
                        type="button"
                        className={`toggle-switch ${isProfitColorInverted ? "on warm-on" : ""}`}
                        data-testid="profit-color-toggle"
                        aria-label="切换盈亏颜色"
                        aria-pressed={isProfitColorInverted}
                        onClick={toggleProfitColorMode}
                      >
                        <span />
                      </button>
                    </div>
                    <div className="settings-row">
                      <div className="settings-copy">
                        <span>界面动画</span>
                        <strong>{animationsEnabled ? "已开启" : "已关闭"}</strong>
                      </div>
                      <button
                        type="button"
                        className={`toggle-switch ${animationsEnabled ? "on" : ""}`}
                        data-testid="animation-toggle"
                        aria-label="切换界面动画"
                        aria-pressed={animationsEnabled}
                        onClick={toggleAnimations}
                      >
                        <span />
                      </button>
                    </div>
                  </section>

                  <section className="settings-group">
                    <div className="settings-row settings-row-stack theme-color-row">
                      <div className="settings-copy">
                        <span>主题色</span>
                        <strong>{activeThemeOption.label}</strong>
                      </div>
                      <div className="theme-color-options" aria-label="主题色">
                        {themeOptions.map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            className={themeColor === option.value ? "active" : ""}
                            style={{ "--swatch": option.swatch }}
                            aria-pressed={themeColor === option.value}
                            onClick={() => setThemeColor(option.value)}
                          >
                            <span />
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}

              {settingsSection === "about" ? (
                <div className="settings-pane">
                  <section className="settings-about-card">
                    <div className="settings-about-identity">
                      <TrophyMark />
                      <div>
                        <h3>体彩投注账本</h3>
                        <p>SQLite 持久化记账工具</p>
                      </div>
                    </div>
                    <a
                      className="settings-about-link"
                      href="https://github.com/zolegi"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="我的GitHub链接，打开 GitHub 个人主页"
                    >
                      <Github size={18} />
                      <span>我的GitHub链接</span>
                    </a>
                  </section>
                  <section className="settings-group">
                    <div className="settings-row">
                      <span>数据存储</span>
                      <strong>SQLite 持久化</strong>
                    </div>
                    <div className="settings-row">
                      <span>版本</span>
                      <strong>1.0</strong>
                    </div>
                  </section>
                </div>
              ) : null}

              <div className="settings-actions">
                <button type="button" className="primary-button" onClick={() => setSettingsOpen(false)}>关闭</button>
              </div>
            </section>
          </section>
        </div>
      ) : null}
    </div>
  );

  function setFormField(key, value) {
    setForm((next) => ({ ...next, [key]: value }));
  }
}

function TrophyMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <path d="M24 4c4 3.8 8.5 6 14 6-1 11-5.7 19-14 24C15.7 29 11 21 10 10c5.5 0 10-2.2 14-6Z" />
        <path d="M18 35h12l1.5 5h5.5v4H11v-4h5.5L18 35Z" />
        <path d="M18.5 13c1.6 4.7 3.5 8.1 5.5 10.1 2-2 3.9-5.4 5.5-10.1" />
      </svg>
    </div>
  );
}

function KpiCard({ icon, label, value, tone = "" }) {
  return (
    <article className="kpi-card">
      <div className="kpi-icon">{icon}</div>
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </article>
  );
}

function TooltipText({ label, value, className = "" }) {
  const text = value == null ? "" : String(value);
  return (
    <span
      className={["cell-tooltip-target", className].filter(Boolean).join(" ")}
      data-tooltip-title={label}
      data-tooltip-value={text}
    >
      {text}
    </span>
  );
}

function MiniList({ title, items, tone, onItemSelect }) {
  return (
    <div className="mini-list">
      <h3>{title}</h3>
      {items.length ? items.slice(0, 3).map((item) => (
        <button type="button" key={`${title}-${item.id}`} className="mini-row mini-row-button" onClick={() => onItemSelect?.(item)}>
          <span>{item.date}</span>
          <strong className={tone}>{money(item.profit)}</strong>
          <em>{item.match}</em>
        </button>
      )) : <p className="empty-mini">暂无记录</p>}
    </div>
  );
}

function aggregateTrendData(items, granularity) {
  const ordered = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (granularity === "day") {
    return ordered.map((item) => ({
      ...item,
      periodKey: item.date,
      periodLabel: shortDate(item.date)
    }));
  }

  const grouped = new Map();
  for (const item of ordered) {
    const period = trendPeriod(item.date, granularity);
    if (!grouped.has(period.key)) {
      grouped.set(period.key, {
        periodKey: period.key,
        periodLabel: period.label,
        date: period.key,
        stake: 0,
        returnAmount: 0,
        profit: 0,
        cumulativeProfit: 0,
        count: 0,
        wins: 0,
        roi: 0,
        profitRate: 0
      });
    }

    const group = grouped.get(period.key);
    group.stake += Number(item.stake || 0);
    group.returnAmount += Number(item.returnAmount || 0);
    group.profit += Number(item.profit || 0);
    group.count += Number(item.count || 0);
    group.wins += Number(item.wins || 0);
  }

  let cumulativeProfit = 0;
  return [...grouped.values()].map((item) => {
    cumulativeProfit += item.profit;
    return {
      ...item,
      stake: roundNumber(item.stake),
      returnAmount: roundNumber(item.returnAmount),
      profit: roundNumber(item.profit),
      cumulativeProfit: roundNumber(cumulativeProfit),
      roi: item.stake ? roundTo(item.returnAmount / item.stake, 4) : 0,
      profitRate: item.stake ? roundTo(item.profit / item.stake, 4) : 0,
      hitRate: item.count ? roundTo(item.wins / item.count, 4) : 0
    };
  });
}

function trendPeriod(dateString, granularity) {
  if (granularity === "week") {
    const start = weekStartDate(dateString);
    return { key: isoDate(start), label: `${shortDate(isoDate(start))}周` };
  }
  if (granularity === "month") {
    const key = String(dateString || "").slice(0, 7);
    return { key, label: key };
  }
  if (granularity === "year") {
    const key = String(dateString || "").slice(0, 4);
    return { key, label: key };
  }
  return { key: dateString, label: shortDate(dateString) };
}

function weekStartDate(dateString) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 1);
  return date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <div key={item.dataKey}>
          <span style={{ backgroundColor: item.color }} />
          {item.name}: {item.dataKey === "roi" ? percent(item.value) : money(item.value)}
        </div>
      ))}
    </div>
  );
}

function statusClass(status) {
  return {
    "命中": "win",
    "亏损": "loss",
    "走水": "push",
    "未结算": "open"
  }[status] || "open";
}

function buildQuery(filters, ledgerId) {
  return {
    ...filters,
    ledgerId: ledgerId === "all" ? "" : ledgerId
  };
}

function buildExportHref(filters, ledgerId) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(buildQuery(filters, ledgerId))) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/api/export.csv?${query}` : "/api/export.csv";
}

function computeBetStatus(stakeValue, returnValue) {
  const stake = roundNumber(stakeValue);
  if (!hasFilledAmount(returnValue)) return "未结算";
  const returnAmount = roundNumber(returnValue);
  const profit = roundNumber(returnAmount - stake);
  if (profit === 0) return "走水";
  return profit > 0 ? "命中" : "亏损";
}

function hasFilledAmount(value) {
  return value !== "" && value !== null && value !== undefined && String(value).trim() !== "";
}

function roundNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : 0;
}

function roundTo(value, digits = 2) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function loadProfitColorMode() {
  if (typeof window === "undefined") return "normal";
  try {
    return window.localStorage.getItem(profitColorModeKey) === "inverted" ? "inverted" : "normal";
  } catch {
    return "normal";
  }
}

function loadAnimationPreference() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(animationModeKey) !== "off";
  } catch {
    return true;
  }
}

function loadRecordsPageSize() {
  if (typeof window === "undefined") return "all";
  try {
    const saved = window.localStorage.getItem(recordsPageSizeKey);
    return recordPageSizeOptions.some((option) => option.value === saved) ? saved : "all";
  } catch {
    return "all";
  }
}

function clampDayTrendVisibleCount(value) {
  if (value === null || value === undefined || value === "") return maxTrendDayVisibleCount;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return maxTrendDayVisibleCount;
  return Math.max(minTrendDayVisibleCount, Math.min(maxTrendDayVisibleCount, Math.round(numeric)));
}

function loadDayTrendVisibleCount() {
  if (typeof window === "undefined") return maxTrendDayVisibleCount;
  try {
    return clampDayTrendVisibleCount(window.localStorage.getItem(trendDayVisibleCountKey));
  } catch {
    return maxTrendDayVisibleCount;
  }
}

function loadThemeColor() {
  if (typeof window === "undefined") return "blue";
  try {
    const saved = window.localStorage.getItem(themeColorKey);
    return themeOptions.some((option) => option.value === saved) ? saved : "blue";
  } catch {
    return "blue";
  }
}

function paginationRange(currentPage, totalPages) {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, 2, totalPages - 1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const range = [];
  let previous = 0;

  for (const page of sortedPages) {
    if (previous && page - previous > 1) range.push(`ellipsis-${previous}-${page}`);
    range.push(page);
    previous = page;
  }

  return range;
}

function getPrefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
