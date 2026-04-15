# Playwright setup

## What was added
- `playwright.config.ts`
- `tests/e2e/smoke.spec.ts`
- npm scripts:
  - `npm run test:e2e`
  - `npm run test:e2e:headed`
  - `npm run test:e2e:ui`

## What the smoke test covers
- `/auth` loads and shows the sign-in form
- signed-out `/ops` redirects back to `/auth`
- optional authenticated sign-in smoke when env vars are provided

## Optional authenticated smoke env vars
```bash
export PLAYWRIGHT_EMAIL="you@example.com"
export PLAYWRIGHT_PASSWORD="your-password"
```

## Browser install
Playwright Chromium was installed with:
```bash
npx playwright install chromium
```

## Linux host dependencies
This machine is currently missing required browser runtime libraries (for example `libnspr4.so`).
On a Debian/Ubuntu host, install them with:
```bash
sudo npx playwright install-deps chromium
```

If `install-deps` is unavailable in your environment, install the needed system packages manually, then rerun:
```bash
npm run test:e2e
```
