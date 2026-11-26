import AppKit

// Menu-bar only app (LSUIElement in Info.plist; .accessory here for `swift run`).
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
