# Check In Redesign Spec - 2026-04-22

## Status
Approved for implementation.

This spec replaces the current staged Check In flow target.

## Product identity
Check In is a standalone intake station, not a normal workspace page.

### Required shell rules
- No sidebar
- No workspace tabs
- No workspace status bar
- No general facility shell chrome
- No alternate navigation controls inside the page body
- The page should present only the Check In experience

## Core workflow model
Check In is a single-page intake canvas.

### Not allowed
- Multi-step wizard flow
- Layout-changing section mount/unmount during normal interaction
- Separate walk-in branch or walk-in search tool
- Client-side routine service pricing calculation or display

### Required
- Single stable page
- All primary intake information visible in one form
- Photo upload on the same page
- Standard-wash fast path remains supported
- Non-standard services expand within a preallocated area
- Backend owns routine service pricing resolution

## Client rules
- Clients must already exist before Check In
- No unofficial walk-in intake path
- Client field acts as lightweight autocomplete lookup for existing clients only
- Submission should require a resolved/valid client identity

## Page layout
Two layout modes only, decided from initial pending-rug data.

### Mode A: pending truck rugs exist
- Left rail appears
- Main form appears to the right

### Mode B: no pending truck rugs exist
- Left rail does not render
- Main form uses full width

### Left rail purpose
The left rail is only for truck-picked-up rugs awaiting Check In.

#### Left rail content
- Group by client name
- Show rug number rows under each client
- Selecting a pending rug populates the main form

#### Left rail exclusions
- No walk-in tooling
- No generic client search
- No unrelated actions
- No layout-changing controls

## Main form fields
All of the following are part of the single page:
- Client name lookup field
- Rug number
- Rug type
- Length
- Width
- Condition notes (always visible)
- Photo upload area (always visible)
- Standard wash yes/no decision
- Service selection area
- Submit action area

## Service model
### Default path
- Operator answers Standard wash yes/no
- If yes, backend resolves the standard-cleaning service and pricing
- No routine price display in UI

### Non-standard path
- Service area is used for non-standard selections
- UI submits minimal service payload
- Only quote/custom-price-required services may request explicit amount entry
- Backend resolves routine pricing from catalog + client tier + dimensions/edges

## Zero-shift implementation rules
This is a hard requirement, not a best effort guideline.

### Global rule
No visible element may move because of clicks, typing, async lookup results, upload progress, or conditional content.

### Required structural rules
1. Reserve space for all major page regions at first render
2. Do not let headers, toolbars, footers, or action rows appear/disappear and change geometry
3. Do not mount/unmount major form sections in ways that change page height
4. Use fixed or preallocated region heights for:
   - client lookup assistance area
   - photo area
   - service area
   - validation/help text rows
   - submit/status area
5. Autocomplete suggestions must overlay/anchor without reflowing surrounding fields
6. Error/help text must have reserved space even when empty
7. Service-area content changes must occur inside a container whose footprint is already allocated
8. Photo thumbnails/uploads must not push later form regions down while appearing
9. No `empty:hidden`/collapse behavior for structural containers
10. No full subtree swaps that change layout footprint during normal interaction

## Data-loading rules
### Initial load only
- Pending truck rug intake list
- Lightweight onboarded-client lookup capability
- Minimal service metadata needed for rendering selection UI

### Defer / do not load broadly
- Full client records
- Broad historical rug data
- Pricing calculations in browser
- Unrelated facility workspace data

## Interaction rules
- Selecting a pending rug fills the same single-page form
- Manual intake uses the same form with client autocomplete
- If no pending rugs exist, the page opens directly as the full-width intake form
- Minimum one photo required before submit
- Condition notes always visible, not hidden behind a later step

## Route and boundary rules
- Check In route should be treated as its own dedicated page boundary
- It should no longer inherit generic Facility workspace navigation/shell behavior
- Facility should not absorb unrelated finance/billing workflows into this surface

## Related product boundary decision
- Create Invoice does not belong in Facility and should be removed from that domain during broader workflow cleanup

## Recommended implementation sequence
1. Create a standalone Check In page shell with no workspace chrome
2. Replace staged step engine with single-page stable form scaffold
3. Replace walk-in branching with onboarded-client autocomplete field
4. Restrict left rail to pending truck rugs only
5. Reserve stable space for photo, lookup assist, services, and status regions
6. Keep backend-owned pricing contract already established and align UI fully to it
7. Validate with real interaction traces for CLS/INP after structural cutover

## Verification standard
Implementation is not considered done until:
- Build passes
- Relevant tests pass
- No structural layout shift remains during normal interaction
- Live Check In run succeeds with backend-owned pricing path
- The page feels operationally calm and does not visibly jump while being used
