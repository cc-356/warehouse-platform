(function () {
  const payloadNode = document.getElementById("report-data");

  const payload = window.WORKFORCE_REPORT_DATA || (payloadNode ? JSON.parse(payloadNode.textContent) : null);
  if (!payload) return;
  const history = [...(payload.history || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const historyByDate = new Map(history.map((item) => [item.date, item]));
  const totalPiecesMax = Math.max(...history.map((run) => (run.groups || []).reduce((sum, group) => sum + Number(group.totalPieces || 0), 0)), 1);
  const groupYMaxCache = new Map();
  const fixedGroupOrder = ["拆包", "上下架", "拣货", "发货", "移货", "质检", "返修", "大烫", "包装"];
  const qualityDimensionFields = [
    ["大货", "大货质检量"],
    ["销退", "消退质检"],
    ["大货返修", "大货返修质检"],
    ["唯品会", "唯品会质检"],
    ["返修", "返修质检"],
    ["异常件", "异常件质检"]
  ];
  const anomalyExcludedWorkers = new Set(["冯建豪", "肖林", "曹远清", "王子民", "杨金玲", "何建珍", "尤佳辉"]);
  const efficiencyExcludedWorkers = new Set(["杨金玲", "刘志文", "肖林", "冯建豪"]);
  let groupCardTimer = null;
  const state = {
    selectedDate: payload.selectedDate || (history[0] && history[0].date),
    group: "all",
    worker: "all",
    calendarYear: Number(String(payload.selectedDate || "").split("-")[0]) || new Date().getFullYear(),
    calendarMonth: Number(String(payload.selectedDate || "").split("-")[1]) || (new Date().getMonth() + 1),
    renderToken: 0,
    pendingScrollGroup: "",
    preserveScrollY: null
  };

  const statusTextMap = { ok: "已完成", partial: "部分完成", blocked: "需人工处理" };

  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  function scrollToTopOnInitialLoad() {
    const goTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    goTop();
    window.requestAnimationFrame(goTop);
    window.setTimeout(goTop, 80);
    window.setTimeout(goTop, 320);
  }

  function rememberScrollPosition() {
    state.preserveScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  }

  function restoreRememberedScroll(token) {
    if (state.preserveScrollY === null || state.pendingScrollGroup) return;
    const y = state.preserveScrollY;
    const restore = () => {
      if (token === state.renderToken) window.scrollTo({ top: y, left: 0, behavior: "auto" });
    };
    restore();
    window.requestAnimationFrame(restore);
    window.setTimeout(restore, 80);
    window.setTimeout(() => {
      restore();
      if (token === state.renderToken) state.preserveScrollY = null;
    }, 260);
  }

  function isEfficiencyExcludedWorker(worker) {
    const name = String(worker || "").replace(/\s+/g, "").replace(/　/g, "");
    return efficiencyExcludedWorkers.has(name) || name.startsWith("临时工");
  }

  function groupHasOrders(group) {
    return Boolean(group) && group.totalOrders !== null && group.totalOrders !== undefined && group.totalOrders !== "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "-";
    return Number(value).toLocaleString("zh-CN");
  }

  function groupUnit(group) {
    return group && group.sourceUnit ? group.sourceUnit : "件";
  }

  function sumRowDetail(rows, fieldName) {
    return (rows || []).reduce((sum, row) => sum + Number((row.details && row.details[fieldName]) || 0), 0);
  }

  function qualityInspectionBreakdown(groups) {
    const inspectionGroups = (groups || []).filter((group) => group.name === "质检" || group.name === "大货质检" || group.name === "销退质检");
    const dimensions = qualityDimensionFields.map(([label, field]) => ({
      label,
      field,
      value: inspectionGroups.reduce((sum, group) => sum + sumRowDetail(group.rows, field), 0)
    }));
    return {
      dimensions,
      largeGoods: dimensions.find((item) => item.field === "大货质检量")?.value || 0,
      returnGoods: dimensions.find((item) => item.field === "消退质检")?.value || 0
    };
  }

  function renderQualityInspectionBreakdown(group, breakdown) {
    if (!group || (group.name !== "质检" && group.name !== "大货质检" && group.name !== "销退质检")) return "";
    const dimensions = (breakdown && breakdown.dimensions) || [];
    if (!dimensions.some((item) => Number(item.value || 0) > 0)) return "";
    return '<div class="quality-breakdown" aria-label="质检产量拆分">' +
      dimensions.map((item) =>
        '<span>' + escapeHtml(item.label) + '数量 <strong>' + formatNumber(item.value) + '</strong> 件</span>'
      ).join("") +
    '</div>';
  }

  function renderWorkerMeta(row, group) {
    if (group && group.name === "质检") {
      const chips = qualityDimensionFields
        .map(([label, field]) => ({ label, value: Number((row.details && row.details[field]) || 0) }))
        .filter((item) => item.value > 0)
        .map((item) => '<em>' + escapeHtml(item.label) + '质检数 <strong>' + formatNumber(item.value) + '</strong></em>')
        .join("");
      return '<span class="sub">原岗位：' + escapeHtml(row.role || "-") + '</span>' +
        '<span class="sub">品牌：' + escapeHtml(row.brand || "未提供") + '</span>' +
        (chips ? '<span class="quality-row-breakdown">' + chips + '</span>' : "");
    }
    return '<span class="sub">原岗位：' + escapeHtml(row.role) + '</span>';
  }

  function renderGroupMetrics(group, deltaPieces, deltaOrders, inspectionBreakdown) {
    if (group && group.name === "质检") {
      const dimensionRows = ((inspectionBreakdown && inspectionBreakdown.dimensions) || qualityDimensionFields.map(([label]) => ({ label, value: 0 })))
        .map((item) => '<em>' + escapeHtml(item.label) + ' <span>' + formatNumber(item.value) + ' 件</span></em>')
        .join("");
      return '<div class="group-metrics quality-metrics">' +
        '<div><span>总件数</span><strong>' + formatNumber(group.totalPieces) + ' ' + escapeHtml(groupUnit(group)) + '</strong></div>' +
        '<div class="quality-metric-split"><span>质检拆分</span><strong>' + dimensionRows + '</strong></div>' +
        '<div><span>效率</span><strong class="metric-efficiency">' + formatEfficiencyMetric(group.efficiency) + '</strong></div>' +
        '<div><span>件数对比上次</span><strong>' + formatDelta(deltaPieces) + '</strong></div>' +
      '</div>';
    }
    if (!groupHasOrders(group)) {
      return '<div class="group-metrics no-orders-metrics">' +
        '<div><span>' + (groupUnit(group) === "件" ? "总件数" : "总工作量") + '</span><strong>' + formatNumber(group.totalPieces) + ' ' + escapeHtml(groupUnit(group)) + '</strong></div>' +
        '<div><span>效率</span><strong class="metric-efficiency">' + formatEfficiencyMetric(group.efficiency) + '</strong></div>' +
        '<div><span>件数对比上次</span><strong>' + formatDelta(deltaPieces) + '</strong></div>' +
      '</div>';
    }
    return '<div class="group-metrics">' +
      '<div><span>' + (groupUnit(group) === "件" ? "总件数" : "总工作量") + '</span><strong>' + formatNumber(group.totalPieces) + ' ' + escapeHtml(groupUnit(group)) + '</strong></div>' +
      '<div><span>单数</span><strong>' + formatNumber(group.totalOrders) + '</strong></div>' +
      '<div><span>效率</span><strong class="metric-efficiency">' + formatEfficiencyMetric(group.efficiency) + '</strong></div>' +
      '<div><span>件数对比上次</span><strong>' + formatDelta(deltaPieces) + '</strong></div>' +
      '<div><span>单数对比上次</span><strong>' + formatDelta(deltaOrders) + '</strong></div>' +
    '</div>';
  }

  function renderGroupRow(row, group) {
    if (!groupHasOrders(group)) {
      return '<tr>' +
        '<td class="rank">' + (row.rank ?? "-") + '</td>' +
        '<td><strong>' + escapeHtml(row.worker) + '</strong>' + renderWorkerMeta(row, group) + '</td>' +
        '<td>' + formatNumber(row.pieces) + '</td>' +
        '<td>' + formatEfficiency(row.efficiency) + '</td>' +
      '</tr>';
    }
    return '<tr>' +
      '<td class="rank">' + (row.rank ?? "-") + '</td>' +
      '<td><strong>' + escapeHtml(row.worker) + '</strong>' + renderWorkerMeta(row, group) + '</td>' +
      '<td>' + formatNumber(row.pieces) + '</td>' +
      '<td>' + formatNumber(row.orders) + '</td>' +
      '<td>' + formatEfficiency(row.efficiency) + '</td>' +
    '</tr>';
  }

  function renderGroupTable(group, rows) {
    const head = !groupHasOrders(group)
      ? '<thead><tr><th>排名</th><th>员工 / 原岗位</th><th>总件数</th><th>效率</th></tr></thead>'
      : '<thead><tr><th>排名</th><th>员工 / 原岗位</th><th>总件数</th><th>单数</th><th>效率</th></tr></thead>';
    return '<div class="table-wrap"><table>' + head + '<tbody>' + rows + '</tbody></table></div>';
  }

  function formatAverageNumber(value) {
    if (value === null || value === undefined || value === "") return "-";
    return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  }

  function formatCompact(value) {
    const number = Number(value || 0);
    if (Math.abs(number) >= 10000) {
      return (number / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 1 }) + "万";
    }
    return number.toLocaleString("zh-CN");
  }

  function formatEfficiency(value) {
    if (value === null || value === undefined || value === "") return "-";
    return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " 件/小时";
  }

  function formatEfficiencyMetric(value) {
    if (value === null || value === undefined || value === "") return "-";
    return '<span class="metric-value">' +
      Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
      '</span><span class="metric-unit">件/小时</span>';
  }

  function formatDelta(value) {
    if (value === null || value === undefined) return "无历史对比";
    const number = Number(value);
    if (Math.abs(number) < 0.0001) return "与上次持平";
    return (number > 0 ? "+" : "") + number.toLocaleString("zh-CN");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getRun(date) {
    return historyByDate.get(date) || null;
  }

  function getPreviousRun(date) {
    return history.find((item) => String(item.date) < String(date)) || null;
  }

  function parseDateText(dateText) {
    const parts = String(dateText || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatDateText(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function addDays(date, offset) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + offset);
    return next;
  }

  function getTrendDays(endDate, count) {
    const dateText = endDate || state.selectedDate || (history[0] && history[0].date);
    const end = parseDateText(dateText);
    if (!end) {
      return [];
    }
    const days = [];
    for (let offset = -(count || 7) + 1; offset <= 0; offset += 1) {
      const dayText = formatDateText(addDays(end, offset));
      days.push({ date: dayText, run: historyByDate.get(dayText) || null });
    }
    return days;
  }

  function getGroupYMax(groupName) {
    if (groupYMaxCache.has(groupName)) return groupYMaxCache.get(groupName);
    const max = Math.max(...history.map((run) => {
      const group = (run.groups || []).find((item) => item.name === groupName);
      return group ? Number(group.totalPieces || 0) : 0;
    }), 1);
    groupYMaxCache.set(groupName, max);
    return max;
  }

  function groupDomId(groupName) {
    return "group-" + String(groupName || "")
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function getAllRows(run) {
    return (run.groups || []).flatMap((group) =>
      (group.rows || []).map((row) => ({ ...row, groupName: group.name, isAuxiliary: false }))
        .concat((group.auxiliaryRows || []).map((row) => ({ ...row, groupName: group.name, isAuxiliary: true })))
    );
  }

  function getWorkerTotals(run) {
    const totals = new Map();
    getAllRows(run || {}).forEach((row) => {
      const worker = row.worker || "";
      if (!worker) return;
      const entry = totals.get(worker) || { worker, pieces: 0, orders: 0, workHours: 0, groups: new Set() };
      entry.pieces += Number(row.pieces || 0);
      entry.orders += Number(row.orders || 0);
      entry.workHours += Number(row.workHours || 0);
      if (row.groupName) entry.groups.add(row.groupName);
      totals.set(worker, entry);
    });
    return totals;
  }

  function getWorkerAnomalies(run) {
    if (!run || !run.date) return [];
    const currentTotals = getWorkerTotals(run);
    const selectedDate = parseDateText(run.date);
    if (!selectedDate) return [];
    const baselineDays = getTrendDays(formatDateText(addDays(selectedDate, -1)), 7);
    const alerts = [];
    currentTotals.forEach((current, worker) => {
      if (anomalyExcludedWorkers.has(worker)) return;
      if (current.pieces <= 0) return;
      const samples = baselineDays.map((day) => {
        const totals = day.run ? getWorkerTotals(day.run).get(worker) : null;
        if (!totals) return null;
        const hadWork = Number(totals.pieces || 0) > 0 || Number(totals.orders || 0) > 0;
        const hadAttendance = Number(totals.workHours || 0) > 0;
        return hadWork || hadAttendance ? totals : null;
      }).filter(Boolean);
      if (samples.length < 3) return;
      const average = samples.reduce((sum, item) => sum + Number(item.pieces || 0), 0) / samples.length;
      if (average <= 0) return;
      const ratio = current.pieces / average;
      if (ratio < 0.8) {
        alerts.push({
          worker,
          pieces: current.pieces,
          average,
          ratio,
          sampleDays: samples.length,
          groups: [...current.groups].join("、") || "-"
        });
      }
    });
    return alerts.sort((a, b) => a.ratio - b.ratio).slice(0, 12);
  }

  function getFilteredGroups(run) {
    return (run.groups || []).map((group) => {
      const rows = (group.rows || []).filter((row) => {
        if (state.group !== "all" && group.name !== state.group) return false;
        if (state.worker !== "all" && row.worker !== state.worker) return false;
        return true;
      });
      const auxiliaryRows = (group.auxiliaryRows || []).filter((row) => {
        if (state.group !== "all" && group.name !== state.group) return false;
        if (state.worker !== "all" && row.worker !== state.worker) return false;
        return true;
      });
      const totalPieces = rows.reduce((sum, row) => sum + Number(row.pieces || 0), 0);
      const totalOrders = groupHasOrders(group)
        ? rows.reduce((sum, row) => sum + Number(row.orders || 0), 0)
        : null;
      const efficiencyRows = rows.filter((row) => Number(row.pieces || 0) > 0 && !isEfficiencyExcludedWorker(row.worker));
      const efficiencyComplete = efficiencyRows.every((row) => row.workHours !== null && row.workHours !== undefined && row.workHours !== "");
      const efficiencyPieces = efficiencyRows.reduce((sum, row) => sum + Number(row.pieces || 0), 0);
      const efficiencyHours = efficiencyRows.reduce((sum, row) => sum + Number(row.workHours || 0), 0);
      const efficiency = efficiencyRows.length && efficiencyComplete && efficiencyHours > 0
        ? efficiencyPieces / efficiencyHours
        : (state.group === "all" && state.worker === "all" ? group.efficiency : null);
      return { ...group, rows, auxiliaryRows, rowCount: rows.length, auxiliaryCount: auxiliaryRows.length, totalPieces, totalOrders, efficiency, workHours: efficiencyComplete ? efficiencyHours : group.workHours };
    }).filter((group) => group.rows.length > 0 || group.auxiliaryRows.length > 0 || state.group === group.name)
      .sort(compareGroups);
  }

  function compareGroups(a, b) {
    const indexA = fixedGroupOrder.indexOf(a.name);
    const indexB = fixedGroupOrder.indexOf(b.name);
    const rankA = indexA === -1 ? fixedGroupOrder.length : indexA;
    const rankB = indexB === -1 ? fixedGroupOrder.length : indexB;
    if (rankA !== rankB) return rankA - rankB;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
  }

  function isBusinessExcludedItem(item) {
    return item && item.workType === "按规则排除";
  }

  function getActionableManualItems(run) {
    return (run.manualItems || []).filter((item) => !isBusinessExcludedItem(item));
  }

  function setSelectOptions(select, options, selected) {
    select.innerHTML = options.map((item) =>
      '<option value="' + escapeHtml(item.value) + '"' + (item.value === selected ? " selected" : "") + ">" +
      escapeHtml(item.label) +
      "</option>"
    ).join("");
  }

  function TechPanel(title, kicker, body, extraClass) {
    return '<section class="tech-panel ' + (extraClass || "").trim() + '">' +
      '<div class="panel-head"><h2 class="panel-title">' + escapeHtml(title) + '</h2><span class="panel-kicker">' + escapeHtml(kicker) + '</span></div>' +
      body +
    '</section>';
  }

  function DashboardHeader(logoSrc, homeHref) {
    return '<header class="dashboard-header">' +
      '<div class="brand-lockup">' +
        '<img class="dashboard-logo" src="' + escapeHtml(logoSrc) + '" alt="井唐仓储" />' +
        '<div class="dashboard-brand"><strong>仓储运营数据驾驶舱</strong><span>Warehouse Operations</span></div>' +
      '</div>' +
      '<div class="title-block"><h1>员工工作量与人效管理</h1><span>WORKFORCE EFFICIENCY CENTER</span><i class="title-line" aria-hidden="true"></i></div>' +
      '<form class="filter-bar" id="filter-bar">' +
        '<div class="filter-field"><label for="filter-date">日期</label><select id="filter-date"></select></div>' +
        '<div class="filter-field"><label for="filter-group">工种</label><select id="filter-group"></select></div>' +
        '<div class="filter-field"><label for="filter-worker">员工</label><select id="filter-worker"></select></div>' +
        '<a class="nav-button" href="' + escapeHtml(homeHref) + '">返回主页</a>' +
      '</form>' +
    '</header>';
  }

  function MetricCard(label, value, detail) {
    return '<article class="metric-card"><span>' + escapeHtml(label) + '</span><strong data-count="' + escapeHtml(value) + '">' + escapeHtml(value) + '</strong><small>' + escapeHtml(detail) + '</small></article>';
  }

  function buildShell() {
    const oldLogo = document.querySelector(".platform-mark");
    const oldHome = document.querySelector(".platform-link");
    const logoSrc = oldLogo ? oldLogo.getAttribute("src") : "../../assets/jingtang-warehouse-logo-clear.png";
    const homeHref = oldHome ? oldHome.getAttribute("href") : "../../index.html";

    document.body.classList.add("dashboard-ready");
    document.querySelector(".page").innerHTML =
      '<div class="dashboard-shell">' +
        DashboardHeader(logoSrc, homeHref) +
        '<main class="dashboard-grid">' +
          '<aside class="dashboard-column left-column">' +
            TechPanel("工种分布", "WORK TYPE", '<div id="group-donut"></div>', "analysis-panel tone-cyan") +
            TechPanel("工作量结构", "VOLUME", '<div id="workload-bars"></div>', "analysis-panel tone-blue") +
            TechPanel("各工种人效对比", "EFFICIENCY", '<div id="efficiency-chart"></div>', "analysis-panel tone-green") +
            TechPanel("工作量趋势", "7 DAYS", '<div id="total-trend"></div>', "analysis-panel tone-amber") +
          '</aside>' +
          '<section class="dashboard-column center-column">' +
            '<section class="dashboard-section overview-section"><div class="section-label"><span>核心总览</span><em>OVERVIEW</em></div><div class="metric-grid" id="metric-grid"></div></section>' +
            TechPanel("异常提醒", "ALERT", '<div class="panel-head"><span id="status-pill" class="status-pill">加载中</span></div><div id="notes"></div>', "alert-panel tone-amber") +
            TechPanel("员工人效总览", "COMMAND CENTER", '<div class="command-center"><div id="completion-ring" class="focus-orbit"></div><div id="summary-grid" class="summary-grid"></div></div>', "command-center-panel tone-cyan") +
          '</section>' +
          '<aside class="dashboard-column right-column">' +
            TechPanel("考勤覆盖", "ATTENDANCE", '<div id="attendance-panel"></div>', "support-panel tone-green") +
            TechPanel("岗位效率", "ROLE", '<div id="role-efficiency"></div>', "support-panel tone-blue") +
            TechPanel("员工工作量排名", "TOP STAFF", '<div id="employee-ranking" class="ranking-list"></div>', "support-panel tone-cyan") +
            TechPanel("人工复核", "REVIEW", '<div id="manual-grid" class="review-grid"></div>', "support-panel tone-rose") +
          '</aside>' +
        '</main>' +
        '<section class="dashboard-section worktype-section"><div class="section-label"><span>工种明细与排名</span><em>WORKTYPE DETAIL</em></div><div id="group-grid" class="group-grid"></div></section>' +
        '<section id="auxiliary-panel" class="tech-panel auxiliary-panel tone-amber"></section>' +
        '<section id="run-notes-panel" class="tech-panel run-notes-panel tone-blue"></section>' +
        '<div id="date-float" class="date-float"><button id="date-panel-toggle" class="date-float-toggle" type="button" aria-label="打开日期导航" aria-expanded="false">日期</button><section class="date-float-panel tech-panel"><div class="panel-head"><h2 class="panel-title">日期导航</h2><span class="panel-kicker">DATE</span></div><div id="date-list" class="date-list"></div></section></div>' +
        '<div id="group-float" class="group-float"><button id="group-panel-toggle" class="group-float-toggle" type="button" aria-label="打开岗位导航" aria-expanded="false">岗位</button><section class="group-float-panel tech-panel"><div class="panel-head"><h2 class="panel-title">岗位导航</h2><span class="panel-kicker">POSITION</span></div><div id="group-nav" class="floating-nav"></div></section></div>' +
      '</div>' +
      '<svg class="sr-only" aria-hidden="true" focusable="false"><defs>' +
        '<linearGradient id="workforceBarGradient" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#49d3be" /><stop offset="100%" stop-color="#fff1cb" /></linearGradient>' +
      '</defs></svg>';
  }

  function DashboardFilters(run) {
    const rows = getAllRows(run);
    setSelectOptions(document.getElementById("filter-date"), history.map((item) => ({ value: item.date, label: item.date })), state.selectedDate);
    setSelectOptions(document.getElementById("filter-group"), [{ value: "all", label: "全部工种" }].concat([...(run.groups || [])].sort(compareGroups).map((group) => ({ value: group.name, label: group.name }))), state.group);
    setSelectOptions(document.getElementById("filter-worker"), [{ value: "all", label: "全部员工" }].concat([...new Set(rows.map((row) => row.worker).filter(Boolean))].sort().map((worker) => ({ value: worker, label: worker }))), state.worker);
  }

  function DateNavigator() {
    const container = document.getElementById("date-list");
    const floatRoot = document.getElementById("date-float");
    const toggle = document.getElementById("date-panel-toggle");
    if (floatRoot && toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = "true";
      toggle.addEventListener("click", () => {
        const open = !floatRoot.classList.contains("open");
        floatRoot.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const monthStart = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstOffset = (monthStart.getDay() + 6) % 7;
    const monthRecords = history.filter((run) => String(run.date).startsWith(year + "-" + String(month).padStart(2, "0") + "-")).length;
    const cells = [];

    for (let index = 0; index < firstOffset; index += 1) {
      cells.push('<span class="calendar-day" aria-hidden="true"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateText = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      const run = historyByDate.get(dateText);
      const className = "calendar-day" + (run ? " has-data" : "") + (dateText === state.selectedDate ? " active" : "");
      const label = run
        ? dateText + "，" + ((run.groups || []).length) + " 工种，" + (statusTextMap[run.status] || run.status || "-")
        : dateText + "，无数据";
      cells.push(run
        ? '<button class="' + className + '" data-date="' + escapeHtml(dateText) + '" aria-label="' + escapeHtml(label) + '">' + day + '</button>'
        : '<span class="' + className + '" aria-label="' + escapeHtml(label) + '">' + day + '</span>'
      );
    }

    container.innerHTML =
      '<div class="calendar-shell">' +
        '<div class="calendar-monthbar">' +
          '<div class="calendar-heading">' +
            '<strong class="calendar-title">' + year + "年" + String(month).padStart(2, "0") + "月" + '</strong>' +
            '<span class="calendar-summary">' + monthRecords + ' 天记录</span>' +
          '</div>' +
          '<div class="calendar-controls">' +
            '<button class="calendar-nav" type="button" data-shift="year-prev" aria-label="上一年">‹‹</button>' +
            '<button class="calendar-nav" type="button" data-shift="month-prev" aria-label="上一月">‹</button>' +
            '<button class="calendar-nav" type="button" data-shift="month-next" aria-label="下一月">›</button>' +
            '<button class="calendar-nav" type="button" data-shift="year-next" aria-label="下一年">››</button>' +
          '</div>' +
        '</div>' +
        '<div class="calendar-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
        '<div class="calendar-grid">' + cells.join("") + '</div>' +
        '<div class="calendar-detail">' +
          '<span class="calendar-meta">' + escapeHtml(state.selectedDate || "-") + '</span>' +
        '</div>' +
      '</div>';

    container.querySelectorAll(".calendar-nav").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.shift;
        if (action === "year-prev") state.calendarYear -= 1;
        if (action === "year-next") state.calendarYear += 1;
        if (action === "month-prev") {
          state.calendarMonth -= 1;
          if (state.calendarMonth < 1) {
            state.calendarMonth = 12;
            state.calendarYear -= 1;
          }
        }
        if (action === "month-next") {
          state.calendarMonth += 1;
          if (state.calendarMonth > 12) {
            state.calendarMonth = 1;
            state.calendarYear += 1;
          }
        }
        DateNavigator();
      });
    });

    container.querySelectorAll(".calendar-day.has-data").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedDate = button.dataset.date;
        const parts = String(state.selectedDate).split("-").map(Number);
        state.calendarYear = parts[0] || state.calendarYear;
        state.calendarMonth = parts[1] || state.calendarMonth;
        state.group = "all";
        state.worker = "all";
        render();
      });
    });
  }


  function GroupNavigator(run) {
    const container = document.getElementById("group-nav");
    if (!container) return;
    const groups = [...(run.groups || [])].sort(compareGroups);
    container.innerHTML = groups.length ? groups.map((group) => {
      return '<button class="float-nav-item" type="button" data-group="' + escapeHtml(group.name) + '">' +
        '<span>' + escapeHtml(group.name) + '</span>' +
        '<strong><span class="nav-number">' + formatNumber(group.totalPieces) + '</span><span class="nav-unit">' + escapeHtml(groupUnit(group)) + '</span></strong>' +
        '<em>' + (group.rowCount ?? ((group.rows || []).length)) + ' 人</em>' +
      '</button>';
    }).join("") : '<p class="empty-note">当前日期暂无岗位数据。</p>';

    container.querySelectorAll(".float-nav-item[data-group]").forEach((button) => {
      button.addEventListener("click", () => {
        const targetGroup = button.dataset.group;
        state.group = "all";
        state.worker = "all";
        state.pendingScrollGroup = targetGroup;
        render();
      });
    });

    const floatRoot = document.getElementById("group-float");
    const toggle = document.getElementById("group-panel-toggle");
    if (floatRoot && toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = "true";
      toggle.addEventListener("click", () => {
        const open = !floatRoot.classList.contains("open");
        floatRoot.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  function getDashboardStats(run, groups) {
    const rows = groups.flatMap((group) => group.rows || []);
    const totalPieces = groups.reduce((sum, group) => sum + Number(group.totalPieces || 0), 0);
    const totalOrders = groups.reduce((sum, group) => sum + Number(group.totalOrders || 0), 0);
    const efficiencyRows = rows.filter((row) => row.efficiency !== null && row.efficiency !== undefined && row.efficiency !== "");
    const averageEfficiency = efficiencyRows.length ? efficiencyRows.reduce((sum, row) => sum + Number(row.efficiency || 0), 0) / efficiencyRows.length : null;
    const included = new Set(rows.map((row) => row.worker)).size;
    const reviewCount = getActionableManualItems(run).length;
    const totalWorkers = included + reviewCount;
    const completionRate = totalWorkers > 0 ? included / totalWorkers : 0;
    return { rows, totalPieces, totalOrders, averageEfficiency, included, totalWorkers, reviewCount, completionRate };
  }

  function CoreMetrics(run, groups) {
    const rows = groups.flatMap((group) => group.rows || []);
    document.getElementById("metric-grid").innerHTML =
      MetricCard("工种分组数", groups.length, "Work types") +
      MetricCard("纳入排名人数", new Set(rows.map((row) => row.worker)).size || run.includedWorkers || "-", "Ranked staff") +
      MetricCard("岗位工作记录", rows.length || run.includedWorkRows || "-", "Work records") +
      MetricCard("统计口径人数", getDashboardStats(run, groups).totalWorkers || "-", "Counted staff") +
      MetricCard("人工复核项", getActionableManualItems(run).length, "Review queue");
  }

  function CommandCenter(run, groups) {
    const stats = getDashboardStats(run, groups);
    const percent = clamp(stats.completionRate * 100, 0, 100);
    const circumference = 2 * Math.PI * 72;
    const dash = circumference * (1 - percent / 100);
    document.getElementById("completion-ring").innerHTML =
      '<div class="orbit-ripples" aria-hidden="true"><span></span><span></span><span></span></div>' +
      '<svg class="progress-ring" viewBox="0 0 220 220" role="img" aria-label="统计覆盖率">' +
        '<circle class="ring-track" cx="110" cy="110" r="72"></circle>' +
        '<circle class="ring-value" cx="110" cy="110" r="72" stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + dash.toFixed(2) + '"></circle>' +
      '</svg>' +
      '<div class="orbit-core"><div><strong>' + percent.toFixed(1) + '%</strong><span>统计覆盖率</span></div></div>';

    const tiles = [
      ["今日总工作量", formatNumber(stats.totalPieces), "各岗位有效动作"],
      ["平均人效", stats.averageEfficiency === null ? "-" : stats.averageEfficiency.toLocaleString("zh-CN", { maximumFractionDigits: 2 }), "件/小时"],
      ["纳入统计人数", formatNumber(stats.included), "有效员工"],
      ["人工复核项", formatNumber(stats.reviewCount), "需处理"]
    ];
    document.getElementById("summary-grid").innerHTML = tiles.map((tile) =>
      '<article class="summary-tile"><span>' + tile[0] + '</span><strong>' + tile[1] + '</strong><span>' + tile[2] + '</span></article>'
    ).join("");
  }

  function barChart(items, options) {
    const compact = options && options.compact;
    const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
    const rows = items.map((item) => {
      const ratio = clamp(Number(item.value || 0) / max, 0, 1);
      return '<div class="bar-row">' +
        '<span class="bar-label">' + escapeHtml(item.label) + '</span>' +
        '<span class="bar-track"><span class="bar-meter" style="width:' + (ratio * 100).toFixed(1) + '%"></span></span>' +
        '<strong class="bar-value">' + escapeHtml(item.display || formatCompact(item.value)) + '</strong>' +
      '</div>';
    }).join("");
    return '<div class="bar-chart' + (compact ? " compact" : "") + '">' + rows + '</div>';
  }

  function svgLineChart(points, label, options) {
    const width = 520;
    const height = 180;
    const padX = 42;
    const padTop = 16;
    const padBottom = 30;
    const plotHeight = height - padTop - padBottom;
    const values = points
      .filter((point) => point.value !== null && point.value !== undefined && point.value !== "")
      .map((point) => Number(point.value || 0));
    const max = Math.max(Number(options && options.yMax ? options.yMax : 0), ...values, 1);
    const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
    const coords = points.map((point, index) => {
      const x = points.length > 1 ? padX + index * step : width / 2;
      const hasValue = point.value !== null && point.value !== undefined && point.value !== "";
      const y = hasValue ? padTop + (1 - Number(point.value || 0) / max) * plotHeight : null;
      return { x, y, point, hasValue };
    });
    const segments = [];
    let currentSegment = [];
    coords.forEach((coord) => {
      if (coord.hasValue) {
        currentSegment.push(coord);
      }
      else if (currentSegment.length) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    });
    if (currentSegment.length) segments.push(currentSegment);
    const lines = segments.map((segment) => {
      const pointsText = segment.map((coord) => coord.x.toFixed(1) + "," + coord.y.toFixed(1)).join(" ");
      return '<polyline class="line-path" points="' + pointsText + '"></polyline>';
    }).join("");
    const areas = segments.map((segment) => {
      if (segment.length < 2) return "";
      const pointsText = segment.map((coord) => coord.x.toFixed(1) + "," + coord.y.toFixed(1)).join(" ");
      return '<polygon class="line-area" points="' + segment[0].x.toFixed(1) + "," + (height - padBottom) + " " + pointsText + " " + segment[segment.length - 1].x.toFixed(1) + "," + (height - padBottom) + '"></polygon>';
    }).join("");
    const dots = coords.filter((coord) => coord.hasValue).map((coord) =>
      '<circle cx="' + coord.x.toFixed(1) + '" cy="' + coord.y.toFixed(1) + '" r="3" fill="#6ee7d2"><title>' + escapeHtml(coord.point.label + "：" + formatNumber(coord.point.value)) + '</title></circle>'
    ).join("");
    const labels = coords.map((coord, index) => {
      if (index !== 0 && index !== coords.length - 1) return "";
      return '<text class="chart-label" x="' + coord.x.toFixed(1) + '" y="' + (height - 8) + '" text-anchor="' + (index === 0 ? "start" : "end") + '">' + escapeHtml(String(coord.point.label).slice(5)) + '</text>';
    }).join("");
    const missingMarkers = coords.filter((coord) => !coord.hasValue).map((coord) =>
      '<line class="missing-marker" x1="' + coord.x.toFixed(1) + '" y1="' + padTop + '" x2="' + coord.x.toFixed(1) + '" y2="' + (height - padBottom) + '"><title>' + escapeHtml(coord.point.label + "：无数据") + '</title></line>'
    ).join("");
    const yTicks = [0, 0.5, 1].map((ratio) => {
      const y = padTop + (1 - ratio) * plotHeight;
      return '<line class="grid-line" x1="' + padX + '" y1="' + y.toFixed(1) + '" x2="' + (width - padX) + '" y2="' + y.toFixed(1) + '"></line>' +
        '<text class="axis-label" x="' + (padX - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(formatCompact(max * ratio)) + '</text>';
    }).join("");
    return '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="' + escapeHtml(label) + '">' +
      yTicks +
      '<line class="axis-line" x1="' + padX + '" y1="' + (height - padBottom) + '" x2="' + (width - padX) + '" y2="' + (height - padBottom) + '"></line>' +
      areas + lines + dots + missingMarkers + labels +
    '</svg>';
  }

  function WorkloadChart(groups) {
    const items = [...groups].sort((a, b) => Number(b.totalPieces || 0) - Number(a.totalPieces || 0)).slice(0, 8).map((group) => ({
      label: group.name,
      value: Number(group.totalPieces || 0),
      display: formatCompact(group.totalPieces)
    }));
    document.getElementById("workload-bars").innerHTML = items.length ? barChart(items, { compact: true }) : '<p class="empty-note">暂无工作量数据。</p>';
  }

  function EfficiencyChart(groups) {
    const items = [...groups].filter((group) => group.efficiency !== null && group.efficiency !== undefined && group.efficiency !== "").sort((a, b) => Number(b.efficiency || 0) - Number(a.efficiency || 0)).slice(0, 8).map((group) => ({
      label: group.name,
      value: Number(group.efficiency || 0),
      display: Number(group.efficiency || 0).toLocaleString("zh-CN", { maximumFractionDigits: 1 })
    }));
    document.getElementById("efficiency-chart").innerHTML = items.length ? barChart(items) : '<p class="empty-note">当前考勤覆盖不足，暂无完整工种人效对比。</p>';
  }

  function WorkloadTrend() {
    const points = getTrendDays(state.selectedDate, 7).map((day) => ({
      label: day.date,
      value: day.run ? (day.run.groups || []).reduce((sum, group) => sum + Number(group.totalPieces || 0), 0) : null
    }));
    document.getElementById("total-trend").innerHTML = svgLineChart(points, (state.selectedDate || "") + " 截止连续7天真实工作量趋势", { yMax: totalPiecesMax });
  }

  function GroupTrend(groupName) {
    const trendDays = getTrendDays(state.selectedDate, 7);
    const points = trendDays.map((day) => {
      const group = day.run ? (day.run.groups || []).find((item) => item.name === groupName) : null;
      return { label: day.date, value: group ? Number(group.totalPieces || 0) : null };
    });
    const averagePoints = points.filter((point) => point.value !== null && point.value !== undefined && point.value !== "");
    const trendAverage = averagePoints.length
      ? averagePoints.reduce((sum, point) => sum + Number(point.value || 0), 0) / averagePoints.length
      : null;
    const efficiencyPoints = trendDays.map((day) => {
      const group = day.run ? (day.run.groups || []).find((item) => item.name === groupName) : null;
      return group ? group.efficiency : null;
    }).filter((value) => value !== null && value !== undefined && value !== "");
    const efficiencyAverage = efficiencyPoints.length
      ? efficiencyPoints.reduce((sum, value) => sum + Number(value || 0), 0) / efficiencyPoints.length
      : null;
    const latestRun = getRun(state.selectedDate);
    const latest = ((latestRun && latestRun.groups) || []).find((item) => item.name === groupName);
    return '<div class="group-trend">' +
      '<h3>连续7天趋势</h3>' +
      svgLineChart(points, groupName + "连续7天真实趋势", { yMax: getGroupYMax(groupName) }) +
      '<div class="trend-summary">' +
        '<div><span>最新日期</span><strong>' + escapeHtml(state.selectedDate || "-") + '</strong></div>' +
        '<div><span>7天工作量均值</span><strong>' + formatAverageNumber(trendAverage) + '</strong></div>' +
        '<div><span>7天效率均值</span><strong>' + formatEfficiency(efficiencyAverage) + '</strong></div>' +
        '<div><span>总件数</span><strong>' + formatNumber(latest ? latest.totalPieces : null) + '</strong></div>' +
        '<div><span>单数</span><strong>' + formatNumber(latest ? latest.totalOrders : null) + '</strong></div>' +
        '<div><span>效率</span><strong>' + formatEfficiency(latest ? latest.efficiency : null) + '</strong></div>' +
      '</div>' +
    '</div>';
  }

  function GroupDistribution(groups) {
    const total = groups.reduce((sum, group) => sum + Number(group.totalPieces || 0), 0);
    const top = [...groups].sort((a, b) => Number(b.totalPieces || 0) - Number(a.totalPieces || 0)).slice(0, 8);
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const colors = ["#6ee7d2", "#c9fff4", "#b9d7cf", "#e8c170", "#8fbdb5", "#d6a6a6", "#9fb4c7", "#a9d9a8"];
    const rings = top.map((group, index) => {
      const portion = total ? Number(group.totalPieces || 0) / total : 0;
      const dash = Math.max(0.8, portion * circumference);
      const circle = '<circle cx="75" cy="75" r="' + radius + '" fill="none" stroke="' + colors[index % colors.length] + '" stroke-width="10" stroke-dasharray="' + dash.toFixed(2) + ' ' + (circumference - dash).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 75 75)"></circle>';
      offset += dash;
      return circle;
    }).join("");
    const legend = top.map((group, index) =>
      '<div class="legend-row" style="--legend-color:' + colors[index % colors.length] + '"><i class="legend-dot" style="background:' + colors[index % colors.length] + '"></i><span>' + escapeHtml(group.name) + '</span><strong>' + formatCompact(group.totalPieces) + '</strong></div>'
    ).join("");
    document.getElementById("group-donut").innerHTML =
      '<div class="donut-grid"><svg class="donut-svg" viewBox="0 0 150 150">' +
        '<circle cx="75" cy="75" r="' + radius + '" fill="none" stroke="rgba(210,235,225,0.10)" stroke-width="10"></circle>' +
        rings +
        '<text x="75" y="72" text-anchor="middle" fill="#f2f8ff" font-size="20" font-family="Consolas" font-weight="800">' + groups.length + '</text>' +
        '<text x="75" y="91" text-anchor="middle" fill="#91a4ba" font-size="11">工种</text>' +
      '</svg><div class="donut-legend">' + legend + '</div></div>';
  }

  function AttendancePanel(run, groups) {
    const stats = getDashboardStats(run, groups);
    const matched = stats.rows.filter((row) => row.efficiency !== null && row.efficiency !== undefined && row.efficiency !== "").length;
    const coverage = stats.rows.length ? matched / stats.rows.length : 0;
    const tiles = [
      ["考勤覆盖", (coverage * 100).toFixed(1) + "%", "有工时记录"],
      ["已匹配效率", formatNumber(matched), "记录"],
      ["待补效率", formatNumber(stats.rows.length - matched), "记录"],
      ["复核人数", formatNumber(getActionableManualItems(run).length), "人员"]
    ];
    document.getElementById("attendance-panel").innerHTML = '<div class="summary-grid">' + tiles.map((tile) =>
      '<article class="summary-tile"><span>' + tile[0] + '</span><strong>' + tile[1] + '</strong><span>' + tile[2] + '</span></article>'
    ).join("") + '</div>';
  }

  function RoleEfficiencyChart(groups) {
    const roleMap = new Map();
    groups.flatMap((group) => group.rows || []).forEach((row) => {
      const key = row.role || "未标注岗位";
      const entry = roleMap.get(key) || { role: key, pieces: 0, efficiencySum: 0, efficiencyCount: 0 };
      entry.pieces += Number(row.pieces || 0);
      if (row.efficiency !== null && row.efficiency !== undefined && row.efficiency !== "") {
        entry.efficiencySum += Number(row.efficiency || 0);
        entry.efficiencyCount += 1;
      }
      roleMap.set(key, entry);
    });
    const items = [...roleMap.values()].map((item) => ({
      label: item.role.replace(/（.*?）/g, ""),
      value: item.efficiencyCount ? item.efficiencySum / item.efficiencyCount : item.pieces,
      display: item.efficiencyCount ? (item.efficiencySum / item.efficiencyCount).toLocaleString("zh-CN", { maximumFractionDigits: 1 }) : formatCompact(item.pieces)
    })).sort((a, b) => Number(b.value || 0) - Number(a.value || 0)).slice(0, 7);
    document.getElementById("role-efficiency").innerHTML = items.length ? barChart(items, { compact: true }) : '<p class="empty-note">暂无岗位效率数据。</p>';
  }

  function EmployeeRanking(groups) {
    const workerMap = new Map();
    groups.forEach((group) => {
      (group.rows || []).forEach((row) => {
        if (Number(row.pieces || 0) <= 0) return;
        const key = row.worker || "";
        if (!key) return;
        const entry = workerMap.get(key) || {
          worker: key,
          role: row.role || "",
          pieces: 0,
          orders: 0,
          workHours: 0,
          hasMissingHours: false,
          groups: new Set()
        };
        entry.pieces += Number(row.pieces || 0);
        entry.orders += Number(row.orders || 0);
        if (row.workHours !== null && row.workHours !== undefined && row.workHours !== "") {
          entry.workHours += Number(row.workHours || 0);
        }
        else {
          entry.hasMissingHours = true;
        }
        if (group.name) entry.groups.add(group.name);
        workerMap.set(key, entry);
      });
    });
    const rows = [...workerMap.values()].map((entry) => ({
      ...entry,
      efficiency: !entry.hasMissingHours && entry.workHours > 0 ? entry.pieces / entry.workHours : null,
      groupLabel: [...entry.groups].join("、") || entry.role || "-"
    }))
      .sort((a, b) => Number(b.pieces || 0) - Number(a.pieces || 0))
      .slice(0, 18);
    document.getElementById("employee-ranking").innerHTML = rows.length ? rows.map((row, index) =>
      '<article class="ranking-item top-' + (index + 1) + '">' +
        '<div class="rank-num">' + (index + 1) + '</div>' +
        '<div class="avatar">' + escapeHtml(String(row.worker || "?").slice(0, 1)) + '</div>' +
        '<div class="rank-main"><strong>' + escapeHtml(row.worker) + '</strong><span>' + escapeHtml(row.groupLabel) + '</span></div>' +
        '<div class="rank-side"><strong>' + formatCompact(row.pieces) + '</strong><span>' + formatEfficiency(row.efficiency) + '</span></div>' +
      '</article>'
    ).join("") : '<p class="empty-note">暂无排名数据。</p>';
  }

  function ManualReview(run) {
    const items = getActionableManualItems(run);
    document.getElementById("manual-grid").innerHTML = items.length ? items.map((item) =>
      '<article class="review-card">' +
        '<div class="review-top"><strong>' + escapeHtml(item.worker) + '</strong><span>' + escapeHtml(item.workType) + '</span></div>' +
        '<p class="review-role">岗位：' + escapeHtml(item.role) + '</p>' +
        '<p class="review-reason">' + escapeHtml(item.reason) + '</p>' +
      '</article>'
    ).join("") : '<p class="empty-note">今天没有被排除的人工复核人员。</p>';
  }

  function Alerts(run) {
    const pill = document.getElementById("status-pill");
    const alerts = getWorkerAnomalies(run);
    pill.textContent = alerts.length ? "员工波动 " + alerts.length : "无明显波动";
    pill.className = "status-pill " + (alerts.length ? "status-partial" : "status-ok");
    document.getElementById("notes").innerHTML = alerts.length
      ? '<div class="alert-list">' + alerts.map((item) =>
        '<article class="alert-item employee-alert">' +
          '<div class="alert-top"><strong>' + escapeHtml(item.worker) + '</strong><span>' + Math.round(item.ratio * 100) + '%</span></div>' +
          '<p>当天工作量 ' + formatNumber(item.pieces) + '，过去一周有效工作日均值 ' + formatNumber(Math.round(item.average)) + '，低于均值 ' + (100 - item.ratio * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 }) + '%。</p>' +
          '<small>' + escapeHtml(item.groups) + ' · 对比 ' + item.sampleDays + ' 个有效工作日；无工作量且无打卡工时的日期已按休息排除。</small>' +
        '</article>'
      ).join("") + '</div>'
      : '<p class="empty-note">当前日期没有发现低于过去一周有效工作日均值 20% 以上的员工。</p>';
  }

  function RunNotes(run) {
    const container = document.getElementById("run-notes-panel");
    if (!container) return;
    const notes = run.notes || [];
    container.innerHTML =
      '<div class="panel-head"><h2 class="panel-title">运行记录</h2><span class="panel-kicker">RUN NOTES</span></div>' +
      (notes.length
        ? '<div class="run-note-list">' + notes.map((note) => '<div class="run-note-item">' + escapeHtml(note) + '</div>').join("") + '</div>'
        : '<p class="empty-note">当前日期没有运行记录。</p>');
  }

  function GroupCards(run, previousRun, groups) {
    const previousMap = new Map(((previousRun && previousRun.groups) || []).map((group) => [group.name, group]));
    const inspectionBreakdown = qualityInspectionBreakdown((run && run.groups) || groups);
    document.getElementById("group-grid").innerHTML = groups.length ? groups.map((group) => {
      const previous = previousMap.get(group.name);
      const deltaPieces = previous ? Number(group.totalPieces || 0) - Number(previous.totalPieces || 0) : null;
      const deltaOrders = previous ? Number(group.totalOrders || 0) - Number(previous.totalOrders || 0) : null;
      const rows = (group.rows || []).map((row) => renderGroupRow(row, group)).join("");
      return '<section class="group-card" id="' + escapeHtml(groupDomId(group.name)) + '">' +
        '<div class="group-header">' +
          '<div><h2>' + escapeHtml(group.name) + '</h2><p>纳入人数 ' + (group.rowCount ?? 0) + ' 人' + (group.auxiliaryCount ? ' · 辅助/顺手 ' + group.auxiliaryCount + ' 条' : '') + '</p></div>' +
          renderGroupMetrics(group, deltaPieces, deltaOrders, inspectionBreakdown) +
        '</div>' +
        '<div class="group-body">' +
          renderGroupTable(group, rows) +
          GroupTrend(group.name) +
        '</div>' +
      '</section>';
    }).join("") : '<section class="tech-panel"><p class="empty-note">当前筛选下没有可展示的工种结果。</p></section>';
  }

  function AuxiliaryActions(groups) {
    const container = document.getElementById("auxiliary-panel");
    if (!container) return;
    const rows = groups.flatMap((group) => (group.auxiliaryRows || []).map((row) => ({ ...row, groupName: group.name })))
      .sort((a, b) => Number(b.pieces || 0) - Number(a.pieces || 0));
    const totalPieces = rows.reduce((sum, row) => sum + Number(row.pieces || 0), 0);
    const totalOrders = rows.reduce((sum, row) => sum + Number(row.orders || 0), 0);
    const body = rows.length
      ? '<details class="auxiliary-details"><summary><span>展开辅助动作 / 顺手操作明细</span><strong>' + rows.length + ' 条 / ' + formatNumber(totalPieces) + ' 件 / ' + formatNumber(totalOrders) + ' 单</strong></summary>' +
        '<div class="table-wrap auxiliary-table"><table><thead><tr><th>工种</th><th>员工 / 岗位</th><th>件数</th><th>单数</th><th>说明</th></tr></thead><tbody>' +
        rows.map((row) =>
          '<tr>' +
            '<td class="rank">' + escapeHtml(row.groupName || "-") + '</td>' +
            '<td><strong>' + escapeHtml(row.worker) + '</strong><span class="sub">' + escapeHtml(row.role) + '</span></td>' +
            '<td>' + formatNumber(row.pieces) + '</td>' +
            '<td>' + formatNumber(row.orders) + '</td>' +
            '<td>' + escapeHtml(row.reason || "低于有效工种阈值，不计入排名和效率。") + '</td>' +
          '</tr>'
        ).join("") +
        '</tbody></table></div></details>'
      : '<p class="empty-note">当前筛选下没有辅助动作 / 顺手操作记录。</p>';
    container.innerHTML =
      '<div class="panel-head"><h2 class="panel-title">辅助动作 / 顺手操作</h2><span class="panel-kicker">AUXILIARY</span></div>' +
      '<p class="auxiliary-lead">低于有效工种阈值 20 的记录集中展示；不进入工种排名、汇总和效率计算。</p>' +
      body;
  }

  function scheduleGroupCards(run, previousRun, groups, token) {
    const container = document.getElementById("group-grid");
    if (!container) return;
    const previousHeight = container.getBoundingClientRect().height;
    const previousContent = container.innerHTML;
    const hasRenderedGroupCards = container.children.length > 0;
    if (previousHeight > 0) {
      container.style.minHeight = Math.ceil(previousHeight) + "px";
    }
    container.setAttribute("aria-busy", "true");
    container.innerHTML = '<section class="tech-panel"><p class="empty-note">正在加载工种明细...</p></section>';
    if (hasRenderedGroupCards) {
      container.innerHTML = previousContent;
    }
    if (groupCardTimer) {
      if (window.cancelIdleCallback) window.cancelIdleCallback(groupCardTimer);
      else clearTimeout(groupCardTimer);
    }
    const renderCards = () => {
      if (token !== state.renderToken) return;
      GroupCards(run, previousRun, groups);
      AuxiliaryActions(groups);
      container.setAttribute("aria-busy", "false");
      window.requestAnimationFrame(() => {
        if (token === state.renderToken) container.style.minHeight = "";
      });
      if (state.pendingScrollGroup) {
        const target = document.getElementById(groupDomId(state.pendingScrollGroup));
        state.pendingScrollGroup = "";
        if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
      }
      groupCardTimer = null;
    };
    if (window.requestIdleCallback) {
      groupCardTimer = window.requestIdleCallback(renderCards, { timeout: 350 });
    }
    else {
      groupCardTimer = setTimeout(renderCards, 32);
    }
  }

  function bindFilters() {
    document.getElementById("filter-date").addEventListener("change", (event) => {
      state.selectedDate = event.target.value;
      state.group = "all";
      state.worker = "all";
      render();
    });
    document.getElementById("filter-group").addEventListener("change", (event) => {
      state.group = event.target.value;
      state.worker = "all";
      render();
    });
    document.getElementById("filter-worker").addEventListener("change", (event) => {
      state.worker = event.target.value;
      render();
    });
  }

  function render() {
    const token = ++state.renderToken;
    const run = getRun(state.selectedDate) || history[0];
    if (!run) return;
    const previousRun = getPreviousRun(run.date);
    const groups = getFilteredGroups(run);
    DashboardFilters(run);
    DateNavigator();
    GroupNavigator(run);
    Alerts(run);
    CoreMetrics(run, groups);
    CommandCenter(run, groups);
    GroupDistribution(groups);
    WorkloadChart(groups);
    EfficiencyChart(groups);
    WorkloadTrend();
    AttendancePanel(run, groups);
    RoleEfficiencyChart(groups);
    EmployeeRanking(groups);
    scheduleGroupCards(run, previousRun, groups, token);
    ManualReview(run);
    RunNotes(run);
  }

  buildShell();
  bindFilters();
  render();
  scrollToTopOnInitialLoad();
})();
