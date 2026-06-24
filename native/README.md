# ColorFlats Native Module (C++)

This is the C++ native addon for the ColorFlats UXP plugin. It handles performance-critical pixel processing operations that are too slow in JavaScript:

- **Outline mask building** — O(n) pixel scan with luminance threshold
- **Flood fill / region detection** — scanline flood fill algorithm
- **Flat color buffer generation** — writes RGBA pixels for all detected regions
- **Trapping** — expands regions under outline pixels

## Architecture

```
┌──────────────────────────────────────┐
│           UXP Plugin (JS)            │
│  ┌────────────────────────────────┐   │
│  │    src/lib/flats.ts           │   │  ← UI orchestration, Photoshop API calls
│  │    src/lib/native-bridge.ts   │   │  ← Bridge: calls native module, falls back to JS
│  └────────────┬───────────────────┘   │
│               │ require("colorflats-native")  (UXP addon bridge)
│               ▼                       │
│  ┌────────────────────────────────┐   │
│  │    colorflats-native.(dylib|dll)│  │  ← Shared library loaded by UXP runtime
│  │    module.cpp → registerNative() │  │  ← Exposes functions to JS via UXP addon API
│  │    flats_core.cpp               │  │  ← C++ implementation of algorithms
│  └────────────────────────────────┘   │
│                                       │
│  If native module unavailable:        │
│  native-bridge.ts falls back to the   │
│  pure-JS implementation in flats.ts   │
└───────────────────────────────────────┘
```

## Building

### Prerequisites
- CMake 3.16+
- C++17 compatible compiler
- UXP Hybrid Plugin SDK (download from [Adobe Developer Console](https://developer.adobe.com/console/servicesandapis/ps))
- Photoshop C++ SDK (for PIUXPSuite messaging, optional)

### macOS
```bash
cd native
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make
```

### Windows
```bash
cd native
mkdir build && cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

### Cross-compile for macOS Universal (arm64 + x86_64)
```bash
cd native
mkdir build && cd build
cmake .. -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64" -DCMAKE_BUILD_TYPE=Release
make
```

## Output

The build produces shared libraries:
- `mac-arm64/colorflats-native.dylib` — macOS Apple Silicon
- `mac-x64/colorflats-native.dylib` — macOS Intel
- `win-x64/colorflats-native.dll` — Windows Intel

These must be placed in the plugin's `native/` directory (relative to manifest.json) for the UXP runtime to load them.

## Deployment

For distribution, all three platform binaries must be included. macOS binaries must be signed and notarized with an Apple Developer ID certificate.

See the main README.md for packaging instructions.