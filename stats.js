// stats.js

let currentPeriod = 7;

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDateKey(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(key) {
  const parts = key.split("-");
  return `${parts[1]}/${parts[2]}`;
}

function formatMinutes(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m${s}s`;
}

function getBarColor(seconds, limitSeconds) {
  const pct = (seconds / limitSeconds) * 100;
  if (pct >= 100) return "bar-red";
  if (pct >= 85) return "bar-orange";
  if (pct >= 60) return "bar-yellow";
  return "bar-green";
}

function renderChart(containerId, site, usage, settings, days) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const limitSec = (settings[site]?.limitMinutes || 20) * 60;

  // Collect data for the period
  const entries = [];
  let maxSeconds = limitSec;
  for (let i = days - 1; i >= 0; i--) {
    const key = getDateKey(i);
    const sec = (usage[key] && usage[key][site]) || 0;
    entries.push({ key, sec, label: formatDateLabel(key) });
    if (sec > maxSeconds) maxSeconds = sec;
  }

  // Check if all zero
  const hasData = entries.some(e => e.sec > 0);
  if (!hasData) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "まだデータがありません";
    container.appendChild(empty);
    return;
  }

  const limitPct = (limitSec / maxSeconds) * 100;

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "chart-row";

    const dateEl = document.createElement("div");
    dateEl.className = "chart-date";
    dateEl.textContent = entry.label;

    const barWrap = document.createElement("div");
    barWrap.className = "chart-bar-wrap";

    const barFill = document.createElement("div");
    barFill.className = "chart-bar-fill " + getBarColor(entry.sec, limitSec);
    const pct = Math.min((entry.sec / maxSeconds) * 100, 100);
    barFill.style.width = `${pct}%`;

    // Limit line
    const limitLine = document.createElement("div");
    limitLine.className = "limit-line";
    limitLine.style.left = `${Math.min(limitPct, 100)}%`;
    limitLine.title = `上限: ${Math.floor(limitSec / 60)}分`;

    barWrap.appendChild(barFill);
    barWrap.appendChild(limitLine);

    const valueEl = document.createElement("div");
    valueEl.className = "chart-value";
    valueEl.textContent = entry.sec > 0 ? formatMinutes(entry.sec) : "-";

    row.appendChild(dateEl);
    row.appendChild(barWrap);
    row.appendChild(valueEl);
    container.appendChild(row);
  }
}

function renderSummary(usage, settings, days) {
  const sites = { "youtube.com": "YouTube", "twitter.com": "Twitter / X" };
  const summaryEl = document.getElementById("summary");

  let html = '<div class="summary-title">集計</div><div class="summary-grid">';

  for (const [site, name] of Object.entries(sites)) {
    let totalSec = 0;
    let exceedDays = 0;
    const limitSec = (settings[site]?.limitMinutes || 20) * 60;

    for (let i = 0; i < days; i++) {
      const key = getDateKey(i);
      const sec = (usage[key] && usage[key][site]) || 0;
      totalSec += sec;
      if (sec >= limitSec) exceedDays++;
    }

    const avgSec = Math.floor(totalSec / days);
    html += `
      <div class="summary-item">
        <div class="summary-item-label">${name}</div>
        <div class="summary-item-value">${formatMinutes(totalSec)}</div>
        <div class="summary-item-sub">合計 (${days}日間)</div>
      </div>
      <div class="summary-item">
        <div class="summary-item-label">${name} 平均/日</div>
        <div class="summary-item-value">${formatMinutes(avgSec)}</div>
        <div class="summary-item-sub">上限超過: ${exceedDays}日</div>
      </div>
    `;
  }

  html += "</div>";
  summaryEl.innerHTML = html;
}

async function loadAndRender() {
  chrome.runtime.sendMessage({ type: "getUsageHistory" }, (usage) => {
    if (!usage) usage = {};
    chrome.runtime.sendMessage({ type: "getSettingsOnly" }, (settings) => {
      if (!settings) settings = {};
      renderChart("youtube-chart", "youtube.com", usage, settings, currentPeriod);
      renderChart("twitter-chart", "twitter.com", usage, settings, currentPeriod);
      renderSummary(usage, settings, currentPeriod);
    });
  });
}

// Period toggle
document.getElementById("btn-7").addEventListener("click", () => {
  currentPeriod = 7;
  document.getElementById("btn-7").classList.add("active");
  document.getElementById("btn-30").classList.remove("active");
  loadAndRender();
});

document.getElementById("btn-30").addEventListener("click", () => {
  currentPeriod = 30;
  document.getElementById("btn-30").classList.add("active");
  document.getElementById("btn-7").classList.remove("active");
  loadAndRender();
});

// Auto-refresh every 10 seconds
loadAndRender();
setInterval(loadAndRender, 10000);
