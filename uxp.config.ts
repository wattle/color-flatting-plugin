import { UXP_Manifest, UXP_Config, UXP_Config_Extra } from "vite-uxp-plugin";
import { version } from "./package.json";

const extraPrefs: UXP_Config_Extra = {
  hotReloadPort: 8081,
  webviewUi: false,
  copyZipAssets: ["public-zip/*"],
  uniqueIds: true,
  debugger: "udt",
};

const id = "com.superheropw.colorflats";
const name = "ColorFlats";

// Use manifestVersion 5 with host as an object (not array)
// PS v27 / UXP 9.3 doesn't fully support v6 host array format
const manifest: any = {
  id,
  name,
  version,
  main: "index.html",
  manifestVersion: 6,
  host: [
    {
      app: "PS",
      minVersion: "24.2.0",
    },
  ],
  entrypoints: [
    {
      type: "panel",
      id: `${id}.main`,
      label: {
        default: name,
      },
      minimumSize: { width: 280, height: 400 },
      maximumSize: { width: 600, height: 2000 },
      preferredDockedSize: { width: 300, height: 500 },
      preferredFloatingSize: { width: 400, height: 600 },
      icons: [
        {
          width: 23,
          height: 23,
          path: "icons/dark.png",
          scale: [1, 2],
          theme: ["darkest", "dark", "medium"],
        },
        {
          width: 23,
          height: 23,
          path: "icons/light.png",
          scale: [1, 2],
          theme: ["lightest", "light"],
        },
      ],
    },
  ],
  featureFlags: {
    enableAlerts: true,
  },
  requiredPermissions: {
    localFileSystem: "fullAccess",
    launchProcess: {
      schemes: ["https", "file"],
      extensions: [".psd", ".png", ".jpg"],
    },
    network: {
      domains: [`ws://localhost:${extraPrefs.hotReloadPort}`],
    },
    clipboard: "readAndWrite",
    allowCodeGenerationFromStrings: true,
    allowEnterDebugger: true,
    enableAddon: true,
  },
  addon: {
    name: "colorflats-hybrid.uxpaddon",
  },
  icons: [
    {
      width: 48,
      height: 48,
      path: "icons/plugin-icon.png",
      scale: [1, 2],
      theme: ["darkest", "dark", "medium", "lightest", "light", "all"],
      species: ["pluginList"],
    },
  ],
};

export const config: UXP_Config = {
  manifest,
  ...extraPrefs,
};