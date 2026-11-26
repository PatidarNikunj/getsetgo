import { DEFAULTS } from "../settings.js";

const api = globalThis.browser ?? globalThis.chrome;

const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const siteBox = $("#site-enabled");
const toggleBtn = $("#toggle");

const [tab] = await api.tabs.query({ active: true, currentWindow: true });
let host = "";
try {
  host = new URL(tab?.url ?? "").hostname;
} catch {
  /* no URL access (e.g. a Safari internal page) */
}

const settings = { ...DEFAULTS, ...(await api.storage.local.get(DEFAULTS)) };
const save = (patch) => {
  Object.assign(settings, patch);
  return api.storage.local.set(patch);
};

for (const box of document.querySelectorAll("[data-setting]")) {
  const key = box.dataset.setting;
  box.checked = Boolean(settings[key]);
  box.addEventListener("change", () => save({ [key]: box.checked }));
}

if (host) {
  $("#site-name").textContent = host;
  siteBox.checked = !settings.disabledSites.includes(host);
  siteBox.addEventListener("change", () => {
    const sites = new Set(settings.disabledSites);
    if (siteBox.checked) sites.delete(host);
    else sites.add(host);
    save({ disabledSites: [...sites] });
  });
} else {
  siteBox.disabled = true;
}

async function refreshStatus() {
  if (tab?.id == null) {
    statusEl.textContent = "No page.";
    toggleBtn.disabled = true;
    return;
  }
  let s;
  try {
    s = await api.tabs.sendMessage(tab.id, { type: "status" });
  } catch {
    s = undefined;
  }
  if (!s) {
    statusEl.textContent = "No video found on this page.";
    toggleBtn.disabled = true;
    return;
  }
  toggleBtn.disabled = false;
  const where = s.frame === "top" ? "" : ` (in ${s.frame})`;
  if (s.inPip) statusEl.textContent = `Video is in Picture in Picture${where}.`;
  else if (s.eligible) statusEl.textContent = `Playing video ${s.size} detected${where}. Ready.`;
  else if (s.playing) statusEl.textContent = `Video detected${where}, but it's muted or too small.`;
  else statusEl.textContent = `Video detected${where}, not playing.`;
  if (s.lastError) statusEl.textContent += ` Last attempt: ${s.lastError}`;
}

toggleBtn.addEventListener("click", async () => {
  if (tab?.id == null) return;
  await api.tabs.sendMessage(tab.id, { type: "toggle" }).catch(() => {});
  setTimeout(refreshStatus, 500);
});

refreshStatus();
