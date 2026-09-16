(() => {
  const data = window.SCHEDULING_DATA || { months: [] };
  const state = { month: data.selectedMonth, date: "", startDate: "", endDate: "", name: "", detailLimit: 50, detailPage: 1 };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: digits });
  const monthObj = () => data.months.find((item) => item.month === state.month) || data.months[data.months.length - 1] || { people: [], daily: [], dailyRecords: [], summary: {} };
  const dayObj = (month) => month.daily.find((item) => item.date === state.date) || month.daily[month.daily.length - 1] || {};
  const monthRange = (month) => ({ first: month.daily[0]?.date || "", last: month.daily[month.daily.length - 1]?.date || "" });
  const rangeLabel = () => state.startDate === state.endDate ? state.startDate : `${state.startDate} 至 ${state.endDate}`;
  const inRange = (date) => (!state.startDate || date >= state.startDate) && (!state.endDate || date <= state.endDate);
  const rangeRecords = (month) => month.dailyRecords.filter((row) => inRange(row.date) && (!state.name || row.name.includes(state.name)));
  const rangeDays = (month) => month.daily.filter((row) => inRange(row.date));

  function ensureDateRange(month) {
    const { first, last } = monthRange(month);
    if (!first || !last) return;
    if (!state.startDate || state.startDate < first || state.startDate > last) state.startDate = first;
    if (!state.endDate || state.endDate < first || state.endDate > last) state.endDate = last;
    if (state.startDate > state.endDate) [state.startDate, state.endDate] = [state.endDate, state.startDate];
    if (!state.date || state.date < state.startDate || state.date > state.endDate) state.date = state.endDate;
  }

  function summarizeRows(month, rows) {
    const names = new Set(rows.map((row) => row.name).filter(Boolean));
    return {
      presentPeople: rows.filter((row) => row.status === "出勤").length,
      restPeople: rows.filter((row) => row.status === "休息/未排班").length,
      leavePeople: rows.filter((row) => row.status === "请假").length,
      overtimePeople: rows.filter((row) => Number(row.overtimeHours || 0) > 0).length,
      overtimeHours: rows.reduce((sum, row) => sum + Number(row.overtimeHours || 0), 0),
      warningPeople: rows.filter((row) => row.lateCount || row.missingClockCount || row.status === "异常").length,
      people: names.size || month.summary.people,
    };
  }

  function renderControls() {
    const month = monthObj();
    const { first, last } = monthRange(month);
    $("month-select").innerHTML = data.months.map((item) => `<option value="${esc(item.month)}">${esc(item.month)}</option>`).join("");
    $("month-select").value = state.month;
    $("start-date-filter").min = first;
    $("start-date-filter").max = last;
    $("start-date-filter").value = state.startDate;
    $("end-date-filter").min = first;
    $("end-date-filter").max = last;
    $("end-date-filter").value = state.endDate;
    $("name-filter").value = state.name;
    $("detail-limit").value = String(state.detailLimit);
  }

  function renderMetrics(month, summary) {
    $("month-status").innerHTML = `<span class="status-card"><span>当前月份</span><strong>${esc(month.month || "-")}</strong><small>${esc(rangeLabel() || "无日期")}</small></span>`;
    const items = [
      ["筛选出勤", summary.presentPeople, "范围内出勤记录"],
      ["休息/未排班", summary.restPeople, "范围内明细标记"],
      ["请假记录", summary.leavePeople, "含事假、病假等"],
      ["加班记录", summary.overtimePeople, `${fmt(summary.overtimeHours, 1)} 小时`],
      ["缺卡/迟到", summary.warningPeople, "需人工复核"],
      ["筛选人数", summary.people, "范围内涉及人员"],
    ];
    $("metric-grid").innerHTML = items.map(([label, value, note]) => `<article class="metric"><span>${esc(label)}</span><strong>${fmt(value)}</strong><small>${esc(note)}</small></article>`).join("");
  }

  function renderDays(month) {
    const days = month.daily || [];
    const selected = dayObj(month);
    const first = days[0]?.date || `${month.month || ""}-01`;
    const firstDate = new Date(`${first}T00:00:00`);
    const leading = Number.isNaN(firstDate.getTime()) ? 0 : (firstDate.getDay() + 6) % 7;
    $("calendar-title").textContent = month.month ? `${month.month.replace("-", "年")}月` : "-";
    $("calendar-summary").textContent = `${fmt(days.length)} 天记录`;
    const monthIndex = data.months.findIndex((item) => item.month === month.month);
    $("calendar-prev-month").disabled = monthIndex <= 0;
    $("calendar-next-month").disabled = monthIndex < 0 || monthIndex >= data.months.length - 1;
    $("calendar-detail").innerHTML = selected.date ? `<span class="calendar-meta">${esc(selected.date)} ${esc(selected.weekday || "")}</span><span class="calendar-badge">出勤 ${fmt(selected.presentPeople)} · 休息/未排班 ${fmt(selected.restPeople)} · 请假 ${fmt(selected.leavePeople)} · 异常 ${fmt(selected.warningPeople)}</span>` : `<span class="calendar-meta">无日期</span>`;
    const blanks = Array.from({ length: leading }, () => `<span class="calendar-blank" aria-hidden="true"></span>`);
    const cells = days.map((day) => {
      const dayNumber = Number(day.date.slice(8, 10));
      const label = `${day.date}，${day.weekday || ""}，出勤 ${fmt(day.presentPeople)}，异常 ${fmt(day.warningPeople)}`;
      const warn = Number(day.warningPeople || 0);
      return `<button class="calendar-day ${day.date === state.date ? "active" : ""}" type="button" data-date="${esc(day.date)}" aria-label="${esc(label)}" title="${esc(label)}"><span class="calendar-day-num">${fmt(dayNumber)}</span>${warn ? `<span class="calendar-warn">${fmt(warn)}</span>` : ""}</button>`;
    });
    $("day-strip").innerHTML = blanks.concat(cells).join("");
    document.querySelectorAll(".calendar-day").forEach((card) => card.addEventListener("click", () => {
      state.date = card.dataset.date;
      state.startDate = card.dataset.date;
      state.endDate = card.dataset.date;
      state.detailPage = 1;
      render();
      if (window.matchMedia("(max-width:680px)").matches) {
        $("calendarSidebar")?.classList.remove("is-open");
        $("calendarPanelToggle")?.setAttribute("aria-expanded", "false");
      }
    }));
  }

  function renderTrend() {
    const trend = data.trend || data.months.map((month) => ({ month: month.month, ...month.summary, warningPeople: (month.dailyRecords || []).filter((row) => row.lateCount || row.missingClockCount || row.status === "\u5f02\u5e38").length, dailyRecords: month.dailyRecords.length }));
    if (!trend.length) {
      $("trend-list").innerHTML = `<article class="trend-chart muted">暂无历史月度数据</article>`;
      return;
    }
    const month = monthObj();
    const width = 620;
    const height = 260;
    const pad = { top: 28, right: 34, bottom: 64, left: 42 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const chartBase = pad.top + chartH;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animateAttr = (attr, from, to, delay = 0, dur = .72) => reduceMotion ? "" : `<animate attributeName="${attr}" from="${from}" to="${to}" dur="${dur}s" begin="${delay}s" fill="freeze"></animate>`;
    const labelDelay = (index) => reduceMotion ? "" : ` style="animation-delay:${.62 + index * .05}s"`;
    const maxAttendance = Math.max(...trend.map((item) => Number(item.attendanceDays || 0)), 1);
    const maxPeople = Math.max(...trend.map((item) => Number(item.people || 0)), 1);
    const xStep = trend.length > 1 ? chartW / (trend.length - 1) : chartW;
    const barWidth = Math.min(58, Math.max(28, chartW / Math.max(trend.length, 1) * .42));
    const xFor = (index) => pad.left + (trend.length > 1 ? index * xStep : chartW / 2);
    const yAttendance = (value) => pad.top + chartH - Number(value || 0) / maxAttendance * chartH;
    const warningTotalFor = (item) => Number(item.warningPeople ?? (Number(item.lateCount || 0) + Number(item.missingClockCount || 0)));
    const maxWarning = Math.max(...trend.map((item) => warningTotalFor(item)), 1);
    const yBand = (value, max, topRatio, bottomRatio) => {
      const top = pad.top + chartH * topRatio;
      const bottom = pad.top + chartH * bottomRatio;
      return bottom - Number(value || 0) / max * (bottom - top);
    };
    const yPeople = (value) => yBand(value, maxPeople, .10, .38);
    const yWarning = (value) => yBand(value, maxWarning, .48, .82);
    const gridLines = [0, .25, .5, .75, 1].map((ratio) => {
      const y = pad.top + chartH * ratio;
      return `<line class="trend-grid-line" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line>`;
    }).join("");
    const barRects = trend.map((item, index) => {
      const x = xFor(index);
      const value = Number(item.attendanceDays || 0);
      const y = yAttendance(value);
      const h = pad.top + chartH - y;
      const finalH = Math.max(2, h);
      return `<rect class="trend-bar-rect" x="${x - barWidth / 2}" y="${reduceMotion ? y : chartBase}" width="${barWidth}" height="${reduceMotion ? finalH : 0}" rx="8"><title>${esc(item.month)} 出勤天数 ${fmt(value, 0)}</title>${animateAttr("y", chartBase, y, index * .06)}${animateAttr("height", 0, finalH, index * .06)}</rect>`;
    }).join("");
    const barValues = trend.map((item, index) => {
      const x = xFor(index);
      const value = Number(item.attendanceDays || 0);
      const y = yAttendance(value);
      return `<text class="trend-bar-value trend-anim-label" x="${x}" y="${Math.min(y + 20, pad.top + chartH - 8)}" text-anchor="middle"${labelDelay(index)}>${fmt(value, 0)}</text>`;
    }).join("");
    const peoplePoints = trend.map((item, index) => `${xFor(index)},${yPeople(item.people)}`).join(" ");
    const peopleBase = pad.top + chartH * .38;
    const peopleStartPoints = trend.map((item, index) => `${xFor(index)},${peopleBase}`).join(" ");
    const peopleDots = trend.map((item, index) => {
      const x = xFor(index);
      const y = yPeople(item.people);
      const label = fmt(item.people);
      const labelY = Math.max(18, y - 26 - (index % 2) * 12);
      return `<circle class="trend-point" cx="${x}" cy="${reduceMotion ? y : peopleBase}" r="5"><title>${esc(item.month)} 人数 ${label}</title>${animateAttr("cy", peopleBase, y, .12 + index * .05, .78)}</circle><rect class="trend-line-box trend-anim-label" x="${x - 18}" y="${labelY - 15}" width="36" height="20" rx="6"${labelDelay(index)}></rect><text class="trend-line-value trend-anim-label" x="${x}" y="${labelY}" text-anchor="middle"${labelDelay(index)}>${label}</text>`;
    }).join("");
    const warningPoints = trend.map((item, index) => `${xFor(index)},${yWarning(warningTotalFor(item))}`).join(" ");
    const warningBase = pad.top + chartH * .82;
    const warningStartPoints = trend.map((item, index) => `${xFor(index)},${warningBase}`).join(" ");
    const warningDots = trend.map((item, index) => {
      const x = xFor(index);
      const warningTotal = warningTotalFor(item);
      const y = yWarning(warningTotal);
      const labelY = Math.min(pad.top + chartH - 10, y + 24 + (index % 2) * 8);
      return `<circle class="trend-warning-point" cx="${x}" cy="${reduceMotion ? y : warningBase}" r="5"><title>${esc(item.month)} 异常 ${fmt(warningTotal)}</title>${animateAttr("cy", warningBase, y, .18 + index * .05, .78)}</circle><rect class="trend-warning-box trend-anim-label" x="${x - 30}" y="${labelY - 15}" width="60" height="20" rx="6"${labelDelay(index)}></rect><text class="trend-warning-value trend-anim-label" x="${x}" y="${labelY}" text-anchor="middle"${labelDelay(index)}>异常 ${fmt(warningTotal)}</text>`;
    }).join("");
    const labels = trend.map((item, index) => `<text class="trend-label" x="${xFor(index)}" y="${height - 26}" text-anchor="middle">${esc(item.month.slice(5))}月</text>`).join("");
    const hitWidth = Math.min(112, Math.max(70, xStep * .62 || 80));
    const monthHitAreas = trend.map((item, index) => {
      const x = xFor(index);
      return `<rect class="trend-month-hit" data-trend-month="${esc(item.month)}" tabindex="0" role="button" aria-label="查看 ${esc(item.month)} 数据" x="${x - hitWidth / 2}" y="${pad.top}" width="${hitWidth}" height="${chartH + 50}" rx="10"><title>查看 ${esc(item.month)} 数据</title></rect>`;
    }).join("");
    const dailyRows = (month.daily || []).map((day) => `<tr><td>${esc(day.date)}</td><td class="muted-cell">${esc(day.weekday || "")}</td><td>${fmt(day.presentPeople)}</td><td>${fmt(day.restPeople)}</td><td>${fmt(day.leavePeople)}</td><td>${fmt(day.overtimePeople)}</td><td>${fmt(day.warningPeople)}</td></tr>`).join("");
    const dailyTable = `<aside class="daily-month-panel"><div class="daily-month-head"><strong>${esc(month.month || "-")} 每日汇总</strong><span>${fmt((month.daily || []).length)} 天</span></div><div class="daily-table-wrap"><table class="daily-month-table"><thead><tr><th>日期</th><th>星期</th><th>出勤</th><th>休息</th><th>请假</th><th>加班</th><th>异常</th></tr></thead><tbody>${dailyRows || `<tr><td colspan="7">暂无每日汇总</td></tr>`}</tbody></table></div></aside>`;
    $("trend-list").innerHTML = `<div class="trend-overview"><article class="trend-chart"><svg viewBox="0 0 ${width} ${height}" aria-label="历史月度趋势图，柱状为出勤天数，黄色折线为人数，红色折线为异常人次"><defs><linearGradient id="attendanceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#5fe0c7"></stop><stop offset="100%" stop-color="#fff0bd"></stop></linearGradient></defs>${gridLines}<line class="trend-axis" x1="${pad.left}" y1="${pad.top + chartH}" x2="${width - pad.right}" y2="${pad.top + chartH}"></line>${barRects}<polyline class="trend-warning-line" points="${reduceMotion ? warningPoints : warningStartPoints}">${animateAttr("points", warningStartPoints, warningPoints, .16, .88)}</polyline>${warningDots}<polyline class="trend-line" points="${reduceMotion ? peoplePoints : peopleStartPoints}">${animateAttr("points", peopleStartPoints, peoplePoints, .10, .88)}</polyline>${peopleDots}${barValues}${labels}${monthHitAreas}</svg><div class="trend-legend"><span><i></i>出勤天数</span><span><i class="people"></i>人数</span><span><i class="warning"></i>异常人次</span></div></article>${dailyTable}</div>`;
    document.querySelectorAll("[data-trend-month]").forEach((node) => {
      node.addEventListener("click", () => selectMonth(node.dataset.trendMonth));
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectMonth(node.dataset.trendMonth);
        }
      });
    });
  }

  function renderDayStatus(month, day, rows) {
    $("day-title").textContent = `${rangeLabel() || day.date || "-"} 状态构成`;
    const workHours = rows.filter((row) => row.status === "出勤").reduce((sum, row) => sum + Number(row.workHours || 0), 0);
    const leaveHours = rows.filter((row) => row.status === "请假").reduce((sum, row) => sum + Number(row.leaveHours || 0), 0);
    const warningCount = rows.filter((row) => row.lateCount || row.missingClockCount || row.status === "异常").length;
    const groups = [
      ["出勤", rows.filter((r) => r.status === "出勤").length, "good", `${fmt(workHours, 1)} 工时`],
      ["请假", rows.filter((r) => r.status === "请假").length, "warn", `${fmt(leaveHours, 1)} 小时`],
      ["休息/未排班", rows.filter((r) => r.status === "休息/未排班").length, "", "记录数"],
      ["异常提醒", warningCount, "red", "复核人次"],
    ];
    $("shift-list").innerHTML = groups.map(([name, count, tone, note]) => `<article class="shift-card"><div class="shift-card-head"><span class="shift-name">${esc(name)}</span></div><div class="time-block">${fmt(count)}</div><div class="shift-card-foot"><span class="shift-note">当前筛选范围</span><span class="tag ${tone}">${esc(note)}</span></div></article>`).join("");
  }

  function renderDetails(rows) {
    const pageCount = Math.max(1, Math.ceil(rows.length / state.detailLimit));
    state.detailPage = Math.min(Math.max(1, state.detailPage), pageCount);
    const start = (state.detailPage - 1) * state.detailLimit;
    const visibleRows = rows.slice(start, start + state.detailLimit);
    $("detail-count").textContent = rows.length ? `显示 ${fmt(start + 1)}-${fmt(start + visibleRows.length)} / ${fmt(rows.length)} 条` : "无明细";
    $("detail-page-info").textContent = rows.length ? `第 ${fmt(state.detailPage)} / ${fmt(pageCount)} 页` : "第 0 / 0 页";
    $("detail-prev").disabled = state.detailPage <= 1;
    $("detail-next").disabled = state.detailPage >= pageCount || !rows.length;
    $("detail-body").innerHTML = visibleRows.length ? visibleRows.map((row) => {
      const warn = [row.lateCount ? `迟到${fmt(row.lateCount)}次` : "", row.missingClockCount ? `缺卡${fmt(row.missingClockCount)}次` : ""].filter(Boolean).join(" / ") || "-";
      return `<tr><td>${esc(row.date)}</td><td>${esc(row.name)}</td><td>${esc(row.status)}</td><td>${esc(row.checkin)} ${esc(row.checkinResult)}</td><td>${esc(row.checkout)} ${esc(row.checkoutResult)}</td><td>${fmt(row.workHours, 1)}</td><td>${fmt(row.overtimeHours, 1)}</td><td>${fmt(row.leaveHours, 1)}</td><td>${esc(warn)}</td></tr>`;
    }).join("") : `<tr><td colspan="9">当前筛选无人员明细</td></tr>`;
  }

  function renderWarnings(rows) {
    const allWarnings = rows.filter((row) => row.lateCount || row.missingClockCount || row.status === "异常");
    const warnings = allWarnings.slice(0, 50);
    $("warning-count").textContent = allWarnings.length ? `显示 ${fmt(warnings.length)} / ${fmt(allWarnings.length)} 人次` : "无异常";
    $("warning-list").innerHTML = warnings.length ? warnings.map((row) => {
      const tone = row.missingClockCount ? "missing" : row.status === "异常" ? "status" : "late";
      const type = row.missingClockCount ? "缺卡" : row.status === "异常" ? "未能归类" : "迟到";
      return `<article class="warning-card ${tone}"><strong>${esc(row.name)}</strong><span class="warning-type">${esc(type)}</span><span class="muted">${esc(row.date)} ${row.lateCount ? `迟到 ${fmt(row.lateCount)} 次` : ""}${row.missingClockCount ? ` 缺卡 ${fmt(row.missingClockCount)} 次` : ""}${row.status === "异常" ? " 缺少出勤/休息/请假标记" : ""}</span></article>`;
    }).join("") : `<article class="warning-card status"><strong>当前筛选无异常</strong><span class="muted">未发现迟到、缺卡或未能归类记录。</span></article>`;
  }

  function render() {
    const month = monthObj();
    ensureDateRange(month);
    const day = dayObj(month);
    const rows = rangeRecords(month);
    const summary = summarizeRows(month, rows);
    renderControls();
    renderMetrics(month, summary);
    renderDays(month);
    renderTrend();
    renderDayStatus(month, day, rows);
    renderDetails(rows);
    renderWarnings(rows);
  }

  function selectMonth(monthValue, scrollTarget = "filters") {
    if (!data.months.some((item) => item.month === monthValue)) return;
    state.month = monthValue;
    state.date = "";
    state.startDate = "";
    state.endDate = "";
    state.detailPage = 1;
    render();
    if (scrollTarget === "filters") {
      document.querySelector(".toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  $("month-select").addEventListener("change", (event) => { selectMonth(event.target.value, "none"); });
  $("start-date-filter").addEventListener("change", (event) => { state.startDate = event.target.value; state.detailPage = 1; render(); });
  $("end-date-filter").addEventListener("change", (event) => { state.endDate = event.target.value; state.detailPage = 1; render(); });
  $("name-filter").addEventListener("input", (event) => { state.name = event.target.value.trim(); state.detailPage = 1; render(); });
  $("detail-limit").addEventListener("change", (event) => { state.detailLimit = Number(event.target.value) || 50; state.detailPage = 1; render(); });
  $("detail-prev").addEventListener("click", () => { state.detailPage = Math.max(1, state.detailPage - 1); render(); });
  $("detail-next").addEventListener("click", () => { state.detailPage += 1; render(); });
  $("clear-filters").addEventListener("click", () => { state.name = ""; state.date = ""; state.startDate = ""; state.endDate = ""; state.detailPage = 1; render(); });
  function switchCalendarMonth(offset) {
    const monthIndex = data.months.findIndex((item) => item.month === state.month);
    const next = data.months[monthIndex + offset];
    if (next) selectMonth(next.month, "none");
  }
  $("calendar-prev-month").addEventListener("click", () => switchCalendarMonth(-1));
  $("calendar-next-month").addEventListener("click", () => switchCalendarMonth(1));
  document.querySelectorAll("[data-date-target]").forEach((button) => button.addEventListener("click", () => {
    const input = $(button.dataset.dateTarget);
    if (input?.showPicker) input.showPicker();
    else input?.focus();
  }));
  $("calendarPanelToggle").addEventListener("click", () => {
    const sidebar = $("calendarSidebar");
    const open = !sidebar.classList.contains("is-open");
    sidebar.classList.toggle("is-open", open);
    $("calendarPanelToggle").setAttribute("aria-expanded", open ? "true" : "false");
  });
  render();
})();
