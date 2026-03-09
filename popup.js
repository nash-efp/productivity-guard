// popup.js

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

function updateSiteUI(site, data) {
  const key = site === "youtube.com" ? "youtube" : "twitter";
  const bar = document.getElementById(`${key}-bar`);
  const label = document.getElementById(`${key}-label`);
  const bypassEl = document.getElementById(`${key}-bypass`);

  const usedMin = data.usedSeconds / 60;
  const limitMin = data.limitMinutes;
  const pct = Math.min((usedMin / limitMin) * 100, 100);

  bar.style.width = `${pct}%`;
  bar.className = "progress-bar " + getBarColor(pct);

  label.textContent = `${formatTime(data.usedSeconds)} / ${limitMin}m`;

  if (data.bypassActive && data.bypassRemainingMs > 0) {
    bypassEl.style.display = "block";
    bypassEl.textContent = `バイパス中: 残り ${formatMs(data.bypassRemainingMs)}`;
  } else {
    bypassEl.style.display = "none";
  }
}

async function loadStatus() {
  chrome.runtime.sendMessage({ type: "getStatus" }, (status) => {
    if (!status) return;
    updateSiteUI("youtube.com", status["youtube.com"]);
    updateSiteUI("twitter.com", status["twitter.com"]);

    document.getElementById("youtube-limit").value = status["youtube.com"].limitMinutes;
    document.getElementById("youtube-enabled").checked = status["youtube.com"].enabled;
    document.getElementById("twitter-limit").value = status["twitter.com"].limitMinutes;
    document.getElementById("twitter-enabled").checked = status["twitter.com"].enabled;
  });

  chrome.runtime.sendMessage({ type: "getConfirmSettings" }, (res) => {
    if (!res) return;
    document.getElementById("confirm-enabled").checked = res.confirmEnabled;
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

document.getElementById("save-btn").addEventListener("click", () => {
  const settings = {
    "youtube.com": {
      limitMinutes: parseInt(document.getElementById("youtube-limit").value, 10) || 20,
      enabled: document.getElementById("youtube-enabled").checked
    },
    "twitter.com": {
      limitMinutes: parseInt(document.getElementById("twitter-limit").value, 10) || 20,
      enabled: document.getElementById("twitter-enabled").checked
    }
  };
  const confirmEnabled = document.getElementById("confirm-enabled").checked;

  chrome.runtime.sendMessage({ type: "saveSettings", settings }, () => {
    chrome.runtime.sendMessage({ type: "setConfirmEnabled", enabled: confirmEnabled }, () => {
      const msg = document.getElementById("save-msg");
      msg.textContent = "保存しました";
      setTimeout(() => { msg.textContent = ""; }, 2000);
      loadStatus();
    });
  });
});

// Initial load
loadStatus();
