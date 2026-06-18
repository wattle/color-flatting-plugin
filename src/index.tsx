import "./app.css";
import "./index.scss";
import ReactDOM from "react-dom/client";
import { App } from "./main";
import { initUXP } from "./api/uxp";
import { polyfillMutationObserver } from "./api/polyfills";

console.clear();

// Must polyfill MutationObserver BEFORE React renders,
// because React 19 uses MutationObserver internally and
// UXP's implementation may be incomplete.
polyfillMutationObserver();

initUXP();

// Note: React.StrictMode is intentionally removed because it causes
// double-rendering which triggers a UXP MutationObserver bug:
// "Cannot read properties of undefined (reading 'name')"
ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <App />
);