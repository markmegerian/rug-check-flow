# Driver Portal Workflow Surface Review - 2026-04-21

## Scope

This review covers the driver-facing operational loading surface, centered on `src/components/driver/TruckLoadingView.tsx`.

## First judgment

Driver workflows should remain highly operational and narrow.
This is not a place for broad management surfaces or heavy mixed workflows.

The driver portal should prioritize:
- what is on today’s route
- what is on the truck
- what still needs to be added or confirmed
- what is complete

## Current shape

The current truck-loading view does several operational things:
- finds today’s active delivery list for the route
- loads confirmed-for-delivery rugs
- shows morning additions available for same-day loading
- groups rugs by client
- tracks loaded-on-truck toggles
- supports add-to-truck behavior for morning additions
- supports final truck checkout/finalization

This is much closer to a real-purpose-built workflow than some office surfaces.

## Worker-intent model for Driver Portal

## 1. Load Truck
Purpose:
- see today’s delivery list
- see which rugs belong on the truck
- mark rugs loaded
- add valid morning additions reliably
- finalize truck state

This should be the primary driver workflow.

## 2. Route Execution / Delivery Confirmation
Purpose:
- support the driver after loading when they are out executing the route
- confirm completion and delivery proof where needed

This may be adjacent, but should remain clearly separate from loading.

## Current judgment by function

## 1. Truck loading flow
### Judgment
**Keep.**

### Why
This is a good example of a purpose-specific workflow page.
It is focused on one operational job and does not try to be everything.

### Important rule
Keep it narrow.
Do not turn it into a broad management surface.

## 2. Morning additions
### Judgment
**Keep, but guard carefully.**

### Why
Morning additions are operationally real, but they introduce risk and complexity.
The page already needed idempotency hardening here, which confirms that this area needs discipline.

### Rule
Morning additions should remain explicit and reliable, never ambiguous or duplicate-prone.

## 3. Grouping by client
### Judgment
**Keep.**

### Why
This is useful to drivers and maps to how delivery work is actually performed.
Grouping by client is a human-meaningful anchor.

## 4. Broader driver workflow scope
### Judgment
**Do not overload this surface.**

### Why
Drivers need simple, reliable, next-action interfaces.
The portal should stay minimal and practical.

## Launch-priority judgment

### Keep and refine now
- truck loading
- add-to-truck flow
- loaded-state tracking
- finalization flow
- client grouping

### Review later
- whether loading and in-route execution should remain together or be more explicitly separated
- whether any additional route context is helpful without increasing cognitive load

## Preliminary keep / simplify / split / merge / remove summary

- **Truck loading view** → Keep
- **Morning additions** → Keep, guard carefully
- **Client grouping** → Keep
- **All-in-one driver management portal** → Avoid

## Current conclusion

Driver Portal should remain a tightly focused operational workflow.
This is one of the clearer product areas because it already has a strong single-job purpose.
The main design rule here is not radical restructuring, but protecting simplicity and reliability.
