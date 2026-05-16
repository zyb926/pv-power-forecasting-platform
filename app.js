const data = window.PVPlatformData || {};

const storage = {
  get(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value ?? fallback;
    } catch (error) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // Some file:// browser contexts block localStorage; keep the page interactive anyway.
    }
  },
};

const state = {
  scenario: storage.get("pv-demo-scenario", "clear"),
  horizon: storage.get("pv-demo-horizon", "15"),
};

const horizonMeta = {
  "15": {
    label: "15 分钟前瞻窗口",
    predLen: 1,
    resolution: "15 分钟 / 步",
    dataset: "Dataset0（15 分钟分辨率工业高频数据）",
    compareContext: "对应论文中 Dataset0 多时长对比表的 15 分钟窗口，评价指标为 MSE。",
  },
  "60": {
    label: "60 分钟前瞻窗口",
    predLen: 4,
    resolution: "15 分钟 / 步",
    dataset: "Dataset0（15 分钟分辨率工业高频数据）",
    compareContext: "对应论文中 Dataset0 多时长对比表的 60 分钟窗口，评价指标为 MSE。",
  },
  "180": {
    label: "180 分钟前瞻窗口",
    predLen: 12,
    resolution: "15 分钟 / 步",
    dataset: "Dataset0（15 分钟分辨率工业高频数据）",
    compareContext: "对应论文中 Dataset0 多时长对比表的 180 分钟窗口，评价指标为 MSE。",
  },
};

function normalizeState() {
  if (!data.scenarios) return;
  if (!data.scenarios[state.scenario]) state.scenario = "clear";
  if (!data.scenarios[state.scenario]?.horizons?.[state.horizon]) state.horizon = "15";
}

function saveState() {
  storage.set("pv-demo-scenario", state.scenario);
  storage.set("pv-demo-horizon", state.horizon);
}

function getScenarioPack() {
  normalizeState();
  return data.scenarios[state.scenario];
}

function getHorizonPack() {
  normalizeState();
  return data.scenarios[state.scenario].horizons[state.horizon];
}

function getHorizonMeta() {
  return horizonMeta[state.horizon] || horizonMeta["15"];
}

function renderHostFallback(host, title, detail) {
  if (!host) return;
  host.innerHTML = `
    <div class="empty-state">
      <strong>${title}</strong>
      <p>${detail}</p>
    </div>
  `;
}

function renderBootFallback(message) {
  [
    "forecastChart",
    "compareBars",
    "frequencyBands",
    "analyticsHeatmap",
    "spectralMatrix",
    "datasetCards",
    "ablationRows",
    "complexityTable",
    "dispatchCards",
    "seasonalHeatmap",
  ].forEach((id) => {
    const host = document.getElementById(id);
    if (host && !host.innerHTML.trim()) {
      renderHostFallback(host, "内容加载中断", message);
    }
  });
}

function confidenceAverage(values) {
  return Math.round((values.reduce((sum, item) => sum + item, 0) / values.length) * 100);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function interpolateColor(value, min, max, start, end) {
  const ratio = clamp((value - min) / (max - min), 0, 1);
  const rgb = start.map((component, index) => Math.round(component + (end[index] - component) * ratio));
  return `rgb(${rgb.join(",")})`;
}

function setActiveButtons(groupId, attr, value) {
  document.querySelectorAll(`#${groupId} [${attr}]`).forEach((element) => {
    element.classList.toggle("is-active", element.getAttribute(attr) === value);
  });
}

function renderForecastChart() {
  const host = document.getElementById("forecastChart");
  if (!host) return;

  const scenarioPack = getScenarioPack();
  const horizonPack = getHorizonPack();
  const meta = getHorizonMeta();
  const modeTag = document.getElementById("chartMode");
  if (modeTag) modeTag.textContent = `当前展示：${horizonPack.title} · pred_len=${meta.predLen}`;
  const width = 960;
  const height = 390;
  const padding = { top: 24, right: 26, bottom: 54, left: 58 };
  const values = [...horizonPack.forecast, ...horizonPack.actual];
  const max = Math.max(...values) + 1.2;
  const min = 0;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const x = (index) => padding.left + (plotWidth / (horizonPack.labels.length - 1)) * index;
  const y = (value) => padding.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

  const grid = Array.from({ length: 6 }, (_, index) => {
    const value = (max / 5) * index;
    const py = y(value);
    return `
      <line x1="${padding.left}" y1="${py}" x2="${width - padding.right}" y2="${py}" stroke="rgba(20,52,84,0.10)" stroke-width="1"/>
      <text x="${padding.left - 16}" y="${py + 5}" text-anchor="end" fill="#7b8fa5" font-size="12">${value.toFixed(1)}</text>
    `;
  }).join("");

  const xLabels = horizonPack.labels.map((label, index) => `
    <text x="${x(index)}" y="${height - 18}" text-anchor="middle" fill="#7b8fa5" font-size="12">${label}</text>
  `).join("");

  const forecastPath = horizonPack.forecast.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  const actualPath = horizonPack.actual.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  const bandUpper = horizonPack.forecast.map((value, index) => [x(index), y(value + (1 - horizonPack.confidence[index]) * 3.0)]);
  const bandLower = horizonPack.forecast.map((value, index) => [x(index), y(Math.max(0, value - (1 - horizonPack.confidence[index]) * 3.0))]);
  const bandPath =
    `M ${bandUpper[0][0]} ${bandUpper[0][1]} ` +
    bandUpper.slice(1).map(([cx, cy]) => `L ${cx} ${cy}`).join(" ") +
    " " +
    bandLower
      .slice()
      .reverse()
      .map(([cx, cy]) => `L ${cx} ${cy}`)
      .join(" ") +
    " Z";

  host.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${scenarioPack.label} ${horizonPack.title} 真实功率与预测曲线">
      <defs>
        <linearGradient id="forecastBand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(29, 111, 183, 0.22)"></stop>
          <stop offset="100%" stop-color="rgba(29, 111, 183, 0.02)"></stop>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${bandPath}" fill="url(#forecastBand)"></path>
      <path d="${actualPath}" fill="none" stroke="#f09a1b" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="8 7"></path>
      <path d="${forecastPath}" fill="none" stroke="#1f67b6" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"></path>
      ${horizonPack.forecast.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4.8" fill="#1f67b6" stroke="#ffffff" stroke-width="2"></circle>`).join("")}
      ${horizonPack.actual.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4.1" fill="#f09a1b" stroke="#ffffff" stroke-width="2"></circle>`).join("")}
      ${xLabels}
    </svg>
    <div class="inline-note">
      <strong>${scenarioPack.label}</strong> · <strong>${horizonPack.title}</strong> · 平均置信度
      <strong>${confidenceAverage(horizonPack.confidence)}%</strong>。
      ${horizonPack.confidenceText}
    </div>
  `;
}

function renderComparisonBars() {
  const host = document.getElementById("compareBars");
  const subtitle = document.getElementById("compareSubtitle");
  if (!host) return;
  const items = data.comparisonByHorizon[state.horizon];
  const max = Math.max(...items.map((item) => item.value));
  const min = Math.min(...items.map((item) => item.value));
  const meta = getHorizonMeta();
  if (subtitle) {
    subtitle.textContent = `条件：${meta.dataset} · MSE · 当前窗口 ${state.horizon} 分钟（pred_len=${meta.predLen}）`;
  }

  host.innerHTML = items
    .map((item) => {
      const width = `${(item.value / max) * 100}%`;
      const isBest = item.value === min;
      return `
        <div class="bar-row ${isBest ? "highlight" : ""}">
          <div class="bar-meta">
            <strong>${item.model}</strong>
            <span>${item.value.toFixed(4)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${width}; background:${item.color};"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderFrequencyBands() {
  const host = document.getElementById("frequencyBands");
  if (!host) return;
  const bands = data.scenarios[state.scenario].bands[state.horizon];
  host.innerHTML = bands
    .map((band) => {
      return `
        <div class="band-row">
          <div class="band-head">
            <strong>${band.label}</strong>
            <span>${band.value.toFixed(1)}%</span>
          </div>
          <div class="band-track"><div class="band-fill" style="width:${band.value}%"></div></div>
          <p>${band.note}</p>
        </div>
      `;
    })
    .join("");
}

function renderHeatmap(hostId, dataset) {
  const host = document.getElementById(hostId);
  if (!host) return;

  const header = `
    <div class="heatmap-empty"></div>
    ${dataset.columns.map((column) => `<div class="heatmap-col">${column}</div>`).join("")}
  `;
  const rows = dataset.rows
    .map((row) => {
      const cells = row.values
        .map((value) => {
          const fill = interpolateColor(value, 0.68, 0.98, [234, 244, 237], [23, 126, 85]);
          const color = value > 0.83 ? "#ffffff" : "#17324d";
          return `<div class="heatmap-cell" style="background:${fill}; color:${color};">${value.toFixed(4)}</div>`;
        })
        .join("");
      return `<div class="heatmap-row-label">${row.label}</div>${cells}`;
    })
    .join("");

  host.innerHTML = `<div class="heatmap-grid">${header}${rows}</div>`;
}

function renderSpectralMatrix() {
  renderHeatmap("spectralMatrix", data.spectralMatrix);
}

function renderDatasetCards() {
  const host = document.getElementById("datasetCards");
  if (!host) return;
  host.innerHTML = data.datasetCards
    .map(
      (item) => `
        <article class="dataset-card">
          <span>${item.note}</span>
          <h4>${item.name}</h4>
          <strong>${item.mse}</strong>
          <p>${item.result}</p>
        </article>
      `
    )
    .join("");
}

function renderAblationRows() {
  const host = document.getElementById("ablationRows");
  if (!host) return;
  const max = 13;
  host.innerHTML = data.ablation
    .map((row) => {
      const values = [
        { label: "D1 MSE", value: row.d1mse },
        { label: "D1 MAE", value: row.d1mae },
        { label: "D4 MSE", value: row.d4mse },
        { label: "D4 MAE", value: row.d4mae },
      ];
      return `
        <div class="ablation-row">
          <div class="ablation-name">
            <strong>${row.name}</strong>
            <span>移除组件后的平均退化</span>
          </div>
          <div class="ablation-bars">
            ${values
              .map((item) => {
                const width = `${Math.abs(item.value) / max * 100}%`;
                const positive = item.value >= 0;
                return `
                  <div class="mini-bar">
                    <label>${item.label}</label>
                    <div class="mini-track">
                      <div class="mini-fill ${positive ? "warn" : "safe"}" style="width:${width}"></div>
                    </div>
                    <span>${item.value > 0 ? "+" : ""}${item.value.toFixed(2)}%</span>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderComplexityTable() {
  const host = document.getElementById("complexityTable");
  if (!host) return;
  host.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>模型</th>
          <th>参数量(M)</th>
          <th>FLOPs(G)</th>
          <th>训练/epoch(s)</th>
          <th>推理(ms)</th>
        </tr>
      </thead>
      <tbody>
        ${data.complexity
          .map(
            (item) => `
              <tr class="${item.model === "Ours" ? "focus-row" : ""}">
                <td>${item.model}</td>
                <td>${item.params}</td>
                <td>${item.flops}</td>
                <td>${item.train}</td>
                <td>${item.infer}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderDispatchCards() {
  const host = document.getElementById("dispatchCards");
  if (!host) return;
  host.innerHTML = data.dispatchCards
    .map(
      (item) => `
        <article class="dispatch-card">
          <span class="dispatch-tag">${item.tag}</span>
          <h4>${item.title}</h4>
          <p>${item.desc}</p>
        </article>
      `
    )
    .join("");
}

function updateDashboardText() {
  const scenarioPack = getScenarioPack();
  const horizonPack = getHorizonPack();
  const meta = getHorizonMeta();

  const map = {
    scenarioLabel: scenarioPack.label,
    scenarioSummary: scenarioPack.summary,
    chartMode: `当前展示：${horizonPack.title} · pred_len=${meta.predLen}`,
    dashboardSubnote: `${scenarioPack.label} · ${meta.label}`,
    kpiNow: horizonPack.nextPower,
    kpiNowSub: horizonPack.nextDelta,
    kpiPeak: horizonPack.peakTime,
    kpiPeakSub: horizonPack.peakNote,
    kpiRisk: horizonPack.risk,
    warningText: horizonPack.warning,
    kpiStorage: horizonPack.storage,
    dispatchText: horizonPack.dispatch,
  };

  Object.entries(map).forEach(([id, text]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  });
}

function getAnalyticsScenarioSummary() {
  const summaryMap = {
    clear:
      "该场景用于验证模型在稳定天气下是否真正学到了日周期与半日周期结构，重点观察峰值时刻、爬升阶段与平稳段的拟合一致性。",
    cloudy:
      "该场景用于验证模型面对云团遮挡时的恢复能力，重点观察局部功率骤降、二次回升和误差带扩张是否被合理刻画。",
    front:
      "该场景用于验证模型在强对流前沿扰动下的鲁棒性边界，重点观察趋势保持、风险区间表达和异常波动下的稳定输出能力。",
  };
  return summaryMap[state.scenario] || summaryMap.clear;
}

function getAnalyticsScenarioInsight() {
  const horizonFocus =
    state.horizon === "15" ? "短时滚动修正" : state.horizon === "60" ? "小时级调度预备" : "中期趋势判断";
  const insightMap = {
    clear: `当前更适合观察 ${horizonFocus} 条件下模型对稳定主周期的保持效果，以及峰值时刻是否仍然准确对齐。`,
    cloudy: `当前更适合观察 ${horizonFocus} 条件下模型对云层扰动频带的响应能力，以及局部波谷之后的恢复是否平滑。`,
    front: `当前更适合观察 ${horizonFocus} 条件下模型是否把单点精度转化为风险区间与趋势判断，从而支撑更稳健的辅助决策。`,
  };
  return insightMap[state.scenario] || insightMap.clear;
}

function updateNarrativeBlocks() {
  const scenarioPack = getScenarioPack();
  const horizonPack = getHorizonPack();
  const meta = getHorizonMeta();
  const currentWindow = `${state.horizon} 分钟`;
  const map = {
    horizonMeaning: `这里的“预测时长”指预测前瞻窗口，对应模型输出长度 pred_len 映射后的真实时间范围，而不是输入序列长度。当前 ${currentWindow} 对应 ${meta.dataset} 中的 pred_len=${meta.predLen}。`,
    chartContext: `当前曲线回放展示的是 ${meta.dataset} 中抽取出的代表性${scenarioPack.label}场景，用于说明 ${currentWindow} 前瞻预测下模型输出、真实功率与风险区间的关系。`,
    compareContext: `该模型对比只随预测窗口变化，不随天气场景切换变化；数据来自论文中 Dataset0 的多时长 MSE 对比表。${meta.compareContext}`,
    analyticsCondition: `模型对比条件：${meta.dataset}，采样分辨率为 ${meta.resolution}，评价指标为 MSE，当前展示 ${currentWindow} 窗口（pred_len=${meta.predLen}），比较对象为 Ours、PatchTST、iTransformer 和 iReformer。`,
    analyticsDefinition: `实验页中的“时长视角”同样表示预测前瞻窗口。当前 ${currentWindow} 对应 pred_len=${meta.predLen}；场景切换用于解释不同天气扰动下的建模难点，模型对比本身来自固定 benchmark 条件。`,
    analyticsScenarioLabel: scenarioPack.label,
    analyticsScenarioSummary: getAnalyticsScenarioSummary(),
    analyticsScenarioInsight: getAnalyticsScenarioInsight(),
    dispatchWindowExplain: `当前窗口为 ${currentWindow} 前瞻预测，在 ${meta.dataset} 的定义下对应 pred_len=${meta.predLen}，适合用于${state.horizon === "15" ? "滚动修正" : state.horizon === "60" ? "小时级调度预备" : "中期风险准备"}。`,
  };

  Object.entries(map).forEach(([id, text]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  });
}

function updateDispatchSummary() {
  const scenarioPack = getScenarioPack();
  const horizonPack = getHorizonPack();
  const fields = {
    dispatchScenario: scenarioPack.label,
    dispatchHorizon: horizonPack.title,
    dispatchRisk: horizonPack.risk,
    dispatchAdvice: horizonPack.dispatch,
    dispatchWarning: horizonPack.warning,
  };
  Object.entries(fields).forEach(([id, text]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  });
}

function renderDashboard() {
  updateDashboardText();
  updateNarrativeBlocks();
  renderForecastChart();
  setActiveButtons("scenarioChips", "data-scenario", state.scenario);
  setActiveButtons("horizonChips", "data-horizon", state.horizon);
}

function renderAnalytics() {
  const scenarioPack = getScenarioPack();
  const meta = getHorizonMeta();
  renderComparisonBars();
  renderHeatmap("analyticsHeatmap", data.seasonalHeatmap);
  renderDatasetCards();
  renderAblationRows();
  renderComplexityTable();
  updateNarrativeBlocks();
  const title = document.getElementById("analyticsMode");
  if (title) title.textContent = `${scenarioPack.label} · ${meta.label} · pred_len=${meta.predLen}`;
  setActiveButtons("analyticsScenarioChips", "data-scenario", state.scenario);
  setActiveButtons("analyticsHorizonChips", "data-horizon", state.horizon);
}

function renderDispatch() {
  updateDispatchSummary();
  updateNarrativeBlocks();
}

function bindScenarioControls(groupIds) {
  groupIds.forEach((groupId) => {
    const host = document.getElementById(groupId);
    if (!host) return;
    host.addEventListener("click", (event) => {
      const button = event.target.closest("[data-scenario]");
      if (!button) return;
      state.scenario = button.dataset.scenario;
      saveState();
      refreshPage();
    });
  });
}

function bindHorizonControls(groupIds) {
  groupIds.forEach((groupId) => {
    const host = document.getElementById(groupId);
    if (!host) return;
    host.addEventListener("click", (event) => {
      const button = event.target.closest("[data-horizon]");
      if (!button) return;
      state.horizon = button.dataset.horizon;
      saveState();
      refreshPage();
    });
  });
}

function markPageLinkActive() {
  const current = document.body.dataset.page;
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    link.classList.toggle("is-current", link.dataset.pageLink === current);
  });
}

function refreshPage() {
  normalizeState();
  const page = document.body.dataset.page;
  if (page === "dashboard") renderDashboard();
  if (page === "analytics") renderAnalytics();
  if (page === "dispatch") renderDispatch();
  if (page === "architecture") {
    const mode = document.getElementById("architectureMode");
    if (mode) mode.textContent = `${data.project.school} · ${data.project.status}`;
  }
}

function setupReveal() {
  const elements = document.querySelectorAll(".reveal");
  if (!elements.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.16 }
  );
  elements.forEach((element) => observer.observe(element));
}

function init() {
  if (!data.scenarios) {
    renderBootFallback("页面数据未成功初始化，请刷新页面后重试。");
    return;
  }
  bindScenarioControls(["scenarioChips", "analyticsScenarioChips", "dispatchScenarioChips"]);
  bindHorizonControls(["horizonChips", "analyticsHorizonChips", "dispatchHorizonChips"]);
  markPageLinkActive();
  setupReveal();
  refreshPage();
}

function start() {
  try {
    init();
  } catch (error) {
    console.error("PV demo init failed:", error);
    renderBootFallback("交互脚本未完整执行，已进入安全回退模式。请刷新页面重试。");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
