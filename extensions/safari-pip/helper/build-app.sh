#!/usr/bin/env bash
# Builds "Auto PiP Helper.app" (universal) into ./build. Needs Xcode on macOS 13+.
#   ./build-app.sh                         # ad-hoc signed (re-grant Accessibility after each rebuild)
#   SIGN_IDENTITY="Apple Development: …" ./build-app.sh   # keeps the permission across rebuilds
set -euo pipefail
cd "$(dirname "$0")"

APP="build/Auto PiP Helper.app"
ARCHS=(--arch arm64 --arch x86_64)

swift build -c release "${ARCHS[@]}"
BIN_DIR="$(swift build -c release "${ARCHS[@]}" --show-bin-path)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/AutoPiPHelper" "$APP/Contents/MacOS/AutoPiPHelper"
cp Resources/Info.plist "$APP/Contents/Info.plist"

codesign --force --options runtime --timestamp=none --sign "${SIGN_IDENTITY:--}" "$APP"
echo "Built $APP"
echo "Install: mv \"$APP\" /Applications/ && open \"/Applications/Auto PiP Helper.app\""
