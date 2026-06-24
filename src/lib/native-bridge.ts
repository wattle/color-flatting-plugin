/**
 * native-bridge.ts — Bridge between UXP JavaScript and C++ hybrid addon
 *
 * This module provides a transparent bridge that:
 *   1. Attempts to load the C++ hybrid addon ("colorflats-hybrid.uxpaddon")
 *   2. If available, delegates heavy computation to C++ for speed
 *   3. If unavailable, falls back to the pure-JS implementation in flats.ts
 *
 * The hybrid addon is loaded via the UXP Hybrid Plugin mechanism using
 * require("colorflats-hybrid.uxpaddon"). The addon binary (.uxpaddon files)
 * must be in the public-hybrid/ directory and are copied to dist/ during build.
 *
 * ─── Architecture ──────────────────────────────────────────────────
 *
 *   UXP Plugin (JS)
 *     │
 *     ├── native-bridge.ts  ← this file
 *     │     │
 *     │     ├── try require("colorflats-hybrid.uxpaddon")  ← C++ addon
 *     │     │     └── buildOutlineMask(pixelData, totalPixels, threshold)
 *     │     │     └── runFlatsPipeline(pixelData, w, h, config...)  ← async!
 *     │     │
 *     │     └── fallback to flats.ts                ← pure JS
 *     │           └── generateColorFlats(config)
 *     │
 *     └── flats.ts  ← existing pure-JS implementation (kept as fallback)
 *
 * ─── Hybrid Addon API ────────────────────────────────────────────────
 *
 * The C++ addon exposes:
 *
 * buildOutlineMask(pixelData: ArrayBuffer, totalPixels: number, threshold: number)
 *   → { mask: ArrayBuffer, outlineCount: number }
 *
 *   Synchronous. Fast O(n) luminance threshold scan.
 *
 * runFlatsPipeline(
 *   pixelData: ArrayBuffer, width: number, height: number,
 *   outlineThreshold: number, minRegionSize: number,
 *   maxRegionFraction: number, trapUnderLines: number,
 *   trapWidth: number, colorMode: number
 * )
 *   → Promise<{ regionCount: number, flatBuffer: ArrayBuffer, layerName: string }>
 *
 *   Async. Runs the full flatting pipeline on a worker thread.
 *   Returns a Promise that resolves with the result.
 *
 * ─── Performance Comparison ────────────────────────────────────────
 *
 * For a 4000×4000 image (16M pixels):
 *   - JS:     ~3-8 seconds for flood fill + color generation
 *   - C++:    ~0.2-0.8 seconds (estimated, ~5-10x speedup)
 */

import { photoshop } from "../globals";
import { generateColorFlats, analyzeOutlines, DEFAULT_CONFIG, FlatConfig } from "./flats";

const LOG = "[ColorFlats:NativeBridge]";

/** The native addon, if available */
let nativeModule: any = null;
let nativeLoadAttempted = false;
let nativeAvailable = false;

// ─── Color mode enum mapping ────────────────────────────────────────────────

const COLOR_MODE_MAP: Record<string, number> = {
  pastel: 0,
  saturated: 1,
  muted: 2,
  rainbow: 3,
};

// ─── Native module loading ──────────────────────────────────────────────────

/**
 * Attempt to load the native C++ hybrid addon.
 * This should be called once at plugin initialization.
 *
 * The addon name must match the `addon.name` field in manifest.json
 * and the `requiredPermissions.enableAddon` must be true.
 */
export function initNativeBridge(): void {
  if (nativeLoadAttempted) return;
  nativeLoadAttempted = true;

  try {
    // UXP Hybrid Plugin SDK loads native addons via require()
    // The addon name must match manifest.json addon.name
    nativeModule = require("colorflats-hybrid.uxpaddon");
    nativeAvailable = true;
    console.log(LOG, "✓ Native C++ hybrid addon loaded successfully");

    // Verify the expected functions are available
    if (typeof nativeModule.buildOutlineMask === "function") {
      console.log(LOG, "  ✓ buildOutlineMask available");
    }
    if (typeof nativeModule.runFlatsPipeline === "function") {
      console.log(LOG, "  ✓ runFlatsPipeline available");
    }
  } catch (err: any) {
    nativeAvailable = false;
    console.log(LOG, `✗ Hybrid addon not available: ${err?.message || err}`);
    console.log(LOG, "  Falling back to pure-JavaScript implementation");
  }
}

/**
 * Check if the native addon is available for use.
 */
export function isNativeAvailable(): boolean {
  return nativeAvailable;
}

// ─── Native implementation wrappers ─────────────────────────────────────────

/**
 * Build an outline mask from pixel data using C++.
 * Synchronous call — fast O(n) operation.
 */
function nativeBuildOutlineMask(
  pixelData: Uint8Array,
  totalPixels: number,
  threshold: number
): { mask: Int8Array; outlineCount: number } {
  if (!nativeModule) throw new Error("Native module not loaded");

  const result = nativeModule.buildOutlineMask(pixelData.buffer, totalPixels, threshold);
  return {
    mask: new Int8Array(result.mask),
    outlineCount: result.outlineCount as number,
  };
}

/**
 * Run the complete flatting pipeline in C++.
 * Async — runs on a worker thread, returns a Promise.
 */
async function nativeRunFlatsPipeline(
  pixelData: Uint8Array,
  width: number,
  height: number,
  config: FlatConfig
): Promise<{ regionCount: number; flatBuffer: Uint8Array; layerName: string }> {
  if (!nativeModule) throw new Error("Native module not loaded");

  const colorModeNum = COLOR_MODE_MAP[config.colorMode] ?? 0;
  const trapUnderLinesNum = config.trapUnderLines ? 1 : 0;

  // The C++ addon function takes individual arguments:
  // runFlatsPipeline(pixelData, width, height,
  //   outlineThreshold, minRegionSize, maxRegionFraction,
  //   trapUnderLines, trapWidth, colorMode)
  const result = await nativeModule.runFlatsPipeline(
    pixelData.buffer,
    width,
    height,
    config.outlineThreshold,
    config.minRegionSize,
    config.maxRegionFraction,
    trapUnderLinesNum,
    config.trapWidth,
    colorModeNum
  );

  return {
    regionCount: result.regionCount as number,
    flatBuffer: new Uint8Array(result.flatBuffer),
    layerName: result.layerName as string,
  };
}

// ─── Hybrid implementation ──────────────────────────────────────────────────

const { executeAsModal } = photoshop.core;
const { batchPlay } = photoshop.action;
const imaging = photoshop.imaging;

const MAX_DIMENSION = 5200;

/** Safely dispose an imaging object */
async function safeDispose(obj: any, label: string) {
  try {
    if (obj && typeof obj.dispose === "function") {
      await obj.dispose();
    }
  } catch (e) {
    console.warn(LOG, `${label} dispose error:`, e);
  }
}

/** Find a layer by ID, recursing into groups */
function findLayerById(layers: any[], id: number): any {
  for (const layer of layers) {
    try {
      if (layer.id === id) return layer;
      if (layer.layers && layer.layers.length > 0) {
        const found = findLayerById(layer.layers, id);
        if (found) return found;
      }
    } catch {
      // Skip inaccessible layers
    }
  }
  return null;
}

/**
 * Generate color flats using the hybrid approach.
 *
 * Strategy:
 *   1. Read pixel data via Photoshop UXP API (must be in executeAsModal)
 *   2. If C++ hybrid addon is available:
 *      - Transfer pixel data to C++ as ArrayBuffer
 *      - Run entire flatting pipeline in C++ (async, on worker thread)
 *      - Receive flat color buffer back as ArrayBuffer
 *   3. If C++ not available:
 *      - Fall back to pure-JS implementation from flats.ts
 *   4. Write the result back to Photoshop via UXP API
 */
export async function hybridGenerateColorFlats(config: FlatConfig): Promise<{
  regionCount: number;
  layerName: string;
  usedNative: boolean;
}> {
  console.log(LOG, `hybridGenerateColorFlats: START (native=${nativeAvailable})`);

  // If native module is not available, delegate entirely to JS
  if (!nativeAvailable) {
    console.log(LOG, "Using pure-JS implementation");
    const result = await generateColorFlats(config);
    return { ...result, usedNative: false };
  }

  // ─── Hybrid path: use C++ for computation, JS for Photoshop API ────

  try {
    const result = await executeAsModal(
      async () => {
        try {
          const doc = photoshop.app.activeDocument;
          if (!doc) throw new Error("No document open.");
          const width = Math.round(doc.width);
          const height = Math.round(doc.height);

          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            throw new Error(`Document too large (${width}×${height}). Max is ${MAX_DIMENSION}px.`);
          }

          // Resolve target layer
          let outlineLayer: any;
          if (config.selectedLayerId >= 0) {
            outlineLayer = findLayerById(doc.layers, config.selectedLayerId);
            if (!outlineLayer) throw new Error("Layer not found.");
          } else {
            outlineLayer = doc.activeLayers?.[0];
            if (!outlineLayer) throw new Error("No active layer.");
          }
          const outlineLayerId = outlineLayer.id;

          // Step 1: Read pixel data (JS — must use Photoshop API)
          console.log(LOG, "Reading pixel data...");
          let pixelResult: any;
          let pixelData: Uint8Array;
          let imageDataObj: any;
          try {
            pixelResult = await imaging.getPixels({
              documentID: doc.id,
              layerID: outlineLayerId,
              sourceBounds: { left: 0, top: 0, right: width, bottom: height },
              componentSize: 8,
            });
            imageDataObj = pixelResult.imageData;
            pixelData = await imageDataObj.getData({ chunky: true });
          } catch (pxErr: any) {
            throw new Error(`Failed to read pixel data: ${pxErr?.message || String(pxErr)}`);
          }

          // Step 2: Run C++ flatting pipeline (async — runs on worker thread)
          console.log(LOG, "Running C++ flatting pipeline...");
          const t0 = performance.now();
          let nativeResult: { regionCount: number; flatBuffer: Uint8Array; layerName: string };

          try {
            nativeResult = await nativeRunFlatsPipeline(pixelData, width, height, config);
          } catch (nativeErr: any) {
            console.warn(LOG, `C++ pipeline failed (${nativeErr?.message}), falling back to JS`);
            // Release pixel data
            await safeDispose(imageDataObj, "imageDataObj");
            // Fall back to pure JS
            const jsResult = await generateColorFlats(config);
            return { ...jsResult, usedNative: false };
          }

          const elapsed = performance.now() - t0;
          console.log(LOG, `C++ pipeline completed in ${elapsed.toFixed(0)}ms, ${nativeResult.regionCount} regions`);

          // Release pixel data immediately
          await safeDispose(imageDataObj, "imageDataObj");

          // Step 3: Create Color Flats layer (JS — Photoshop API)
          console.log(LOG, "Creating flats layer...");
          await batchPlay([
            { _obj: "select", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], layerID: outlineLayerId, _options: { dialogOptions: "dontDisplay" } },
          ], {});
          await batchPlay([
            { _obj: "make", new: { _obj: "layer", name: "Color Flats" }, _options: { dialogOptions: "dontDisplay" } },
          ], {});
          await batchPlay([
            { _obj: "move", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], to: { _ref: "layer", _enum: "ordinal", _value: "backward" }, _options: { dialogOptions: "dontDisplay" } },
          ], {});

          const flatsLayer = doc.activeLayers[0];
          const flatsLayerId = flatsLayer.id;

          // Step 4: Write flat color pixels (JS — Photoshop API)
          console.log(LOG, "Writing flat colors...");
          let flatImageData: any;
          try {
            flatImageData = await imaging.createImageDataFromBuffer(nativeResult.flatBuffer, {
              width, height, components: 4, chunky: true,
              colorSpace: "RGB", colorProfile: "sRGB IEC61966-2.1",
            });
          } catch (imgErr: any) {
            throw new Error(`Failed to create image data: ${imgErr?.message || String(imgErr)}`);
          }

          try {
            await imaging.putPixels({
              documentID: doc.id,
              layerID: flatsLayerId,
              imageData: flatImageData,
              replace: true,
              targetBounds: { left: 0, top: 0, width, height },
              commandName: "Generate Color Flats",
            });
          } catch (putErr: any) {
            throw new Error(`Failed to write pixels: ${putErr?.message || String(putErr)}`);
          }

          await safeDispose(flatImageData, "flatImageData");

          // Step 5: Re-select outline layer
          await batchPlay([
            { _obj: "select", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], layerID: outlineLayerId, _options: { dialogOptions: "dontDisplay" } },
          ], {}).catch(() => console.warn(LOG, "Could not re-select outline layer"));

          return { regionCount: nativeResult.regionCount, layerName: "Color Flats", usedNative: true };
        } catch (modalErr: any) {
          console.error(LOG, "Error in hybrid modal context:", modalErr?.message || modalErr);
          throw modalErr;
        }
      },
      { commandName: "Generate Color Flats (Hybrid)" }
    );

    console.log(LOG, "hybridGenerateColorFlats: completed successfully");
    return result;
  } catch (outerErr: any) {
    console.error(LOG, "hybridGenerateColorFlats: outer error:", outerErr?.message || outerErr);
    throw outerErr;
  }
}

/**
 * Analyze outlines using the hybrid approach.
 *
 * If native module is available, uses C++ for mask building.
 * Otherwise falls back to pure JS.
 */
export async function hybridAnalyzeOutlines(config: FlatConfig): Promise<{
  outlinePixels: number;
  totalPixels: number;
  regionsFound: number;
  usedNative: boolean;
}> {
  console.log(LOG, `hybridAnalyzeOutlines: START (native=${nativeAvailable})`);

  if (!nativeAvailable) {
    console.log(LOG, "Using pure-JS implementation");
    const result = await analyzeOutlines(config);
    return { ...result, usedNative: false };
  }

  // For analyze mode, we still need to read pixel data via JS
  // but can do the computation in C++
  try {
    const result = await executeAsModal(
      async () => {
        try {
          const doc = photoshop.app.activeDocument;
          if (!doc) throw new Error("No document open.");
          const width = Math.round(doc.width);
          const height = Math.round(doc.height);

          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            throw new Error(`Document too large.`);
          }
          const totalPixels = width * height;

          // Resolve target layer
          let activeLayer: any;
          if (config.selectedLayerId >= 0) {
            activeLayer = findLayerById(doc.layers, config.selectedLayerId);
            if (!activeLayer) throw new Error("Layer not found.");
          } else {
            activeLayer = doc.activeLayers?.[0];
            if (!activeLayer) throw new Error("No active layer.");
          }

          // Read pixel data
          let pixelResult: any;
          let pixelData: Uint8Array;
          let imageDataObj: any;
          try {
            pixelResult = await imaging.getPixels({
              documentID: doc.id,
              layerID: activeLayer.id,
              sourceBounds: { left: 0, top: 0, right: width, bottom: height },
              componentSize: 8,
            });
            imageDataObj = pixelResult.imageData;
            pixelData = await imageDataObj.getData({ chunky: true });
          } catch (pxErr: any) {
            throw new Error(`Failed to read pixel data: ${pxErr?.message || String(pxErr)}`);
          }

          // Run C++ mask analysis
          const t0 = performance.now();
          let outlineCount: number;
          let regionsFound: number;

          try {
            const maskResult = nativeBuildOutlineMask(pixelData, totalPixels, config.outlineThreshold);
            outlineCount = maskResult.outlineCount;

            // For region count, we still need to do a flood fill.
            // Since buildOutlineMask is sync and fast, we can use it here.
            // For a full analysis, we'd need to call runFlatsPipeline and count regions,
            // but that's heavier. For now, estimate from the JS fallback.
            // Actually, we can count fillable pixels as a rough estimate,
            // but for accurate count, fall back to JS flood fill.
            await safeDispose(imageDataObj, "imageDataObj");

            // Use JS flood fill for counting since we don't have a dedicated native
            // flood fill function exposed (the pipeline does it internally)
            const jsResult = await analyzeOutlines(config);
            regionsFound = jsResult.regionsFound;
            outlineCount = maskResult.outlineCount; // Use C++ count (more accurate)
          } catch (nativeErr: any) {
            console.warn(LOG, `C++ analyze failed (${nativeErr?.message}), falling back to JS`);
            await safeDispose(imageDataObj, "imageDataObj");
            const jsResult = await analyzeOutlines(config);
            return { ...jsResult, usedNative: false };
          }

          const elapsed = performance.now() - t0;
          console.log(LOG, `C++ analyze completed in ${elapsed.toFixed(0)}ms`);

          return { outlinePixels: outlineCount, totalPixels, regionsFound, usedNative: true };
        } catch (modalErr: any) {
          console.error(LOG, "Error in analyze modal context:", modalErr?.message || modalErr);
          throw modalErr;
        }
      },
      { commandName: "Analyze Outlines (Hybrid)" }
    );

    return result;
  } catch (outerErr: any) {
    console.error(LOG, "hybridAnalyzeOutlines: outer error:", outerErr?.message || outerErr);
    throw outerErr;
  }
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export type { FlatConfig } from "./flats";
export { DEFAULT_CONFIG } from "./flats";