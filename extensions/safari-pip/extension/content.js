/*
 * Auto PiP: content script, runs in every frame.
 *
 * Leaving the page (tab hidden, window/app loses focus, or a tab/window shortcut) moves the best
 * playing <video> into Picture in Picture. Returning closes PiP and playback continues in the page.
 *
 * Safari only allows PiP while it is handling a user gesture, so we try every route:
 *   1. `autopictureinpicture` on the video (WebKit has the attribute; honoured where enabled).
 *   2. Media Session "enterpictureinpicture" handler (the browser's own auto-PiP, where supported).
 *   3. requestPictureInPicture() / webkitSetPresentationMode() on visibilitychange and blur.
 *   4. Shortcut assist: entering PiP inside the keydown of Safari's tab/window shortcuts, which
 *      is a real gesture. This is the route that works reliably today.
 *   5. Helper signal: the native Auto PiP Helper app sends Ctrl+Option+F18 just before Cmd+Tab
 *      or a click that leaves Safari, so those get a real gesture too.
 */
(() => {
  "use strict";

  if (globalThis.__autoPipLoaded) return;
  globalThis.__autoPipLoaded = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const IS_TOP = window === window.top;
  const BLUR_DELAY_MS = 150; // ignore brief blurs (dialogs, focus moving into an iframe)
  const STRAY_PIP_CHECK_MS = 1200; // shortcut didn't actually leave the page: undo
  const MIN_WIDTH = 160;
  const MIN_HEIGHT = 90;
  const MIN_DURATION_S = 5;

  // Keep in sync with settings.js.
  const DEFAULTS = {
    enabled: true,
    onTabSwitch: true,
    onWindowBlur: true,
    restoreOnReturn: true,
    shortcutAssist: true,
    helperSignal: true,
    helperReturn: true,
    unblockDisabled: true,
    includeMuted: false,
    debug: false,
    disabledSites: [],
  };
  let settings = { ...DEFAULTS };

  const state = {
    /** Video we moved into PiP automatically; only this one is restored on return. */
    autoEntered: null,
    entering: false,
    /** User came back while a PiP request was still pending. */
    restoreRequested: false,
    lastPlayed: null,
    lastError: null,
    blurTimer: 0,
  };
  /** Videos the user played or unmuted themselves. */
  const engaged = new WeakSet();
  const prepared = new WeakSet();

  const log = (...args) => {
    if (settings.debug) console.debug("[auto-pip]", ...args);
  };

  // Settings are keyed by the top-level site, also inside cross-origin iframes (embedded players).
  const siteHost = (() => {
    try {
      const anc = location.ancestorOrigins;
      if (anc && anc.length) return new URL(anc[anc.length - 1]).hostname;
    } catch {
      /* fall through */
    }
    return location.hostname;
  })();

  const activeHere = () => settings.enabled && !settings.disabledSites.includes(siteHost);

  // ---------------------------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------------------------

  try {
    Promise.resolve(api.storage.local.get(DEFAULTS))
      .then((stored) => {
        settings = { ...DEFAULTS, ...stored };
      })
      .catch(() => {});
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in DEFAULTS) settings[key] = newValue ?? DEFAULTS[key];
      }
    });
  } catch {
    /* storage unavailable (e.g. extension reloaded); defaults stay in effect */
  }

  // ---------------------------------------------------------------------------------------------
  // Finding the video
  // ---------------------------------------------------------------------------------------------

  /** All <video> elements, including those inside open shadow roots. */
  function collectVideos(root = document, out = []) {
    for (const v of root.querySelectorAll("video")) out.push(v);
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) collectVideos(el.shadowRoot, out);
    }
    return out;
  }

  const isPlaying = (v) => !v.paused && !v.ended && v.readyState >= 2;
  const isAudible = (v) => !v.muted && v.volume > 0;

  function isCandidate(v) {
    if (!v.isConnected || !isPlaying(v)) return false;
    const r = v.getBoundingClientRect();
    if (r.width < MIN_WIDTH || r.height < MIN_HEIGHT) return false;
    // Live streams report Infinity; short clips are usually UI decoration.
    if (Number.isFinite(v.duration) && v.duration < MIN_DURATION_S) return false;
    // Muted looping background/hero videos.
    if (v.muted && v.loop && !engaged.has(v)) return false;
    if (!settings.includeMuted && !isAudible(v) && !engaged.has(v)) return false;
    return true;
  }

  function score(v) {
    const r = v.getBoundingClientRect();
    let s = r.width * r.height;
    if (isAudible(v)) s *= 2;
    if (engaged.has(v)) s *= 2;
    if (v === state.lastPlayed) s += 1e7;
    return s;
  }

  const pickBest = (videos) => videos.sort((a, b) => score(b) - score(a))[0] ?? null;

  /** Best playing video for automatic PiP, or null. */
  const pickCandidate = () => pickBest(collectVideos().filter(isCandidate));

  /** For the manual toggle: prefer a candidate, else the largest loaded video. */
  const pickAny = () =>
    pickCandidate() ??
    pickBest(collectVideos().filter((v) => v.isConnected && v.readyState >= 1 && v.videoWidth > 0));

  function prepare(v) {
    if (prepared.has(v)) return;
    prepared.add(v);
    if (settings.unblockDisabled) unblock(v);
    try {
      // WebKit/Chromium know this attribute; where the browser honours it, it enters PiP itself.
      v.autoPictureInPicture = true;
      v.setAttribute("autopictureinpicture", "");
    } catch {
      /* not supported */
    }
    v.addEventListener("webkitpresentationmodechanged", () => onPipChange(v));
    v.addEventListener("enterpictureinpicture", () => onPipChange(v));
    v.addEventListener("leavepictureinpicture", () => onPipChange(v));
  }

  function unblock(v) {
    if (v.disablePictureInPicture || v.hasAttribute("disablepictureinpicture")) {
      v.disablePictureInPicture = false;
      v.removeAttribute("disablepictureinpicture");
      log("removed disablepictureinpicture", v);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // PiP enter / exit
  // ---------------------------------------------------------------------------------------------

  function inPip(v) {
    if (!v) return false;
    if (v.webkitPresentationMode === "picture-in-picture") return true;
    const root = v.getRootNode();
    return document.pictureInPictureElement === v || root.pictureInPictureElement === v;
  }

  const anyPip = () =>
    Boolean(document.pictureInPictureElement) ||
    collectVideos().some((v) => v.webkitPresentationMode === "picture-in-picture");

  function webkitEnter(video) {
    if (
      typeof video.webkitSetPresentationMode !== "function" ||
      !video.webkitSupportsPresentationMode?.("picture-in-picture")
    ) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      let timer = 0;
      const finish = (ok) => {
        clearTimeout(timer);
        video.removeEventListener("webkitpresentationmodechanged", onChange);
        resolve(ok);
      };
      const onChange = () => {
        if (video.webkitPresentationMode === "picture-in-picture") finish(true);
      };
      video.addEventListener("webkitpresentationmodechanged", onChange);
      timer = setTimeout(() => finish(video.webkitPresentationMode === "picture-in-picture"), 800);
      try {
        video.webkitSetPresentationMode("picture-in-picture");
      } catch (err) {
        state.lastError = String(err);
        finish(false);
      }
    });
  }

  /**
   * Must be called synchronously from the triggering event: the first PiP request happens before
   * any await so a user gesture, if there is one, still counts.
   */
  function enterPip(video, mode) {
    if (!video) return Promise.resolve(false);
    if (inPip(video)) return Promise.resolve(true);
    if (state.entering) return Promise.resolve(false);
    prepare(video);
    if (settings.unblockDisabled) unblock(video);
    state.entering = true;
    state.restoreRequested = false;

    let attempt;
    try {
      if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function") {
        attempt = video.requestPictureInPicture().then(() => true);
      } else {
        attempt = Promise.resolve(false);
      }
    } catch (err) {
      attempt = Promise.reject(err);
    }

    return attempt
      .catch((err) => {
        state.lastError = `${err?.name ?? "Error"}: ${err?.message ?? err}`;
        log("requestPictureInPicture failed", state.lastError);
        return false;
      })
      .then((ok) => (ok ? true : webkitEnter(video)))
      .then((ok) => {
        state.entering = false;
        if (ok) {
          state.lastError = null;
          if (mode === "auto") state.autoEntered = video;
          log("entered PiP", mode, video);
          if (state.restoreRequested) onReturn("pending-restore");
        } else {
          log("could not enter PiP", mode);
        }
        return ok;
      });
  }

  function exitPip(video) {
    if (!inPip(video)) return Promise.resolve();
    const resume = !video.paused; // keep whatever play state the PiP window had
    let done;
    try {
      if (video.webkitPresentationMode === "picture-in-picture") {
        video.webkitSetPresentationMode("inline");
        done = Promise.resolve();
      } else {
        done = document.exitPictureInPicture();
      }
    } catch (err) {
      done = Promise.reject(err);
    }
    return done
      .catch((err) => log("exit failed", err))
      .then(() => {
        // Some players pause when PiP closes; carry on where the user left off.
        if (resume && video.paused) video.play().catch(() => {});
      });
  }

  function onPipChange(video) {
    // Tell the background which tab holds the PiP video, so a double-click on the PiP window
    // (helper return signal) can bring that tab back.
    send({ type: "pip-state", inPip: inPip(video) });
    if (inPip(video)) {
      // The browser entered PiP on its own (autopictureinpicture / media session) while we were
      // away: treat it as ours so it's restored on return.
      if (!state.autoEntered && (document.hidden || !document.hasFocus())) {
        state.autoEntered = video;
        log("browser auto-entered PiP", video);
      }
    } else if (state.autoEntered === video) {
      // Closed from the PiP window (or by us): nothing left to restore.
      state.autoEntered = null;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Leaving and returning
  // ---------------------------------------------------------------------------------------------

  function autoEnter(reason) {
    if (!activeHere() || state.autoEntered || state.entering) return;
    if (anyPip()) return; // something (maybe the user) already has a PiP window
    const video = pickCandidate();
    if (!video) return;
    log("leaving page:", reason);
    enterPip(video, "auto");
  }

  function onReturn(reason) {
    clearTimeout(state.blurTimer);
    if (state.entering) {
      state.restoreRequested = true;
      return;
    }
    const video = state.autoEntered;
    if (!video || !settings.restoreOnReturn) return;
    state.autoEntered = null;
    log("returned to page:", reason);
    exitPip(video);
  }

  /** Safari tab/window/app shortcuts that leave the current page (macOS). */
  function isLeaveShortcut(e) {
    const { metaKey: cmd, ctrlKey: ctrl, altKey: alt, shiftKey: shift, code } = e;
    if (ctrl && code === "Tab") return true; // next/previous tab
    if (cmd && shift && (code === "BracketLeft" || code === "BracketRight")) return true;
    if (cmd && alt && (code === "ArrowLeft" || code === "ArrowRight")) return true;
    if (cmd && !alt && !ctrl && !shift && /^Digit[1-9]$/.test(code)) return true; // Cmd+1…9
    if (cmd && !alt && !ctrl && ["KeyT", "KeyN", "KeyH", "KeyM", "Backquote"].includes(code)) {
      return true; // new tab, new window, hide app, minimise, cycle windows
    }
    return false;
  }

  /**
   * Key press sent by the native Auto PiP Helper app just before you leave Safari in a way the
   * page can't see (Cmd+Tab, clicking another app or Safari tab). Keep in sync with
   * helper/Sources/AutoPiPHelper/LeaveDetector.swift.
   */
  const isHelperSignal = (e) =>
    e.code === "F18" && e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey;

  /**
   * Key press the helper sends after you double-click the PiP window: it brings Safari to the
   * front first, so this arrives in whichever tab is showing. The background then switches to the
   * tab that has the PiP video. Keep in sync with `ReturnSignal` in LeaveDetector.swift.
   */
  const isReturnSignal = (e) =>
    e.code === "F19" && e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey;

  /** Cmd is held (e.g. the Cmd+Tab switcher is open): don't decide "stayed" yet. */
  let metaDown = false;

  function scheduleStrayCheck(tries = 0) {
    setTimeout(() => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return; // we left
      if (metaDown && tries < 20) return scheduleStrayCheck(tries + 1);
      // e.g. Cmd+3 with only two tabs, or Cmd+Tab cancelled: still here, so close PiP again.
      onReturn("stayed");
    }, STRAY_PIP_CHECK_MS);
  }

  function onKeyDown(e) {
    if (e.key === "Meta") metaDown = true;
    if (e.isTrusted && isReturnSignal(e)) {
      // Not meant for the site. Works on any page (also sites where Auto PiP is switched off),
      // because the PiP video is usually in another tab.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (settings.enabled && settings.helperReturn) send({ type: "return-to-pip" });
      return;
    }
    if (!e.isTrusted || !activeHere()) return;
    let source;
    if (isHelperSignal(e)) {
      // Not meant for the site.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!settings.helperSignal) return;
      source = "helper";
    } else if (settings.shortcutAssist && isLeaveShortcut(e)) {
      source = `shortcut ${e.code}`;
    } else {
      return;
    }
    if (state.autoEntered || state.entering || anyPip()) return;
    const video = pickCandidate();
    if (!video) return;
    log("leaving page:", source);
    enterPip(video, "auto"); // synchronous: this keydown is the user gesture Safari wants
    scheduleStrayCheck();
  }

  function onKeyUp(e) {
    if (e.key === "Meta") metaDown = false;
    if (e.isTrusted && (isHelperSignal(e) || isReturnSignal(e))) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (settings.onTabSwitch) autoEnter("tab hidden");
    } else {
      onReturn("tab visible");
    }
  });

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", () => {
    metaDown = false;
  });

  if (IS_TOP) {
    // Window/app focus is only meaningful in the top frame: an iframe "blurs" whenever the user
    // clicks the surrounding page. The background script relays these to every frame in the tab.
    window.addEventListener("blur", () => {
      if (!settings.onWindowBlur) return;
      clearTimeout(state.blurTimer);
      state.blurTimer = setTimeout(() => {
        if (document.hasFocus() || document.visibilityState === "hidden") return;
        autoEnter("window blur");
        send({ type: "focus-lost" });
      }, BLUR_DELAY_MS);
    });
    window.addEventListener("focus", () => {
      clearTimeout(state.blurTimer);
      onReturn("window focus");
      send({ type: "focus-gained" });
    });
  }

  // Remember what the user plays and whether they did it themselves.
  const markEngaged = (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    prepare(v);
    if (e.type === "play") state.lastPlayed = v;
    if (navigator.userActivation?.isActive) engaged.add(v);
  };
  document.addEventListener("play", markEngaged, true);
  document.addEventListener("volumechange", markEngaged, true);

  // Browser-native automatic PiP (Media Session), where the browser supports it.
  try {
    navigator.mediaSession?.setActionHandler?.("enterpictureinpicture", () => {
      if (!activeHere()) return;
      const video = pickCandidate();
      if (video) enterPip(video, "auto");
    });
  } catch {
    /* action not supported */
  }

  // ---------------------------------------------------------------------------------------------
  // Messaging (background relays, popup, keyboard command)
  // ---------------------------------------------------------------------------------------------

  function send(msg) {
    try {
      Promise.resolve(api.runtime.sendMessage(msg)).catch(() => {});
    } catch {
      /* extension context gone */
    }
  }

  function toggle() {
    const current = collectVideos().find(inPip);
    if (current) {
      if (state.autoEntered === current) state.autoEntered = null;
      exitPip(current);
      return;
    }
    const video = pickAny();
    if (video) enterPip(video, "manual");
  }

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case "auto-enter":
        autoEnter("background");
        return false;
      case "restore":
        onReturn("background");
        return false;
      case "exit-pip": {
        // Double-click on the PiP window: back to the page, whoever opened PiP.
        const video = collectVideos().find(inPip);
        if (!video) return false;
        if (state.autoEntered === video) state.autoEntered = null;
        log("returning from PiP window");
        exitPip(video);
        return false;
      }
      case "toggle":
        toggle();
        return false;
      case "status": {
        // Frames without a video stay silent so the frame that has one answers.
        const video = collectVideos().find(inPip) ?? pickAny();
        if (!video) return false;
        sendResponse({
          frame: IS_TOP ? "top" : location.hostname,
          playing: isPlaying(video),
          eligible: isCandidate(video),
          inPip: inPip(video),
          size: `${video.videoWidth}×${video.videoHeight}`,
          lastError: state.lastError,
        });
        return false;
      }
      default:
        return false;
    }
  });
})();
