/**
 * module.cpp — UXP Hybrid Addon module for ColorFlats
 *
 * This is the entry point for the native C++ addon loaded by the UXP runtime.
 * It registers JavaScript-callable functions that dispatch to the C++ core
 * algorithms in flats_core.cpp.
 *
 * The UXP Hybrid Plugin SDK provides the addon API for exposing C++ functions
 * to JavaScript. The SDK header "uxp_addon.h" defines the types and macros
 * used below.
 *
 * ─── Build Requirements ──────────────────────────────────────────────
 *
 * You need the UXP Hybrid Plugin SDK downloaded from:
 *   https://developer.adobe.com/console/servicesandapis/ps
 *
 * The SDK provides:
 *   - uxp_addon.h — Type definitions and macros for addon registration
 *   - Sample project structure showing how to build and package
 *
 * ─── Function Mapping (JS ↔ C++) ─────────────────────────────────────
 *
 * JS Function                → C++ Implementation
 * ──────────────────────────────────────────────────
 * buildOutlineMask(data, w, h, threshold)
 *                            → buildOutlineMask() + returns {mask, outlineCount}
 * floodFillRegions(mask, w, h, minSize, maxFrac)
 *                            → floodFillRegions() + returns region array
 * generateFlatBuffer(regions, totalPx, colorMode)
 *                            → generateFlatBuffer() + returns Uint8Array
 * runFlatsPipeline(data, w, h, config)
 *                            → runFlatsPipeline() + returns full result
 * trapRegion(region, outlineMask, w, h, trapW)
 *                            → trapRegion() + returns expanded region
 *
 * ─── Data Transfer Strategy ──────────────────────────────────────────
 *
 * Pixel data (RGBA) is transferred as ArrayBuffer from JS → C++.
 * Results are returned as structured objects with ArrayBuffers where
 * large binary data (masks, flat buffers) is involved.
 *
 * This avoids the serialization overhead of passing large arrays through
 * JSON and allows direct memory sharing between the two worlds.
 */

#include "module.h"
#include "flats_core.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

// ─── UXP Addon API Stubs ────────────────────────────────────────────────────
//
// These are forward declarations matching the UXP Hybrid Plugin SDK's API.
// When building with the actual SDK, these will be provided by uxp_addon.h.
// The SDK provides macros like ADDON_EXPORT and helper functions for creating
// return values. This stub layer lets the code compile without the SDK for
// development/testing, and the real SDK headers override these when present.
//
// See: https://developer.adobe.com/photoshop/uxp/2022/guides/hybrid-plugins/getting-started/

#ifndef UXP_SDK_AVAILABLE

// When the SDK is not available, we provide minimal type stubs.
// In production, include the actual SDK headers.
//
// The UXP addon runtime passes data through a context object that provides:
//   - Getting argument values (numbers, strings, ArrayBuffers)
//   - Creating return values (numbers, strings, objects, ArrayBuffers)
//   - Error reporting
//
// The actual API looks like:
//   ADDON_EXPORT AddonValue addon_buildOutlineMask(AddonData data, AddonValue args)
//   ADDON_EXPORT AddonValue addon_floodFillRegions(AddonData data, AddonValue args)
//   etc.

#define ADDON_EXPORT extern "C" __attribute__((visibility("default")))

// For now, we define the function signatures that will be registered.
// The actual registration happens in addonInit() using SDK-provided macros.

#endif // UXP_SDK_AVAILABLE

// ─── Helper: FlatConfig from JS arguments ───────────────────────────────────

static FlatConfig parseConfig(/* AddonValue configObj */) {
    // In the real implementation, this would extract fields from the JS object:
    //   configObj["outlineThreshold"].asInt32()
    //   configObj["minRegionSize"].asInt32()
    //   configObj["maxRegionFraction"].asDouble()
    //   configObj["trapUnderLines"].asBool()
    //   configObj["trapWidth"].asInt32()
    //   configObj["colorMode"].asInt32()
    //
    // For now, we return defaults. The bridge layer (native-bridge.ts) will
    // handle the JS → C++ argument marshalling.
    FlatConfig config;
    return config;
}

// ─── Native function implementations ────────────────────────────────────────
//
// Each function follows the UXP addon signature:
//   AddonValue functionName(AddonData data, AddonValue args)
//
// The `args` parameter is an array-like value containing the JS arguments.
// The `data` parameter provides the addon context for creating return values.

/**
 * buildOutlineMask(pixelData: ArrayBuffer, totalPixels: number, threshold: number)
 *   → { mask: ArrayBuffer, outlineCount: number }
 *
 * Takes RGBA pixel data and a luminance threshold, returns the outline mask
 * as an ArrayBuffer (Int8Array-compatible) and the count of outline pixels.
 */
ADDON_EXPORT AddonValue addon_buildOutlineMask(AddonData data, AddonValue args) {
    // Real implementation with SDK:
    //   const uint8_t* pixels = getArrayBuffer(data, getArg(args, 0));
    //   int32_t totalPixels = getInt32(data, getArg(args, 1));
    //   int32_t threshold = getInt32(data, getArg(args, 2));
    //
    //   MaskResult result = buildOutlineMask(pixels, totalPixels, threshold);
    //
    //   AddonValue returnObj = createObject(data);
    //   setObjectProperty(data, returnObj, "outlineCount", createInt32(data, result.outlineCount));
    //   setObjectProperty(data, returnObj, "mask",
    //       createArrayBuffer(data, result.mask.data(), result.mask.size()));
    //   return returnObj;

    // Placeholder — will be fully implemented with SDK integration
    return nullptr;
}

/**
 * floodFillRegions(mask: ArrayBuffer, width: number, height: number,
 *                  minRegionSize: number, maxRegionFraction: number)
 *   → { regions: Array<{id, indices: ArrayBuffer, bounds: {x1,y1,x2,y2}}>, count: number }
 */
ADDON_EXPORT AddonValue addon_floodFillRegions(AddonData data, AddonValue args) {
    // Real implementation with SDK:
    //   std::vector<int8_t> maskData = getArrayBufferCopy(data, getArg(args, 0));
    //   int32_t width = getInt32(data, getArg(args, 1));
    //   int32_t height = getInt32(data, getArg(args, 2));
    //   int32_t minSize = getInt32(data, getArg(args, 3));
    //   double maxFrac = getDouble(data, getArg(args, 4));
    //
    //   std::vector<Region> regions = floodFillRegions(maskData, width, height, minSize, maxFrac);
    //
    //   AddonValue resultArray = createArray(data, regions.size());
    //   for (size_t i = 0; i < regions.size(); i++) {
    //       AddonValue regionObj = createObject(data);
    //       setObjectProperty(data, regionObj, "id", createInt32(data, regions[i].id));
    //       setObjectProperty(data, regionObj, "indices",
    //           createArrayBuffer(data, regions[i].indices.data(), regions[i].indices.size() * 4));
    //       AddonValue boundsObj = createObject(data);
    //       setObjectProperty(data, boundsObj, "x1", createInt32(data, regions[i].bounds.x1));
    //       setObjectProperty(data, boundsObj, "y1", createInt32(data, regions[i].bounds.y1));
    //       setObjectProperty(data, boundsObj, "x2", createInt32(data, regions[i].bounds.x2));
    //       setObjectProperty(data, boundsObj, "y2", createInt32(data, regions[i].bounds.y2));
    //       setObjectProperty(data, regionObj, "bounds", boundsObj);
    //       setArrayIndex(data, resultArray, i, regionObj);
    //   }
    //   return resultArray;

    return nullptr;
}

/**
 * generateFlatBuffer(regions: Array, totalPixels: number, colorMode: number)
 *   → ArrayBuffer (RGBA pixel data)
 *
 * Takes the region data and produces a flat-color RGBA buffer.
 */
ADDON_EXPORT AddonValue addon_generateFlatBuffer(AddonData data, AddonValue args) {
    // Will extract region data from JS objects, call generateFlatBuffer(),
    // and return the resulting buffer as an ArrayBuffer.
    //
    // The tricky part is deserializing the regions array from JS objects.
    // An alternative approach: pass regions as a single packed ArrayBuffer
    // (id, count, x1, y1, x2, y2, indices...) to avoid per-object overhead.
    return nullptr;
}

/**
 * trapRegion(regionIndices: ArrayBuffer, outlineMask: ArrayBuffer,
 *            width: number, height: number, trapWidth: number)
 *   → { indices: ArrayBuffer, count: number }
 */
ADDON_EXPORT AddonValue addon_trapRegion(AddonData data, AddonValue args) {
    return nullptr;
}

/**
 * runFlatsPipeline(pixelData: ArrayBuffer, width: number, height: number,
 *                 config: Object)
 *   → { regionCount: number, flatBuffer: ArrayBuffer, layerName: string }
 *
 * The main entry point for the complete flatting pipeline.
 * This is the recommended call from JS — single round-trip, all computation
 * happens in C++, and only the final RGBA buffer comes back.
 */
ADDON_EXPORT AddonValue addon_runFlatsPipeline(AddonData data, AddonValue args) {
    // Real implementation with SDK:
    //   const uint8_t* pixels = getArrayBuffer(data, getArg(args, 0));
    //   int32_t width = getInt32(data, getArg(args, 1));
    //   int32_t height = getInt32(data, getArg(args, 2));
    //   AddonValue configObj = getArg(args, 3);
    //
    //   FlatConfig config;
    //   config.outlineThreshold = getInt32(data, getObjectProperty(data, configObj, "outlineThreshold"));
    //   config.minRegionSize = getInt32(data, getObjectProperty(data, configObj, "minRegionSize"));
    //   config.maxRegionFraction = getDouble(data, getObjectProperty(data, configObj, "maxRegionFraction"));
    //   config.trapUnderLines = getBool(data, getObjectProperty(data, configObj, "trapUnderLines"));
    //   config.trapWidth = getInt32(data, getObjectProperty(data, configObj, "trapWidth"));
    //   config.colorMode = getInt32(data, getObjectProperty(data, configObj, "colorMode"));
    //
    //   FlatsResult result = runFlatsPipeline(pixels, width, height, config);
    //
    //   AddonValue returnObj = createObject(data);
    //   setObjectProperty(data, returnObj, "regionCount", createInt32(data, result.regionCount));
    //   setObjectProperty(data, returnObj, "layerName", createString(data, result.layerName.c_str()));
    //   setObjectProperty(data, returnObj, "flatBuffer",
    //       createArrayBuffer(data, result.flatBuffer.data(), result.flatBuffer.size()));
    //   return returnObj;

    return nullptr;
}

// ─── Module initialization ─────────────────────────────────────────────────

/**
 * Called by the UXP runtime when the native addon is loaded.
 *
 * Registers all native functions so they can be called from JavaScript as:
 *   const native = require("colorflats-native");
 *   const result = native.runFlatsPipeline(pixelData, width, height, config);
 */
AddonError addonInit(AddonData data, AddonValue exports) {
    // Real implementation with the UXP SDK:
    //
    //   registerFunction(data, exports, "buildOutlineMask", addon_buildOutlineMask);
    //   registerFunction(data, exports, "floodFillRegions", addon_floodFillRegions);
    //   registerFunction(data, exports, "generateFlatBuffer", addon_generateFlatBuffer);
    //   registerFunction(data, exports, "trapRegion", addon_trapRegion);
    //   registerFunction(data, exports, "runFlatsPipeline", addon_runFlatsPipeline);
    //
    //   return kAddonErr_Ok;

    return kAddonErr_Ok;
}

/**
 * Called by the UXP runtime when the addon is being unloaded.
 * Clean up any allocated resources here.
 */
void addonCleanup(AddonData data) {
    // No global state to clean up in this module
}

// ─── PSDLLMain: Photoshop C++ SDK integration ───────────────────────────────
//
// If the Photoshop C++ SDK is available and you want to also use traditional
// C++ plugin capabilities (like filter plugins or accessing Photoshop suites),
// implement PSDLLMain. This gives you access to SPBasicSuite for acquiring
// Photoshop API suites.
//
// This is OPTIONAL — you only need this if you want to:
//   - Use Photoshop filter plugin APIs from C++
//   - Access PS color space suites, channel manipulation, etc.
//   - Create a filter that appears in the Filter menu
//
// See: https://developer.adobe.com/photoshop/uxp/2022/guides/hybrid-plugins/getting-started/#photoshop-c-sdk

#ifdef HAS_PS_CSDK

#include "SPBasic.h"

static const SPBasicSuite* gBasicSuite = nullptr;

extern "C" ADDON_EXPORT AddonError PSDLLMain(
    const char* selector,
    SPBasicSuite* spBasic,
    void* /* descriptor */
) {
    if (spBasic == nullptr) {
        return static_cast<AddonError>(1); // kSPNoError would be 0, but we got null
    }

    // Cache the basic suite for later use
    gBasicSuite = spBasic;

    // Acquire any Photoshop suites you need here
    // Example: Color Space suite
    // SPErr err = gBasicSuite->AcquireSuite(
    //     kPSColorSpaceSuite, kPSColorSpaceSuiteVersion,
    //     reinterpret_cast<const void**>(&gColorSpaceSuite));

    return static_cast<AddonError>(0);
}

#endif // HAS_PS_CSDK