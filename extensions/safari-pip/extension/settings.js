// Shared defaults. Loaded by the popup; content.js keeps its own copy because content scripts
// declared in the manifest can't import modules. Keep the two in sync.
export const DEFAULTS = Object.freeze({
  enabled: true,
  // Enter PiP when the tab is hidden (tab switch, new tab, minimise, Cmd+H).
  onTabSwitch: true,
  // Enter PiP when the Safari window loses focus but stays visible (another app or window in front).
  onWindowBlur: true,
  // Close PiP and continue in the page when you come back.
  restoreOnReturn: true,
  // Enter PiP during Safari's tab/window shortcuts (Ctrl+Tab, Cmd+Shift+], Cmd+1…9, Cmd+T, Cmd+N,
  // Cmd+`, Cmd+H, Cmd+M). The key press is a user gesture, which Safari requires for PiP.
  shortcutAssist: true,
  // React to the native Auto PiP Helper app's signal key (Ctrl+Option+F18), sent just before
  // Cmd+Tab, Spotlight, Mission Control, or a click on another app or Safari tab.
  helperSignal: true,
  // Remove `disablepictureinpicture` that some sites put on their players.
  unblockDisabled: true,
  // Also consider muted videos the user hasn't interacted with (autoplaying previews, feeds).
  includeMuted: false,
  // Log decisions to the page's Web Inspector console.
  debug: false,
  // Hostnames (top-level page) where the extension does nothing.
  disabledSites: [],
});
