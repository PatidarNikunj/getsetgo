// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AutoPiPHelper",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "AutoPiPHelper",
            path: "Sources/AutoPiPHelper"
        ),
    ]
)
