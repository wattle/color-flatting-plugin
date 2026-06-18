/**
 * ColorFlats - Core Flatting Engine (Optimized)
 *
 * Memory layout:
 *   - One Int8Array mask (combined outline + visit state):
 *     0 = fillable/unvisited, 1 = outline, 2 = visited fillable
 *   - Flood fill stores pixel indices as Int32Array (4 bytes each)
 *     instead of {x,y} objects (~50 bytes each)
 *   - Flat output uses Uint8Array zero-initialized (native memset)
 */

import { photoshop } from "../globals";

const { executeAsModal } = photoshop.core;
const { batchPlay } = photoshop.action;
const imaging = photoshop.imaging;

const LOG = "[ColorFlats]";

/** Maximum dimension we'll process to avoid crashes */
const MAX_DIMENSION = 5200;

/** Mask cell states */
const FILLABLE = 0;
const OUTLINE = 1;
const VISITED = 2;

/** A connected region found by flood fill */
interface Region {
  id: number;
  indices: Int32Array;
  count: number;
  bounds: { x1: number; y1: number; x2: number; y2: number };
}

/** Configuration for the flatting process */
export interface FlatConfig {
  outlineThreshold: number;
  minRegionSize: number;
  maxRegionFraction: number;
  detectGrayscale: boolean;
  trapUnderLines: boolean;
  trapWidth: number;
  colorMode: "pastel" | "saturated" | "muted" | "rainbow";
  selectedLayerId: number;
}

export const DEFAULT_CONFIG: FlatConfig = {
  outlineThreshold: 80,
  minRegionSize: 100,
  maxRegionFraction: 0.5,
  detectGrayscale: false,
  trapUnderLines: false,
  trapWidth: 1,
  colorMode: "pastel",
  selectedLayerId: -1,
};

/** Pre-computed color LUT for fast flat color generation */
interface CachedColor { r: number; g: number; b: number; }

function buildColorLUT(total: number, mode: FlatConfig["colorMode"]): CachedColor[] {
  const size = Math.min(total, 256);
  const lut: CachedColor[] = new Array(size);
  for (let i = 0; i < size; i++) {
    lut[i] = generateFlatColor(i, total, mode);
  }
  return lut;
}

function generateFlatColor(index: number, total: number, mode: FlatConfig["colorMode"]): CachedColor {
  let h: number, s: number, l: number;
  switch (mode) {
    case "pastel":
      h = (index * 137.508) % 360; s = 0.5 + (index % 3) * 0.1; l = Math.min(0.85 + (index % 5) * 0.03, 0.95); break;
    case "saturated":
      h = (index * 137.508) % 360; s = 0.85; l = 0.65; break;
    case "muted":
      h = (index * 47.0) % 360; s = 0.35; l = 0.55; break;
    case "rainbow":
      h = (index / total) * 360; s = 0.7; l = 0.75; break;
    default:
      h = (index * 137.508) % 360; s = 0.5; l = 0.85; break;
  }
  return hslToRgb(h / 360, s, l);
}

function hslToRgb(h: number, s: number, l: number): CachedColor {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/** Scanline flood fill. Returns Int32Array of pixel indices, or null if too small. */
function floodFillScanline(
  mask: Int8Array,
  startX: number,
  startY: number,
  width: number,
  height: number,
  minRegionSize: number
): Int32Array | null {
  const startIdx = startY * width + startX;
  if (mask[startIdx] !== FILLABLE) return null;

  let capacity = Math.min(width * height, 16384);
  let indices = new Int32Array(capacity);
  let count = 0;

  const stack: number[] = [startX, startY];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    let leftX = x;
    while (leftX > 0 && mask[y * width + leftX - 1] === FILLABLE) leftX--;

    let spanAbove = false;
    let spanBelow = false;

    let cx = leftX;
    while (cx < width && mask[y * width + cx] === FILLABLE) {
      const idx = y * width + cx;
      mask[idx] = VISITED;

      if (count >= capacity) {
        capacity = capacity << 1;
        const newIndices = new Int32Array(capacity);
        newIndices.set(indices);
        indices = newIndices;
      }
      indices[count++] = idx;

      if (y > 0) {
        const aboveIdx = (y - 1) * width + cx;
        if (mask[aboveIdx] === FILLABLE) {
          if (!spanAbove) { stack.push(cx, y - 1); spanAbove = true; }
        } else { spanAbove = false; }
      }

      if (y < height - 1) {
        const belowIdx = (y + 1) * width + cx;
        if (mask[belowIdx] === FILLABLE) {
          if (!spanBelow) { stack.push(cx, y + 1); spanBelow = true; }
        } else { spanBelow = false; }
      }

      cx++;
    }
  }

  if (count < minRegionSize) return null;
  return count < indices.length ? indices.slice(0, count) : indices;
}

/** Trap: expand region into outline pixels using Uint8Array bitmap */
function trapRegion(
  regionIndices: Int32Array,
  count: number,
  outlineMask: Int8Array,
  width: number,
  height: number,
  trapWidth: number
): { indices: Int32Array; count: number } {
  const totalPx = width * height;
  const expanded = new Uint8Array(totalPx);
  for (let i = 0; i < count; i++) expanded[regionIndices[i]] = 1;

  for (let t = 0; t < trapWidth; t++) {
    let added = 0;
    for (let idx = 0; idx < totalPx; idx++) {
      if (expanded[idx] !== 1) continue;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x > 0 && outlineMask[idx - 1] === OUTLINE && expanded[idx - 1] === 0) { expanded[idx - 1] = 2; added++; }
      if (x < width - 1 && outlineMask[idx + 1] === OUTLINE && expanded[idx + 1] === 0) { expanded[idx + 1] = 2; added++; }
      if (y > 0 && outlineMask[idx - width] === OUTLINE && expanded[idx - width] === 0) { expanded[idx - width] = 2; added++; }
      if (y < height - 1 && outlineMask[idx + width] === OUTLINE && expanded[idx + width] === 0) { expanded[idx + width] = 2; added++; }
    }
    for (let idx = 0; idx < totalPx; idx++) { if (expanded[idx] === 2) expanded[idx] = 1; }
    if (added === 0) break;
  }

  let finalCount = 0;
  for (let idx = 0; idx < totalPx; idx++) { if (expanded[idx] === 1) finalCount++; }
  const result = new Int32Array(finalCount);
  let ri = 0;
  for (let idx = 0; idx < totalPx; idx++) { if (expanded[idx] === 1) result[ri++] = idx; }
  return { indices: result, count: finalCount };
}

/** Build the outline mask from pixel data. Returns mask and outline count. */
function buildOutlineMask(
  pixelData: Uint8Array,
  totalPixels: number,
  threshold: number
): { mask: Int8Array; outlineCount: number } {
  const mask = new Int8Array(totalPixels);
  let outlineCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const a = pixelData[off + 3];
    if (a < 10) {
      mask[i] = OUTLINE;
      outlineCount++;
    } else {
      const lum = pixelData[off] * 0.299 + pixelData[off + 1] * 0.587 + pixelData[off + 2] * 0.114;
      if (lum < threshold) {
        mask[i] = OUTLINE;
        outlineCount++;
      }
    }
  }

  return { mask, outlineCount };
}

/** Safely dispose an imaging object */
async function safeDispose(obj: any, label: string) {
  try {
    if (obj && typeof obj.dispose === "function") {
      await obj.dispose();
      console.log(LOG, `${label} disposed`);
    }
  } catch (e) {
    console.warn(LOG, `${label} dispose error:`, e);
  }
}

/**
 * Main flatting algorithm - generates flat color regions from a selected layer
 */
export async function generateColorFlats(config: FlatConfig): Promise<{
  regionCount: number;
  layerName: string;
}> {
  console.log(LOG, "generateColorFlats: START");
  try {
    const result = await executeAsModal(
      async () => {
        try {
          console.log(LOG, "generateColorFlats: modal context entered");

          const doc = photoshop.app.activeDocument;
          if (!doc) throw new Error("No document open.");
          const width = Math.round(doc.width);
          const height = Math.round(doc.height);
          console.log(LOG, `generateColorFlats: doc ${width}×${height}`);

          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            throw new Error(`Document too large (${width}×${height}). Max is ${MAX_DIMENSION}px.`);
          }
          const totalPixels = width * height;

          // Resolve target layer
          let outlineLayer: any;
          if (config.selectedLayerId >= 0) {
            outlineLayer = findLayerById(doc.layers, config.selectedLayerId);
            if (!outlineLayer) throw new Error("Layer not found. It may have been deleted.");
          } else {
            outlineLayer = doc.activeLayers?.[0];
            if (!outlineLayer) throw new Error("No active layer.");
          }
          const outlineLayerId = outlineLayer.id;
          console.log(LOG, `generateColorFlats: layer="${outlineLayer.name}" id=${outlineLayerId}`);

          // Step 1: Read pixels
          console.log(LOG, "generateColorFlats: getPixels...");
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
            console.log(LOG, `generateColorFlats: got ${pixelData.length} bytes of pixel data`);
          } catch (pxErr: any) {
            console.error(LOG, "generateColorFlats: getPixels FAILED", pxErr?.message || pxErr);
            throw new Error(`Failed to read pixel data: ${pxErr?.message || String(pxErr)}`);
          }

          // Step 2: Build mask
          console.log(LOG, "generateColorFlats: building mask...");
          const t0 = performance.now();
          const { mask, outlineCount: _oc } = buildOutlineMask(pixelData, totalPixels, config.outlineThreshold);
          console.log(LOG, `generateColorFlats: mask built in ${(performance.now() - t0).toFixed(0)}ms`);

          // Release pixel data immediately
          await safeDispose(imageDataObj, "imageDataObj");

          // Step 3: Flood fill
          console.log(LOG, "generateColorFlats: flood filling...");
          const t1 = performance.now();
          const regions: Region[] = [];
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = y * width + x;
              if (mask[idx] !== FILLABLE) continue;
              const regionIndices = floodFillScanline(mask, x, y, width, height, config.minRegionSize);
              if (regionIndices) {
                const fraction = regionIndices.length / totalPixels;
                if (fraction < config.maxRegionFraction) {
                  let x1 = width, y1 = height, x2 = 0, y2 = 0;
                  for (let i = 0; i < regionIndices.length; i++) {
                    const pi = regionIndices[i];
                    const px = pi % width;
                    const py = (pi - px) / width;
                    if (px < x1) x1 = px; if (py < y1) y1 = py;
                    if (px > x2) x2 = px; if (py > y2) y2 = py;
                  }
                  regions.push({ id: regions.length, indices: regionIndices, count: regionIndices.length, bounds: { x1, y1, x2, y2 } });
                }
              }
            }
          }
          console.log(LOG, `generateColorFlats: found ${regions.length} regions in ${(performance.now() - t1).toFixed(0)}ms`);

          if (regions.length === 0) {
            throw new Error("No flappable regions found. Try adjusting the outline threshold.");
          }

          // Step 4: Create Color Flats layer
          console.log(LOG, "generateColorFlats: creating layer...");
          await batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], layerID: outlineLayerId, _options: { dialogOptions: "dontDisplay" } }], {});
          await batchPlay([{ _obj: "make", new: { _obj: "layer", name: "Color Flats" }, _options: { dialogOptions: "dontDisplay" } }], {});
          await batchPlay([{ _obj: "move", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], to: { _ref: "layer", _enum: "ordinal", _value: "backward" }, _options: { dialogOptions: "dontDisplay" } }], {});

          const flatsLayer = doc.activeLayers[0];
          const flatsLayerId = flatsLayer.id;
          console.log(LOG, `generateColorFlats: flats layer id=${flatsLayerId}`);

          // Step 5: Write flat colors
          console.log(LOG, "generateColorFlats: writing colors...");
          const t2 = performance.now();
          const flatBuffer = new Uint8Array(totalPixels * 4);
          const colorLUT = buildColorLUT(regions.length, config.colorMode);
          const lutSize = colorLUT.length;

          for (let r = 0; r < regions.length; r++) {
            const color = colorLUT[r % lutSize];
            let srcIndices: Int32Array;
            let srcCount: number;
            if (config.trapUnderLines) {
              const trapped = trapRegion(regions[r].indices, regions[r].count, mask, width, height, config.trapWidth);
              srcIndices = trapped.indices;
              srcCount = trapped.count;
            } else {
              srcIndices = regions[r].indices;
              srcCount = regions[r].count;
            }
            const cr = color.r, cg = color.g, cb = color.b;
            for (let i = 0; i < srcCount; i++) {
              const off = srcIndices[i] << 2;
              flatBuffer[off] = cr;
              flatBuffer[off + 1] = cg;
              flatBuffer[off + 2] = cb;
              flatBuffer[off + 3] = 255;
            }
          }
          console.log(LOG, `generateColorFlats: colors written in ${(performance.now() - t2).toFixed(0)}ms`);

          // Write pixels
          console.log(LOG, "generateColorFlats: creating image data...");
          let flatImageData: any;
          try {
            flatImageData = await imaging.createImageDataFromBuffer(flatBuffer, {
              width, height, components: 4, chunky: true,
              colorSpace: "RGB", colorProfile: "sRGB IEC61966-2.1",
            });
          } catch (imgErr: any) {
            console.error(LOG, "createImageDataFromBuffer FAILED", imgErr?.message || imgErr);
            throw new Error(`Failed to create image data: ${imgErr?.message || String(imgErr)}`);
          }

          console.log(LOG, "generateColorFlats: putPixels...");
          try {
            await imaging.putPixels({
              documentID: doc.id, layerID: flatsLayerId,
              imageData: flatImageData, replace: true,
              targetBounds: { left: 0, top: 0, width, height },
              commandName: "Generate Color Flats",
            });
          } catch (putErr: any) {
            console.error(LOG, "putPixels FAILED", putErr?.message || putErr);
            throw new Error(`Failed to write pixels: ${putErr?.message || String(putErr)}`);
          }
          console.log(LOG, "generateColorFlats: putPixels OK");

          await safeDispose(flatImageData, "flatImageData");

          // Step 6: Switch back
          await batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], layerID: outlineLayerId, _options: { dialogOptions: "dontDisplay" } }], {})
            .catch(() => console.warn(LOG, "could not re-select outline layer"));

          console.log(LOG, `generateColorFlats: DONE — ${regions.length} regions`);
          return { regionCount: regions.length, layerName: "Color Flats" };
        } catch (modalErr: any) {
          console.error(LOG, "generateColorFlats: error inside modal:", modalErr?.message || modalErr);
          throw modalErr;
        }
      },
      { commandName: "Generate Color Flats" }
    );
    console.log(LOG, "generateColorFlats: modal completed successfully");
    return result;
  } catch (outerErr: any) {
    console.error(LOG, "generateColorFlats: outer error:", outerErr?.message || outerErr);
    throw outerErr;
  }
}

/**
 * Analyze outlines and count regions without modifying the document.
 */
export async function analyzeOutlines(config: FlatConfig): Promise<{
  outlinePixels: number;
  totalPixels: number;
  regionsFound: number;
}> {
  console.log(LOG, "analyzeOutlines: START");
  try {
    const result = await executeAsModal(
      async () => {
        try {
          console.log(LOG, "analyzeOutlines: modal context entered");

          const doc = photoshop.app.activeDocument;
          if (!doc) throw new Error("No document open.");
          const width = Math.round(doc.width);
          const height = Math.round(doc.height);
          console.log(LOG, `analyzeOutlines: doc ${width}×${height}`);

          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            throw new Error(`Document too large (${width}×${height}). Max is ${MAX_DIMENSION}px.`);
          }
          const totalPixels = width * height;

          // Resolve target layer
          let activeLayer: any;
          if (config.selectedLayerId >= 0) {
            activeLayer = findLayerById(doc.layers, config.selectedLayerId);
            if (!activeLayer) throw new Error("Layer not found. It may have been deleted.");
          } else {
            activeLayer = doc.activeLayers?.[0];
            if (!activeLayer) throw new Error("No active layer.");
          }
          console.log(LOG, `analyzeOutlines: layer="${activeLayer.name}" id=${activeLayer.id}`);

          // Read pixel data
          console.log(LOG, "analyzeOutlines: getPixels...");
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
            console.log(LOG, `analyzeOutlines: got ${pixelData.length} bytes of pixel data`);
          } catch (pxErr: any) {
            console.error(LOG, "analyzeOutlines: getPixels FAILED", pxErr?.message || pxErr);
            throw new Error(`Failed to read pixel data: ${pxErr?.message || String(pxErr)}`);
          }

          // Build mask
          console.log(LOG, "analyzeOutlines: building mask...");
          const t0 = performance.now();
          const { mask, outlineCount } = buildOutlineMask(pixelData, totalPixels, config.outlineThreshold);
          console.log(LOG, `analyzeOutlines: mask built in ${(performance.now() - t0).toFixed(0)}ms, ${outlineCount} outline pixels`);

          // Release pixel data immediately
          await safeDispose(imageDataObj, "imageDataObj");

          // Count regions
          console.log(LOG, "analyzeOutlines: flood filling...");
          const t1 = performance.now();
          let regionsFound = 0;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = y * width + x;
              if (mask[idx] !== FILLABLE) continue;
              const regionIndices = floodFillScanline(mask, x, y, width, height, config.minRegionSize);
              if (regionIndices) {
                const fraction = regionIndices.length / totalPixels;
                if (fraction < config.maxRegionFraction) regionsFound++;
              }
            }
          }
          console.log(LOG, `analyzeOutlines: found ${regionsFound} regions in ${(performance.now() - t1).toFixed(0)}ms`);

          console.log(LOG, `analyzeOutlines: DONE — ${outlineCount} outline pixels, ${regionsFound} regions`);
          return { outlinePixels: outlineCount, totalPixels, regionsFound };
        } catch (modalErr: any) {
          console.error(LOG, "analyzeOutlines: error inside modal:", modalErr?.message || modalErr);
          throw modalErr;
        }
      },
      { commandName: "Analyze Outlines" }
    );
    console.log(LOG, "analyzeOutlines: modal completed successfully");
    return result;
  } catch (outerErr: any) {
    console.error(LOG, "analyzeOutlines: outer error:", outerErr?.message || outerErr);
    throw outerErr;
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