import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

const enableVisualizer = process.env.ANALYZE === "true";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    ...(enableVisualizer
      ? [
          visualizer({
            filename: "dist/stats.html",
            gzipSize: true,
            brotliSize: true,
            template: "treemap",
          }) as unknown as ReturnType<typeof react>[number],
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
          ],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-charts": ["recharts"],
          "vendor-date": ["date-fns"],
          "vendor-dnd": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities", "@dnd-kit/modifiers"],
        },
      },
    },
  },
}));
