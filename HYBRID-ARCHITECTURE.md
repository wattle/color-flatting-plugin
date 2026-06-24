# ColorFlats Hybrid Architecture

## Overview

ColorFlats uses a **UXP Hybrid Plugin architecture** that combines a UXP JavaScript plugin with a C++ native addon for performance-critical pixel processing. The plugin gracefully falls back to the pure-JS implementation when the native addon is not available.

The hybrid approach follows the [Bolt UXP](https://github.com/hyperbrew/bolt-uxp) pattern for UXP Hybrid Plugins, using the official UXP Hybrid Plugin SDK (`UxpAddonShared.h`, `UxpAddonTypes.h`) and utility classes (`UxpAddon`, `UxpTask`, `UxpValue`) for thread-safe async execution.

## Why Hybrid?

The flatting algorithm involves:
1. **Outline mask building** — O(n) pixel scan, ~5-10x faster in C++
2. **Flood fill / region detection** — Most expensive step, ~20-50x faster in C++
3. **Flat color buffer generation** — Direct memory writes, ~3-5x faster in C++
4. **Trapping** — Bitmap expansion, ~10-20x faster in C++

For a 4000×4000 image (16M pixels), the JS implementation takes 3-8 seconds while the C++ implementation is estimated at 0.2-0.8 seconds.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    UXP Plugin (JS)                         │
│                                                            │
│  ┌──────────────────┐   ┌──────────────────────────────┐   │
│  │   main.tsx       │   │   native-bridge.ts           │   │
│  │   (UI layer)     │──▶│   (transparent dispatch)      │   │
│  │                  │   │                                │   │
│  │                  │   │   if native available:        │   │
│  │                  │   │     ──▶ C++ addon (async)    │   │
│  │                  │   │   else:                       │   │
│  │                  │   │     ──▶ flats.ts (pure JS)    │   │
│  └──────────────────┘   └──────────┬───────────────────┘   │
│                                     │                      │
│             require("colorflats-hybrid.uxpaddon")          │
│                                     │                      │
│  ┌──────────────────────────────────▼──────────────────┐   │
│  │        C++ Hybrid Addon (.uxpaddon)                │   │
│  │                                                      │   │
│  │   src/hybrid/src/module.cpp                         │   │
│  │     │ Register: buildOutlineMask (sync)             │   │
│  │     │ Register: runFlatsPipeline (async, Task-based) │   │
│  │     │                                               │   │
│  │   src/hybrid/src/flats/flats_core.cpp              │   │
│  │     │ C++ algorithm implementations                 │   │
│  │     │ (buildOutlineMask, floodFill, generate, trap) │   │
│  │     │                                               │   │
│  │   SDK utilities: UxpAddon, UxpTask, UxpValue       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                            │
│  Photoshop API calls (JS only):                            │
│    - imaging.getPixels() ──▶ read pixel data              │
│    - imaging.putPixels() ──▶ write pixel data             │
│    - batchPlay() ──▶ create layers, select layers          │
└────────────────────────────────────────────────────────────┘
```

## Data Flow

### Generate Flats (Hybrid Path — Async)

```
1. JS: executeAsModal() context
2. JS: imaging.getPixels() → pixelData (Uint8Array)
3. JS: nativeRunFlatsPipeline(pixelData.buffer, width, height, config)
   │
   │  UXP Hybrid Plugin threading model:
   │  Scripting Thread → parse args, copy to shared ptrs
   │  Main Thread → spawn worker thread
   │  Worker Thread → C++ pipeline (buildOutlineMask + floodFill + trap + generateFlatBuffer)
   │  Worker Thread → schedule result on Scripting Thread
   │  Scripting Thread → create JS return values, resolve Promise
   │
   └── Returns: { regionCount, flatBuffer: ArrayBuffer, layerName }
4. JS: imaging.createImageDataFromBuffer(flatBuffer)
5. JS: imaging.putPixels() → write to new layer
6. JS: cleanup, re-select outline layer
```

### Generate Flats (JS Fallback)

Same as before — pure JS implementation in `flats.ts`.

## File Structure

```
colorflats/
├── manifest.json              # UXP manifest (manifestVersion: 6, enableAddon: true)
├── uxp.config.ts              # UXP/Vite config (addon.name, enableAddon)
├── vite.config.ts             # Build config (external: colorflats-hybrid.uxpaddon)
├── package.json               # Build scripts (mac-build, win-build, etc.)
│
├── src/
│   ├── main.tsx               # UI — uses hybridGenerateColorFlats()
│   ├── lib/
│   │   ├── flats.ts           # Pure JS implementation (fallback)
│   │   └── native-bridge.ts   # Bridge: loads hybrid addon, falls back to JS
│   ├── api/                   # Photoshop API helpers
│   └── globals.ts             # UXP module imports
│
├── src/hybrid/                # C++ Hybrid Plugin source
│   ├── src/
│   │   ├── module.cpp         # UXP addon entry point + function registration
│   │   ├── api/
│   │   │   ├── UxpAddonShared.h   # UXP addon API definitions
│   │   │   └── UxpAddonTypes.h   # UXP addon type definitions
│   │   ├── utilities/
│   │   │   ├── UxpAddon.h/cpp     # Addon API singleton + macros
│   │   │   ├── UxpTask.h/cpp      # Async task scheduling (main/scripting thread)
│   │   │   └── UxpValue.h/cpp     # JS↔C++ value conversion
│   │   └── flats/
│   │       ├── flats_core.h       # Algorithm declarations
│   │       └── flats_core.cpp     # Algorithm implementations
│   ├── mac/
│   │   └── colorflats-hybrid.xcodeproj/  # Xcode project (arm64 + x64)
│   └── win/
│       ├── colorflats-hybrid.sln         # Visual Studio solution
│       └── colorflats-hybrid.vcxproj     # VS project (x64)
│
├── public-hybrid/             # Pre-built hybrid addon binaries
│   ├── mac/
│   │   ├── arm64/             # macOS Apple Silicon binary
│   │   └── x64/               # macOS Intel binary
│   └── win/
│       ├── x64/               # Windows x64 binary
│       └── arm64/              # Windows ARM64 binary (debug only)
│
├── public/                    # Plugin static assets (icons, debug.json)
└── dist/                      # Built plugin output
```

## Building the Hybrid Addon

### macOS (Xcode)

1. Open `src/hybrid/mac/colorflats-hybrid.xcodeproj` in Xcode
2. **Important**: Add `flats_core.cpp` and `flats_core.h` to the project:
   - Right-click the project → Add Files → select `../src/flats/flats_core.cpp` and `../src/flats/flats_core.h`
   - Add `flats_core.cpp` to both arm64 and x64 targets' Sources
   - Add `flats_core.h` to both targets' Headers
3. Update code signing:
   - Select the project → arm64 target → Signing & Capabilities
   - Set your Team ID and Signing Certificate
   - Repeat for x64 target
4. Build:
   ```bash
   yarn mac-build
   ```
5. Or build in Xcode: Product → Build All

### Windows (Visual Studio 2019+)

1. Open `src/hybrid/win/colorflats-hybrid.sln` in Visual Studio
2. Build → Build Solution (Release|x64)
3. The output is automatically copied to `public-hybrid/win/x64/`

### Command Line

```bash
# macOS (both architectures)
yarn mac-build

# macOS (debug builds for Xcode debugging)
yarn mac-build-debug

# Windows (requires msbuild in PATH)
yarn win-build
```

### Signing (macOS)

macOS requires hybrid plugins to be signed and notarized:

1. Create `.env` from `.env.example` with your Apple credentials
2. `yarn mac-sign` — Sign and notarize the binary
3. Or `yarn mac-build-sign` — Build + sign in one step

## UXP Hybrid Plugin SDK

The `src/hybrid/src/api/` and `src/hybrid/src/utilities/` directories contain the official UXP Hybrid Plugin SDK from Adobe, which provides:

- **UxpAddonShared.h** — Function pointer struct for all UXP addon APIs
- **UxpAddonTypes.h** — Type definitions (addon_env, addon_value, etc.)
- **UxpAddon.h/cpp** — Singleton interface for accessing addon APIs + macros
- **UxpTask.h/cpp** — Thread-safe task scheduling (main thread ↔ scripting thread)
- **UxpValue.h/cpp** — JS↔C++ value conversion (primitives, arrays, objects)

### Threading Model

The UXP Hybrid API has strict threading requirements:

- **Scripting Thread**: Where JS executes. Functions must start and complete here.
- **Main Thread**: Can spawn threads. Used as a bridge.
- **Worker Thread**: For heavy computation. No UXP values can be used here.
- Tasks can be scheduled: Scripting → Main → Worker → Scripting

The `runFlatsPipeline` function follows this pattern:
1. **Scripting Thread**: Parse arguments, create shared pointers, schedule on Main thread
2. **Main Thread**: Spawn and detach worker thread
3. **Worker Thread**: Run C++ pipeline, store results, schedule on Scripting thread
4. **Scripting Thread**: Create return values, resolve Promise

### Exposed Functions

| JS Function | C++ Function | Sync/Async | Description |
|-------------|---------------|------------|-------------|
| `buildOutlineMask(buf, n, threshold)` | `BuildOutlineMask` | Sync | Build outline mask from RGBA pixels |
| `runFlatsPipeline(buf, w, h, ...)` | `RunFlatsPipeline` | Async | Full flatting pipeline on worker thread |

## How the Bridge Works

### native-bridge.ts

The bridge module provides:

1. **`initNativeBridge()`** — Attempts to `require("colorflats-hybrid.uxpaddon")` at startup
2. **`isNativeAvailable()`** — Returns whether C++ addon loaded successfully
3. **`hybridGenerateColorFlats(config)`** — Transparent dispatch:
   - If native available: JS reads pixels → C++ processes (async) → JS writes pixels
   - If native unavailable: Falls back to pure-JS `generateColorFlats()`
4. **`hybridAnalyzeOutlines(config)`** — Same pattern for analyze mode

## Testing Without the Native Addon

The plugin works perfectly without the C++ addon — it just uses the pure-JS implementation. This means:

1. **Development**: You can develop and test the UI entirely in JS
2. **CI/CD**: Tests can run without building the native addon
3. **Fallback**: If the native addon fails to load, the plugin degrades gracefully

The UI shows the engine status:
- **"✓ C++ native"** — C++ addon loaded and active
- **"JS only"** — Pure JavaScript implementation active

## Troubleshooting

### Native addon doesn't load
- Ensure `public-hybrid/` directories contain the `.uxpaddon` files
- Check that `enableAddon: true` and `addon.name: "colorflats-hybrid.uxpaddon"` are in manifest.json
- On macOS, check System Preferences → Security & Privacy for blocked libraries
- Check the UXP Developer Tool console for error messages
- Ensure manifest.json version matches (`manifestVersion: 6` is required for hybrid addons)

### Build errors in Xcode
- Make sure `flats_core.cpp` and `flats_core.h` are added to both targets
- Update code signing identity to your Apple Developer ID
- The Xcode project references files at `../src/api/`, `../src/utilities/`, and `../src/flats/` — make sure paths are correct

### Build errors in Visual Studio
- The project requires Visual Studio 2019 or later with the C++ workload
- C++17 language standard is required (`/std:c++17`)
- Additional include directories are set to `../src/api`, `../src/utilities`, `../src/flats`

### Performance not improving
- Ensure the native addon is actually loaded (check UI status indicator)
- The first call may be slow due to library loading
- Large images still need time for Photoshop API calls (getPixels/putPixels) which are always in JS