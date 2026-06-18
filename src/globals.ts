/// <reference path="./vite-env.d.ts" />
/// <reference types="@adobe/cc-ext-uxp-types/uxp" />

if (typeof require === "undefined") {
  //@ts-ignore
  window.require = (moduleName: string) => {
    return {};
  };
}

//@ts-ignore - UXP runtime modules
export const uxp = require("uxp") as typeof import("uxp");
//@ts-ignore - UXP runtime modules
export const os = require("os") as typeof import("os");
//@ts-ignore - UXP runtime modules
export const photoshop = require("photoshop") as typeof import("photoshop");