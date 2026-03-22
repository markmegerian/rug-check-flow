import "@testing-library/jest-dom";

// Provide dummy Supabase env vars so the client module doesn't throw during tests
// that transitively import it. These are not real credentials.
if (!import.meta.env.VITE_SUPABASE_URL) {
  (import.meta.env as Record<string, string>).VITE_SUPABASE_URL = "https://test.supabase.co";
}
if (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  (import.meta.env as Record<string, string>).VITE_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-key";
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
