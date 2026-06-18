/**
 * Polyfill Global Error Handler for UXP
 *
 * UXP doesn't natively support window.onerror or unhandledrejection.
 * We also need to guard against MutationObserver errors that occur when
 * React 19's DOM reconciliation triggers UXP's internal observer.
 */

export const polyFillGlobalErrorHandler = () => {
  // Polyfill window.onerror if not available — always return true to suppress
  //@ts-ignore
  window.onerror = (error: any) => {
    console.warn("[ColorFlats] onerror suppressed:", typeof error === "object" ? error?.message || error : String(error));
    return true;
  };

  // Catch unhandled promise rejections — always preventDefault to avoid crashes
  //@ts-ignore
  if (typeof window.addEventListener === "function") {
    //@ts-ignore
    window.addEventListener("unhandledrejection", (event: any) => {
      const reason = event?.reason;
      // Log a short summary, not the full error object (which can be huge / crash console)
      const msg = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : String(reason);
      console.warn("[ColorFlats] unhandledrejection suppressed:", msg);
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
    });
  }

  // Catch general errors — always preventDefault to avoid cascading crashes
  //@ts-ignore
  if (typeof window.addEventListener === "function") {
    //@ts-ignore
    window.addEventListener("error", (event: any) => {
      const errMsg = event?.error?.message || event?.message || String(event);
      console.warn("[ColorFlats] error event suppressed:", errMsg);
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
    });
  }
};

export const throwErr = (error: any) => {
  if (window.onerror) {
    window.onerror(error);
  } else {
    console.error(error);
  }
};

export const safe = <T>(func: () => T): T | Error => {
  try {
    return func();
  } catch (error: any) {
    throwErr(error);
    return error;
  }
};

export const safeAsync = async <T>(func: () => Promise<T>): Promise<T | Error> => {
  try {
    return await func();
  } catch (error: any) {
    throwErr(error);
    return error;
  }
};