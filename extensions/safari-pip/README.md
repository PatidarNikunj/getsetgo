# Auto PiP (Safari Web Extension)

An Arc-style automatic Picture in Picture for Safari on macOS:

- detects the video you're watching (also inside iframes and open shadow DOM),
- opens a floating PiP window when you leave the page (switch tab, switch window or app, minimise or
  hide Safari),
- closes it when you come back, and playback continues in the site's own player (play/pause state
  from the PiP window is kept).

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
| `autopictureinpicture` attribute set on the video                                         | Only if your WebKit build honours it; harmless otherwise |
| Media Session `enterpictureinpicture` handler                                             | Not in Safari as of now; ready if Apple ships it         |
| `requestPictureInPicture()` / `webkitSetPresentationMode()` on tab hide or window blur    | Usually rejected without a gesture; tried anyway         |
| Toolbar button or Alt+Shift+P                                                             | Depends on whether Safari passes the gesture to the page |

Leave shortcuts recognised (macOS): Ctrl+Tab, Ctrl+Shift+Tab, Cmd+Shift+[ / ], Cmd+Option+← / →,
Cmd+1…9, Cmd+T, Cmd+N, Cmd+`, Cmd+H, Cmd+M. If a shortcut doesn't actually leave the page (Cmd+3
with two tabs), PiP closes again after about a second. **Cmd+Tab never reaches web pages**, so app
switching with Cmd+Tab relies on the routes Safari may reject. Habit tip: Cmd+H (hide Safari) does
work.

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
| `extension/background.js` | Relays window focus to every frame of the tab; Alt+Shift+P command  |
| `extension/popup/`        | Toolbar popup: on/off, per-site switch, triggers, status            |
| `extension/settings.js`   | Default settings (content.js keeps a copy; keep in sync)            |
| `test-page/index.html`    | Manual test page                                                    |
