// blocked.js

const params = new URLSearchParams(location.search);
const site = params.get("site") || "";
const originalUrl = params.get("originalUrl") || "";

// Display site name
const siteNames = { "youtube.com": "YouTube", "twitter.com": "Twitter / X" };
document.getElementById("site-name").textContent = siteNames[site] || site;

// Load usage info
chrome.runtime.sendMessage({ type: "getStatus" }, (status) => {
  if (!status || !status[site]) return;
  const data = status[site];
  const usedMin = Math.floor(data.usedSeconds / 60);
  const usedSec = data.usedSeconds % 60;
  const limitMin = data.limitMinutes;
  const infoEl = document.getElementById("usage-info");
  infoEl.textContent = `本日の利用時間: ${usedMin}分${usedSec}秒 / 上限 ${limitMin}分`;
});

// Bypass button
const bypassBtn = document.getElementById("bypass-btn");
const countdownEl = document.getElementById("countdown");

bypassBtn.addEventListener("click", () => {
  bypassBtn.disabled = true;
  bypassBtn.textContent = "処理中...";

  chrome.runtime.sendMessage({ type: "grantBypass", site }, () => {
    bypassBtn.style.display = "none";
    countdownEl.style.display = "block";

    let remaining = 5;
    countdownEl.textContent = `${remaining}秒後にリダイレクトします...`;

    const timer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(timer);
        countdownEl.textContent = "移動中...";
        // Redirect to original URL or site root
        if (originalUrl) {
          location.href = decodeURIComponent(originalUrl);
        } else {
          location.href = `https://www.${site}`;
        }
      } else {
        countdownEl.textContent = `${remaining}秒後にリダイレクトします...`;
      }
    }, 1000);
  });
});
