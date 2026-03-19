import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/** Fail the build if required env vars are missing. */
function envGuard(requiredVars: string[]): Plugin {
  return {
    name: "env-guard",
    configResolved(config) {
      if (config.command !== "build") return;
      const missing = requiredVars.filter(
        (v) => !process.env[v] && !config.env[v],
      );
      if (missing.length > 0) {
        throw new Error(
          `Build aborted — missing required env vars: ${missing.join(", ")}`,
        );
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    false && envGuard(["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]),
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
