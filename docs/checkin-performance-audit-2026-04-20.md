# Check In Performance Audit, 2026-04-20

## Executive summary

Check In performance issues are most likely **architectural client-side interaction problems**, not a single query bug or a single hot function. The current screen still concentrates too much reactive state, pricing logic, conditional workflow logic, and mounted UI inside one large live route.

The result is that the common operator path, especially simple standard-clean check-in, still pays for machinery that belongs only to advanced/custom intake. This is why repeated targeted optimizations have not made the screen feel reliably fast in real use.

## Main conclusion

The most credible fix is a **substantial structural redesign of the Check In UI flow**, while keeping the existing backend workflow/data model intact.

Specifically:
- keep `check-in-workflow`
- keep current DB tables and additive backend snapshots
- rebuild the Check In UI as a staged, isolated flow
- ensure the standard-clean path never mounts the custom-services machinery unless explicitly needed

## What was audited

### Route shell
- `src/pages/CheckIn.tsx`
- `src/components/facility/CheckInLayout.tsx`

### Data/state orchestration
- `src/hooks/useCheckInData.ts`
- `src/components/facility/CheckInForm.tsx`
- `src/components/facility/CheckInServiceSelector.tsx`
- `src/components/facility/CheckInPhotoSection.tsx`

### Submit path
- `src/components/facility/CheckInLayout.tsx`
- `supabase/functions/check-in-workflow/index.ts`

## Findings

### 1. The screen is still one large reactive client surface
`CheckInLayout` mounts a single `CheckInForm` that owns:
- rug details
- client lookup state
- pricing tier state
- service selection state
- edge-selection state
- flat-price state
- photo state
- step state
- standard/custom wash decision state
- submit preparation logic

Even with some memoization, this is still a large, highly-coupled interaction surface.

**Impact:** typing, selecting, toggling, and changing dimensions can still cascade through too much live state.

### 2. Standard-clean path still carries custom-service machinery
`CheckInForm` still contains service loading, service maps, pricing derivation, service snapshot building, and custom-service state even when the user is trying to do a simple standard-clean check-in.

Although heavy UI is partially deferred, the component still owns the service-related machinery.

**Impact:** the common fast path still pays for custom-flow complexity.

### 3. Too much derived pricing/state is maintained inside the live form
`CheckInForm` still builds:
- `servicePricing`
- `serviceById`
- `standardWashService`
- `buildServiceSnapshots(...)`
- client tier dependent price calculations
- dimension-derived sqft and linear foot calculations

These are not individually terrible, but they live inside the main interaction component and therefore remain part of the active rerender cost.

**Impact:** the form remains computationally busy relative to the simplicity of the common operator task.

### 4. State ownership is too broad for the operator workflow
The form currently mixes together several concerns that should be isolated:
- intake identity (client / pending rug)
- rug details
- photos
- standard vs custom branching
- custom services and service pricing
- submit orchestration

This makes the UI fragile and makes it hard to guarantee that hidden/irrelevant steps are truly inactive.

**Impact:** hidden complexity leaks into the common path.

### 5. Queue + form share the same route-level reactive environment
`CheckInLayout` simultaneously owns:
- pending queue state from `useCheckInData`
- form selection state
- walk-in add flow
- completion/log updates

The pending queue and form are visually split, but they are still coordinated in one live screen.

**Impact:** selecting pending rugs, adding walk-ins, and form interactions are not isolated enough.

### 6. Photo flow is likely part of perceived heaviness
`CheckInPhotoSection` manages:
- local preview URLs
- file input
- optional camera stream/dialog state
- image creation / blob conversion

Even if not the primary root cause, it is still heavyweight interaction logic living inside the larger intake tree.

**Impact:** more complexity inside the main screen than necessary.

### 7. Submit path itself is probably not the main cause of typing lag
The submit path uploads photos and invokes `check-in-workflow`, which can affect final submission speed, but that is different from the complaint that the screen is broadly laggy and hard to use during intake.

**Conclusion:** backend submit latency matters, but it is probably not the main root cause of the everyday interaction pain.

## Root-cause assessment

### Most likely root cause
**The Check In UI is over-coupled and over-mounted for the common path.**

The screen behaves like a full configurable workflow editor when the most common operator need is closer to a short staged intake wizard.

### Less likely primary causes
- single slow DB query on initial load
- status bar polling outside this route
- one specific service selector bug
- one edge-function issue

These may contribute, but they do not explain why the overall screen still feels bad after multiple local optimizations.

## Recommended implementation plan

## Plan A, recommended: rebuild Check In UI as a staged flow on top of the current backend

### Goal
Create a new Check In experience that is structurally optimized for the common path instead of trying to optimize a giant all-in-one form.

### Keep
- current DB schema
- current `check-in-workflow`
- current pending-pickup backend snapshot path
- current photo upload path
- current service catalog and approval logic

### Replace
Current `CheckInForm` should be replaced by a staged flow with hard isolation between steps.

### Proposed new flow
1. **Entry step**
   - choose pending rug OR walk-in client
   - no service logic mounted
   - no photo UI mounted

2. **Rug details step**
   - rug number
   - rug type / construction
   - dimensions
   - notes / condition
   - no custom-services UI mounted

3. **Photos step**
   - photo capture/upload only
   - isolated local state
   - no service selector mounted

4. **Decision step**
   - `Standard cleaning? Yes / No`
   - if **Yes**: submit directly using existing standard-clean path
   - if **No**: advance to custom services

5. **Custom services step, conditional only**
   - mount the service selector only here
   - load services only here
   - pricing maps only exist here

6. **Confirmation / completion**
   - lightweight result state

## Why this is most likely to work
- removes hidden custom-service cost from the common path
- isolates photo state from text-entry state
- drastically reduces mounted surface area at any one time
- makes layout stability easier because each step has a bounded footprint
- improves operator comfort by reducing scrolling and visual competition

## Plan B, intermediate option
Keep the current route but split `CheckInForm` into separate mounted child screens with a state machine and lift only the minimal shared draft state up.

This is lower-risk than a full route replacement but still meaningfully structural.

## What should NOT be the primary strategy
- more micro-optimizations inside the current giant form
- more memo wrappers without state-boundary changes
- more tiny query tweaks as the main plan

These may help slightly but are unlikely to fully solve the operator experience.

## Implementation sequence

### Phase 1: design and isolate
- create a new `CheckInDraft` shape for minimal shared state
- define step state machine
- split current form into separate step components

### Phase 2: build standard-clean path first
- pending/walk-in step
- rug details step
- photos step
- standard-clean decision and submit

### Phase 3: add custom-services branch
- load services only when entering custom path
- mount service selector only on custom branch
- preserve existing service snapshots and workflow submission shape

### Phase 4: validate and replace
- verify standard-clean submission speed and feel
- verify custom-services path still works
- remove old monolithic Check In form once confidence is high

## Success criteria
- standard-clean check-in feels instant enough to use without frustration
- no obvious typing lag on details step
- no heavy service UI or pricing logic mounted unless custom path is chosen
- less scrolling and no layout jumping between steps
- existing workflow data integrity preserved

## Final recommendation
Do not continue with piecemeal tuning as the primary strategy.

The best professional move is to **rebuild the Check In UI flow from scratch as a staged intake wizard on top of the existing backend workflow**. That is the strongest path to actually resolving the lag rather than marginally improving symptoms.
