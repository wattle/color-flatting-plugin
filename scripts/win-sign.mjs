#!/usr/bin/env node

/**
 * win-sign.js — Sign the Windows hybrid addon binary
 *
 * This script signs the .uxpaddon binary with an EV certificate
 * hosted via Azure Key Vault.
 *
 * Prerequisites:
 *   - EV Certificate hosted on Azure Key Vault
 *   - .env file with Azure credentials
 *
 * Usage:
 *   node scripts/win-sign.js
 */

import { existsSync } from "fs";
import { resolve } from "path";
import dotenv from "dotenv";

dotenv.config();

const ADDON_NAME = "colorflats-hybrid.uxpaddon";
const WIN_DIR = resolve(import.meta.dirname, "../public-hybrid/win");

console.log("=== ColorFlats Hybrid Addon — Windows Signing ===\n");

// TODO: Implement Windows signing with Azure Key Vault or local cert
// This is a placeholder script. Implement based on your signing infrastructure.
// See Bolt UXP's scripts/win-sign.js for a reference implementation.

const platforms = ["x64"];

for (const platform of platforms) {
  const addonPath = resolve(WIN_DIR, platform, ADDON_NAME);

  if (!existsSync(addonPath)) {
    console.log(`⚠ ${platform}: ${ADDON_NAME} not found at ${addonPath}. Build first with yarn win-build.`);
    continue;
  }

  console.log(`ℹ ${platform}: Windows signing not yet configured.`);
  console.log(`  See scripts/win-sign.js to set up EV certificate signing.`);
}

console.log("\nℹ Windows signing skipped (not configured)");