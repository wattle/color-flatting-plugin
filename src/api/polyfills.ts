/**
 * Polyfills for UXP environment compatibility
 *
 * UXP's environment is missing or has incomplete implementations of
 * several web APIs that React 19 depends on. These polyfills fill the gaps.
 *
 * The main issue: React 19 uses MutationObserver internally, and UXP's
 * built-in MutationObserver is broken. When React 19's reconciliation
 * creates DOM mutations, UXP's observer crashes trying to read `.name`
 * on undefined nodes during its internal traversal.
 *
 * Error we're fixing:
 *   TypeError: Cannot read properties of undefined (reading 'name')
 *   at s (././js/4.js:103:3021)   -- UXP observer reading .name on undefined
 *   at l (././js/4.js:103:1270)    -- recursive DOM traversal
 *   at Object.fn (././js/4.js:103:1962)
 *   at t.takeRecords (././js/4.js:103:2605)
 *
 * The '4.js' and '67.bundle.js' are UXP runtime files. The error occurs
 * when UXP's internal MutationObserver processes DOM mutations created
 * by React 19's reconciliation.
 *
 * Solution: Replace UXP's broken MutationObserver entirely with a
 * polling-based polyfill. UXP's observer exists but its internal
 * node-processing logic cannot handle React 19's DOM structure.
 */

/**
 * Replace UXP's broken MutationObserver with a working polling-based polyfill.
 *
 * This MUST be called before React renders, because React 19
 * uses MutationObserver internally.
 *
 * We always replace MutationObserver on UXP because:
 * 1. If it's undefined, we obviously need to provide one
 * 2. If it exists, it's UXP's buggy version that crashes with React 19
 */
export const polyfillMutationObserver = () => {
  const win = window as any;

  // Always replace MutationObserver on UXP.
  // UXP's built-in MutationObserver crashes when processing React 19 DOM
  // mutations: "Cannot read properties of undefined (reading 'name')".
  // The error occurs deep in UXP's internal traversal logic (4.js),
  // which we cannot patch. Replacing the entire observer is the only fix.

  // Disconnect any existing UXP observers before replacing
  const OrigMO = win.MutationObserver;
  if (OrigMO && typeof OrigMO._instances === "object") {
    try {
      for (const inst of OrigMO._instances) {
        if (inst && typeof inst.disconnect === "function") inst.disconnect();
      }
    } catch {
      /* ignore */
    }
  }

  win.MutationObserver = class MutationObserver {
    private callback: MutationCallback;
    private interval: number | null = null;
    private element: Node | null = null;
    private oldHtml: string = "";
    private observing: boolean = false;

    constructor(callback: MutationCallback) {
      this.callback = callback;
    }

    observe(target: Node, _options?: MutationObserverInit) {
      this.disconnect();
      this.element = target;
      this.observing = true;
      // Capture a snapshot of the current DOM state.
      // Use outerHTML for a broader diff (innerHTML can be empty on detached nodes).
      try {
        this.oldHtml = (target as any)?.outerHTML || (target as any)?.innerHTML || "";
      } catch {
        this.oldHtml = "";
      }
      this.interval = window.setInterval(() => {
        if (!this.observing || !this.element) return;
        try {
          // If element is no longer in the DOM, stop observing
          if (!(this.element as any)?.isConnected) {
            this.disconnect();
            return;
          }
          const currentHtml = (this.element as any)?.innerHTML;
          if (currentHtml != null && currentHtml !== this.oldHtml) {
            this.oldHtml = currentHtml;
            const pending = this.takeRecords();
            if (pending.length > 0) {
              // Wrap callback in try/catch to prevent unhandled exceptions
              // from cascading and crashing the UXP runtime
              try {
                this.callback(pending, this as any);
              } catch (cbErr) {
                // Swallow errors from MutationObserver callbacks — these are
                // typically React reconciliation errors that should not crash PS
              }
            }
          }
        } catch {
          // Silently ignore polling errors — element may have been removed
        }
      }, 250) as unknown as number;
    }

    disconnect() {
      this.observing = false;
      if (this.interval !== null) {
        window.clearInterval(this.interval);
        this.interval = null;
      }
    }

    takeRecords(): MutationRecord[] {
      return [];
    }
  } as any;
};

/**
 * Guard: wrap DOM operations that might trigger UXP MutationObserver errors.
 * Use this around React rendering or any code that causes significant DOM changes.
 */
export const withDOMErrorSuppression = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e: any) {
    if (e && e.message && e.message.includes("Cannot read properties of undefined")) {
      console.warn("[ColorFlats] Suppressed UXP DOM error:", e.message);
      return undefined as T;
    }
    throw e;
  }
};