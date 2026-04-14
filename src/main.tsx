import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const STALE_CHUNK_RELOAD_KEY = "vite-stale-chunk-reload";

const isChunkLoadError = (message: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(message);

const reloadForStaleChunk = () => {
  if (typeof window === "undefined") return;
  if (window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) === "1") return;
  window.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, "1");
  window.location.reload();
};

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    const message = payload instanceof Error ? payload.message : String(payload ?? "");
    if (isChunkLoadError(message)) {
      event.preventDefault();
      reloadForStaleChunk();
    }
  });

  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.message ?? "")) {
      reloadForStaleChunk();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "");
    if (isChunkLoadError(message)) {
      event.preventDefault();
      reloadForStaleChunk();
    }
  });

  window.setTimeout(() => {
    window.sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
  }, 10000);
}

createRoot(document.getElementById("root")!).render(<App />);
