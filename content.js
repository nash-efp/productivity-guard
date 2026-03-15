// content.js - Content Script (document_start)

(function () {
  const hostname = location.hostname;

  // Don't show confirmation on the blocked.html redirect
  if (location.href.includes(chrome.runtime.id)) return;

  // Check if this site is monitored before doing anything
  chrome.runtime.sendMessage({ type: "isMonitored", hostname }, (res) => {
    if (chrome.runtime.lastError || !res || !res.monitored) return;
    initSite();
  });

  function initSite() {
    // Confirmation overlay: shown once per session per site
    const sessionKey = `pg_confirmed_${hostname}`;

    function showConfirmation(siteName, onConfirm, onCancel) {
      const overlay = document.createElement("div");
      overlay.id = "pg-overlay";
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        background: "#1a1a2e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      });

      overlay.innerHTML = `
        <div style="text-align:center;max-width:380px;padding:0 24px;">
          <div style="font-size:48px;margin-bottom:16px;">⏱️</div>
          <h2 style="color:#e94560;font-size:22px;margin-bottom:8px;">本当に開きますか？</h2>
          <p style="color:#a0a8c0;font-size:14px;line-height:1.6;margin-bottom:28px;">
            <strong style="color:#e0e0e0;">${siteName}</strong> を開こうとしています。<br>
            意識的な選択ですか？
          </p>
          <div style="display:flex;gap:12px;justify-content:center;">
            <button id="pg-cancel" style="
              padding:10px 28px;
              background:#16213e;
              border:1px solid #4a5568;
              border-radius:8px;
              color:#e0e0e0;
              font-size:14px;
              font-weight:600;
              cursor:pointer;
            ">← 戻る</button>
            <button id="pg-confirm" style="
              padding:10px 28px;
              background:#e94560;
              border:none;
              border-radius:8px;
              color:white;
              font-size:14px;
              font-weight:600;
              cursor:pointer;
            ">開く</button>
          </div>
        </div>
      `;

      function inject() {
        if (document.documentElement) {
          document.documentElement.appendChild(overlay);
        } else {
          document.addEventListener("DOMContentLoaded", () => {
            document.documentElement.appendChild(overlay);
          });
        }

        document.getElementById("pg-confirm").addEventListener("click", () => {
          overlay.remove();
          onConfirm();
        });

        document.getElementById("pg-cancel").addEventListener("click", () => {
          overlay.remove();
          onCancel();
        });
      }

      inject();
    }

    function startTicking() {
      function sendTick() {
        if (document.visibilityState !== "visible") return;
        chrome.runtime.sendMessage({ type: "tick", hostname }, () => {
          if (chrome.runtime.lastError) {}
        });
      }

      let intervalId = setInterval(sendTick, 5000);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          if (!intervalId) intervalId = setInterval(sendTick, 5000);
        } else {
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
        }
      });
    }

    // Check settings, then decide whether to show confirmation
    chrome.runtime.sendMessage({ type: "getConfirmSettings" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        startTicking();
        return;
      }

      const masterEnabled = res.masterEnabled;
      const confirmEnabled = res.confirmEnabled;
      const pausedToday = res.pausedToday;
      const alreadyConfirmed = sessionStorage.getItem(sessionKey) === "1";

      if (!masterEnabled || !confirmEnabled || pausedToday || alreadyConfirmed) {
        startTicking();
        return;
      }

      const siteNames = {
        "youtube.com": "YouTube",
        "twitter.com": "Twitter / X",
        "x.com": "Twitter / X"
      };
      const siteName = siteNames[hostname] || hostname;

      showConfirmation(
        siteName,
        () => {
          sessionStorage.setItem(sessionKey, "1");
          startTicking();
        },
        () => {
          if (history.length > 1) {
            history.back();
          } else {
            window.close();
          }
        }
      );
    });
  }
})();
