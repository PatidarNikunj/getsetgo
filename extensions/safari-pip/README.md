# Auto PiP (Safari Web Extension)

An Arc-style automatic Picture in Picture for Safari on macOS:

- detects the video you're watching (also inside iframes and open shadow DOM),
- opens a floating PiP window when you leave the page (switch tab, switch window or app, minimise or
  hide Safari),
- closes it when you come back, and playback continues in the site's own player (play/pause state
  from the PiP window is kept),
- with the native helper: double-click the PiP window to jump back to the video's tab and keep
  watching in the page.

This folder is standalone. It isn't part of the pnpm workspace and doesn't use the monorepo's stack.

## How it decides what to put in PiP

The video must be playing, at least 160×90, longer than 5 s (or live) and audible. The audible rule
skips muted autoplay previews and looping hero videos. A muted video still counts if you played or
unmuted it yourself, and the setting _Include muted autoplaying videos_ drops the audible rule. If
several videos qualify, the largest audible one you played last wins.

## The Safari limitation (read this)

WebKit only allows `requestPictureInPicture()` **while it is handling a user gesture** (a click or
key press in the page). Leaving a tab by clicking Safari's tab bar, or switching apps with Cmd+Tab,
gives the page no gesture: the page only sees `visibilitychange` / `blur`, and Safari rejects PiP
from those (`NotAllowedError`). Chrome extensions such as _Automatic picture-in-picture_ can use
Chrome's own auto-PiP (Media Session `enterpictureinpicture`), which Safari doesn't implement.

So the extension tries every route, in this order:

| Route                                                                                     | Works in Safari today?                                   |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Shortcut assist:** enter PiP inside the keydown of Safari's leave shortcuts (see below) | **Yes** (the key press is the gesture)                   |
| **Helper signal:** the native helper app sends a key press just before Cmd+Tab or a click | **Yes**, with the helper installed (see below)           |
| `autopictureinpicture` attribute set on the video                                         | Only if your WebKit build honours it; harmless otherwise |
| Media Session `enterpictureinpicture` handler                                             | Not in Safari as of now; ready if Apple ships it         |
| `requestPictureInPicture()` / `webkitSetPresentationMode()` on tab hide or window blur    | Usually rejected without a gesture; tried anyway         |
| Toolbar button or Alt+Shift+P                                                             | Depends on whether Safari passes the gesture to the page |

Leave shortcuts recognised (macOS): Ctrl+Tab, Ctrl+Shift+Tab, Cmd+Shift+[ / ], Cmd+Option+← / →,
Cmd+1…9, Cmd+T, Cmd+N, Cmd+`, Cmd+H, Cmd+M. If a shortcut doesn't actually leave the page (Cmd+3
with two tabs), PiP closes again after about a second (it waits while Cmd is held, so an open
Cmd+Tab switcher isn't cut short). **Cmd+Tab and clicks never give the page a gesture**: for those,
install the native helper.

Restoring always works: closing PiP needs no gesture.

Known quirk: opening Safari's address bar or an extension popup blurs the page, so with _switch to
another app or window_ on, PiP may open briefly; it closes when you click back into the page.

## Build and install (on your Mac)

You need Xcode (from the App Store). A paid Apple Developer account is only needed to distribute.

1. Convert the web extension into an Xcode project:

   ```bash
   xcrun safari-web-extension-converter extensions/safari-pip/extension --app-name "Auto PiP" --macos-only --no-open
   ```

   Pick the output folder when asked (or add `--project-location <dir>`).

2. Open the generated `.xcodeproj`, select the **Auto PiP (macOS)** scheme and press Run. This
   launches the small container app, which installs the extension.
3. In Safari: **Settings → Advanced → Show features for web developers**, then
   **Develop → Allow Unsigned Extensions** (needed for local builds; resets when Safari quits).
4. **Settings → Extensions → Auto PiP**: enable it and set website access to **Always Allow on Every
   Website**.

After changing JS/HTML, run again from Xcode (Cmd+R) to reload.

## Native helper app (for Cmd+Tab and clicks)

`helper/` is a small menu-bar app, **Auto PiP Helper**. While Safari is the frontmost app it watches
for actions that leave Safari without the page noticing:

- Cmd+Tab / Cmd+Shift+Tab, Cmd+Space (Spotlight), Ctrl+↑/↓ (Mission Control, App Exposé),
  Ctrl+←/→ (Spaces),
- clicks on another app's window, the Dock or the desktop,
- clicks on another tab in Safari's tab bar (found through the Accessibility tree).

Just before such an action reaches the system, it inserts a **Ctrl+Option+F18** key press, which
Safari (still frontmost) delivers to the page. That's a real user gesture, so the extension can open
PiP. The extension hides this key from the site. The helper never blocks or changes your own input,
and does nothing while another app is frontmost.

It needs **Accessibility** permission (to watch input and send the key). It isn't sandboxed, so it
can't ship in the Mac App Store; build it yourself:

```bash
cd extensions/safari-pip/helper
./build-app.sh
mv "build/Auto PiP Helper.app" /Applications/
open "/Applications/Auto PiP Helper.app"
```

1. macOS asks for Accessibility access: **System Settings → Privacy & Security → Accessibility**,
   switch on **Auto PiP Helper**. The menu-bar icon turns solid once it's watching.
2. Optional: menu-bar icon → **Launch at Login**.
3. The menu has switches for each trigger, and **Debug Logging**: open Console.app and filter for
   process `AutoPiPHelper`.

The build is ad-hoc signed by default, so macOS treats each rebuild as a new app: remove the old
entry in the Accessibility list and switch on the new one. To avoid that, sign with your
development certificate: `SIGN_IDENTITY="Apple Development: …" ./build-app.sh`.

### Double-click the PiP window to go back

With the helper running, double-click the PiP window (whichever app is in front). The helper brings
Safari to the front and sends **Ctrl+Option+F19**; the extension then switches to the tab and window
that hold the PiP video, closes PiP and keeps playing in the page. Switch it off in the helper's
menu (**Double-click the PiP window to go back to the video**) or in the extension popup.

Limits: the key reaches the page in Safari's active tab, so it needs a page the extension runs on
(not Safari's Start Page, and not while typing in the address bar). The PiP window belongs to
macOS, not Safari, so double-clicking a FaceTime or TV PiP window also brings Safari forward.

Window size: the PiP window is drawn by macOS (`PIPAgent`). Web pages and extensions can't size it,
and macOS ignores resize requests through Accessibility; drag a corner to resize it.

Limits: the signal goes to the focused frame, so if keyboard focus is inside an iframe without the
video, nothing happens. If Safari's tab bar layout isn't recognised (tabs shown in the sidebar),
tab clicks fall back to the routes Safari may reject; check with Xcode's Accessibility Inspector and
adjust `isSafariTab` in `LeaveDetector.swift`.

## Try it

Open `extensions/safari-pip/test-page/index.html` in Safari (local files need
**Develop → Allow Unsigned Extensions**, and possibly website access for file URLs). Pick a video
file, press play, and go through the checklist on the page. Then try YouTube, Vimeo, Netflix, etc.

Debugging: turn on _Log to the page console_ in the popup, then **Develop → [page] → Web Inspector**
and filter the console for `auto-pip`. The popup also shows what it found and the last PiP error.
The background script is under **Develop → Web Extension Background Content**.

## Files

| File                      | What it does                                                        |
| ------------------------- | ------------------------------------------------------------------- |
| `extension/manifest.json` | Manifest V3 for Safari 16.4+                                        |
| `extension/content.js`    | Video detection, enter/exit PiP, leave/return triggers (all frames) |
| `extension/background.js` | Relays window focus; remembers the PiP tab; Alt+Shift+P command     |
| `extension/popup/`        | Toolbar popup: on/off, per-site switch, triggers, status            |
| `extension/settings.js`   | Default settings (content.js keeps a copy; keep in sync)            |
| `test-page/index.html`    | Manual test page                                                    |
| `helper/`                 | Native menu-bar helper (Swift, AppKit); `build-app.sh` builds it    |
