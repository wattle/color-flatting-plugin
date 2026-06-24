#!/usr/bin/env node

/**
 * mac-sign.js — Sign and notarize the macOS hybrid addon binary
 *
 * This script signs the .uxpaddon binary with your Apple Developer ID
 * certificate and notarizes it with Apple's servers.
 *
 * Prerequisites:
 *   - Apple Developer Account
 *   - Developer ID Certificate installed locally
 *   - Xcode Command Line Tools installed
 *   - .env file with APPLE_ID, APPLE_TEAM_ID, APPLE_PASSWORD, APPLE_SIGNING_IDENTITY
 *
 * Usage:
 *   node scripts/mac-sign.js
 *
 * Based on the Bolt UXP signing script:
 * https://github.com/hyperbrew/bolt-uxp
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";
import dotenv from "dotenv";

dotenv.config();

const APPLE_ID = process.env.APPLE_ID;
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const APPLE_PASSWORD = process.env.APPLE_PASSWORD;
const APPLE_SIGNING_IDENTITY = process.env.APPLE_SIGNING_IDENTITY;

const ADDON_NAME = "colorflats-hybrid.uxpaddon";
const MAC_DIR = resolve(import.meta.dirname, "../public-hybrid/mac");

function signAndNotarize(arch) {
  const addonPath = resolve(MAC_DIR, arch, ADDON_NAME);

  if (!existsSync(addonPath)) {
    console.log(`⚠ ${arch}: ${ADDON_NAME} not found at ${addonPath}. Build first with yarn mac-build.`);
    return;
  }

  console.log(`🔐 Signing ${arch} binary...`);

  // Sign the binary
  try {
    execSync(
      `codesign --force --sign "${APPLE_SIGNING_IDENTITY}" --timestamp "${addonPath}"`,
      { stdio: "inherit" }
    );
    console.log(`✓ ${arch}: Signed successfully`);
  } catch (err) {
    console.error(`✗ ${arch}: Signing failed`, err.message);
    process.exit(1);
  }

  // Notarize
  if (APPLE_ID && APPLE_TEAM_ID && APPLE_PASSWORD) {
    console.log(`📋 Notarizing ${arch} binary...`);
    try {
      // Create a temp zip for notarization
      const zipPath = resolve(MAC_DIR, `${arch}/${ADDON_NAME}.zip`);
      execSync(`cd "${resolve(MAC_DIR, arch)}" && zip -j "${zipPath}" "${ADDON_NAME}"`, { stdio: "inherit" });

      // Submit for notarization
      execSync(
        `xcrun notarytool submit "${zipPath}" --apple-id "${APPLE_ID}" --team-id "${APPLE_TEAM_ID}" --password "${APPLE_PASSWORD}" --wait`,
        { stdio: "inherit" }
      );

      // Staple the notarization ticket
      execSync(`xcrun stapler staple "${addonPath}"`, { stdio: "inherit" });

      // Clean up zip
      execSync(`rm -f "${zipPath}"`);

      console.log(`✓ ${arch}: Notarized successfully`);
    } catch (err) {
      console.error(`✗ ${arch}: Notarization failed`, err.message);
      process.exit(1);
    }
  } else {
    console.log(`⚠ ${arch}: Skipping notarization (APPLE_ID, APPLE_TEAM_ID, APPLE_PASSWORD not set)`);
  }
}

console.log("=== ColorFlats Hybrid Addon — macOS Signing & Notarization ===\n");

if (!APPLE_SIGNING_IDENTITY) {
  console.error("✗ APPLE_SIGNING_IDENTITY not set in .env");
  console.error("  Create a .env file with your Apple Developer credentials:");
  console.error("  APPLE_SIGNING_IDENTITY=\"Developer ID Application: Your Name (TEAMID)\"");
  console.error("  APPLE_ID=your@apple-id.com");
  console.error("  APPLE_TEAM_ID=YOURTEAMID");
  console.error("  APPLE_PASSWORD=app-specific-password");
  process.exit(1);
}

signAndNotarize("arm64");
signAndNotarize("x64");

console.log("\n✓ Signing complete");