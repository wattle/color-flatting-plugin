import React, { useEffect, useState, useCallback, useRef } from "react";
import { getDocInfo, LayerInfo } from "./api/uxp";
import {
  hybridGenerateColorFlats,
  hybridAnalyzeOutlines,
  initNativeBridge,
  isNativeAvailable,
  DEFAULT_CONFIG,
  FlatConfig,
} from "./lib/native-bridge";

const LOG_PREFIX = "[ColorFlats]";

/** Maximum document dimension (in either direction) we'll process */
const MAX_DOC_DIMENSION = 5200;

export const App = () => {
  const [config, setConfig] = useState<FlatConfig>({ ...DEFAULT_CONFIG });
  const [status, setStatus] = useState<string>("Ready");
  const [nativeStatus, setNativeStatus] = useState<string>("Checking...");
  const [isProcessing, setIsProcessing] = useState(false);
  const [docInfo, setDocInfo] = useState<{
    name: string;
    width: number;
    height: number;
    layerName: string;
    layers: LayerInfo[];
    activeLayerId: number;
  } | null>(null);
  const [regionCount, setRegionCount] = useState<number | null>(null);
  const [outlineInfo, setOutlineInfo] = useState<{
    outlinePixels: number;
    totalPixels: number;
    regionsFound: number;
  } | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const refreshDocInfo = useCallback(async () => {
    console.log(LOG_PREFIX, "refreshDocInfo: starting");
    try {
      const info = await getDocInfo();
      console.log(LOG_PREFIX, "refreshDocInfo: got info", info ? { name: info.name, w: info.width, h: info.height, layers: info.layers?.length, activeId: info.activeLayerId } : null);
      setDocInfo(info);
      if (info && info.activeLayerId >= 0 && configRef.current.selectedLayerId === -1) {
        console.log(LOG_PREFIX, "refreshDocInfo: setting selectedLayerId to", info.activeLayerId);
        setConfig((prev) => ({
          ...prev,
          selectedLayerId: info.activeLayerId,
        }));
      }
    } catch (e: any) {
      console.error(LOG_PREFIX, "refreshDocInfo error:", e?.message || String(e));
      setDocInfo(null);
    }
  }, []);

  // Initial load — initialize native bridge first
  useEffect(() => {
    console.log(LOG_PREFIX, "App: initial mount");
    initNativeBridge();
    setNativeStatus(isNativeAvailable() ? "✓ C++ native" : "JS only");
    console.log(LOG_PREFIX, `Native addon: ${isNativeAvailable() ? "available" : "not available"}`);
    refreshDocInfo();
  }, [refreshDocInfo]);

  // Check if document dimensions are too large
  const isDocTooLarge = docInfo && (
    docInfo.width > MAX_DOC_DIMENSION || docInfo.height > MAX_DOC_DIMENSION
  );

  const handleGenerateFlats = async () => {
    if (!docInfo) return;
    if (isDocTooLarge) {
      setStatus(`✗ Document too large (max ${MAX_DOC_DIMENSION}px per side).`);
      return;
    }

    console.log(LOG_PREFIX, "handleGenerateFlats: starting with config", {
      layerId: config.selectedLayerId,
      threshold: config.outlineThreshold,
      minSize: config.minRegionSize,
      maxFrac: config.maxRegionFraction,
      colorMode: config.colorMode,
      trap: config.trapUnderLines,
      trapWidth: config.trapWidth,
    });

    setIsProcessing(true);
    setStatus("Reading outline layer...");
    setRegionCount(null);
    setOutlineInfo(null);

    try {
      console.log(LOG_PREFIX, "handleGenerateFlats: calling generateColorFlats...");
      const result = await hybridGenerateColorFlats(config);
      console.log(LOG_PREFIX, "handleGenerateFlats: got result", result);
      setRegionCount(result.regionCount);
      const engineTag = result.usedNative ? " (C++)" : " (JS)";
      setStatus(`✓ Created ${result.regionCount} flat regions on "${result.layerName}" layer${engineTag}`);
      setTimeout(() => refreshDocInfo(), 500);
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.error(LOG_PREFIX, "handleGenerateFlats error:", msg, error);
      setStatus(`✗ Error: ${msg}`);
    } finally {
      setIsProcessing(false);
      console.log(LOG_PREFIX, "handleGenerateFlats: done");
    }
  };

  const handleAnalyze = async () => {
    if (!docInfo) return;
    if (isDocTooLarge) {
      setStatus(`✗ Document too large (max ${MAX_DOC_DIMENSION}px per side).`);
      return;
    }

    console.log(LOG_PREFIX, "handleAnalyze: starting with config", {
      layerId: config.selectedLayerId,
      threshold: config.outlineThreshold,
      minSize: config.minRegionSize,
      maxFrac: config.maxRegionFraction,
    });

    setIsProcessing(true);
    setStatus("Analyzing outlines...");
    setOutlineInfo(null);

    try {
      console.log(LOG_PREFIX, "handleAnalyze: calling analyzeOutlines...");
      const result = await hybridAnalyzeOutlines(config);
      console.log(LOG_PREFIX, "handleAnalyze: got result", result);
      setOutlineInfo(result);
      const engineTag = result.usedNative ? " (C++)" : " (JS)";
      setStatus(`✓ Found ${result.regionsFound} flappable regions (${result.outlinePixels.toLocaleString()} outline pixels)${engineTag}`);
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.error(LOG_PREFIX, "handleAnalyze error:", msg, error);
      setStatus(`✗ Error: ${msg}`);
    } finally {
      setIsProcessing(false);
      console.log(LOG_PREFIX, "handleAnalyze: done");
    }
  };

  const selectableLayers = docInfo?.layers?.filter((l) => !l.isGroup) || [];
  const selectedLayerName = docInfo?.layers?.find(
    (l) => l.id === config.selectedLayerId
  )?.name || "Active Layer";

  return (
    <main className="colorflats-panel">
      {/* Header */}
      <div className="header">
        <sp-icon size="l" name="colorFill"></sp-icon>
        <h2>ColorFlats</h2>
      </div>

      {/* Document Info */}
      <div className="section doc-info">
        {docInfo ? (
          <>
            <div className="doc-detail">
              <span className="label">Document:</span>
              <span className="value">{docInfo.name}</span>
            </div>
            <div className="doc-detail">
              <span className="label">Size:</span>
              <span className="value">{docInfo.width} × {docInfo.height}px</span>
            </div>
            {isDocTooLarge && (
              <div className="doc-detail warning">
                ⚠ Large document — analysis may be slow or fail
              </div>
            )}
            <sp-button variant="secondary" size="s" onClick={refreshDocInfo}>
              ↻ Refresh
            </sp-button>
          </>
        ) : (
          <>
            <div className="doc-detail warning">No document open</div>
            <sp-button variant="secondary" size="s" onClick={refreshDocInfo}>
              ↻ Retry
            </sp-button>
          </>
        )}
      </div>

      <sp-divider size="s"></sp-divider>

      {/* Layer Selection */}
      <div className="section">
        <h3 className="section-title">Outline Layer</h3>
        {docInfo && selectableLayers.length > 0 ? (
          <div className="setting-row">
            <label htmlFor="layerSelect">Select layer to flat:</label>
            <select
              id="layerSelect"
              value={config.selectedLayerId}
              onChange={(e) =>
                setConfig({ ...config, selectedLayerId: parseInt(e.target.value) })
              }
              disabled={isProcessing}
            >
              {selectableLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name} {!layer.visible ? "(hidden)" : ""}
                </option>
              ))}
            </select>
            <div className="hint">
              Choose the layer containing your line art / outlines
            </div>
          </div>
        ) : (
          <div className="hint">
            {docInfo ? "No valid layers found" : "Open a document to see layers"}
          </div>
        )}
      </div>

      <sp-divider size="s"></sp-divider>

      {/* Settings */}
      <div className="section">
        <h3 className="section-title">Outline Detection</h3>

        <div className="setting-row">
          <label htmlFor="threshold">Outline Threshold</label>
          <div className="slider-row">
            <input
              type="range"
              id="threshold"
              min="10"
              max="200"
              value={config.outlineThreshold}
              onChange={(e) =>
                setConfig({ ...config, outlineThreshold: parseInt(e.target.value) })
              }
            />
            <span className="slider-value">{config.outlineThreshold}</span>
          </div>
          <div className="hint">Pixels with luminance below this are treated as outline</div>
        </div>

        <div className="setting-row">
          <label htmlFor="minSize">Min Region Size</label>
          <div className="slider-row">
            <input
              type="range"
              id="minSize"
              min="10"
              max="1000"
              step="10"
              value={config.minRegionSize}
              onChange={(e) =>
                setConfig({ ...config, minRegionSize: parseInt(e.target.value) })
              }
            />
            <span className="slider-value">{config.minRegionSize}</span>
          </div>
          <div className="hint">Ignore regions smaller than this many pixels</div>
        </div>

        <div className="setting-row">
          <label htmlFor="maxFraction">Max Region Fraction</label>
          <div className="slider-row">
            <input
              type="range"
              id="maxFraction"
              min="0.1"
              max="0.9"
              step="0.05"
              value={config.maxRegionFraction}
              onChange={(e) =>
                setConfig({ ...config, maxRegionFraction: parseFloat(e.target.value) })
              }
            />
            <span className="slider-value">{Math.round(config.maxRegionFraction * 100)}%</span>
          </div>
          <div className="hint">Regions larger than this % of image are background</div>
        </div>
      </div>

      <sp-divider size="s"></sp-divider>

      {/* Color Settings */}
      <div className="section">
        <h3 className="section-title">Flat Colors</h3>

        <div className="setting-row">
          <label htmlFor="colorMode">Color Mode</label>
          <select
            id="colorMode"
            value={config.colorMode}
            onChange={(e) =>
              setConfig({ ...config, colorMode: e.target.value as FlatConfig["colorMode"] })
            }
          >
            <option value="pastel">Pastel</option>
            <option value="saturated">Saturated</option>
            <option value="muted">Muted</option>
            <option value="rainbow">Rainbow</option>
          </select>
        </div>
      </div>

      <sp-divider size="s"></sp-divider>

      {/* Trapping */}
      <div className="section">
        <h3 className="section-title">Trapping</h3>

        <div className="setting-row checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={config.trapUnderLines}
              onChange={(e) =>
                setConfig({ ...config, trapUnderLines: e.target.checked })
              }
            />
            <span>Trap Under Lines</span>
          </label>
          <div className="hint">Expand flats slightly under outlines to prevent gaps</div>
        </div>

        {config.trapUnderLines && (
          <div className="setting-row">
            <label htmlFor="trapWidth">Trap Width</label>
            <div className="slider-row">
              <input
                type="range"
                id="trapWidth"
                min="1"
                max="5"
                value={config.trapWidth}
                onChange={(e) =>
                  setConfig({ ...config, trapWidth: parseInt(e.target.value) })
                }
              />
              <span className="slider-value">{config.trapWidth}px</span>
            </div>
          </div>
        )}
      </div>

      <sp-divider size="s"></sp-divider>

      {/* Actions */}
      <div className="section actions">
        <sp-button
          variant="primary"
          onClick={handleAnalyze}
          disabled={isProcessing || !docInfo}
        >
          Analyze
        </sp-button>
        <sp-button
          variant="cta"
          onClick={handleGenerateFlats}
          disabled={isProcessing || !docInfo}
        >
          Generate Flats
        </sp-button>
      </div>

      {/* Results */}
      {outlineInfo && (
        <div className="section results">
          <h3 className="section-title">Analysis Results</h3>
          <div className="result-row">
            <span>Outline Pixels:</span>
            <span>{outlineInfo.outlinePixels.toLocaleString()}</span>
          </div>
          <div className="result-row">
            <span>Total Pixels:</span>
            <span>{outlineInfo.totalPixels.toLocaleString()}</span>
          </div>
          <div className="result-row">
            <span>Regions Found:</span>
            <span className="result-highlight">{outlineInfo.regionsFound}</span>
          </div>
        </div>
      )}

      {regionCount !== null && (
        <div className="section results success">
          <sp-icon name="checkmarkCircle" size="s"></sp-icon>
          <span>Created <strong>{regionCount}</strong> flat color regions on layer "<strong>Color Flats</strong>"</span>
        </div>
      )}

      {/* Engine Status */}
      <div className="section engine-status">
        <div className="doc-detail">
          <span className="label">Engine:</span>
          <span className={`value ${isNativeAvailable() ? "native-available" : "native-unavailable"}`}>
            {nativeStatus}
          </span>
        </div>
        {!isNativeAvailable() && (
          <div className="hint">
            Install the native addon for faster processing. See native/README.md.
          </div>
        )}
      </div>

      {/* Status */}
      <div className="status-bar">
        <span className={isProcessing ? "processing" : ""}>
          {isProcessing && <sp-icon name="progressCircle" size="s"></sp-icon>}
          {status}
        </span>
      </div>
    </main>
  );
};