// background.js - Service Worker

const DEFAULT_SITES = ["youtube.com", "twitter.com"];
const BYPASS_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const KEEP_DAYS = 30;

async function getCustomSites() {
  const data = await chrome.storage.local.get("customSites");
  return data.customSites || [];
}

async function getAllSites() {
  const customSites = await getCustomSites();
  return [...DEFAULT_SITES, ...customSites];
}

async function normalizeHost(hostname) {
  if (!hostname) return null;
  hostname = hostname.toLowerCase();

  // Twitter/X alias
  if (hostname === "x.com" || hostname.endsWith(".x.com")) return "twitter.com";

  const allSites = await getAllSites();
  for (const site of allSites) {
    if (hostname === site || hostname.endsWith("." + site)) return site;
  }
  return null;
}

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function getSettings() {
  const data = await chrome.storage.local.get("settings");
  const settings = data.settings || {};
  // Ensure default sites always have settings
  for (const site of DEFAULT_SITES) {
    if (!settings[site]) settings[site] = { limitMinutes: 20, enabled: true };
  }
  return settings;
}

async function isMasterEnabled() {
  const data = await chrome.storage.local.get("masterEnabled");
  return data.masterEnabled !== false; // default: true
}

async function getUsage() {
  const data = await chrome.storage.local.get("usage");
  return data.usage || {};
}

async function getBypass() {
  const data = await chrome.storage.local.get("bypass");
  return data.bypass || {};
}

async function addUsageSeconds(site, secs) {
  const usage = await getUsage();
  const todayKey = getTodayKey();

  if (!usage[todayKey]) usage[todayKey] = {};
  usage[todayKey][site] = (usage[todayKey][site] || 0) + secs;

  // Remove entries older than KEEP_DAYS
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  for (const key of Object.keys(usage)) {
    const keyDate = new Date(key);
    if (keyDate < cutoff) {
      delete usage[key];
    }
  }

  await chrome.storage.local.set({ usage });
}

async function isBypassActive(site) {
  const bypass = await getBypass();
  if (!bypass[site]) return false;
  const { grantedAt, durationMs } = bypass[site];
  return Date.now() < grantedAt + durationMs;
}

async function getBypassRemainingMs(site) {
  const bypass = await getBypass();
  if (!bypass[site]) return 0;
  const { grantedAt, durationMs } = bypass[site];
  const remaining = (grantedAt + durationMs) - Date.now();
  return Math.max(0, remaining);
}

async function grantBypass(site) {
  const bypass = await getBypass();
  bypass[site] = { grantedAt: Date.now(), durationMs: BYPASS_DURATION_MS };
  await chrome.storage.local.set({ bypass });
}

async function checkAndBlock(site, tabId) {
  const settings = await getSettings();
  const siteSetting = settings[site];
  if (!siteSetting || !siteSetting.enabled) return;

  const bypassActive = await isBypassActive(site);
  if (bypassActive) return;

  const usage = await getUsage();
  const todayKey = getTodayKey();
  const usedSeconds = (usage[todayKey] && usage[todayKey][site]) || 0;
  const limitSeconds = siteSetting.limitMinutes * 60;

  if (usedSeconds >= limitSeconds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const originalUrl = encodeURIComponent(tab.url || "");
      const blockedUrl = chrome.runtime.getURL(
        `blocked.html?site=${encodeURIComponent(site)}&originalUrl=${originalUrl}`
      );
      await chrome.tabs.update(tabId, { url: blockedUrl });
    } catch (e) {
      // Tab may have been closed
    }
  }
}

function customScriptId(hostname) {
  return `pg-custom-${hostname}`;
}

function customScriptOrigins(hostname) {
  return [`*://*.${hostname}/*`, `*://${hostname}/*`];
}

async function registerCustomScript(hostname) {
  const id = customScriptId(hostname);
  const matches = customScriptOrigins(hostname);
  try {
    await chrome.scripting.registerContentScripts([{
      id, matches, js: ["content.js"], runAt: "document_start"
    }]);
  } catch (e) {
    // Already registered — update to ensure it's current
    try {
      await chrome.scripting.updateContentScripts([{
        id, matches, js: ["content.js"], runAt: "document_start"
      }]);
    } catch (_) { /* ignore */ }
  }
}

async function unregisterCustomScript(hostname) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [customScriptId(hostname)] });
  } catch (_) { /* already gone */ }
}

// Re-register all custom site scripts on install/update/startup
async function reRegisterCustomScripts() {
  const customSites = await getCustomSites();
  for (const hostname of customSites) {
    await registerCustomScript(hostname);
  }
}

chrome.runtime.onInstalled.addListener(reRegisterCustomScripts);
chrome.runtime.onStartup.addListener(reRegisterCustomScripts);

async function addCustomSite(hostname, limitMinutes) {
  const customSites = await getCustomSites();
  if (!customSites.includes(hostname)) {
    customSites.push(hostname);
    await chrome.storage.local.set({ customSites });
  }
  await registerCustomScript(hostname);
  const settings = await getSettings();
  if (!settings[hostname]) {
    settings[hostname] = { limitMinutes: limitMinutes || 20, enabled: true };
    await chrome.storage.local.set({ settings });
  }
}

async function removeCustomSite(hostname) {
  const customSites = await getCustomSites();
  const idx = customSites.indexOf(hostname);
  if (idx >= 0) {
    customSites.splice(idx, 1);
    await chrome.storage.local.set({ customSites });
  }
  await unregisterCustomScript(hostname);
  // Revoke the optional host permission for this site
  try {
    await chrome.permissions.remove({ origins: customScriptOrigins(hostname) });
  } catch (_) { /* ignore */ }
  const data = await chrome.storage.local.get("settings");
  const settings = data.settings || {};
  if (settings[hostname]) {
    delete settings[hostname];
    await chrome.storage.local.set({ settings });
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "isMonitored") {
    normalizeHost(message.hostname).then((site) => {
      sendResponse({ monitored: !!site });
    });
    return true;
  }

  if (message.type === "tick") {
    normalizeHost(message.hostname).then((site) => {
      if (!site) {
        sendResponse({ ok: false });
        return;
      }
      isMasterEnabled().then((enabled) => {
        if (!enabled) {
          sendResponse({ ok: true, skipped: true });
          return;
        }
        const tabId = sender.tab ? sender.tab.id : null;
        addUsageSeconds(site, 5).then(() => {
          if (tabId !== null) {
            checkAndBlock(site, tabId).then(() => sendResponse({ ok: true }));
          } else {
            sendResponse({ ok: true });
          }
        });
      });
    });
    return true;
  }

  if (message.type === "getMasterEnabled") {
    isMasterEnabled().then((enabled) => sendResponse({ enabled }));
    return true;
  }

  if (message.type === "setMasterEnabled") {
    chrome.storage.local.set({ masterEnabled: message.enabled }).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }

  if (message.type === "grantBypass") {
    const site = message.site;
    grantBypass(site).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "getStatus") {
    Promise.all([getSettings(), getUsage(), getAllSites()]).then(
      async ([settings, usage, allSites]) => {
        const todayKey = getTodayKey();
        const result = {};
        for (const site of allSites) {
          const siteSetting = settings[site] || { limitMinutes: 20, enabled: true };
          const usedSeconds = (usage[todayKey] && usage[todayKey][site]) || 0;
          const bypassActive = await isBypassActive(site);
          const bypassRemainingMs = await getBypassRemainingMs(site);
          result[site] = {
            limitMinutes: siteSetting.limitMinutes,
            enabled: siteSetting.enabled,
            usedSeconds,
            bypassActive,
            bypassRemainingMs
          };
        }
        sendResponse(result);
      }
    );
    return true;
  }

  if (message.type === "saveSettings") {
    chrome.storage.local.set({ settings: message.settings }).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }

  if (message.type === "getUsageHistory") {
    getUsage().then((usage) => sendResponse(usage));
    return true;
  }

  if (message.type === "getSettingsOnly") {
    getSettings().then((settings) => sendResponse(settings));
    return true;
  }

  if (message.type === "getConfirmSettings") {
    Promise.all([
      chrome.storage.local.get("masterEnabled"),
      chrome.storage.local.get("confirmEnabled"),
      chrome.storage.local.get("confirmPausedUntil")
    ]).then(([m, c, p]) => {
      const pausedUntil = p.confirmPausedUntil || 0;
      const pausedToday = Date.now() < pausedUntil;
      sendResponse({
        masterEnabled: m.masterEnabled !== false,
        confirmEnabled: c.confirmEnabled !== false, // default: true
        pausedToday
      });
    });
    return true;
  }

  if (message.type === "setConfirmEnabled") {
    chrome.storage.local.set({ confirmEnabled: message.enabled }).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }

  if (message.type === "pauseConfirmToday") {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    chrome.storage.local.set({ confirmPausedUntil: endOfDay }).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }

  if (message.type === "clearConfirmPause") {
    chrome.storage.local.remove("confirmPausedUntil").then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }

  if (message.type === "getCustomSites") {
    getCustomSites().then((sites) => sendResponse(sites));
    return true;
  }

  if (message.type === "addCustomSite") {
    addCustomSite(message.hostname, message.limitMinutes).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }

  if (message.type === "removeCustomSite") {
    removeCustomSite(message.hostname).then(() => sendResponse({ ok: true }));
    return true;
  }
});
