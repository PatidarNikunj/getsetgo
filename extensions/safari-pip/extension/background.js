// Auto PiP: background script.
// Relays window focus changes from a tab's top frame to all of its frames (so embedded players in
// iframes react too), remembers which tab holds the PiP video (for the helper's double-click
// return), and handles the keyboard command.
const api = globalThis.browser ?? globalThis.chrome;

// The background page isn't persistent, so keep the PiP tab in session storage (cleared when
// Safari quits). Fall back to local storage where session storage is missing.
const store = api.storage.session ?? api.storage.local;
const PIP_KEY = "pipTab";

function sendToTab(tabId, msg) {
  try {
    Promise.resolve(api.tabs.sendMessage(tabId, msg)).catch(() => {});
  } catch {
    /* tab gone */
  }
}

async function setPipTab(tab, inPip) {
  if (inPip) {
    await store.set({ [PIP_KEY]: { tabId: tab.id, windowId: tab.windowId } });
    return;
  }
  const { [PIP_KEY]: current } = await store.get(PIP_KEY);
  if (current?.tabId === tab.id) await store.remove(PIP_KEY);
}

/** Double-click on the PiP window: show the tab with the video and close PiP. */
async function returnToPip() {
  const { [PIP_KEY]: target } = await store.get(PIP_KEY);
  if (!target) return;
  try {
    await api.tabs.update(target.tabId, { active: true });
    await api.windows.update(target.windowId, { focused: true });
  } catch {
    // The tab or window is gone.
    await store.remove(PIP_KEY);
    return;
  }
  sendToTab(target.tabId, { type: "exit-pip" });
}

api.runtime.onMessage.addListener((msg, sender) => {
  const tab = sender.tab;
  if (tab?.id == null) return false;
  if (msg?.type === "focus-lost") sendToTab(tab.id, { type: "auto-enter" });
  if (msg?.type === "focus-gained") sendToTab(tab.id, { type: "restore" });
  if (msg?.type === "pip-state") setPipTab(tab, Boolean(msg.inPip)).catch(() => {});
  if (msg?.type === "return-to-pip") returnToPip().catch(() => {});
  return false;
});

api.tabs.onRemoved?.addListener(async (tabId) => {
  const { [PIP_KEY]: current } = await store.get(PIP_KEY);
  if (current?.tabId === tabId) await store.remove(PIP_KEY);
});

api.commands?.onCommand.addListener(async (command) => {
  if (command !== "toggle-pip") return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) sendToTab(tab.id, { type: "toggle" });
});
