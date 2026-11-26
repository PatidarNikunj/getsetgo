import Foundation

/// User preferences, stored in UserDefaults.
enum Pref: String, CaseIterable {
    /// Master switch.
    case enabled
    /// Cmd+Tab / Cmd+Shift+Tab, Cmd+Space (Spotlight), Ctrl+arrows (Mission Control, Spaces).
    case appSwitchKeys
    /// Clicks on another app's window, the Dock or the desktop.
    case clicksOutside
    /// Clicks on another tab in Safari's tab bar.
    case safariTabClicks
    /// Double-click on the PiP window: bring Safari back with the video's tab.
    case doubleClickReturn
    /// Write decisions to the system log (Console.app, process "AutoPiPHelper").
    case debugLog

    var defaultValue: Bool {
        self == .debugLog ? false : true
    }
}

enum Settings {
    private static let store = UserDefaults.standard

    static func registerDefaults() {
        var defaults: [String: Any] = [:]
        for pref in Pref.allCases { defaults[pref.rawValue] = pref.defaultValue }
        store.register(defaults: defaults)
    }

    static subscript(_ pref: Pref) -> Bool {
        get { store.bool(forKey: pref.rawValue) }
        set { store.set(newValue, forKey: pref.rawValue) }
    }
}
