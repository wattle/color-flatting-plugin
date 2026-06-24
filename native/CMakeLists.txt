cmake_minimum_required(VERSION 3.16)
project(colorflats-native VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# UXP Hybrid Plugin SDK path — set this to where you extracted the SDK
# Download from: https://developer.adobe.com/console/servicesandapis/ps
set(UXP_SDK_PATH "" CACHE PATH "Path to UXP Hybrid Plugin SDK root")
set(PS_CSDK_PATH "" CACHE PATH "Path to Photoshop C++ SDK root (optional, for PIUXPSuite)")

# Source files
set(SOURCES
    src/module.cpp
    src/flats_core.cpp
)

set(HEADERS
    include/flats_core.h
    include/module.h
)

# Shared library output
add_library(colorflats-native SHARED ${SOURCES} ${HEADERS})

target_include_directories(colorflats-native
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
        ${UXP_SDK_PATH}
)

# Link UXP addon API if SDK is available
if(UXP_SDK_PATH AND EXISTS "${UXP_SDK_PATH}/include")
    target_include_directories(colorflats-native PRIVATE "${UXP_SDK_PATH}/include")
    target_link_directories(colorflats-native PRIVATE "${UXP_SDK_PATH}/lib")
endif()

# Photoshop C++ SDK for PIUXPSuite messaging (optional)
if(PS_CSDK_PATH AND EXISTS "${PS_CSDK_PATH}/common/includes")
    target_include_directories(colorflats-native PRIVATE "${PS_CSDK_PATH}/common/includes")
    target_compile_definitions(colorflats-native PRIVATE HAS_PS_CSDK=1)
endif()

# Platform-specific settings
if(APPLE)
    # Build as universal binary for arm64 + x86_64
    set(CMAKE_OSX_ARCHITECTURES "x86_64;arm64" CACHE STRING "Mac architectures" FORCE)
    # No .so extension on macOS
    set_target_properties(colorflats-native PROPERTIES
        PREFIX ""
        SUFFIX ".dylib"
    )
    # Code signing (override with -D_CODESIGN_IDENTITY=...)
    if(_CODESIGN_IDENTITY)
        add_custom_command(TARGET colorflats-native POST_BUILD
            COMMAND codesign --force --sign "${_CODESIGN_IDENTITY}" $<TARGET_FILE:colorflats-native>
        )
    endif()
elseif(WIN32)
    set_target_properties(colorflats-native PROPERTIES
        PREFIX ""
        SUFFIX ".dll"
    )
endif()

# Disable MSVC specific warnings
if(MSVC)
    target_compile_options(colorflats-native PRIVATE /W4 /WX /wd4996)
else()
    target_compile_options(colorflats-native PRIVATE -Wall -Wextra -Werror -Wno-unused-parameter)
endif()

# Install targets
install(TARGETS colorflats-native
    LIBRARY DESTINATION ${CMAKE_CURRENT_SOURCE_DIR}/../native/mac-arm64  # Default, overridden per-platform
)