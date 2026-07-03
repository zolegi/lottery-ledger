import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Download,
  FileSpreadsheet,
  Github,
  Layers,
  LayoutDashboard,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
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
  const [bets, setBets] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [filters, setFilters] = useState({ q: "", status: "全部", from: "", to: "" });
  const [form, setForm] = useState(() => ({ ...blankForm, date: today() }));
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadLedgers();
  }, []);

  useEffect(() => {
    const closeMenu = () => setLedgerMenu(null);
    const closeOnKey = (event) => {
      if (event.key === "Escape") closeMenu();
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
  const projectedProfit = Number(form.returnAmount || 0) - Number(form.stake || 0);
  const projectedStatus = computeBetStatus(form.stake, form.returnAmount);
  const summary = analytics?.summary || {};
  const daily = analytics?.daily || [];
  const exportHref = useMemo(() => buildExportHref(filters, selectedLedgerId), [filters, selectedLedgerId]);

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
      const [betsPayload, analyticsPayload] = await Promise.all([
        apiGet("/api/bets", params),
        apiGet("/api/analytics", params)
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
    setSelectedId(bet.id);
    setForm({
      id: bet.id,
      ledgerId: String(bet.ledgerId || defaultLedgerId),
      date: bet.date,
      match: bet.match,
      pick: bet.pick,
      stake: bet.stake,
      returnAmount: bet.returnAmount,
      score: bet.score,
      note: bet.note,
      status: bet.status
    });
  }

  function resetForm(ledgerId = selectedLedgerId === "all" ? defaultLedgerId : selectedLedgerId) {
    setSelectedId(null);
    setForm({ ...blankForm, date: today(), ledgerId: String(ledgerId || defaultLedgerId) });
  }

  function goToNewBet(event) {
    event?.preventDefault();
    resetForm();
    setActiveSection("entry");
    window.requestAnimationFrame(() => {
      document.getElementById("entry")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (window.location.hash !== "#entry") {
        window.history.pushState(null, "", "#entry");
      }
    });
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
        returnAmount: Number(form.returnAmount || 0),
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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <TrophyMark />
          <div>
            <strong>体彩投注账本</strong>
            <span>{activeLedgerName}</span>
          </div>
        </div>

        <nav className="nav">
          <a className={`nav-item ${activeSection === "overview" ? "active" : ""}`} href="#overview" onClick={() => setActiveSection("overview")}><LayoutDashboard size={18} />总览</a>
          <a className={`nav-item ${activeSection === "ledger" ? "active" : ""}`} href="#ledger" onClick={() => setActiveSection("ledger")}><ListChecks size={18} />投注明细</a>
          <a className={`nav-item ${activeSection === "entry" ? "active" : ""}`} href="#entry" onClick={goToNewBet}><Plus size={18} />新增投注</a>
        </nav>

        <section className="ledger-switcher" aria-label="账本切换">
          <div className="side-heading">账本</div>
          <button type="button" className={`ledger-tab ${selectedLedgerId === "all" ? "active" : ""}`} onClick={() => chooseLedger("all")}>
            <span><Layers size={16} />全部账本</span>
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
                <span><FileSpreadsheet size={16} />{ledger.name}</span>
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
            <a
              className="github-profile-link"
              href="https://github.com/zolegi"
              target="_blank"
              rel="noreferrer"
              aria-label="打开 GitHub 个人主页"
              title="GitHub 个人主页"
            >
              <Github size={18} />
            </a>
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
              <div className="segmented small">
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
                <h2>每日利润、累计结余、投入与回报率</h2>
              </div>
              <div className="legend-note">{daily.length} 个记账日</div>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={daily} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e8edf4" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="money" tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} width={58} />
                  <YAxis yAxisId="ratio" orientation="right" tickFormatter={(value) => `${Math.round(value * 100)}%`} tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#344054" }} />
                  <Bar yAxisId="money" dataKey="stake" name="每日投入" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={24} isAnimationActive={false} />
                  <Line yAxisId="money" type="monotone" dataKey="profit" name="每日利润" stroke="#0f9f6e" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line yAxisId="money" type="monotone" dataKey="cumulativeProfit" name="累计结余" stroke="#111827" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line yAxisId="ratio" type="monotone" dataKey="roi" name="回报率" stroke="#d19100" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
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
                <div className="status-row" key={item.status}>
                  <span className={`status-chip ${statusClass(item.status)}`}>{item.status}</span>
                  <strong>{item.count} 单</strong>
                  <em className={profitTone(item.profit)}>{money(item.profit)}</em>
                </div>
              ))}
            </div>
            <div className="split-list">
              <MiniList title="最高盈利" items={analytics?.topWins || []} tone="positive" />
              <MiniList title="最大亏损" items={analytics?.topLosses || []} tone="negative" />
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
          <div className="segmented">
            {statusOptions.map((status) => (
              <button key={status} className={filters.status === status ? "selected" : ""} onClick={() => setFilters((next) => ({ ...next, status }))}>
                {status}
              </button>
            ))}
          </div>
        </section>

        <section className="ledger-layout">
          <div id="ledger" className="panel table-panel">
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
                  {bets.length ? bets.map((bet) => (
                    <tr key={bet.id} className={selectedId === bet.id ? "selected-row" : ""} onClick={() => editBet(bet)}>
                      <td><span className="ledger-pill">{bet.ledgerName}</span></td>
                      <td>{bet.date}</td>
                      <td className="wide">{bet.match}</td>
                      <td className="wide preserve">{bet.pick}</td>
                      <td>{money(bet.stake)}</td>
                      <td>{money(bet.returnAmount)}</td>
                      <td className={profitTone(bet.profit)}>{money(bet.profit)}</td>
                      <td className="wide">{bet.score}</td>
                      <td><span className={`status-chip ${statusClass(bet.status)}`}>{bet.status}</span></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="9">
                        <div className="empty-state">当前筛选没有投注记录</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
              <label>返还<input data-testid="entry-return" required min="0" step="0.01" type="number" value={form.returnAmount} onChange={(event) => setFormField("returnAmount", event.target.value)} /></label>
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

function MiniList({ title, items, tone }) {
  return (
    <div className="mini-list">
      <h3>{title}</h3>
      {items.length ? items.slice(0, 3).map((item) => (
        <div key={`${title}-${item.id}`} className="mini-row">
          <span>{item.date}</span>
          <strong className={tone}>{money(item.profit)}</strong>
          <em>{item.match}</em>
        </div>
      )) : <p className="empty-mini">暂无记录</p>}
    </div>
  );
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
  const returnAmount = roundNumber(returnValue);
  const profit = roundNumber(returnAmount - stake);
  if (stake === 0 && returnAmount === 0) return "未结算";
  if (profit === 0) return "走水";
  return profit > 0 ? "命中" : "亏损";
}

function roundNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
