// Auto PiP: background script.
// Relays window focus changes from a tab's top frame to all of its frames (so embedded players in
// iframes react too) and handles the keyboard command.
const api = globalThis.browser ?? globalThis.chrome;

function sendToTab(tabId, msg) {
  try {
    Promise.resolve(api.tabs.sendMessage(tabId, msg)).catch(() => {});
  } catch {
    /* tab gone */
  }
}

api.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return false;
  if (msg?.type === "focus-lost") sendToTab(tabId, { type: "auto-enter" });
  if (msg?.type === "focus-gained") sendToTab(tabId, { type: "restore" });
  return false;
});

api.commands?.onCommand.addListener(async (command) => {
  if (command !== "toggle-pip") return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) sendToTab(tab.id, { type: "toggle" });
});
