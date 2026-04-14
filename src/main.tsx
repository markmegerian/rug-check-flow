import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const loadAppFont = () => {
  void import("@fontsource-variable/plus-jakarta-sans").catch(() => {
    // Keep system fallback fonts if the custom font fails to load.
  });
};

if (typeof window !== "undefined") {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(loadAppFont, { timeout: 1500 });
  } else {
    window.setTimeout(loadAppFont, 0);
  }
}

createRoot(document.getElementById("root")!).render(<App />);
