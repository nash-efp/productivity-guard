// popup.js

const SITE_NAMES = {
  "youtube.com": "YouTube",
  "twitter.com": "Twitter / X"
};

function getSiteName(hostname) {
  return SITE_NAMES[hostname] || hostname;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m`;
}

function formatMs(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function getBarColor(pct) {
  if (pct >= 100) return "red";
  if (pct >= 85) return "orange";
  if (pct >= 60) return "yellow";
  return "";
}

function parseHostname(input) {
  input = input.trim().toLowerCase();
  if (!input) return null;
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    input = "https://" + input;
  }
  try {
    const url = new URL(input);
    let host = url.hostname;
    if (host.startsWith("www.")) host = host.slice(4);
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

function renderMainSection(status) {
  const section = document.getElementById("main-section");
  if (!status || Object.keys(status).length === 0) {
    section.innerHTML = '<div class="no-sites">監視中のサイトなし</div>';
    return;
  }

  section.innerHTML = Object.entries(status).map(([site, data]) => {
    const name = getSiteName(site);
    const usedMin = data.usedSeconds / 60;
    const limitMin = data.limitMinutes;
    const pct = Math.min((usedMin / limitMin) * 100, 100);
    const barColor = getBarColor(pct);
    const bypassHtml = (data.bypassActive && data.bypassRemainingMs > 0)
      ? `<div class="bypass-label">バイパス中: 残り ${formatMs(data.bypassRemainingMs)}</div>`
      : "";
    return `
      <div class="site-row">
        <div class="site-name">${name}</div>
        <div class="progress-wrap">
          <div class="progress-bar ${barColor}" style="width:${pct}%"></div>
        </div>
        <div class="usage-label">${formatTime(data.usedSeconds)} / ${limitMin}m</div>
        ${bypassHtml}
      </div>
    `;
  }).join("");
}

function renderSettingsRows(status) {
  const container = document.getElementById("settings-rows");
  if (!status || Object.keys(status).length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = Object.entries(status).map(([site, data]) => {
    const name = getSiteName(site);
    return `
      <div class="setting-row">
        <label class="setting-label">${name}上限</label>
        <input type="number" class="limit-input site-limit" data-site="${site}"
               value="${data.limitMinutes}" min="1" max="1440" />
        <span class="unit">min</span>
        <label class="toggle-label">
          <input type="checkbox" class="site-enabled" data-site="${site}" ${data.enabled ? "checked" : ""} />
          有効
        </label>
      </div>
    `;
  }).join("");
}

function renderCustomSitesList(customSites) {
  const list = document.getElementById("custom-sites-list");
  if (customSites.length === 0) {
    list.innerHTML = '<div class="no-custom-sites">カスタムサイトなし</div>';
    return;
  }
  list.innerHTML = customSites.map(hostname => `
    <div class="custom-site-item">
      <span class="custom-site-name">${hostname}</span>
      <button class="delete-site-btn" data-hostname="${hostname}">削除</button>
    </div>
  `).join("");

  list.querySelectorAll(".delete-site-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "removeCustomSite", hostname: btn.dataset.hostname }, () => {
        loadAll();
      });
    });
  });
}

function loadAll() {
  chrome.runtime.sendMessage({ type: "getStatus" }, (status) => {
    if (!status) return;
    renderMainSection(status);
    renderSettingsRows(status);
  });

  chrome.runtime.sendMessage({ type: "getConfirmSettings" }, (res) => {
    if (!res) return;
    document.getElementById("confirm-enabled").checked = res.confirmEnabled;
  });

  chrome.runtime.sendMessage({ type: "getCustomSites" }, (sites) => {
    renderCustomSitesList(sites || []);
  });
}

// Master on/off toggle
const masterToggle = document.getElementById("master-enabled");

chrome.runtime.sendMessage({ type: "getMasterEnabled" }, (res) => {
  const enabled = res?.enabled !== false;
  masterToggle.checked = enabled;
  document.body.classList.toggle("extension-off", !enabled);
});

masterToggle.addEventListener("change", () => {
  const enabled = masterToggle.checked;
  document.body.classList.toggle("extension-off", !enabled);
  chrome.runtime.sendMessage({ type: "setMasterEnabled", enabled });
});

// Save settings
document.getElementById("save-btn").addEventListener("click", () => {
  const settings = {};
  document.querySelectorAll(".site-limit").forEach(input => {
    const site = input.dataset.site;
    const enabledEl = document.querySelector(`.site-enabled[data-site="${site}"]`);
    settings[site] = {
      limitMinutes: parseInt(input.value, 10) || 20,
      enabled: enabledEl ? enabledEl.checked : true
    };
  });
  const confirmEnabled = document.getElementById("confirm-enabled").checked;

  chrome.runtime.sendMessage({ type: "saveSettings", settings }, () => {
    chrome.runtime.sendMessage({ type: "setConfirmEnabled", enabled: confirmEnabled }, () => {
      const msg = document.getElementById("save-msg");
      msg.textContent = "保存しました";
      setTimeout(() => { msg.textContent = ""; }, 2000);
      loadAll();
    });
  });
});

// Add custom site
document.getElementById("add-site-btn").addEventListener("click", () => {
  const urlInput = document.getElementById("new-site-url");
  const limitInput = document.getElementById("new-site-limit");
  const errorEl = document.getElementById("add-site-error");

  const hostname = parseHostname(urlInput.value);
  if (!hostname) {
    errorEl.textContent = "URLが正しくありません";
    return;
  }
  errorEl.textContent = "";

  const limitMinutes = parseInt(limitInput.value, 10) || 20;
  chrome.runtime.sendMessage({ type: "addCustomSite", hostname, limitMinutes }, () => {
    urlInput.value = "";
    limitInput.value = "20";
    loadAll();
  });
});

// Clear error on input
document.getElementById("new-site-url").addEventListener("input", () => {
  document.getElementById("add-site-error").textContent = "";
});

// Initial load
loadAll();
