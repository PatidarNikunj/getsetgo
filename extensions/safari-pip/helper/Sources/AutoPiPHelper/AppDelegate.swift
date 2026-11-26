import AppKit
import ApplicationServices
import ServiceManagement

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let detector = LeaveDetector()
    private var statusItem: NSStatusItem?
    private var permissionTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        Settings.registerDefaults()

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(
            systemSymbolName: "pip",
            accessibilityDescription: "Auto PiP Helper"
        )
        let menu = NSMenu()
        menu.delegate = self
        item.menu = menu
        statusItem = item

        startWhenTrusted(prompt: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        detector.stop()
    }

    // MARK: Accessibility permission

    private func startWhenTrusted(prompt: Bool) {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary
        if AXIsProcessTrustedWithOptions(options) {
            startDetector()
            return
        }
        // Wait for the user to switch us on in System Settings.
        permissionTimer?.invalidate()
        permissionTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] timer in
            guard AXIsProcessTrusted() else { return }
            timer.invalidate()
            self?.startDetector()
        }
        updateIcon()
    }

    private func startDetector() {
        permissionTimer?.invalidate()
        permissionTimer = nil
        detector.start()
        updateIcon()
    }

    private func updateIcon() {
        let active = detector.isRunning && Settings[.enabled]
        statusItem?.button?.appearsDisabled = !active
    }

    private func openAccessibilitySettings() {
        let url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        if let url = URL(string: url) { NSWorkspace.shared.open(url) }
    }

    // MARK: Menu

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        let status: String
        if !AXIsProcessTrusted() {
            status = "Needs Accessibility permission"
        } else if !detector.isRunning {
            status = "Not running"
        } else {
            status = Settings[.enabled] ? "Watching Safari" : "Paused"
        }
        menu.addItem(disabledItem("Auto PiP Helper: \(status)"))
        menu.addItem(.separator())

        menu.addItem(toggle("Enabled", .enabled))
        menu.addItem(.separator())
        menu.addItem(disabledItem("Signal Safari before…"))
        menu.addItem(toggle("App switching (⌘Tab, Spotlight, Mission Control, Spaces)", .appSwitchKeys))
        menu.addItem(toggle("Clicks on other apps, the Dock or the desktop", .clicksOutside))
        menu.addItem(toggle("Clicks on another Safari tab", .safariTabClicks))
        menu.addItem(.separator())
        menu.addItem(toggle("Double-click the PiP window to go back to the video", .doubleClickReturn))
        menu.addItem(.separator())

        if !AXIsProcessTrusted() {
            menu.addItem(action("Open Accessibility Settings…", #selector(grantPermission)))
        }
        let login = action("Launch at Login", #selector(toggleLaunchAtLogin))
        login.state = SMAppService.mainApp.status == .enabled ? .on : .off
        menu.addItem(login)
        menu.addItem(toggle("Debug Logging (Console.app)", .debugLog))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
    }

    private func disabledItem(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    private func action(_ title: String, _ selector: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
        item.target = self
        return item
    }

    private func toggle(_ title: String, _ pref: Pref) -> NSMenuItem {
        let item = action(title, #selector(togglePref(_:)))
        item.representedObject = pref.rawValue
        item.state = Settings[pref] ? .on : .off
        return item
    }

    @objc private func togglePref(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let pref = Pref(rawValue: raw) else { return }
        Settings[pref].toggle()
        updateIcon()
    }

    @objc private func grantPermission() {
        startWhenTrusted(prompt: true)
        openAccessibilitySettings()
    }

    @objc private func toggleLaunchAtLogin() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            let alert = NSAlert(error: error)
            alert.messageText = "Couldn't change Launch at Login"
            alert.runModal()
        }
    }
}
