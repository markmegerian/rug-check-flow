import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    // Provide fallback Supabase env vars for tests so the client module
    // doesn't throw when real secrets aren't available (e.g. in CI).
    "import.meta.env.VITE_SUPABASE_URL":
      JSON.stringify(process.env.VITE_SUPABASE_URL ?? "https://test.supabase.co"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY":
      JSON.stringify(process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key"),
  },
  test: {
    env: {
      NODE_ENV: "test",
    },
    environment: "node",
    environmentMatchGlobs: [["src/test/hooks.test.ts", "jsdom"]],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
