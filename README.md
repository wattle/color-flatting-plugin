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

## Tech Stack

- **Bolt UXP** — UXP plugin boilerplate with Vite + TypeScript
- **React** — UI framework
- **TypeScript** — Type-safe development
- **Photoshop UXP API** — Native Photoshop integration via batchPlay

## Development

```bash
# Install dependencies
npm install

# Development with hot reload
npm run dev

# Production build
npm run build

# Package as CCX
npm run ccx

# Create ZIP archive
npm run zip
```

## License

MIT