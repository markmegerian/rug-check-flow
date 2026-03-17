import '@fontsource-variable/plus-jakarta-sans';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Catch unhandled promise rejections globally (e.g. expired auth, network errors)
window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message ?? String(event.reason);
  // Supabase auth session expired — reload to trigger login redirect
  if (/JWT|token|expired|refresh_token/i.test(msg)) {
    window.location.reload();
    return;
  }
  console.error("Unhandled rejection:", event.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
