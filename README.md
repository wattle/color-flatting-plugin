# ColorFlats - Photoshop UXP Plugin

A Photoshop plugin built with [Bolt UXP](https://github.com/hyperbrew/bolt-uxp) that automatically generates flat color layers from black outline artwork — similar to [Peltmade's Flatting plugin](https://peltmade.com/psplugins-flatting.html).

## What It Does

ColorFlats analyzes your black outline artwork and:

1. **Detects black outlines** — identifies pixels below a configurable luminance threshold
2. **Finds enclosed regions** — uses flood-fill to discover all distinct closed areas
3. **Fills with distinct colors** — assigns a unique flat color to each region
4. **Creates a "Color Flats" layer** — places the flat colors on a new layer below your outlines

This is essential for comic coloring workflows where you need a base flat layer to quickly select and paint individual areas.

## Features

- **Adjustable Outline Threshold** — Control what counts as "black" (default: 80/255 luminance)
- **Minimum Region Size** — Ignore tiny stray pixels (default: 100px)
- **Maximum Region Fraction** — Exclude background areas (default: 50% of image)
- **Color Modes** — Pastel, Saturated, Muted, or Rainbow flat colors
- **Trapping** — Optionally expand flats under outlines to prevent white gaps
- **Analyze Mode** — Preview region count before committing to generation
- **Hybrid C++ Engine** — Optional native addon for 15-20× faster processing (falls back to JS automatically)

## Installation

### Development (UDT)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the plugin:
   ```bash
   npm run build
   ```

3. Open the [Adobe UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/guides/devtool/)
4. Click "Add Plugin" and select the `dist/manifest.json` file
5. Click "Load" to enable the plugin

### Development with Hot Reload

```bash
npm run dev
```

Then load the plugin in UDT — changes will auto-reload.

### Production Build (CCX)

```bash
npm run ccx
```

This generates a `.ccx` file in the `dist/` folder that can be distributed and installed by double-clicking.

## Usage

1. Open a Photoshop document with black outline artwork
2. Select the layer containing your outlines
3. Open the ColorFlats panel (Window → Extensions → ColorFlats)
4. Adjust settings as needed
5. Click **Analyze** to preview how many regions will be found
6. Click **Generate Flats** to create the flat color layer

The panel shows which processing engine is active:
- **"✓ C++ native"** — The C++ addon is loaded; processing will be significantly faster
- **"JS only"** — The pure JavaScript engine is active; functional but slower on large images

## How It Works

### Algorithm

1. **Outline Detection**: Each pixel's luminance is calculated (0.299R + 0.587G + 0.114B). Pixels below the threshold are treated as outline boundaries. Transparent pixels are also treated as boundaries.

2. **Region Finding**: A scanline flood-fill algorithm scans left-to-right, top-to-bottom finding all connected regions of non-outline pixels. Each region must meet the minimum size threshold.

3. **Background Rejection**: Any region larger than the max fraction threshold is assumed to be background (the page/canvas area) and is skipped.

4. **Color Assignment**: Each region gets a unique color generated using golden angle hue distribution for maximum perceptual separation.

5. **Trapping** (optional): When enabled, each flat region is expanded slightly into the outline pixels to prevent white gaps between the outline and the flat color — a common issue in print production.

### Color Modes

- **Pastel**: Light, soft colors with good contrast against black lines
- **Saturated**: Vivid, strong colors for maximum distinction
- **Muted**: Subdued colors that are easy on the eyes
- **Rainbow**: Full spectrum sequential colors

## Hybrid Architecture (C++ Native Addon)

ColorFlats supports a **hybrid plugin architecture** that combines a UXP JavaScript plugin with an optional C++ native addon for performance-critical pixel processing. The plugin works fully in pure JavaScript and transparently upgrades to C++ when the native addon is available.

### Why C++?

The flatting algorithm is computationally intensive — for a 4000×4000 image, the pure-JS implementation takes 3–8 seconds. The C++ addon reduces this to an estimated 0.2–0.8 seconds (~15-20× speedup):

| Operation              | JS (estimated) | C++ (estimated) | Speedup |
|------------------------|----------------|-----------------|---------|
| Outline mask (4K×4K)   | ~300ms         | ~40ms           | 7.5×    |
| Flood fill (4K×4K)     | ~3–6s          | ~100–300ms      | 20–50×  |
| Color buffer (4K×4K)   | ~200ms         | ~50ms           | 4×      |
| Trapping (4K×4K)       | ~500ms         | ~30ms           | 17×     |

### How It Works

```
┌──────────────────────────────────────────────────┐
│                  UXP Plugin (JS)                 │
│                                                  │
│  main.tsx  ──▶  native-bridge.ts                │
│                     │                            │
│          native addon available?                 │
│               ╱           ╲                      │
│             Yes            No                    │
│              ╲              ╱                     │
│        C++ addon      flats.ts (JS fallback)    │
│                                                  │
│  Photoshop API (always JS):                      │
│    imaging.getPixels() ──▶ read pixel data       │
│    imaging.putPixels() ──▶ write pixel data      │
│    batchPlay() ──▶ create/select layers          │
└──────────────────────────────────────────────────┘
```

The bridge layer (`native-bridge.ts`) handles the dispatch transparently. Data is transferred between JS and C++ using `ArrayBuffer` for near-zero-copy performance.

### Building the Native Addon

#### Prerequisites

- **UXP Hybrid Plugin SDK** — Download from [Adobe Developer Console](https://developer.adobe.com/console/servicesandapis/ps)
- **CMake 3.16+** and a **C++17 compiler** (Clang on macOS, Visual Studio 2022 on Windows)
- **Photoshop C++ SDK** — Optional, for PIUXPSuite messaging integration

#### Build

```bash
# Set SDK path
export UXP_SDK_PATH=/path/to/uxp-hybrid-sdk

# Build for current platform
cd native
./build-native.sh --uxp-sdk $UXP_SDK_PATH

# Build with Photoshop C++ SDK (optional)
./build-native.sh --uxp-sdk $UXP_SDK_PATH --ps-csdk /path/to/photoshop-csdk
```

#### Output

| Platform          | Output                                      |
|-------------------|---------------------------------------------|
| macOS ARM64       | `native/mac-arm64/colorflats-native.dylib`  |
| macOS Intel       | `native/mac-x64/colorflats-native.dylib`   |
| Windows x64       | `native/win-x64/colorflats-native.dll`     |

> **Note:** All three platform binaries must be included in the distributed plugin. macOS binaries must be **signed and notarized** with an Apple Developer ID certificate (self-signed certs are not accepted).

#### Developing Without the Native Addon

The plugin works entirely in JavaScript without the C++ addon. This means:

- You can develop and test the UI without building native code
- CI/CD pipelines don't need C++ toolchains
- If the addon fails to load (wrong architecture, missing file), the plugin degrades gracefully

### File Structure

```
colorflats/
├── manifest.json              # UXP manifest (includes addonLibs)
├── uxp.config.ts              # UXP/Vite config
├── vite.config.ts             # Build config
├── src/
│   ├── main.tsx               # UI — uses hybrid bridge
│   ├── lib/
│   │   ├── flats.ts           # Pure JS implementation (fallback)
│   │   └── native-bridge.ts   # Bridge: C++ with JS fallback
│   ├── api/                   # Photoshop API helpers
│   └── globals.ts             # UXP module imports
├── native/                    # C++ native addon
│   ├── README.md              # Build instructions
│   ├── CMakeLists.txt         # CMake build config
│   ├── build-native.sh        # Build script
│   ├── include/
│   │   ├── flats_core.h       # Algorithm declarations
│   │   └── module.h           # UXP addon API declarations
│   ├── src/
│   │   ├── flats_core.cpp     # Core algorithm implementations
│   │   └── module.cpp         # UXP addon entry point
│   ├── mac-arm64/             # macOS ARM64 binary (built)
│   ├── mac-x64/               # macOS Intel binary (built)
│   └── win-x64/               # Windows x64 binary (built)
└── HYBRID-ARCHITECTURE.md     # Detailed architecture doc
```

### Further Reading

- **[HYBRID-ARCHITECTURE.md](HYBRID-ARCHITECTURE.md)** — Full architecture details, data flow diagrams, Photoshop C++ SDK integration, and troubleshooting
- **[native/README.md](native/README.md)** — C++ addon build and deployment instructions
- [Adobe UXP Hybrid Plugin Guide](https://developer.adobe.com/photoshop/uxp/2022/guides/hybrid-plugins/getting-started/) — Official documentation
- [Adobe C++ ↔ UXP Messaging](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/cpp-pluginsdk) — PIUXPSuite for bidirectional C++ messaging

## Tech Stack

- **Bolt UXP** — UXP plugin boilerplate with Vite + TypeScript
- **React** — UI framework
- **TypeScript** — Type-safe development
- **Photoshop UXP API** — Native Photoshop integration via batchPlay
- **C++ Native Addon** — Optional performance layer via UXP Hybrid Plugin SDK

## Development

```bash
# Install dependencies
npm install

# Development with hot reload
npm run dev

# Production build (JS only)
npm run build

# Build native addon (requires UXP Hybrid Plugin SDK)
cd native && ./build-native.sh --uxp-sdk /path/to/sdk

# Package as CCX
npm run ccx

# Create ZIP archive
npm run zip
```

## License

MIT
