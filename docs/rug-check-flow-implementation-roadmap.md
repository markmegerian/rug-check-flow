# Rug Check Flow Implementation Roadmap

## Goal
Turn the current feature set into a coherent rug-operations platform built around:
- **rug master identity**
- **job = client + pickup date**
- **service cycle**
- **route stop**
- **estimate / approval flow**
- **invoice / payment flow**
- **exception + attention tracking**

## Guiding rules
- Work should **always proceed** operationally.
- Approval is a **commercial exception**, not an operational hold.
- Portal-submitted **rug number is canonical** unless changed by super admin/office.
- Same rug can move through **multiple service cycles** over time.
- Same client + same pickup date = **same job**.
- Invoices are grouped by **store + the rugs actually delivered there that day**.

## Build order

### Phase 1 — Operational data spine
1. Formalize **Job** as `client + pickup date` workspace.
2. Separate **rug identity** from **service-cycle state**.
3. Formalize **exceptions / attention items**.
4. Strengthen links between pickup items, checked-in rugs, route stops, estimates, and invoices.
5. Add client billing profile defaults (default 14-day terms, per-client override).

### Phase 2 — Office workflow control
1. Add **Jobs workspace** for office:
   - search by client / rug number
   - group by client + pickup date
   - open job and work rugs inside it
2. Strengthen rug search/detail with:
   - photos
   - current services
   - linked job context
3. Improve office edit flow for rug metadata and job-level handling.

### Phase 3 — Super admin control tower
1. Replace infra-only admin landing with operations control center.
2. Top queues:
   - client responses
   - overdue invoices
   - rugs needing attention
3. Add service/pricing administration under super admin.

### Phase 4 — Exception + re-entry lifecycle
1. Immediate return at delivery.
2. Later return for newly approved work.
3. New service cycle for re-entry work.
4. Second invoice flow for later approved work.
5. Clear office/check-in notifications.

### Phase 5 — Financial maturity
1. Client billing profiles and reminder cadence.
2. Account-level balance view in portal.
3. Better overdue automation.
4. Manual payment entry refinements.
5. Foundations for later card-on-file automation.

## First implementation slice
Start with **Phase 2 / Jobs workspace** because it is the highest-leverage office gap and can be built safely on top of existing pickup request + rug data.

### Slice scope
- New Operations tab: **Jobs**
- Group office work by **client + pickup date**
- Search by **client name** or **rug number**
- Open a job and see all rugs in that batch
- Edit pickup-item metadata from office
- Add/remove pre-check-in items safely
- Open linked checked-in rug detail from the job
- Surface linked photos/services/status when a pickup item has already been checked in

## Follow-up after first slice
- Job notes and richer batch actions
- stronger linked invoice/estimate visibility per job
- super admin attention board
- client billing profiles
- first-class re-entry / return lifecycle
