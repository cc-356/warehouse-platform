


(() => {
  const payload = window.INBOUND_DATA || { days: [], history: [], availableDates: [] };
  const issuePayload = window.INBOUND_ISSUES || { summary: {}, records: [] };
  const params = new URLSearchParams(location.search);
  const brandColors = { "陈陈": "#6ee7d2", "鹭青一": "#9cc7ff", "周淼": "#e8c170", "未识别": "#ffb19b" };
  const businessTypes = ["成衣", "加工", "外采", "未标注"];
  const brands = ["陈陈", "鹭青一", "周淼"];
  const state = {
    selectedDate: params.get("date") || payload.selectedDate,
    range: params.get("range") || "today",
    customStart: params.get("start") || "",
    customEnd: params.get("end") || "",
    brand: params.get("brand") || "",
    businessType: params.get("businessType") || "",
    supplier: params.get("supplier") || "",
    hour: "",
    keyword: params.get("keyword") || "",
    qtyMin: "",
    qtyMax: "",
    trendMetric: "quantity",
    brandCompareMetric: "quantity",
    supplierSort: "quantity",
    sortKey: "warehouseTime",
    sortDir: "desc",
    calendarYear: Number((params.get("date") || payload.selectedDate || "").slice(0, 4)) || new Date().getFullYear(),
    calendarMonth: Number((params.get("date") || payload.selectedDate || "").slice(5, 7)) || (new Date().getMonth() + 1),
    page: 1,
    pageSize: 20,
    issueBrand: "",
    issueAttribute: "",
    issueDate: "",
    issueFactory: "",
    issueKeyword: "",
    issuePage: 1,
    issuePageSize: 5,
    notice: ""
  };

  const $ = id => document.getElementById(id);
  const fmt = value => Number(value || 0).toLocaleString("zh-CN");
  const pct = (part, total) => total ? `${((part / total) * 100).toFixed(1)}%` : "0.0%";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const uniq = values => [...new Set(values.filter(Boolean))];
  const dayByDate = date => payload.days.find(day => day.date === date) || payload.days[0] || { records: [], warnings: [] };
  const currentDay = () => dayByDate(state.selectedDate);
  const hourOf = record => (record.warehouseTime || "").slice(11, 13);
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealObserver = "IntersectionObserver" in window && !reduceMotion
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        revealObserver.unobserve(entry.target);
        playChartReveal(entry.target);
      });
    }, { threshold: 0.24 })
    : null;
  const setSelectedDate = date => {
    state.selectedDate = date || payload.selectedDate;
    const parts = String(state.selectedDate || "").split("-").map(Number);
    state.calendarYear = parts[0] || state.calendarYear;
    state.calendarMonth = parts[1] || state.calendarMonth;
  };
  const by = (records, key) => records.reduce((map, item) => {
    const value = typeof key === "function" ? key(item) : item[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(item);
    return map;
  }, new Map());

  function recordsForDateRange() {
    if (!payload.days.length) return [];
    const selected = currentDay().date;
    let dates = [selected];
    if (state.range === "7d") dates = payload.availableDates.slice(0, 7);
    if (state.range === "month") dates = payload.availableDates.filter(date => date.slice(0, 7) === selected.slice(0, 7));
    if (state.range === "custom" && state.customStart && state.customEnd) {
      dates = payload.availableDates.filter(date => date >= state.customStart && date <= state.customEnd);
    }
    return payload.days.filter(day => dates.includes(day.date)).flatMap(day => day.records);
  }

  function filteredRecords() {
    let rows = filterRecords(recordsForDateRange());
    return rows;
  }

  function issueRecords() {
    let rows = [...(issuePayload.records || [])];
    if (state.issueBrand) rows = rows.filter(row => (row.brand || "未标注") === state.issueBrand);
    if (state.issueAttribute) rows = rows.filter(row => (row.attribute || "未标注") === state.issueAttribute);
    if (state.issueDate) rows = rows.filter(row => row.date === state.issueDate);
    if (state.issueFactory) rows = rows.filter(row => (row.factory || "未标注") === state.issueFactory);
    if (state.issueKeyword) {
      const keyword = state.issueKeyword.trim();
      rows = rows.filter(row =>
        row.factory.includes(keyword) ||
        row.styleNo.includes(keyword) ||
        row.defectIssue.includes(keyword)
      );
    }
    return rows;
  }

  function filterRecords(records, options = {}) {
    let rows = [...records];
    if (state.brand && !options.ignoreBrand) rows = rows.filter(row => row.brand === state.brand);
    if (state.businessType && !options.ignoreBusinessType) rows = rows.filter(row => row.businessType === state.businessType);
    if (state.supplier && !options.ignoreSupplier) rows = rows.filter(row => row.supplier.includes(state.supplier));
    if (state.hour) rows = rows.filter(row => hourOf(row) === state.hour);
    if (state.keyword) {
      const term = state.keyword.trim().toLowerCase();
      rows = rows.filter(row => [row.inboundOrderNo, row.styleNo].some(value => String(value).toLowerCase().includes(term)));
    }
    if (state.qtyMin !== "") rows = rows.filter(row => row.quantity >= Number(state.qtyMin));
    if (state.qtyMax !== "") rows = rows.filter(row => row.quantity <= Number(state.qtyMax));
    return rows;
  }

  function clearInvalidSupplier() {
    if (!state.supplier || !state.brand) return;
    const valid = recordsForDateRange().some(row => row.brand === state.brand && row.supplier.includes(state.supplier));
    if (!valid) {
      state.supplier = "";
      state.notice = "已清除不属于当前品牌的供应商条件";
    }
  }

  function summary(records) {
    const quantity = records.reduce((sum, row) => sum + row.quantity, 0);
    const orders = uniq(records.map(row => row.inboundOrderNo)).length;
    const styles = uniq(records.map(row => row.styleNo)).length;
    const suppliers = uniq(records.map(row => row.supplier)).length;
    return { quantity, orders, styles, suppliers, records: records.length, avgPerOrder: orders ? quantity / orders : 0 };
  }

  function prepareChartReveal(element) {
    element.querySelectorAll(".weekly-line").forEach(line => {
      if (!line.getTotalLength) return;
      const length = Math.ceil(line.getTotalLength());
      line.style.setProperty("--line-length", length);
      line.style.strokeDasharray = length;
      line.style.strokeDashoffset = length;
    });
  }

  function playChartReveal(element) {
    prepareChartReveal(element);
    element.classList.remove("is-animated");
    void element.offsetWidth;
    requestAnimationFrame(() => element.classList.add("is-animated"));
  }

  function queueChartReveal(id) {
    const element = typeof id === "string" ? $(id) : id;
    if (!element) return;
    element.classList.add("chart-reveal");
    if (reduceMotion) {
      element.classList.add("is-animated");
      return;
    }
    if (revealObserver) {
      revealObserver.observe(element);
      return;
    }
    playChartReveal(element);
  }

  function groupedSummary(records, key) {
    return [...by(records, key)].map(([name, rows]) => ({ name, ...summary(rows), rows }));
  }

  function renderImportStatus() {
    const day = currentDay();
    const file = (day.sourceFile || "").split(/[\\/]/).pop();
    $("importStatus").innerHTML = `
      <span title="${esc(day.sourceFile || "")}">文件：${esc(file || "-")}</span>
      <span>导入时间：${esc(day.importedAt || "-")}</span>
      <span>成功记录：${fmt(day.importedCount)}</span>
      <span>警告记录：${fmt(day.warningCount)}</span>
      <span>跳过记录：${fmt(day.skippedCount)}</span>
      <span>状态：已生成</span>
    `;
  }

  function renderDateControls() {
    $("dateSelect").innerHTML = payload.availableDates.map(date => `<option value="${date}">${date}</option>`).join("");
    $("dateSelect").value = state.selectedDate;
    [...$("rangeButtons").querySelectorAll("button")].forEach(button => button.classList.toggle("active", button.dataset.range === state.range));
    $("startDate").value = state.customStart;
    $("endDate").value = state.customEnd;
    renderDateNavigator();
  }

  function renderDateNavigator() {
    const container = $("dateList");
    if (!container) return;
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    const monthStart = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstOffset = (monthStart.getDay() + 6) % 7;
    const daysByDate = new Map(payload.days.map(day => [day.date, day]));
    const selectedDay = currentDay();
    const monthRecords = payload.availableDates.filter(date => String(date).startsWith(monthPrefix)).length;
    const cells = [];

    for (let index = 0; index < firstOffset; index += 1) {
      cells.push(`<span class="calendar-day" aria-hidden="true"></span>`);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateText = `${monthPrefix}-${String(day).padStart(2, "0")}`;
      const dayData = daysByDate.get(dateText);
      const sum = dayData ? summary(dayData.records || []) : null;
      const className = `calendar-day${dayData ? " has-data" : ""}${dateText === state.selectedDate ? " active" : ""}`;
      const label = dayData ? `${dateText}，入库数量 ${fmt(sum.quantity)}，明细 ${fmt(sum.records)}` : `${dateText}，无数据`;
      cells.push(dayData
        ? `<button class="${className}" type="button" data-date="${esc(dateText)}" aria-label="${esc(label)}">${day}</button>`
        : `<span class="${className}" aria-label="${esc(label)}">${day}</span>`);
    }

    const selectedSummary = summary(selectedDay.records || []);
    container.innerHTML = `
      <div class="calendar-shell">
        <div class="calendar-monthbar">
          <div class="calendar-heading">
            <strong class="calendar-title">${year}年${String(month).padStart(2, "0")}月</strong>
            <span class="calendar-summary">${fmt(monthRecords)} 天记录</span>
          </div>
          <div class="calendar-controls">
            <button class="calendar-nav" type="button" data-shift="year-prev" aria-label="上一年">‹‹</button>
            <button class="calendar-nav" type="button" data-shift="month-prev" aria-label="上一月">‹</button>
            <button class="calendar-nav" type="button" data-shift="month-next" aria-label="下一月">›</button>
            <button class="calendar-nav" type="button" data-shift="year-next" aria-label="下一年">››</button>
          </div>
        </div>
        <div class="calendar-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
        <div class="calendar-grid">${cells.join("")}</div>
        <div class="calendar-detail">
          <span class="calendar-meta">${esc(state.selectedDate || "-")}</span>
          <span class="calendar-badge">${fmt(selectedSummary.quantity)} 件 / ${fmt(selectedSummary.records)} 明细</span>
        </div>
      </div>
    `;

    container.querySelectorAll(".calendar-nav").forEach(button => {
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
        renderDateNavigator();
      });
    });

    container.querySelectorAll(".calendar-day.has-data").forEach(button => {
      button.addEventListener("click", () => {
        setSelectedDate(button.dataset.date);
        state.range = "today";
        state.page = 1;
        render();
      });
    });
  }

  function renderActiveFilters() {
    const rows = filteredRecords();
    const data = summary(rows);
    const chips = [{ key: "date", label: `日期：${state.selectedDate}` }];
    if (state.brand) chips.push({ key: "brand", label: `品牌：${state.brand}` });
    if (state.supplier) chips.push({ key: "supplier", label: `供应商：${state.supplier}` });
    if (state.businessType) chips.push({ key: "businessType", label: `业务类型：${state.businessType}` });
    if (state.keyword) chips.push({ key: "keyword", label: `搜索：${state.keyword}` });
    $("activeFilters").innerHTML = chips.map(item => `
      <span class="filter-chip">${esc(item.label)}${item.key === "date" ? "" : `<button type="button" data-clear-filter="${item.key}" aria-label="清除${esc(item.label)}">×</button>`}</span>
    `).join("");
    $("filterResult").textContent = rows.length
      ? `当前筛选结果：共${fmt(data.orders)}个入库单，${fmt(data.styles)}个款号，入库数量${fmt(data.quantity)}件`
      : "当前条件下暂无入库数据，请调整品牌、供应商或日期范围。";
    $("filterNotice").textContent = state.notice || "";
  }

  function renderBrandCards(records) {
    const total = summary(records).quantity;
    const rows = brands.map(brand => {
      const brandRows = records.filter(row => row.brand === brand);
      return { brand, ...summary(brandRows) };
    });
    renderDonut("brandDonut", rows.map(item => ({
      name: item.brand,
      value: item.quantity,
      color: brandColors[item.brand]
    })), {
      title: "品牌占比",
      center: fmt(total),
      sub: "入库数量"
    });
    $("brandCards").innerHTML = rows.map(item => `
      <button class="brand-card ${state.brand === item.brand ? "active" : ""} ${item.quantity ? "" : "is-empty"}" type="button" data-brand="${esc(item.brand)}" style="--brand-color:${brandColors[item.brand] || "var(--accent)"}">
        <div class="brand-top"><h3><span class="brand-dot" style="background:${brandColors[item.brand]}"></span>${esc(item.brand)}</h3><span class="tag">${pct(item.quantity, total)}</span></div>
        <div class="brand-metrics">
          <div><span>入库数量</span><strong>${fmt(item.quantity)}</strong></div>
          <div><span>入库单数</span><strong>${fmt(item.orders)}</strong></div>
          <div><span>款数</span><strong>${fmt(item.styles)}</strong></div>
          <div><span>供应商</span><strong>${fmt(item.suppliers)}</strong></div>
        </div>
      </button>
    `).join("");
  }

  function renderBars(id, rows, options = {}) {
    const max = Math.max(1, ...rows.map(row => row.value));
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    const displayRows = options.hideZero ? rows.filter(row => row.value > 0) : rows;
    $(id).classList.remove("is-animated");
    $(id).classList.add("chart-reveal");
    $(id).innerHTML = displayRows.length ? displayRows.map((row, index) => `
      <div class="bar-row">
        <span>${esc(row.name)}</span>
        <button class="bar-track" type="button" data-bar="${esc(row.name)}" style="border:0;padding:0;text-align:left">
          <span class="bar-fill" style="--i:${index};display:block;width:${Math.max(2, row.value / max * 100)}%;background:${row.color || "var(--accent)"}"></span>
        </button>
        <strong>${fmt(row.value)} <small>${pct(row.value, total)}</small></strong>
      </div>
    `).join("") : `<p class="muted">暂无数据</p>`;
    queueChartReveal(id);
  }

  function renderDonut(id, rows, options = {}) {
    const filtered = rows.filter(row => row.value > 0);
    const total = filtered.reduce((sum, row) => sum + row.value, 0);
    if (!total) {
      const emptyLegend = options.hideLegend ? "" : rows.map(row => `
        <div class="legend-row is-empty">
          <span class="legend-dot" style="background:${row.color || "var(--accent)"}"></span>
          <span>${esc(row.name)}</span>
          <strong>0 · 0.0%</strong>
        </div>
      `).join("");
      $(id).innerHTML = `
        <div class="donut-chart${options.hideLegend ? " no-legend" : ""}" aria-label="${esc(options.title || "占比图")}">
          <svg class="chart-reveal" viewBox="0 0 200 200" role="img">
            <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="28"></circle>
            <circle cx="100" cy="100" r="50" fill="rgba(7,11,13,.86)"></circle>
            <text class="donut-center" x="100" y="96">${esc(options.center || "0")}</text>
            <text class="donut-sub" x="100" y="114">${esc(options.sub || "合计")}</text>
          </svg>
          ${options.hideLegend ? "" : `<div class="donut-legend">${emptyLegend}</div>`}
        </div>
      `;
      queueChartReveal($(id).querySelector("svg"));
      return;
    }
    const radius = 78;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const segments = filtered.map((row, index) => {
      const length = row.value / total * circumference;
      const segment = `
        <circle class="donut-segment" cx="100" cy="100" r="${radius}" fill="none" stroke="${row.color || "var(--accent)"}" stroke-width="28"
          stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)"
          style="--i:${index};--circumference:${circumference};--segment-length:${length};--segment-gap:${circumference - length};--segment-offset:${-offset}">
          <title>${esc(row.name)} ${fmt(row.value)}，占比 ${pct(row.value, total)}</title>
        </circle>`;
      offset += length;
      return segment;
    }).join("");
    const legendRows = rows.length ? rows : filtered;
    const legend = options.hideLegend ? "" : legendRows.map(row => `
      <div class="legend-row ${row.value > 0 ? "" : "is-empty"}">
        <span class="legend-dot" style="background:${row.color || "var(--accent)"}"></span>
        <span>${esc(row.name)}</span>
        <strong>${fmt(row.value)} · ${pct(row.value, total)}</strong>
      </div>
    `).join("");
    $(id).innerHTML = `
      <div class="donut-chart${options.hideLegend ? " no-legend" : ""}" aria-label="${esc(options.title || "占比图")}">
        <svg class="chart-reveal" viewBox="0 0 200 200" role="img">
          <circle cx="100" cy="100" r="${radius}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="28"></circle>
          ${segments}
          <circle cx="100" cy="100" r="50" fill="rgba(7,11,13,.86)"></circle>
          <text class="donut-center" x="100" y="96">${esc(options.center || fmt(total))}</text>
          <text class="donut-sub" x="100" y="114">${esc(options.sub || "合计")}</text>
        </svg>
        ${options.hideLegend ? "" : `<div class="donut-legend">${legend}</div>`}
      </div>
    `;
    queueChartReveal($(id).querySelector("svg"));
  }

  function renderHourlyTrend(records) {
    const buckets = [];
    for (let hour = 0; hour < 24; hour++) {
      const key = String(hour).padStart(2, "0");
      const rows = records.filter(row => hourOf(row) === key);
      const data = summary(rows);
      buckets.push({ hour: key, rows, value: data[state.trendMetric], ...data });
    }
    const max = Math.max(1, ...buckets.map(item => item.value));
    const peak = buckets.reduce((best, item) => item.value > best.value ? item : best, buckets[0]);
    const valueTextStyle = 'paint-order:stroke;stroke:#10242b;stroke-width:5px;stroke-linejoin:round;';
    const hourlyLayout = buckets.map((item, index) => {
      const width = 18;
      const x = 48 + index * 29;
      const height = Math.max(2, item.value / max * 136);
      const y = 176 - height;
      const color = item.hour === peak.hour ? "var(--warn)" : "var(--accent)";
      const labelText = fmt(item.value);
      const peakLabelY = Math.max(18, y - 8);
      return { ...item, x, y, width, height, color, labelText, peakLabelY };
    });
    $("hourlyTrend").innerHTML = `
      <svg class="chart-reveal" viewBox="0 0 760 232" role="img" aria-label="分时入库趋势" style="width:100%;height:232px;display:block">
        <line x1="44" y1="176" x2="736" y2="176" stroke="rgba(210,235,225,.18)" />
        ${hourlyLayout.map((item, index) => {
          const peakLabel = item.value > 0 && item.hour === peak.hour ? `<text x="${item.x + 10}" y="${item.peakLabelY}" text-anchor="middle" fill="#ffe1d6" font-size="10" font-weight="700" style="${valueTextStyle}">${item.labelText}</text>` : "";
          const valueTick = item.value > 0 ? `<text x="${item.x + 9}" y="214" text-anchor="middle" fill="${item.hour === peak.hour ? "#ffe1d6" : "#d7fff7"}" font-size="9" font-weight="700">${item.labelText}</text>` : "";
          return `<g><rect class="hour-bar" data-hour="${item.hour}" x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="4" fill="${item.color}" opacity=".86" style="--i:${index}"><title>${item.hour}:00 入库数量 ${item.quantity}，入库单 ${item.orders}，款数 ${item.styles}</title></rect>${peakLabel}<text class="chart-label" x="${item.x + 9}" y="198" text-anchor="middle" fill="#8a9a96" font-size="10">${item.hour}</text>${valueTick}</g>`;
        }).join("")}
      </svg>
      <p class="muted">峰值时段：${peak.hour}:00，${metricName(state.trendMetric)} ${fmt(peak.value)}。点击柱形可联动筛选明细。</p>
    `;
    queueChartReveal($("hourlyTrend").querySelector("svg"));
  }

  function metricName(metric) {
    return ({ quantity: "入库数量", orders: "入库单数", styles: "款数", suppliers: "供应商数" })[metric] || metric;
  }

  function renderBrandCompare(records) {
    const rows = brands.map(brand => {
      const item = summary(records.filter(row => row.brand === brand));
      return { name: brand, value: item[state.brandCompareMetric], color: brandColors[brand] };
    });
    renderBars("brandCompare", rows);
  }

  function renderBusiness(records) {
    const rows = businessTypes.map(type => {
      const item = summary(records.filter(row => row.businessType === type));
      const color = ({ "成衣": "#6ee7d2", "加工": "#9cc7ff", "外采": "#e8c170", "未标注": "#ffb19b" })[type] || "var(--accent)";
      return { name: type, value: item.quantity, color };
    });
    renderDonut("businessDonut", rows, {
      title: "业务类型占比",
      center: fmt(summary(records).quantity),
      sub: "入库数量",
      hideLegend: true
    });
    renderBars("businessBars", rows, { hideZero: true });
    const unmarked = records.filter(row => row.businessType === "未标注").length;
    $("businessHint").textContent = unmarked ? `部分原始数据未标注业务类型，共 ${unmarked} 条，请检查数据源格式。` : "所有记录均已识别业务类型。";
  }

  function renderWeeklyTrend() {
    const selectedIndex = Math.max(0, payload.availableDates.indexOf(state.selectedDate));
    const dates = payload.availableDates.slice(selectedIndex, selectedIndex + 7).reverse();
    const buckets = dates.map(date => {
      const day = dayByDate(date);
      const rows = filterRecords(day.records || []);
      const data = summary(rows);
      return { date, ...data };
    });
    const maxQuantity = Math.max(1, ...buckets.map(item => item.quantity));
    const maxOrders = Math.max(1, ...buckets.map(item => item.orders));
    const chartLeft = 68;
    const chartRight = 724;
    const chartTop = 22;
    const chartBottom = 166;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const step = buckets.length > 1 ? chartWidth / (buckets.length - 1) : chartWidth;
    const barWidth = Math.min(40, Math.max(20, step * 0.36));
    const points = buckets.map((item, index) => {
      const x = buckets.length > 1 ? chartLeft + index * step : chartLeft + chartWidth / 2;
      const lineY = chartBottom - (item.orders / maxOrders) * chartHeight;
      const barHeight = Math.max(2, item.quantity / maxQuantity * chartHeight);
      const barY = chartBottom - barHeight;
      return { ...item, x, lineY, barHeight, barY };
    });
    const total = {
      quantity: buckets.reduce((sum, item) => sum + item.quantity, 0),
      orders: buckets.reduce((sum, item) => sum + item.orders, 0)
    };
    $("weeklyTrend").innerHTML = buckets.length ? `
      <svg class="chart-reveal" viewBox="0 0 780 224" role="img" aria-label="近7日入库数量和入库单数趋势">
        <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" stroke="rgba(210,235,225,.18)" />
        ${[0, .5, 1].map(rate => {
          const y = chartBottom - rate * chartHeight;
          return `<line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="rgba(210,235,225,.07)" /><text x="${chartLeft - 18}" y="${y + 4}" text-anchor="end" fill="#8a9a96" font-size="9">${fmt(Math.round(maxQuantity * rate))}</text>`;
        }).join("")}
        ${points.map((item, index) => `
          <g data-week-date="${esc(item.date)}">
            <rect class="weekly-bar" x="${item.x - barWidth / 2}" y="${item.barY}" width="${barWidth}" height="${item.barHeight}" rx="6" fill="var(--accent)" opacity=".78" style="--i:${index}">
              <title>${esc(item.date)} 入库数量 ${fmt(item.quantity)}，入库单 ${fmt(item.orders)}，款数 ${fmt(item.styles)}</title>
            </rect>
            <text class="chart-label" x="${item.x}" y="198" text-anchor="middle" fill="#8a9a96" font-size="10">${esc(item.date.slice(5))}</text>
          </g>
        `).join("")}
        <polyline class="weekly-line" points="${points.map(item => `${item.x},${item.lineY}`).join(" ")}" fill="none" stroke="var(--warn)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${points.map(item => `<circle class="chart-point" cx="${item.x}" cy="${item.lineY}" r="4" fill="var(--warn)" stroke="#071012" stroke-width="2" />`).join("")}
        ${points.map(item => {
          let qtyY = Math.min(chartBottom - 9, item.barY + 22);
          let orderY = Math.max(13, item.lineY - 18);
          if (Math.abs(qtyY - orderY) < 24) {
            if (item.barHeight > 48) {
              qtyY = Math.min(chartBottom - 9, orderY + 24);
            } else {
              orderY = Math.max(13, qtyY - 24);
            }
          }
          return `
            <g class="chart-label">
              <rect class="weekly-label-bg" x="${item.x - 22}" y="${qtyY - 12}" width="44" height="17" rx="8"></rect>
              <text class="weekly-qty-text" x="${item.x}" y="${qtyY}">${fmt(item.quantity)}</text>
              <rect class="weekly-label-bg" x="${item.x - 17}" y="${orderY - 11}" width="34" height="16" rx="8"></rect>
              <text class="weekly-order-text" x="${item.x}" y="${orderY}">${fmt(item.orders)}</text>
            </g>`;
        }).join("")}
      </svg>
      <div class="weekly-legend">
        <span><span class="legend-dot" style="background:var(--accent)"></span>柱：入库数量</span>
        <span><span class="legend-line"></span>线：入库单数</span>
        <span>近7日合计：${fmt(total.quantity)} 件 / ${fmt(total.orders)} 单</span>
      </div>
    ` : `<p class="muted">暂无近7日数据</p>`;
    queueChartReveal($("weeklyTrend").querySelector("svg"));
  }

  function renderMatrix(records) {
    const totalByBrand = Object.fromEntries(brands.map(brand => [brand, summary(records.filter(row => row.brand === brand)).quantity]));
    $("brandBusinessMatrix").innerHTML = `
      <table><thead><tr><th>品牌</th>${businessTypes.map(type => `<th>${type}</th>`).join("")}<th>合计</th></tr></thead>
      <tbody>${brands.map(brand => `<tr><td><span class="brand-dot" style="background:${brandColors[brand]}"></span>${brand}</td>${businessTypes.map(type => {
        const qty = records.filter(row => row.brand === brand && row.businessType === type).reduce((sum, row) => sum + row.quantity, 0);
        return `<td>${fmt(qty)} <span class="muted">${pct(qty, totalByBrand[brand])}</span></td>`;
      }).join("")}<td>${fmt(totalByBrand[brand])}</td></tr>`).join("")}</tbody></table>
    `;
  }

  function orderGroups(records) {
    return groupedSummary(records.filter(row => row.inboundOrderNo), "inboundOrderNo")
      .map(item => ({
        ...item,
        brands: uniq(item.rows.map(row => row.brand)).filter(brand => brand !== "未识别"),
        suppliers: uniq(item.rows.map(row => row.supplier)),
        businessTypes: uniq(item.rows.map(row => row.businessType))
      }));
  }

  function renderStyleFocus(records) {
    const total = summary(records).quantity;
    const rows = groupedSummary(records, "styleNo")
      .filter(item => item.name)
      .map(item => ({
        ...item,
        brands: uniq(item.rows.map(row => row.brand)).filter(brand => brand !== "未识别"),
        suppliers: uniq(item.rows.map(row => row.supplier)),
        businessTypes: uniq(item.rows.map(row => row.businessType))
      }))
      .sort((a, b) => b.quantity - a.quantity || b.orders - a.orders)
      .slice(0, 8);
    $("styleFocus").innerHTML = rows.length ? rows.map(item => `
      <div class="style-row">
        <button class="link-cell" type="button" data-style="${esc(item.name)}">${esc(item.name)}</button>
        <div class="style-meta">
          ${item.brands.map(brand => `<span class="tag">${esc(brand)}</span>`).join("")}
          <span class="tag">${fmt(item.orders)} 单</span>
          <span class="tag">${fmt(item.suppliers.length)} 供应商</span>
        </div>
        <strong>${fmt(item.quantity)} <small>${pct(item.quantity, total)}</small></strong>
      </div>
    `).join("") : `<p class="muted">当前条件下暂无款号数据。</p>`;
  }

  function renderOrderStructure(records) {
    const orders = orderGroups(records);
    const totalQty = orders.reduce((sum, item) => sum + item.quantity, 0);
    const buckets = [
      { label: "20件及以下", rows: orders.filter(item => item.quantity <= 20) },
      { label: "21-50件", rows: orders.filter(item => item.quantity > 20 && item.quantity <= 50) },
      { label: "51-100件", rows: orders.filter(item => item.quantity > 50 && item.quantity <= 100) },
      { label: "100件以上", rows: orders.filter(item => item.quantity > 100) }
    ];
    const maxOrder = orders.reduce((best, item) => item.quantity > (best.quantity || 0) ? item : best, {});
    const multiStyle = orders.filter(item => item.styles > 1);
    const avgQty = orders.length ? totalQty / orders.length : 0;
    const cards = [
      { label: "平均单量", value: avgQty.toFixed(1), note: `${fmt(orders.length)} 个入库单，合计 ${fmt(totalQty)} 件` },
      { label: "多款入库单", value: fmt(multiStyle.length), note: `占入库单 ${pct(multiStyle.length, orders.length)}` },
      { label: "最大入库单", value: fmt(maxOrder.quantity || 0), note: maxOrder.name ? `${esc(maxOrder.name)}｜${fmt(maxOrder.styles)} 款` : "-" }
    ];
    const bucketRows = buckets.map(item => {
      const quantity = item.rows.reduce((sum, row) => sum + row.quantity, 0);
      return `<div class="quality-line"><span>${item.label}</span><strong>${fmt(item.rows.length)} 单 · ${fmt(quantity)} 件</strong></div>`;
    }).join("");
    $("orderStructure").innerHTML = cards.map(item => `
      <div class="insight-card"><span>${item.label}</span><strong>${item.value}</strong><small>${item.note}</small></div>
    `).join("") + `<div class="insight-card" style="grid-column:1/-1"><span>单量区间</span>${bucketRows}</div>`;
  }

  function renderSupplierCoverage(records) {
    const rows = groupedSummary(records, "supplier")
      .map(item => {
        const times = item.rows.map(row => row.warehouseTime).filter(Boolean).sort();
        return {
          ...item,
          brands: uniq(item.rows.map(row => row.brand)).filter(brand => brand !== "未识别"),
          businessTypes: uniq(item.rows.map(row => row.businessType)),
          firstTime: times[0] || "-",
          lastTime: times[times.length - 1] || "-"
        };
      })
      .sort((a, b) => b.quantity - a.quantity || b.orders - a.orders)
      .slice(0, 12);
    $("supplierCoverageBody").innerHTML = rows.length ? rows.map(item => `
      <tr>
        <td><button class="link-cell" type="button" data-supplier="${esc(item.name)}">${esc(item.name)}</button></td>
        <td>${item.brands.map(brand => `<span class="tag">${esc(brand)}</span>`).join(" ") || "-"}</td>
        <td>${item.businessTypes.map(type => `<span class="tag">${esc(type)}</span>`).join(" ") || "-"}</td>
        <td>${fmt(item.quantity)}</td><td>${fmt(item.orders)}</td><td>${fmt(item.styles)}</td>
        <td>${esc(item.firstTime)}</td><td>${esc(item.lastTime)}</td>
      </tr>
    `).join("") : `<tr class="empty-row"><td colspan="8">当前条件下暂无供应商覆盖数据。</td></tr>`;
  }

  function renderSuppliers(records) {
    const total = summary(records).quantity;
    const rows = groupedSummary(records, "supplier").map(item => ({
      ...item,
      brands: uniq(item.rows.map(row => row.brand)).filter(brand => brand !== "未识别")
    })).sort((a, b) => b[state.supplierSort] - a[state.supplierSort]).slice(0, 10);
    $("supplierBody").innerHTML = rows.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><button class="link-cell" type="button" data-supplier="${esc(item.name)}">${esc(item.name)}</button></td>
        <td>${item.brands.map(brand => `<span class="tag">${esc(brand)}</span>`).join(" ") || "-"}</td>
        <td>${fmt(item.quantity)}</td><td>${fmt(item.orders)}</td><td>${fmt(item.styles)}</td><td>${pct(item.quantity, total)}</td>
      </tr>
    `).join("");
  }

  function renderFilterOptions(records) {
    const brandBase = filterRecords(records, { ignoreBrand: true });
    const brandRows = [{ name: "", label: "全部", quantity: summary(brandBase).quantity }].concat(brands.map(brand => ({
      name: brand,
      label: brand,
      quantity: summary(brandBase.filter(row => row.brand === brand)).quantity
    })));
    $("brandQuick").innerHTML = brandRows.map(item => `
      <button type="button" data-brand-value="${esc(item.name)}" class="${state.brand === item.name ? "active" : ""}">
        ${esc(item.label)} ${fmt(item.quantity)}
      </button>
    `).join("");

    const supplierBase = filterRecords(records, { ignoreSupplier: true });
    const supplierRows = groupedSummary(supplierBase, "supplier")
      .map(item => ({
        name: item.name,
        quantity: item.quantity,
        brands: uniq(item.rows.map(row => row.brand)).filter(brand => brand !== "未识别")
      }))
      .sort((a, b) => b.quantity - a.quantity);
    $("supplierSearch").value = state.supplier;
    const query = state.supplier.trim();
    const visibleRows = supplierRows
      .filter(item => !query || item.name.includes(query) || item.brands.join("、").includes(query))
      .slice(0, 30);
    $("supplierSuggestions").innerHTML = visibleRows.length ? visibleRows.map(item => `
      <button class="supplier-suggestion" type="button" role="option" data-supplier="${esc(item.name)}">
        <strong>${esc(item.name)}</strong>
        <span>${esc(item.brands.join("、") || "-")} ｜ ${fmt(item.quantity)}件</span>
      </button>
    `).join("") : `<div class="supplier-suggestion-empty">没有匹配的供应商</div>`;
    const showSuggestions = document.activeElement === $("supplierSearch");
    $("supplierSuggestions").classList.toggle("open", showSuggestions);
    $("supplierSearch").setAttribute("aria-expanded", showSuggestions ? "true" : "false");

    $("businessFilter").innerHTML = `<option value="">全部业务类型</option>${businessTypes.map(type => `<option value="${type}">${type}</option>`).join("")}`;
    $("businessFilter").value = state.businessType;
    $("keyword").value = state.keyword;
  }

  function sortedDetails(records) {
    return [...records].sort((a, b) => {
      const av = a[state.sortKey];
      const bv = b[state.sortKey];
      const result = state.sortKey === "quantity" ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), "zh-CN");
      return state.sortDir === "asc" ? result : -result;
    });
  }

  function renderDetails(records) {
    const rows = sortedDetails(records);
    const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > pageCount) state.page = pageCount;
    const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    $("detailBody").innerHTML = pageRows.length ? pageRows.map(row => `
      <tr>
        <td>${esc(row.warehouseTime)}</td><td>${esc(row.date)}</td><td><span class="tag">${esc(row.brand)}</span></td>
        <td>${esc(row.supplier)}</td><td>${esc(row.businessType)}</td>
        <td><button class="link-cell" type="button" data-order="${esc(row.inboundOrderNo)}">${esc(row.inboundOrderNo)}</button></td>
        <td>${esc(row.styleNo)}</td><td>${fmt(row.quantity)}</td>
        <td><button class="ghost-button" type="button" data-order="${esc(row.inboundOrderNo)}">查看详情</button></td>
      </tr>
    `).join("") : `<tr class="empty-row"><td colspan="9">当前条件下暂无入库数据，请调整品牌、供应商或日期范围。</td></tr>`;
    $("pagerInfo").textContent = `第 ${state.page} / ${pageCount} 页，共 ${fmt(rows.length)} 条`;
  }

  function renderIssuePanel() {
    const records = issueRecords();
    const pageCount = Math.max(1, Math.ceil(records.length / state.issuePageSize));
    if (state.issuePage > pageCount) state.issuePage = pageCount;
    const pageRows = records.slice((state.issuePage - 1) * state.issuePageSize, state.issuePage * state.issuePageSize);
    const all = issuePayload.records || [];
    const brands = uniq(all.map(row => row.brand || "未标注"));
    const brandRows = all.filter(row => !state.issueBrand || (row.brand || "未标注") === state.issueBrand);
    const attributes = uniq(brandRows.map(row => row.attribute || "未标注"));
    const dateRows = brandRows.filter(row => !state.issueAttribute || row.attribute === state.issueAttribute);
    const issueDates = uniq(dateRows.map(row => row.date)).sort().reverse();
    if (state.issueDate && !issueDates.includes(state.issueDate)) state.issueDate = "";
    const factories = uniq(all
      .filter(row => !state.issueBrand || (row.brand || "未标注") === state.issueBrand)
      .filter(row => !state.issueAttribute || row.attribute === state.issueAttribute)
      .filter(row => !state.issueDate || row.date === state.issueDate)
      .map(row => row.factory || "未标注"));
    if (state.issueFactory && !factories.includes(state.issueFactory)) state.issueFactory = "";
    const imageCount = records.reduce((sum, row) => sum + (row.images || []).length, 0);
    const styleCount = uniq(records.map(row => row.styleNo)).length;
    const factoryCount = uniq(records.map(row => row.factory)).length;

    $("issueSummary").innerHTML = `
      <div class="issue-metric"><span>问题记录</span><strong>${fmt(records.length)}</strong></div>
      <div class="issue-metric"><span>涉及工厂</span><strong>${fmt(factoryCount)}</strong></div>
      <div class="issue-metric"><span>涉及款号</span><strong>${fmt(styleCount)}</strong></div>
      <div class="issue-metric"><span>问题图片</span><strong>${fmt(imageCount)}</strong></div>
    `;
    $("issueBrand").innerHTML = `<option value="">全部品牌</option>${brands.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}`;
    $("issueBrand").value = state.issueBrand;
    $("issueAttribute").innerHTML = `<option value="">全部属性</option>${attributes.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}`;
    $("issueAttribute").value = state.issueAttribute;
    $("issueDate").innerHTML = `<option value="">全部日期</option>${issueDates.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}`;
    $("issueDate").value = state.issueDate;
    $("issueFactory").innerHTML = `<option value="">全部工厂</option>${factories.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}`;
    $("issueFactory").value = state.issueFactory;
    $("issueKeyword").value = state.issueKeyword;
    $("issuePageSize").value = String(state.issuePageSize);

    $("issueBody").innerHTML = pageRows.length ? pageRows.map(row => {
      const images = (row.images || []).slice(0, 4);
      const extra = Math.max(0, (row.images || []).length - images.length);
      return `
        <article class="issue-card">
          <div class="issue-card-main">
            <div class="issue-card-title">
              <strong>${esc(row.factory || "未标注工厂")}</strong>
              <span>${esc(row.date)}</span>
            </div>
            <div class="issue-tags">
              <span>${esc(row.brand || "陈陈")}</span>
              <span>${esc(row.attribute || "未标注")}</span>
              ${(row.responsibleParties || []).map(item => `<span>${esc(item)}</span>`).join("")}
            </div>
            <div class="issue-style">${esc(row.styleNo || "-")}</div>
            <p class="issue-defect"><span>瑕疵问题</span>${esc(row.defectIssue || "-")}</p>
          </div>
          <div class="issue-images">
            ${images.map((image, index) => image.relativePath ? `
              <button class="issue-image-button" type="button" data-issue-record="${esc(row.recordId)}" data-issue-image="${esc(image.relativePath)}" data-issue-title="${esc(`${row.factory} ${row.styleNo}`)}">
                <img src="${esc(image.relativePath)}" alt="${esc(row.defectIssue || "问题图片")}" loading="lazy" />
              </button>
            ` : `<span class="issue-image-missing">${esc(image.name || `图片${index + 1}`)}</span>`).join("")}
            ${extra ? `<button class="issue-image-more" type="button" data-issue-record="${esc(row.recordId)}" data-issue-title="${esc(`${row.factory} ${row.styleNo}`)}">+${fmt(extra)}</button>` : ""}
          </div>
        </article>
      `;
    }).join("") : `<div class="empty-state">当前条件下没有问题记录。</div>`;
    $("issuePagerInfo").textContent = `第 ${state.issuePage} / ${pageCount} 页，共 ${fmt(records.length)} 条`;
    $("issuePrevPage").disabled = state.issuePage <= 1;
    $("issueNextPage").disabled = state.issuePage >= pageCount;
  }

  function openOrder(orderNo) {
    const records = filteredRecords().filter(row => row.inboundOrderNo === orderNo);
    const data = summary(records);
    $("drawerTitle").textContent = `入库单 ${orderNo}`;
    $("drawerContent").innerHTML = `
      <div class="drawer-list">
        <div class="drawer-item">品牌：${uniq(records.map(row => row.brand)).join("、") || "-"}</div>
        <div class="drawer-item">供应商：${uniq(records.map(row => row.supplier)).join("、") || "-"}</div>
        <div class="drawer-item">业务类型：${uniq(records.map(row => row.businessType)).join("、") || "-"}</div>
        <div class="drawer-item">入库总数量：${fmt(data.quantity)}，款号数：${fmt(data.styles)}</div>
        ${records.map(row => `<div class="drawer-item"><strong>${esc(row.styleNo)}</strong><br>数量 ${fmt(row.quantity)} · 入仓时间 ${esc(row.warehouseTime)}</div>`).join("")}
      </div>
    `;
    showDrawer("orderDrawer");
  }

  function openIssueImages(recordId, fallbackImage, fallbackTitle) {
    const record = (issuePayload.records || []).find(item => item.recordId === recordId);
    const images = (record?.images || []).filter(image => image.relativePath);
    const title = `${record?.factory || ""} ${record?.styleNo || ""}`.trim() || fallbackTitle || "问题图片";
    $("drawerTitle").textContent = title;
    if (images.length > 1) {
      $("drawerContent").innerHTML = `<div class="issue-drawer-grid">${images.map(image => `
        <button type="button" data-drawer-image="${esc(image.relativePath)}" data-drawer-title="${esc(title)}" data-drawer-record="${esc(recordId)}">
          <img src="${esc(image.relativePath)}" alt="${esc(record?.defectIssue || image.name || "问题图片")}" loading="lazy" />
        </button>
      `).join("")}</div>`;
    } else {
      const imagePath = images[0]?.relativePath || fallbackImage;
      $("drawerContent").innerHTML = imagePath
        ? `<img class="issue-drawer-image" src="${esc(imagePath)}" alt="${esc(title)}" />`
        : `<div class="empty-state">这条记录没有可预览的图片。</div>`;
    }
    $("drawerBackdrop").classList.add("open");
    $("orderDrawer").classList.add("open");
    $("orderDrawer").setAttribute("aria-hidden", "false");
  }

  function openIssueImage(imagePath, title, returnRecordId = "") {
    $("drawerTitle").textContent = title || "问题图片";
    const imageMarkup = `<img class="issue-drawer-image" src="${esc(imagePath)}" alt="${esc(title || "问题图片")}" />`;
    $("drawerContent").innerHTML = returnRecordId
      ? `<button type="button" class="issue-single-image-button" data-return-issue-record="${esc(returnRecordId)}" data-drawer-title="${esc(title || "问题图片")}">${imageMarkup}</button>`
      : imageMarkup;
    $("drawerBackdrop").classList.add("open");
    $("orderDrawer").classList.add("open");
    $("orderDrawer").setAttribute("aria-hidden", "false");
  }

  function showDrawer(id) {
    $("drawerBackdrop").classList.add("open");
    $(id).classList.add("open");
    $(id).setAttribute("aria-hidden", "false");
  }

  function closeDrawers() {
    $("drawerBackdrop").classList.remove("open");
    ["orderDrawer"].forEach(id => {
      $(id).classList.remove("open");
      $(id).setAttribute("aria-hidden", "true");
    });
  }

  function exportCsv(records) {
    const header = ["入仓时间", "日期", "品牌", "供应商", "业务类型", "入库单号", "款号", "数量"];
    const lines = [header, ...sortedDetails(records).map(row => [row.warehouseTime, row.date, row.brand, row.supplier, row.businessType, row.inboundOrderNo, row.styleNo, row.quantity])];
    const csv = lines.map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inbound-${state.selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function syncUrl() {
    const url = new URL(location.href);
    const entries = {
      date: state.selectedDate,
      range: state.range,
      start: state.customStart,
      end: state.customEnd,
      brand: state.brand,
      supplier: state.supplier,
      businessType: state.businessType,
      keyword: state.keyword
    };
    url.searchParams.delete("startTime");
    url.searchParams.delete("endTime");
    Object.entries(entries).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    });
    history.replaceState(null, "", url);
  }

  function render() {
    syncUrl();
    const day = currentDay();
    const rangeRecords = recordsForDateRange();
    const rows = filteredRecords();
    renderImportStatus();
    renderDateControls();
    renderFilterOptions(rangeRecords);
    renderActiveFilters();
    renderBrandCards(rows);
    renderWeeklyTrend();
    renderHourlyTrend(rows);
    renderBrandCompare(rows);
    renderBusiness(rows);
    renderMatrix(rows);
    renderStyleFocus(rows);
    renderOrderStructure(rows);
    renderSupplierCoverage(rows);
    renderSuppliers(rows);
    renderDetails(rows);
    renderIssuePanel();
  }

  function bindEvents() {
    const dateSidebar = $("dateSidebar");
    const datePanelToggle = $("datePanelToggle");
    if (dateSidebar && datePanelToggle) {
      datePanelToggle.addEventListener("click", () => {
        const open = !dateSidebar.classList.contains("is-open");
        dateSidebar.classList.toggle("is-open", open);
        datePanelToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    const filterSidebar = $("filterSidebar");
    const filterPanelToggle = $("filterPanelToggle");
    if (filterSidebar && filterPanelToggle) {
      filterPanelToggle.addEventListener("click", () => {
        const open = !filterSidebar.classList.contains("is-open");
        filterSidebar.classList.toggle("is-open", open);
        filterPanelToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    $("dateSelect").addEventListener("change", event => { state.notice = ""; setSelectedDate(event.target.value); state.range = "today"; state.page = 1; render(); });
    $("rangeButtons").addEventListener("click", event => {
      const button = event.target.closest("button[data-range]");
      if (!button) return;
      state.notice = "";
      state.range = button.dataset.range;
      state.page = 1;
      render();
    });
    $("startDate").addEventListener("change", event => { state.notice = ""; state.customStart = event.target.value; state.range = "custom"; state.page = 1; render(); });
    $("endDate").addEventListener("change", event => { state.notice = ""; state.customEnd = event.target.value; state.range = "custom"; state.page = 1; render(); });
    $("brandQuick").addEventListener("click", event => {
      const button = event.target.closest("[data-brand-value]");
      if (!button) return;
      state.notice = "";
      state.brand = button.dataset.brandValue;
      clearInvalidSupplier();
      state.page = 1;
      render();
    });
    $("supplierSearch").addEventListener("input", event => {
      state.notice = "";
      state.supplier = event.target.value.trim();
      const supplierRows = recordsForDateRange().filter(row => row.supplier === state.supplier);
      const supplierBrands = uniq(supplierRows.map(row => row.brand)).filter(Boolean);
      if (!state.brand && supplierBrands.length === 1) state.brand = supplierBrands[0];
      state.page = 1;
      render();
    });
    $("supplierSearch").addEventListener("focus", () => render());
    $("supplierSuggestions").addEventListener("mousedown", event => {
      const button = event.target.closest("[data-supplier]");
      if (!button) return;
      event.preventDefault();
      state.notice = "";
      state.supplier = button.dataset.supplier;
      const supplierRows = recordsForDateRange().filter(row => row.supplier === state.supplier);
      const supplierBrands = uniq(supplierRows.map(row => row.brand)).filter(Boolean);
      if (!state.brand && supplierBrands.length === 1) state.brand = supplierBrands[0];
      state.page = 1;
      render();
      $("supplierSearch").blur();
      $("supplierSuggestions").classList.remove("open");
      $("supplierSearch").setAttribute("aria-expanded", "false");
    });
    document.addEventListener("mousedown", event => {
      if (event.target.closest(".supplier-combobox")) return;
      $("supplierSuggestions").classList.remove("open");
      $("supplierSearch").setAttribute("aria-expanded", "false");
    });
    $("allBrands").addEventListener("click", () => { state.notice = ""; state.brand = ""; state.page = 1; render(); });
    $("brandCards").addEventListener("click", event => {
      const card = event.target.closest("[data-brand]");
      if (!card) return;
      state.notice = "";
      state.brand = state.brand === card.dataset.brand ? "" : card.dataset.brand;
      clearInvalidSupplier();
      state.page = 1;
      render();
    });
    $("trendMetric").addEventListener("change", event => { state.trendMetric = event.target.value; render(); });
    $("brandCompareMetric").addEventListener("change", event => { state.brandCompareMetric = event.target.value; render(); });
    $("supplierSort").addEventListener("change", event => { state.supplierSort = event.target.value; render(); });
    $("supplierBody").addEventListener("click", event => {
      const target = event.target.closest("[data-supplier]");
      if (!target) return;
      state.notice = "";
      state.supplier = target.dataset.supplier;
      $("supplierSearch").value = state.supplier;
      state.page = 1;
      render();
      $("detailBody").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    $("supplierCoverageBody").addEventListener("click", event => {
      const target = event.target.closest("[data-supplier]");
      if (!target) return;
      state.notice = "";
      state.supplier = target.dataset.supplier;
      $("supplierSearch").value = state.supplier;
      state.page = 1;
      render();
      $("detailBody").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    $("styleFocus").addEventListener("click", event => {
      const target = event.target.closest("[data-style]");
      if (!target) return;
      state.notice = "";
      state.keyword = target.dataset.style;
      state.page = 1;
      render();
      $("detailBody").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    $("hourlyTrend").addEventListener("click", event => {
      const target = event.target.closest("[data-hour]");
      if (!target) return;
      state.notice = "";
      state.hour = state.hour === target.dataset.hour ? "" : target.dataset.hour;
      state.page = 1;
      render();
    });
    $("weeklyTrend").addEventListener("click", event => {
      const target = event.target.closest("[data-week-date]");
      if (!target) return;
      state.notice = "";
      setSelectedDate(target.dataset.weekDate);
      state.range = "today";
      state.hour = "";
      state.page = 1;
      render();
    });
    $("keyword").addEventListener("input", event => { state.notice = ""; state.keyword = event.target.value; state.page = 1; render(); });
    $("businessFilter").addEventListener("change", event => { state.notice = ""; state.businessType = event.target.value; state.page = 1; render(); });
    $("issueBrand").addEventListener("change", event => { state.issueBrand = event.target.value; state.issuePage = 1; render(); });
    $("issueAttribute").addEventListener("change", event => { state.issueAttribute = event.target.value; state.issuePage = 1; render(); });
    $("issueDate").addEventListener("change", event => { state.issueDate = event.target.value; state.issueFactory = ""; state.issuePage = 1; render(); });
    $("issueFactory").addEventListener("change", event => { state.issueFactory = event.target.value; state.issuePage = 1; render(); });
    $("issueKeyword").addEventListener("input", event => { state.issueKeyword = event.target.value.trim(); state.issuePage = 1; render(); });
    $("issuePageSize").addEventListener("change", event => { state.issuePageSize = Number(event.target.value) || 5; state.issuePage = 1; render(); });
    $("issueClearFilters").addEventListener("click", () => {
      state.issueBrand = "";
      state.issueAttribute = "";
      state.issueDate = "";
      state.issueFactory = "";
      state.issueKeyword = "";
      state.issuePageSize = 5;
      state.issuePage = 1;
      render();
    });
    $("issuePrevPage").addEventListener("click", () => { state.issuePage = Math.max(1, state.issuePage - 1); render(); });
    $("issueNextPage").addEventListener("click", () => { state.issuePage += 1; render(); });
    $("issueBody").addEventListener("click", event => {
      const target = event.target.closest("[data-issue-record], [data-issue-image]");
      if (!target) return;
      if (target.classList.contains("issue-image-more")) {
        openIssueImages(target.dataset.issueRecord, target.dataset.issueImage, target.dataset.issueTitle);
      } else {
        openIssueImage(target.dataset.issueImage, target.dataset.issueTitle);
      }
    });
    $("activeFilters").addEventListener("click", event => {
      const button = event.target.closest("[data-clear-filter]");
      if (!button) return;
      state.notice = "";
      const key = button.dataset.clearFilter;
      if (key === "brand") state.brand = "";
      if (key === "supplier") state.supplier = "";
      if (key === "businessType") state.businessType = "";
      if (key === "keyword") state.keyword = "";
      state.page = 1;
      render();
    });
    $("clearFilters").addEventListener("click", () => {
      Object.assign(state, {
        selectedDate: payload.selectedDate,
        range: "today",
        customStart: "",
        customEnd: "",
        brand: "",
        businessType: "",
        supplier: "",
        hour: "",
        keyword: "",
        qtyMin: "",
        qtyMax: "",
        notice: "",
        page: 1
      });
      setSelectedDate(payload.selectedDate);
      render();
    });
    $("detailBody").addEventListener("click", event => {
      const target = event.target.closest("[data-order]");
      if (target) openOrder(target.dataset.order);
    });
    document.addEventListener("click", event => {
      const target = event.target.closest("[data-sort]");
      if (!target) return;
      if (state.sortKey === target.dataset.sort) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortKey = target.dataset.sort; state.sortDir = "asc"; }
      render();
    });
    $("prevPage").addEventListener("click", () => { state.page = Math.max(1, state.page - 1); render(); });
    $("nextPage").addEventListener("click", () => { state.page += 1; render(); });
    $("exportButton").addEventListener("click", () => exportCsv(filteredRecords()));
    $("drawerBackdrop").addEventListener("click", closeDrawers);
    document.querySelectorAll("[data-close-drawer]").forEach(button => button.addEventListener("click", closeDrawers));
    $("drawerContent").addEventListener("click", event => {
      const returnTarget = event.target.closest("[data-return-issue-record]");
      if (returnTarget) {
        openIssueImages(returnTarget.dataset.returnIssueRecord, "", returnTarget.dataset.drawerTitle);
        return;
      }
      const target = event.target.closest("[data-drawer-image]");
      if (!target) return;
      openIssueImage(target.dataset.drawerImage, target.dataset.drawerTitle, target.dataset.drawerRecord);
    });
  }

  bindEvents();
  render();
})();

