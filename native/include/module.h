/**
 * module.h — UXP Hybrid Addon module registration
 *
 * Declares the exported functions that the UXP runtime will call
 * to register the native addon and its callable JS functions.
 */

#ifndef MODULE_H
#define MODULE_H

#include <cstdint>

// UXP Addon API types — these are defined by the UXP Hybrid Plugin SDK
// and provided in the SDK's header files. For compilation without the
// SDK present, we provide forward declarations.

#ifndef UXP_ADDON_TYPES_DEFINED
#define UXP_ADDON_TYPES_DEFINED

// Opaque value type used by the UXP addon runtime
typedef void* AddonValue;
typedef struct AddonData_s* AddonData;

// Return status codes
typedef enum {
    kAddonErr_Ok = 0,
    kAddonErr_Error = 1,
    kAddonErr_InvalidArgs = 2,
    kAddonErr_NotFound = 3,
    kAddonErr_NoMemory = 4,
} AddonError;

// Value types
typedef enum {
    kAddonType_Undefined = 0,
    kAddonType_Null = 1,
    kAddonType_Bool = 2,
    kAddonType_Number = 3,
    kAddonType_String = 4,
    kAddonType_Object = 5,
    kAddonType_Array = 6,
    kAddonType_Buffer = 7,
    kAddonType_Function = 8,
} AddonType;

#endif // UXP_ADDON_TYPES_DEFINED

// ─── Exported module entry points ───────────────────────────────────────────

/**
 * Called by UXP runtime when the addon is loaded.
 * Register all native functions here.
 *
 * @param exports  The exports object to attach functions to
 * @return kAddonErr_Ok on success
 */
AddonError addonInit(AddonData data, AddonValue exports);

/**
 * Called by UXP runtime when the addon is being unloaded.
 * Clean up any resources here.
 */
void addonCleanup(AddonData data);

#endif // MODULE_H