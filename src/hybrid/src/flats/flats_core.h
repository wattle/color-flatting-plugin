/**
 * flats_core.h — Core C++ pixel processing algorithms for ColorFlats
 *
 * These functions are the performance-critical inner loops that benefit
 * from native C++ execution vs JavaScript:
 *
 *   - buildOutlineMask:  O(n) luminance threshold scan
 *   - floodFillRegions:  scanline flood fill to find all connected regions
 *   - generateFlatBuffer: write distinct RGBA colors for each region
 *   - trapRegions:       expand regions under outlines (trapping)
 */

#ifndef FLATS_CORE_H
#define FLATS_CORE_H

#include <cstdint>
#include <vector>
#include <string>

// ─── Data types ─────────────────────────────────────────────────────────────

/** A rectangular bounding box around a region */
struct Bounds {
    int32_t x1, y1, x2, y2;
};

/** A detected connected region (flat area) */
struct Region {
    int32_t id;
    std::vector<int32_t> indices;  // pixel indices in the image
    Bounds bounds;
};

/** Configuration matching FlatConfig from the JS side */
struct FlatConfig {
    int32_t outlineThreshold = 80;
    int32_t minRegionSize   = 100;
    double maxRegionFraction = 0.5;
    bool   detectGrayscale  = false;
    bool   trapUnderLines   = false;
    int32_t trapWidth        = 1;
    int32_t colorMode        = 0;  // 0=pastel, 1=saturated, 2=muted, 3=rainbow
};

/** Result of outline mask building */
struct MaskResult {
    std::vector<int8_t> mask;   // 0=fillable, 1=outline, 2=visited
    int32_t outlineCount;
};

/** Result of the full flatting pipeline */
struct FlatsResult {
    int32_t regionCount;
    std::string layerName;
    std::vector<uint8_t> flatBuffer;  // RGBA pixel data
    std::vector<Region> regions;       // detected regions
};

// ─── Core algorithms ────────────────────────────────────────────────────────

/**
 * Build an outline mask from RGBA pixel data.
 *
 * Pixels with luminance below `threshold` or alpha < 10 are marked as outline.
 * Returns mask array and outline pixel count.
 */
MaskResult buildOutlineMask(
    const uint8_t* pixelData,   // RGBA interleaved, chunky
    int32_t totalPixels,
    int32_t threshold
);

/**
 * Find all connected regions via scanline flood fill.
 *
 * Modifies mask in-place (marks visited pixels as state 2).
 * Filters by minRegionSize and maxRegionFraction.
 */
std::vector<Region> floodFillRegions(
    std::vector<int8_t>& mask,  // modified in place
    int32_t width,
    int32_t height,
    int32_t minRegionSize,
    double maxRegionFraction
);

/**
 * Generate flat color buffer.
 *
 * Writes distinct RGBA colors for each region into a pre-allocated buffer.
 * Uses golden-angle hue distribution for perceptual separation.
 */
void generateFlatBuffer(
    const std::vector<Region>& regions,
    int32_t totalPixels,
    int32_t colorMode,           // 0=pastel, 1=saturated, 2=muted, 3=rainbow
    uint8_t* outBuffer           // must be totalPixels * 4 bytes
);

/**
 * Trap: expand a region's pixels into adjacent outline pixels.
 *
 * Used to prevent white gaps between outlines and flat colors.
 */
Region trapRegion(
    const Region& region,
    const std::vector<int8_t>& outlineMask,
    int32_t width,
    int32_t height,
    int32_t trapWidth
);

/**
 * Run the complete flatting pipeline.
 *
 * 1. Build outline mask
 * 2. Flood fill to find regions
 * 3. Generate flat color buffer
 *
 * This is the main entry point called from the JS bridge.
 */
FlatsResult runFlatsPipeline(
    const uint8_t* pixelData,
    int32_t width,
    int32_t height,
    const FlatConfig& config
);

#endif // FLATS_CORE_H