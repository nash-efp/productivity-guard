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
    const sessionKey = `pg_confirmed_${hostname}`;

    // ── Media blocking ────────────────────────────────────────────────────────
    // Block the page immediately; unblock only after the user confirms (or if
    // confirmation is not required).

    let mediaObserver = null;
    const mutedByUs = new WeakSet(); // track only elements we muted ourselves

    function blockPageContent() {
      // 1. Hide all page content visually while keeping our overlay visible.
      const style = document.createElement("style");
      style.id = "pg-block-style";
      style.textContent =
        "html { visibility: hidden !important; }" +
        "#pg-overlay, #pg-overlay * { visibility: visible !important; }";
      document.documentElement.appendChild(style);

      // 2. Override HTMLMediaElement.prototype.play in the *page* context so
      //    autoplay calls are swallowed while the overlay is showing.
      //    Note: blocked by strict CSP on some sites, but the MutationObserver
      //    below acts as a fallback in those cases.
      const script = document.createElement("script");
      script.textContent = `
        window.__pgBlocking = true;
        (function () {
          var orig = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function () {
            if (window.__pgBlocking) return new Promise(function () {});
            return orig.apply(this, arguments);
          };
        })();
      `;
      document.documentElement.appendChild(script);
      script.remove(); // tag can be removed after execution

      // 3. MutationObserver: pause any media element added while blocking.
      //    Only mute elements that are not already muted by the page itself.
      mediaObserver = new MutationObserver(function () {
        document.querySelectorAll("video, audio").forEach(function (el) {
          if (!el.paused) el.pause();
          if (!el.muted) {
            el.muted = true;
            mutedByUs.add(el);
          }
        });
      });
      mediaObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    function unblockPageContent() {
      // Stop observing.
      if (mediaObserver) {
        mediaObserver.disconnect();
        mediaObserver = null;
      }

      // Remove the visibility-hiding style.
      const style = document.getElementById("pg-block-style");
      if (style) style.remove();

      // Restore HTMLMediaElement.prototype.play in the page context.
      const script = document.createElement("script");
      script.textContent = "window.__pgBlocking = false;";
      document.documentElement.appendChild(script);
      script.remove();

      // Only unmute elements that we muted — leave originally-muted ones alone.
      document.querySelectorAll("video, audio").forEach(function (el) {
        if (mutedByUs.has(el)) el.muted = false;
      });
    }

    // Block the page as early as possible.
    blockPageContent();

    // ── Confirmation overlay ──────────────────────────────────────────────────

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

    // ── Tick / usage tracking ─────────────────────────────────────────────────

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

    // ── Decision logic ────────────────────────────────────────────────────────

    chrome.runtime.sendMessage({ type: "getConfirmSettings" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        unblockPageContent();
        startTicking();
        return;
      }

      const masterEnabled = res.masterEnabled;
      const confirmEnabled = res.confirmEnabled;
      const pausedToday = res.pausedToday;
      const alreadyConfirmed = sessionStorage.getItem(sessionKey) === "1";

      if (!masterEnabled || !confirmEnabled || pausedToday || alreadyConfirmed) {
        // No confirmation needed — unblock immediately.
        unblockPageContent();
        startTicking();
        return;
      }

      const siteNames = {
        "youtube.com": "YouTube",
        "twitter.com": "Twitter / X",
        "x.com": "Twitter / X",
      };
      const siteName = siteNames[hostname] || hostname;

      showConfirmation(
        siteName,
        () => {
          // Confirmed → unblock page, start tracking.
          unblockPageContent();
          sessionStorage.setItem(sessionKey, "1");
          startTicking();
        },
        () => {
          // Cancelled → navigate away (page stays hidden, no need to unblock).
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
