

## Driver Portal: Mobile-First Pickup Verification

### What This Is

A separate driver-facing portal at `/driver` optimized for mobile/tablet use. Drivers see only their assigned confirmed pickups, tap into one to verify each rug with a checklist, add per-rug notes, capture a signature, and complete the pickup -- which permanently locks the record.

### Layout

```text
Pickup List (/driver):
+----------------------------------+
| RugBoost Driver                  |
+----------------------------------+
| Today's Pickups (2)              |
+----------------------------------+
| Pacific Rug Gallery              |
| 3300 NW 23rd Ave, Portland      |
| Feb 20 — 2 rugs                 |
| [Start Verification ->]         |
+----------------------------------+
| Bella Casa Furnishings           |
| 7100 SW Macadam Ave, Portland   |
| Feb 25 — 1 rug                  |
| [Start Verification ->]         |
+----------------------------------+

Completed pickups appear below, grayed:
+----------------------------------+
| Completed                        |
+----------------------------------+
| Riverside Interior Design        |
| Feb 18 — 3 rugs   Completed     |
+----------------------------------+


Verification View (inline, replaces list):
+----------------------------------+
| <- Back    Pacific Rug Gallery   |
+----------------------------------+
| RB-1004  Kilim  5x3             |
| Standard Wash, Fringe Repair    |
| [  ] Verified                   |
| Notes [____________________]    |
+----------------------------------+
| RB-1005  Persian  14x10         |
| Silk Treatment                  |
| [x] Verified                    |
| Notes [Slight edge wear_____]  |
+----------------------------------+
| Signature                        |
| +------------------------------+|
| |                              ||
| |    (draw area)               ||
| |                              ||
| +------------------------------+|
| [Clear]                         |
|                                  |
| [Complete Pickup]                |
| All rugs must be verified to    |
| complete.                        |
+----------------------------------+


After completion (locked):
+----------------------------------+
| <- Back    Pacific Rug Gallery   |
+----------------------------------+
| ! Pickup completed on 2/20/2026 |
|   at 2:34 PM. Record is locked. |
+----------------------------------+
| RB-1004  Kilim  Verified        |
| Notes: —                        |
+----------------------------------+
| RB-1005  Persian  Verified      |
| Notes: Slight edge wear         |
+----------------------------------+
| Signature                        |
| [captured signature image]       |
+----------------------------------+
```

### Behavior

**Pickup List** (default view):
- Shows only confirmed pickups assigned to this driver (hardcoded for now)
- Each card shows: client name, address, date, rug count
- "Start Verification" button opens the verification view
- Completed pickups shown below in a separate section, grayed out, tappable to review locked record

**Verification View**:
- Back button returns to list
- Each rug in the pickup shown as a card with: rug number, type, size, services
- Per-rug "Verified" toggle (checkbox)
- Per-rug notes input (text, optional)
- Signature capture area at bottom (canvas-based, draw with touch/mouse)
- "Clear" button resets the signature canvas
- "Complete Pickup" button: disabled until all rugs are verified AND signature is present
- On complete: locks the pickup permanently, records timestamp, shows toast

**Locked State** (after completion):
- Persistent banner: "Pickup completed on [date] at [time]. Record is locked."
- All rug verifications shown as read-only text
- Signature shown as static image
- No action buttons

### Data Model

**New file: `src/data/mock-driver.ts`**

```typescript
interface DriverPickup {
  id: string;
  pickupId: string;        // references PortalPickup
  clientName: string;
  clientAddress: string;
  date: string;
  rugs: DriverPickupRug[];
  status: "assigned" | "completed";
  completedAt?: string;     // ISO timestamp
  signatureDataUrl?: string; // base64 canvas image
}

interface DriverPickupRug {
  rugNumber: string;
  rugType: string;
  length: number;
  width: number;
  services: string[];
  verified: boolean;
  notes: string;
}
```

Seed data: 2 assigned pickups (matching the confirmed portal pickups) + 1 completed pickup for history.

### File Changes

1. **New: `src/data/mock-driver.ts`**
   - `DriverPickupRug` and `DriverPickup` interfaces
   - `DRIVER_PICKUPS` seed data (2 assigned, 1 completed)

2. **New: `src/pages/DriverPortal.tsx`**
   - Mobile-first layout: full-width, no sidebar, large touch targets
   - Local state for `pickups` (initialized from seed data) and `activePickupId` (null = list view, string = verification view)
   - List view renders pickup cards
   - Verification view renders rug checklist + signature + complete button
   - Completed view renders locked record with banner

3. **New: `src/components/driver/SignatureCanvas.tsx`**
   - HTML5 canvas component for touch/mouse signature drawing
   - Props: `onSignatureChange(dataUrl: string | null)`, `disabled: boolean`, `initialDataUrl?: string`
   - Draws with touch events (touchstart/touchmove) and mouse events (mousedown/mousemove)
   - "Clear" button resets canvas and calls `onSignatureChange(null)`
   - `toDataURL()` export on complete
   - Sized for mobile: full-width, ~150px tall, rounded border

4. **Edit: `src/App.tsx`**
   - Add route: `/driver` -> `DriverPortal`

### Technical Details

- **Mobile-first**: All padding/sizing uses touch-friendly defaults (min 44px tap targets, p-4 spacing, text-base font sizes)
- **No tables**: Everything is stacked cards for mobile readability
- **Signature canvas**: Uses native HTML5 Canvas API, no external library. Captures drawing via pointer events (works for both touch and mouse). Exports as `canvas.toDataURL("image/png")` on completion.
- **View switching**: Uses `activePickupId` state instead of routes -- keeps it simple, no URL management needed
- **Lock is permanent**: Once "Complete Pickup" is clicked, the pickup status changes to `"completed"`, `completedAt` is set, and `signatureDataUrl` is saved. The UI re-renders in locked mode. No undo.
- **Complete button validation**: Disabled unless every rug has `verified: true` AND `signatureDataUrl` is non-null. Shows helper text explaining requirements.
- **Driver is hardcoded**: No auth, driver identity is implicit for now

