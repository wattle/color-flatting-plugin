import { os, uxp } from "../globals";
import { photoshop } from "./themes-data";

const colorTable = {
  dark: {
    "--uxp-host-background-color": "#535353",
    "--uxp-host-text-color": "#ffffff",
    "--uxp-host-border-color": "#454545",
    "--uxp-host-link-text-color": "#4b9cf5",
    "--uxp-host-widget-hover-background-color": "#5b5b5b",
    "--uxp-host-widget-hover-text-color": "#ffffff",
    "--uxp-host-widget-hover-border-color": "#5b5b5b",
    "--uxp-host-text-color-secondary": "#e5e5e5",
    "--uxp-host-link-hover-text-color": "#ffffff",
    "--uxp-host-label-text-color": "#ffffff",
  },
  darkest: {
    "--uxp-host-background-color": "#292929",
    "--uxp-host-text-color": "#ffffff",
    "--uxp-host-border-color": "#292929",
    "--uxp-host-link-text-color": "#4b9cf5",
    "--uxp-host-widget-hover-background-color": "#3d3d3d",
    "--uxp-host-widget-hover-text-color": "#ffffff",
    "--uxp-host-widget-hover-border-color": "#3d3d3d",
    "--uxp-host-text-color-secondary": "#9b9b9b",
    "--uxp-host-link-hover-text-color": "#ffffff",
    "--uxp-host-label-text-color": "#ffffff",
  },
  light: {
    "--uxp-host-background-color": "#b8b8b8",
    "--uxp-host-text-color": "#424242",
    "--uxp-host-border-color": "#9c9c9c",
    "--uxp-host-link-text-color": "#4b9cf5",
    "--uxp-host-widget-hover-background-color": "#9d9d9d",
    "--uxp-host-widget-hover-text-color": "#424242",
    "--uxp-host-widget-hover-border-color": "#9d9d9d",
    "--uxp-host-text-color-secondary": "#424242",
    "--uxp-host-link-hover-text-color": "#424242",
    "--uxp-host-label-text-color": "#424242",
  },
  lightest: {
    "--uxp-host-background-color": "#f0f0f0",
    "--uxp-host-text-color": "#4b4b4b",
    "--uxp-host-border-color": "#d1d1d1",
    "--uxp-host-link-text-color": "#4b9cf5",
    "--uxp-host-widget-hover-background-color": "#cecece",
    "--uxp-host-widget-hover-text-color": "#4b4b4b",
    "--uxp-host-widget-hover-border-color": "#cecece",
    "--uxp-host-text-color-secondary": "#606060",
    "--uxp-host-link-hover-text-color": "#4b4b4b",
    "--uxp-host-label-text-color": "#4b4b4b",
  },
};

export const getColorScheme = async () => {
  // document.theme may not exist in all UXP contexts
  const docTheme = (document as any).theme;
  const theme: "light" | "dark" | "lightest" | "darkest" =
    docTheme && typeof docTheme.getCurrent === "function"
      ? docTheme.getCurrent()
      : "dark";
  let colors: Record<string, string> = colorTable[theme] || colorTable["dark"];
  const platform = os.platform ? os.platform() : "";
  const hostName = uxp.host.name.toLowerCase().replace(/\s/g, "") || "";

  if (hostName.startsWith("photoshop")) {
    const macTheme = photoshop.mac[theme as keyof typeof photoshop.mac] || photoshop.mac["dark"];
    const winTheme = photoshop.win[theme as keyof typeof photoshop.win] || photoshop.win["dark"];
    if (platform === "darwin") colors = macTheme as Record<string, string>;
    else if (platform.includes("win")) colors = winTheme as Record<string, string>;
  }

  return { theme, colors };
};

export const updateColorScheme = (val: {
  theme: string;
  colors: Record<string, string>;
}) => {
  const { theme, colors } = val;
  const root = document.querySelector(":root") as HTMLElement;
  for (const key in colors) {
    const color = colors[key];
    root.style.setProperty(key, color);
  }
  document.documentElement.dataset.theme = theme;
};

export const polyfillUXPVars = () => {
  const hostName = uxp.host.name.toLowerCase().replace(/\s/g, "") || "";
  if (hostName.includes("photoshop")) return;

  const docTheme = (document as any).theme;
  if (!docTheme || typeof docTheme.getCurrent !== "function") return;

  getColorScheme().then((scheme) => {
    updateColorScheme(scheme);
  }).catch((e) => {
    console.warn("[ColorFlats] Failed to get color scheme:", e);
  });

  if (docTheme.onUpdated && typeof docTheme.onUpdated.addListener === "function") {
    docTheme.onUpdated.addListener(() =>
      getColorScheme().then((scheme) => {
        updateColorScheme(scheme);
      }).catch((e) => {
        console.warn("[ColorFlats] Failed to update color scheme:", e);
      })
    );
  }
};