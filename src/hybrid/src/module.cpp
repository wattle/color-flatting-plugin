/**
 * module.cpp — UXP Hybrid Addon module for ColorFlats
 *
 * This is the entry point for the native C++ addon loaded by the UXP runtime.
 * It registers JavaScript-callable functions that dispatch to the C++ core
 * algorithms in flats_core.cpp.
 *
 * Exposed JS functions:
 *   - buildOutlineMask(pixelData, totalPixels, threshold) → {mask, outlineCount}
 *   - runFlatsPipeline(pixelData, width, height, config) → {regionCount, flatBuffer, layerName}
 *
 * Uses the UXP Hybrid Plugin SDK (UxpAddonShared.h, UxpAddonTypes.h) and
 * utility classes (UxpAddon, UxpTask, UxpValue) for thread-safe async execution.
 *
 * Build: Xcode (macOS) or Visual Studio (Windows) → .uxpaddon binary
 */

#include <exception>
#include <stdexcept>
#include <string>
#include <cstring>
#include <vector>
#include <thread>
#include <memory>

#include "../src/api/UxpAddonShared.h"
#include "../src/api/UxpAddonTypes.h"
#include "../src/utilities/UxpAddon.h"
#include "../src/utilities/UxpTask.h"
#include "../src/utilities/UxpValue.h"
#include "../src/flats/flats_core.h"

namespace
{

    // ─── Helper: Create a JS object with properties ────────────────────────

    /**
     * Create a JS object with an int32 property.
     */
    void setInt32Property(addon_env env, addon_value obj, const char *key, int32_t value)
    {
        addon_value propName = nullptr;
        addon_value propValue = nullptr;

        Check(UxpAddonApis.uxp_addon_create_string_utf8(env, key, strlen(key), &propName));
        Check(UxpAddonApis.uxp_addon_create_int32(env, value, &propValue));
        Check(UxpAddonApis.uxp_addon_set_property(env, obj, propName, propValue));
    }

    /**
     * Create a JS object with a double property.
     */
    void setDoubleProperty(addon_env env, addon_value obj, const char *key, double value)
    {
        addon_value propName = nullptr;
        addon_value propValue = nullptr;

        Check(UxpAddonApis.uxp_addon_create_string_utf8(env, key, strlen(key), &propName));
        Check(UxpAddonApis.uxp_addon_create_double(env, value, &propValue));
        Check(UxpAddonApis.uxp_addon_set_property(env, obj, propName, propValue));
    }

    /**
     * Create a JS object with a string property.
     */
    void setStringProperty(addon_env env, addon_value obj, const char *key, const char *value)
    {
        addon_value propName = nullptr;
        addon_value propValue = nullptr;

        Check(UxpAddonApis.uxp_addon_create_string_utf8(env, key, strlen(key), &propName));
        Check(UxpAddonApis.uxp_addon_create_string_utf8(env, value, strlen(value), &propValue));
        Check(UxpAddonApis.uxp_addon_set_property(env, obj, propName, propValue));
    }

    /**
     * Create a JS object with an ArrayBuffer property.
     * Copies the data from the provided pointer into a new ArrayBuffer.
     */
    void setArrayBufferProperty(addon_env env, addon_value obj, const char *key, const void *data, size_t length)
    {
        addon_value propName = nullptr;
        addon_value propValue = nullptr;
        void *bufData = nullptr;

        Check(UxpAddonApis.uxp_addon_create_string_utf8(env, key, strlen(key), &propName));
        Check(UxpAddonApis.uxp_addon_create_arraybuffer(env, length, &bufData, &propValue));

        // Copy data into the new ArrayBuffer
        if (data != nullptr && length > 0)
        {
            std::memcpy(bufData, data, length);
        }

        Check(UxpAddonApis.uxp_addon_set_property(env, obj, propName, propValue));
    }

    /**
     * Get an int32 from a JS value at a given argument index.
     */
    int32_t getInt32Arg(addon_env env, const addon_value *argv, size_t index)
    {
        int32_t result = 0;
        Check(UxpAddonApis.uxp_addon_get_value_int32(env, argv[index], &result));
        return result;
    }

    /**
     * Get a double from a JS value at a given argument index.
     */
    double getDoubleArg(addon_env env, const addon_value *argv, size_t index)
    {
        double result = 0.0;
        Check(UxpAddonApis.uxp_addon_get_value_double(env, argv[index], &result));
        return result;
    }

    /**
     * Get an ArrayBuffer's data pointer and length from a JS value.
     */
    struct ArrayBufferInfo
    {
        void *data;
        size_t length;
    };

    ArrayBufferInfo getArrayBufferArg(addon_env env, addon_value value)
    {
        ArrayBufferInfo info = {nullptr, 0};

        bool isArrayBuffer = false;
        Check(UxpAddonApis.uxp_addon_is_arraybuffer(env, value, &isArrayBuffer));

        if (!isArrayBuffer)
        {
            // Check if it's a typed array - if so, get the underlying buffer
            bool isTypedArray = false;
            Check(UxpAddonApis.uxp_addon_is_typedarray(env, value, &isTypedArray));

            if (isTypedArray)
            {
                // Get the backing ArrayBuffer for the typed array
                addon_value arrayBuffer = nullptr;
                size_t byteOffset = 0;
                size_t byteLength = 0;

                // Use get_dataview_info which also works for typed arrays
                Check(UxpAddonApis.uxp_addon_get_dataview_info(env, value, &byteLength, &info.data, &arrayBuffer, &byteOffset));

                // Re-get from the arraybuffer itself for the full buffer
                // Actually for typed arrays, we need to get buffer info differently
                // Let's get the underlying arraybuffer
                if (arrayBuffer != nullptr)
                {
                    Check(UxpAddonApis.uxp_addon_get_arraybuffer_info(env, arrayBuffer, &info.data, &info.length));
                    // Adjust for typed array offset
                    info.data = static_cast<char *>(info.data) + byteOffset;
                    info.length = byteLength;
                }
                return info;
            }

            // Not an ArrayBuffer or typed array
            throw std::runtime_error("Expected ArrayBuffer or typed array");
        }

        Check(UxpAddonApis.uxp_addon_get_arraybuffer_info(env, value, &info.data, &info.length));
        return info;
    }

    // ─── Native function: buildOutlineMask (synchronous) ──────────────────

    /**
     * buildOutlineMask(pixelData, totalPixels, threshold)
     *
     * Takes an ArrayBuffer of RGBA pixel data, the total pixel count, and
     * a luminance threshold. Returns {mask: ArrayBuffer, outlineCount: number}.
     *
     * The mask uses: 0=fillable, 1=outline, 2=visited (after flood fill).
     */
    addon_value BuildOutlineMask(addon_env env, addon_callback_info info)
    {
        try
        {
            addon_value argv[3];
            size_t argc = 3;
            Check(UxpAddonApis.uxp_addon_get_cb_info(env, info, &argc, argv, NULL, NULL));

            if (argc < 3)
            {
                UxpAddonApis.uxp_addon_throw_error(env, NULL, "buildOutlineMask requires 3 arguments");
                return nullptr;
            }

            // Get pixel data from ArrayBuffer
            ArrayBufferInfo pixelBuf = getArrayBufferArg(env, argv[0]);

            // Get total pixels and threshold
            int32_t totalPixels = getInt32Arg(env, argv, 1);
            int32_t threshold = getInt32Arg(env, argv, 2);

            // Run the algorithm
            const uint8_t *pixelData = static_cast<const uint8_t *>(pixelBuf.data);
            MaskResult result = buildOutlineMask(pixelData, totalPixels, threshold);

            // Create return object: {mask: ArrayBuffer, outlineCount: number}
            addon_value returnObj = nullptr;
            Check(UxpAddonApis.uxp_addon_create_object(env, &returnObj));

            setArrayBufferProperty(env, returnObj, "mask", result.mask.data(), result.mask.size());
            setInt32Property(env, returnObj, "outlineCount", result.outlineCount);

            return returnObj;
        }
        catch (...)
        {
            return CreateErrorFromException(env);
        }
    }

    // ─── Native function: runFlatsPipeline (async) ───────────────────────

    /**
     * runFlatsPipeline(pixelData, width, height, config)
     *
     * Async version that runs the full flatting pipeline on a worker thread
     * to avoid blocking the host app or plugin UI.
     *
     * Config is passed as individual arguments for simplicity:
     *   runFlatsPipeline(pixelData, width, height, outlineThreshold, minRegionSize,
     *                    maxRegionFraction, trapUnderLines, trapWidth, colorMode)
     *
     * Returns a Promise that resolves to:
     *   {regionCount: number, flatBuffer: ArrayBuffer, layerName: string}
     */
    addon_value RunFlatsPipeline(addon_env env, addon_callback_info info)
    {
        try
        {
            addon_value argv[9];
            size_t argc = 9;
            Check(UxpAddonApis.uxp_addon_get_cb_info(env, info, &argc, argv, NULL, NULL));

            if (argc < 9)
            {
                UxpAddonApis.uxp_addon_throw_error(env, NULL, "runFlatsPipeline requires 9 arguments");
                return nullptr;
            }

            // Parse all arguments on the scripting thread
            ArrayBufferInfo pixelBuf = getArrayBufferArg(env, argv[0]);
            int32_t width = getInt32Arg(env, argv, 1);
            int32_t height = getInt32Arg(env, argv, 2);

            FlatConfig config;
            config.outlineThreshold = getInt32Arg(env, argv, 3);
            config.minRegionSize = getInt32Arg(env, argv, 4);
            config.maxRegionFraction = getDoubleArg(env, argv, 5);
            config.trapUnderLines = getInt32Arg(env, argv, 6) != 0;
            config.trapWidth = getInt32Arg(env, argv, 7);
            config.colorMode = getInt32Arg(env, argv, 8);

            // Copy pixel data to a shared buffer (since the JS ArrayBuffer may be GC'd)
            auto pixelDataPtr = std::make_shared<std::vector<uint8_t>>(
                static_cast<const uint8_t *>(pixelBuf.data),
                static_cast<const uint8_t *>(pixelBuf.data) + pixelBuf.length);

            // Shared pointers for the result
            auto resultPtr = std::make_shared<FlatsResult>();
            auto isErrorPtr = std::make_shared<bool>(false);
            auto errorMsgPtr = std::make_shared<std::string>();

            // Script thread handler — runs when the worker thread is done
            auto scriptThreadHandler = [resultPtr, isErrorPtr, errorMsgPtr](Task &task, addon_env env, addon_deferred deferred)
            {
                HandlerScope scope(env);

                if (*isErrorPtr)
                {
                    addon_value errorMsg = nullptr;
                    Check(UxpAddonApis.uxp_addon_create_string_utf8(env, errorMsgPtr->c_str(), errorMsgPtr->size(), &errorMsg));
                    Check(UxpAddonApis.uxp_addon_reject_deferred(env, deferred, errorMsg));
                    return;
                }

                try
                {
                    addon_value returnObj = nullptr;
                    Check(UxpAddonApis.uxp_addon_create_object(env, &returnObj));

                    setInt32Property(env, returnObj, "regionCount", resultPtr->regionCount);
                    setArrayBufferProperty(env, returnObj, "flatBuffer",
                                           resultPtr->flatBuffer.data(), resultPtr->flatBuffer.size());
                    setStringProperty(env, returnObj, "layerName", resultPtr->layerName.c_str());

                    Check(UxpAddonApis.uxp_addon_resolve_deferred(env, deferred, returnObj));
                }
                catch (...)
                {
                    addon_value errorMsg = nullptr;
                    Check(UxpAddonApis.uxp_addon_create_string_utf8(env, "Error creating return value", 28, &errorMsg));
                    Check(UxpAddonApis.uxp_addon_reject_deferred(env, deferred, errorMsg));
                }
            };

            // Main thread handler — spawns a worker thread for heavy computation
            auto mainThreadHandler = [pixelDataPtr, width, height, config, resultPtr, isErrorPtr, errorMsgPtr, scriptThreadHandler](Task &task)
            {
                try
                {
                    auto taskPtr = task.shared_from_this();

                    // Spawn a worker thread for the heavy pixel processing
                    std::thread([pixelDataPtr, width, height, config, resultPtr, isErrorPtr, errorMsgPtr, taskPtr, scriptThreadHandler]()
                                {
                        try
                        {
                            // Run the full pipeline on the worker thread
                            FlatsResult result = runFlatsPipeline(
                                pixelDataPtr->data(),
                                width,
                                height,
                                config);

                            // Move result into shared pointer
                            *resultPtr = std::move(result);
                            *isErrorPtr = false;

                            // Schedule back to scripting thread
                            taskPtr->ScheduleOnScriptingThread(scriptThreadHandler);
                        }
                        catch (const std::exception& e)
                        {
                            *errorMsgPtr = e.what();
                            *isErrorPtr = true;
                            taskPtr->ScheduleOnScriptingThread(scriptThreadHandler);
                        }
                        catch (...)
                        {
                            *errorMsgPtr = "Unknown error in runFlatsPipeline";
                            *isErrorPtr = true;
                            taskPtr->ScheduleOnScriptingThread(scriptThreadHandler);
                        } })
                        .detach();
                }
                catch (...)
                {
                    *errorMsgPtr = "Error spawning worker thread";
                    *isErrorPtr = true;
                }
            };

            auto task = Task::Create();
            return task->ScheduleOnMainThread(env, mainThreadHandler);
        }
        catch (...)
        {
            return CreateErrorFromException(env);
        }
    }

    // ─── Module initialization ─────────────────────────────────────────────

    /**
     * Called by the UXP runtime when the native addon is loaded.
     * Registers all native functions so they can be called from JavaScript.
     */
    addon_value Init(addon_env env, addon_value exports, const addon_apis &addonAPIs)
    {
        addon_status status = addon_ok;
        addon_value fn = nullptr;

        // buildOutlineMask
        {
            status = addonAPIs.uxp_addon_create_function(env, NULL, 0, BuildOutlineMask, NULL, &fn);
            if (status != addon_ok)
            {
                addonAPIs.uxp_addon_throw_error(env, NULL, "Unable to wrap native function");
            }

            status = addonAPIs.uxp_addon_set_named_property(env, exports, "buildOutlineMask", fn);
            if (status != addon_ok)
            {
                addonAPIs.uxp_addon_throw_error(env, NULL, "Unable to populate exports");
            }
        }

        // runFlatsPipeline
        {
            status = addonAPIs.uxp_addon_create_function(env, NULL, 0, RunFlatsPipeline, NULL, &fn);
            if (status != addon_ok)
            {
                addonAPIs.uxp_addon_throw_error(env, NULL, "Unable to wrap native function");
            }

            status = addonAPIs.uxp_addon_set_named_property(env, exports, "runFlatsPipeline", fn);
            if (status != addon_ok)
            {
                addonAPIs.uxp_addon_throw_error(env, NULL, "Unable to populate exports");
            }
        }

        return exports;
    }

} // namespace

/*
 * Register initialization routine
 * Invoked by UXP during uxpaddon load.
 */
UXP_ADDON_INIT(Init)

void terminate(addon_env env)
{
    try
    {
        // No global state to clean up
    }
    catch (...)
    {
    }
}

/*
 * Register addon termination routine
 * Invoked by UXP during uxpaddon un-load.
 */
UXP_ADDON_TERMINATE(terminate)