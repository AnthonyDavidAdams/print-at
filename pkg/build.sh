#!/bin/bash
# Builds docs/assets/PrintAt.pkg (served at https://printat.co/download/PrintAt.pkg).
# Unsigned: without an Apple Developer ID, macOS shows "could not verify" and the person
# must allow it under System Settings › Privacy & Security › Open Anyway.
set -euo pipefail
cd "$(dirname "$0")"
VERSION="$(date +%Y.%m.%d)"
rm -rf build && mkdir -p build/res
cp resources-welcome.txt build/res/welcome.txt; cp resources-conclusion.txt build/res/conclusion.txt
sed "s/VERSION/$VERSION/" distribution.xml > build/distribution.xml
pkgbuild --nopayload --scripts scripts --identifier co.printat.driver --version "$VERSION" build/PrintAt-component.pkg >/dev/null
productbuild --distribution build/distribution.xml --resources build/res --package-path build ../docs/assets/PrintAt.pkg >/dev/null
rm -rf build
ls -la ../docs/assets/PrintAt.pkg
