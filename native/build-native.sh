#!/bin/bash
# build-native.sh — Build the ColorFlats C++ native addon for all platforms
#
# Prerequisites:
#   - CMake 3.16+
#   - UXP Hybrid Plugin SDK (download from https://developer.adobe.com/console/servicesandapis/ps)
#   - Photoshop C++ SDK (optional, for PIUXPSuite messaging)
#
# Usage:
#   ./build-native.sh                    # Build for current platform
#   ./build-native.sh --uxp-sdk /path/to/sdk  # Build with SDK path
#   ./native/build-native.sh --all       # Build for all platforms (requires cross-compilation setup)
#
# For distribution, you need binaries for:
#   - macOS arm64 (Apple Silicon)
#   - macOS x86_64 (Intel Mac)
#   - Windows x64
#
# macOS universal binary: Build with -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64"
# Windows: Must build on Windows with Visual Studio

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
UXP_SDK_PATH="${UXP_SDK_PATH:-}"
PS_CSDK_PATH="${PS_CSDK_PATH:-}"

# Parse args
BUILD_TYPE="Release"
BUILD_ALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --uxp-sdk)
            UXP_SDK_PATH="$2"
            shift 2
            ;;
        --ps-csdk)
            PS_CSDK_PATH="$2"
            shift 2
            ;;
        --debug)
            BUILD_TYPE="Debug"
            shift
            ;;
        --all)
            BUILD_ALL=true
            shift
            ;;
        --clean)
            rm -rf "${BUILD_DIR}"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--uxp-sdk PATH] [--ps-csdk PATH] [--debug] [--all] [--clean]"
            exit 1
            ;;
    esac
done

echo "=== ColorFlats Native Addon Build ==="
echo "Build type: ${BUILD_TYPE}"
echo "UXP SDK: ${UXP_SDK_PATH:-not set}"
echo "PS CSDK: ${PS_CSDK_PATH:-not set}"

# macOS build (universal binary)
build_macos() {
    local BUILD_DIR_MAC="${BUILD_DIR}/macos"
    mkdir -p "${BUILD_DIR_MAC}"
    
    echo ""
    echo "--- Building for macOS (universal: arm64 + x86_64) ---"
    
    cmake -S "${SCRIPT_DIR}" -B "${BUILD_DIR_MAC}" \
        -DCMAKE_BUILD_TYPE="${BUILD_TYPE}" \
        -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64" \
        ${UXP_SDK_PATH:+-DUXP_SDK_PATH="${UXP_SDK_PATH}"} \
        ${PS_CSDK_PATH:+-DPS_CSDK_PATH="${PS_CSDK_PATH}"} \
        -DCMAKE_INSTALL_PREFIX="${SCRIPT_DIR}/mac-universal"
    
    cmake --build "${BUILD_DIR_MAC}" --config "${BUILD_TYPE}" -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
    
    # Copy output to platform-specific directories
    mkdir -p "${SCRIPT_DIR}/mac-arm64"
    mkdir -p "${SCRIPT_DIR}/mac-x64"
    
    # The universal binary goes to both dirs (UXP runtime picks the right one)
    if [ -f "${BUILD_DIR_MAC}/colorflats-native.dylib" ]; then
        cp "${BUILD_DIR_MAC}/colorflats-native.dylib" "${SCRIPT_DIR}/mac-arm64/"
        cp "${BUILD_DIR_MAC}/colorflats-native.dylib" "${SCRIPT_DIR}/mac-x64/"
        echo "✓ Built: mac-arm64/colorflats-native.dylib"
        echo "✓ Built: mac-x64/colorflats-native.dylib"
    else
        echo "✗ Build output not found. Check CMake configuration."
        echo "  Expected: ${BUILD_DIR_MAC}/colorflats-native.dylib"
        echo ""
        echo "  If you don't have the UXP SDK, set UXP_SDK_PATH:"
        echo "    ./build-native.sh --uxp-sdk /path/to/uxp-hybrid-sdk"
        echo ""
        echo "  You can still develop and test with the pure-JS fallback."
    fi
}

# Windows build (must run on Windows)
build_windows() {
    local BUILD_DIR_WIN="${BUILD_DIR}/windows"
    mkdir -p "${BUILD_DIR_WIN}"
    
    echo ""
    echo "--- Building for Windows x64 ---"
    
    # Check if we're on Windows
    if [[ "$(uname -s)" != MINGW* ]] && [[ "$(uname -s)" != MSYS* ]] && [[ "$(uname -s)" != CYGWIN* ]]; then
        echo "⚠ Windows build must be run on Windows. Skipping."
        echo "  Build on a Windows machine with Visual Studio 2022."
        return
    fi
    
    cmake -S "${SCRIPT_DIR}" -B "${BUILD_DIR_WIN}" \
        -G "Visual Studio 17 2022" -A x64 \
        ${UXP_SDK_PATH:+-DUXP_SDK_PATH="${UXP_SDK_PATH}"} \
        ${PS_CSDK_PATH:+-DPS_CSDK_PATH="${PS_CSDK_PATH}"}
    
    cmake --build "${BUILD_DIR_WIN}" --config "${BUILD_TYPE}"
    
    mkdir -p "${SCRIPT_DIR}/win-x64"
    if [ -f "${BUILD_DIR_WIN}/${BUILD_TYPE}/colorflats-native.dll" ]; then
        cp "${BUILD_DIR_WIN}/${BUILD_TYPE}/colorflats-native.dll" "${SCRIPT_DIR}/win-x64/"
        echo "✓ Built: win-x64/colorflats-native.dll"
    fi
}

# Build
if [[ "$(uname -s)" == Darwin ]]; then
    build_macos
    if [ "$BUILD_ALL" = true ]; then
        build_windows
    fi
elif [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]]; then
    build_windows
else
    echo "Unsupported platform: $(uname -s)"
    echo "Supported: macOS (Darwin), Windows (MINGW/MSYS)"
fi

echo ""
echo "=== Build Complete ==="
echo ""
echo "Platform binaries:"
ls -la "${SCRIPT_DIR}"/mac-arm64/*.dylib 2>/dev/null || echo "  mac-arm64: not built"
ls -la "${SCRIPT_DIR}"/mac-x64/*.dylib 2>/dev/null || echo "  mac-x64: not built"
ls -la "${SCRIPT_DIR}"/win-x64/*.dll 2>/dev/null || echo "  win-x64: not built"
echo ""
echo "For distribution, macOS binaries must be signed and notarized."
echo "See native/README.md for packaging instructions."