import AppKit
import ApplicationServices
import Carbon.HIToolbox
import os

/// The key press the Safari extension listens for. Keep in sync with `isHelperSignal` in
/// extension/content.js.
enum Signal {
    static let keyCode = CGKeyCode(kVK_F18)
    static let flags: CGEventFlags = [.maskControl, .maskAlternate]
    /// Stamped on our own events so the tap ignores them.
    static let marker: Int64 = 0x5049_5048 // "PIPH"
}

/// Watches input while Safari is frontmost. Just before an action that leaves Safari (and that the
/// web page can't see), it sends Safari the signal key. That key press is a real user gesture in
/// the page, which is what Safari requires before it allows Picture in Picture.
///
/// The event tap only observes and inserts the signal ahead of the original event; it never
/// swallows or changes your input.
final class LeaveDetector {
    static let safariBundleIDs: Set<String> = [
        "com.apple.Safari",
        "com.apple.SafariTechnologyPreview",
    ]

    /// Minimum time between two signals (Cmd+Tab repeats Tab while the switcher is open).
    private static let debounce: CFTimeInterval = 1.0

    private let log = Logger(subsystem: "local.autopip.helper", category: "detector")
    private let eventSource = CGEventSource(stateID: .privateState)
    private let ownPID = ProcessInfo.processInfo.processIdentifier
    private var tap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var lastSignal: CFAbsoluteTime = 0
    private var activationObserver: NSObjectProtocol?

    /// PID of Safari while it is the frontmost app, otherwise nil.
    private(set) var frontSafariPID: pid_t?

    var isRunning: Bool {
        guard let tap else { return false }
        return CGEvent.tapIsEnabled(tap: tap)
    }

    init() {
        let workspace = NSWorkspace.shared
        updateFrontmost(workspace.frontmostApplication)
        activationObserver = workspace.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            self?.updateFrontmost(app)
        }
    }

    deinit {
        stop()
        if let activationObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(activationObserver)
        }
    }

    private func updateFrontmost(_ app: NSRunningApplication?) {
        if let app, let id = app.bundleIdentifier, Self.safariBundleIDs.contains(id) {
            frontSafariPID = app.processIdentifier
        } else {
            frontSafariPID = nil
        }
    }

    // MARK: Event tap

    /// Installs the event tap. Needs Accessibility permission; returns false without it.
    @discardableResult
    func start() -> Bool {
        if tap != nil { return true }

        let mask = (CGEventMask(1) << CGEventMask(CGEventType.keyDown.rawValue))
            | (CGEventMask(1) << CGEventMask(CGEventType.leftMouseDown.rawValue))

        let callback: CGEventTapCallBack = { proxy, type, event, refcon in
            guard let refcon else { return Unmanaged.passUnretained(event) }
            let detector = Unmanaged<LeaveDetector>.fromOpaque(refcon).takeUnretainedValue()
            detector.handle(proxy: proxy, type: type, event: event)
            return Unmanaged.passUnretained(event)
        }

        // HID level so we see Cmd+Tab before the system app switcher handles it.
        guard let newTap = CGEvent.tapCreate(
            tap: .cghidEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: mask,
            callback: callback,
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            log.error("Could not create event tap (Accessibility permission missing?)")
            return false
        }

        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, newTap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: newTap, enable: true)
        tap = newTap
        runLoopSource = source
        log.info("Event tap installed")
        return true
    }

    func stop() {
        guard let tap else { return }
        CGEvent.tapEnable(tap: tap, enable: false)
        if let runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, .commonModes)
        }
        CFMachPortInvalidate(tap)
        self.tap = nil
        runLoopSource = nil
    }

    private func handle(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent) {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            // The system turns slow taps off; turn it back on.
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return
        }
        guard Settings[.enabled], let safariPID = frontSafariPID else { return }
        if event.getIntegerValueField(.eventSourceUserData) == Signal.marker { return }

        let reason: String?
        switch type {
        case .keyDown:
            reason = Settings[.appSwitchKeys] ? leaveKeyReason(event) : nil
        case .leftMouseDown:
            reason = leaveClickReason(at: event.location, safariPID: safariPID)
        default:
            reason = nil
        }
        if let reason { sendSignal(proxy: proxy, reason: reason) }
    }

    // MARK: Keys

    /// System shortcuts that leave Safari and never reach web pages. (Safari's own tab and window
    /// shortcuts do reach the page, and the extension handles those itself.)
    private func leaveKeyReason(_ event: CGEvent) -> String? {
        if event.getIntegerValueField(.keyboardEventAutorepeat) != 0 { return nil }
        let code = Int(event.getIntegerValueField(.keyboardEventKeycode))
        let flags = event.flags
        let cmd = flags.contains(.maskCommand)
        let ctrl = flags.contains(.maskControl)
        let opt = flags.contains(.maskAlternate)

        switch code {
        case kVK_Tab where cmd && !ctrl:
            return "Cmd+Tab"
        case kVK_Space where cmd && !ctrl && !opt:
            return "Spotlight"
        case kVK_UpArrow where ctrl && !cmd && !opt:
            return "Mission Control"
        case kVK_DownArrow where ctrl && !cmd && !opt:
            return "App Exposé"
        case kVK_LeftArrow where ctrl && !cmd && !opt, kVK_RightArrow where ctrl && !cmd && !opt:
            return "switch Space"
        default:
            return nil
        }
    }

    // MARK: Clicks

    private func leaveClickReason(at point: CGPoint, safariPID: pid_t) -> String? {
        guard let window = topWindow(at: point) else {
            // Nothing but the desktop under the pointer: the click activates Finder.
            return Settings[.clicksOutside] ? "desktop click" : nil
        }
        if window.pid == safariPID {
            guard Settings[.safariTabClicks], isSafariTab(at: point, pid: safariPID) else { return nil }
            return "Safari tab click"
        }
        if window.pid == ownPID { return nil } // our menu-bar menu
        // Menu bar and status items, and pop-up menus: clicking these doesn't leave Safari.
        if window.layer == Int(CGWindowLevelForKey(.mainMenuWindow))
            || window.layer == Int(CGWindowLevelForKey(.statusWindow))
            || window.layer >= Int(CGWindowLevelForKey(.popUpMenuWindow))
        {
            return nil
        }
        return Settings[.clicksOutside] ? "click on \(window.owner)" : nil
    }

    private struct WindowHit {
        let pid: pid_t
        let layer: Int
        let owner: String
    }

    /// Frontmost on-screen window under the point. Window bounds and event locations both use
    /// global coordinates with the origin at the top left of the main display. Needs no Screen
    /// Recording permission (only window titles are withheld without it).
    private func topWindow(at point: CGPoint) -> WindowHit? {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            return nil
        }
        for info in list {
            guard
                let boundsDict = info[kCGWindowBounds as String] as? NSDictionary,
                let bounds = CGRect(dictionaryRepresentation: boundsDict as CFDictionary),
                bounds.contains(point),
                let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value
            else { continue }
            if let alpha = (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue, alpha <= 0 {
                continue
            }
            let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
            let owner = info[kCGWindowOwnerName as String] as? String ?? "pid \(pid)"
            return WindowHit(pid: pid, layer: layer, owner: owner)
        }
        return nil
    }

    /// Whether the point is on a tab in Safari's tab bar, using the Accessibility tree.
    private func isSafariTab(at point: CGPoint, pid: pid_t) -> Bool {
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(app, 0.1) // never stall your click for long
        var hit: AXUIElement?
        guard
            AXUIElementCopyElementAtPosition(app, Float(point.x), Float(point.y), &hit) == .success,
            var element = hit
        else { return false }

        for _ in 0 ..< 6 {
            let role = stringAttribute(element, kAXRoleAttribute)
            let subrole = stringAttribute(element, kAXSubroleAttribute)
            if role == kAXTabGroupRole || subrole == "AXTabButton" { return true }
            if role == kAXWebAreaRole || role == kAXWindowRole { return false } // page or window
            guard let parent = parentElement(element) else { return false }
            element = parent
        }
        return false
    }

    private func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else {
            return nil
        }
        return value as? String
    }

    private func parentElement(_ element: AXUIElement) -> AXUIElement? {
        var value: CFTypeRef?
        guard
            AXUIElementCopyAttributeValue(element, kAXParentAttribute as CFString, &value) == .success,
            let value,
            CFGetTypeID(value) == AXUIElementGetTypeID()
        else { return nil }
        return (value as! AXUIElement) // type ID checked above
    }

    // MARK: Signal

    /// Posts Ctrl+Option+F18 down/up ahead of the event that is about to leave Safari, so Safari
    /// (still frontmost) delivers it to the page first.
    private func sendSignal(proxy: CGEventTapProxy, reason: String) {
        let now = CFAbsoluteTimeGetCurrent()
        guard now - lastSignal > Self.debounce else { return }
        lastSignal = now
        if Settings[.debugLog] { log.info("Signal Safari: \(reason, privacy: .public)") }

        for keyDown in [true, false] {
            guard let signal = CGEvent(
                keyboardEventSource: eventSource,
                virtualKey: Signal.keyCode,
                keyDown: keyDown
            ) else { continue }
            signal.flags = Signal.flags
            signal.setIntegerValueField(.eventSourceUserData, value: Signal.marker)
            signal.tapPostEvent(proxy)
        }
    }
}
