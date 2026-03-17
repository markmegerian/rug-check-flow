# Plan: Fix Build Errors + Modern Dashboard SaaS UI Overhaul

No reference needed — we'll design a **Linear/Vercel-inspired** modern dashboard: clean sidebar navigation, neutral palette with accent pops, data-dense cards, crisp typography, and smooth transitions. Everything should be mobile optimized as a priority

---

## Phase 1: Fix All Build Errors

### 1a. TypeScript target → ES2021+ (fixes `replaceAll`)

Update `tsconfig.app.json` lib from `ES2020` to `ES2022` to support `String.replaceAll`.

### 1b. Fix `@fontsource-variable/plus-jakarta-sans` import

The package exists in `package.json` but TS can't find type