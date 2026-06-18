import { photoshop, uxp } from "../globals";
import { polyFillGlobalErrorHandler } from "./errors";
import { getColorScheme, polyfillUXPVars } from "./themes";

export { getColorScheme };

export const getUXPInfo = async () => {
  const info = {
    version: uxp.versions.uxp as string,
    hostName: uxp.host.name.toLowerCase() as string,
    hostVersion: uxp.host.version as string,
  };
  return info;
};

/** Layer info for the dropdown */
export interface LayerInfo {
  id: number;
  name: string;
  visible: boolean;
  kind: string;
  isGroup: boolean;
}

/**
 * Safely get document info without executeAsModal.
 * Accessing photoshop.app properties is generally safe outside modal context;
 * executeAsModal is only needed for mutations (creating layers, pixel ops).
 */
export const getDocInfo = async () => {
  try {
    const doc = photoshop.app.activeDocument;
    if (!doc) return null;

    let layers: LayerInfo[] = [];
    let activeLayerId = -1;
    let activeLayerName = "None";
    let layerCount = 0;

    try {
      // Get top-level layers only (no recursion into groups)
      const topLayers = doc.layers;
      layerCount = topLayers.length;

      // Flatten one level deep to show group children
      for (const layer of topLayers) {
        try {
          const isGroup = !!layer.layers;
          layers.push({
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            kind: isGroup ? "group" : String(layer.kind || "pixel"),
            isGroup,
          });

          // Show children of groups (one level deep)
          if (isGroup && layer.layers) {
            for (const child of layer.layers) {
              try {
                const childIsGroup = !!child.layers;
                layers.push({
                  id: child.id,
                  name: `  ↳ ${child.name}`,
                  visible: child.visible,
                  kind: childIsGroup ? "group" : String(child.kind || "pixel"),
                  isGroup: childIsGroup,
                });
              } catch {
                // Skip layers we can't read
              }
            }
          }
        } catch {
          // Skip layers we can't read
        }
      }

      // Get active layer
      const activeLayers = doc.activeLayers;
      if (activeLayers && activeLayers.length > 0) {
        activeLayerId = activeLayers[0].id;
        activeLayerName = activeLayers[0].name;
      }
    } catch (layerErr) {
      console.warn("[ColorFlats] Could not read layers:", layerErr);
    }

    return {
      name: doc.name,
      width: doc.width,
      height: doc.height,
      layerName: activeLayerName,
      layerCount,
      layers,
      activeLayerId,
    };
  } catch (e: any) {
    // No document open or can't access it
    console.warn("[ColorFlats] getDocInfo:", e?.message || String(e));
    return null;
  }
};

export const initUXP = () => {
  polyFillGlobalErrorHandler();
  polyfillUXPVars();
};