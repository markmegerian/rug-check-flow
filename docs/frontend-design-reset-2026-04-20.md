# Frontend Design Reset, 2026-04-20

## Intent

The frontend rebuild should not only simplify architecture and workflow ownership. It should also reset the visual language of the product so the app feels:
- premium
- calm
- trustworthy
- operationally clear
- less improvised
- less "dashboard soup"

The PDF concept previously reviewed is useful as inspiration, especially for tone, pacing, and presentation discipline. It should not be copied one-for-one. Its strongest value is the more deliberate editorial product feel.

## Design direction

## Desired product character
- professional but warm
- modern but not trendy
- polished without feeling consumer-app fluffy
- clean and confident rather than loud
- visually structured enough for operations work

## Avoid
- noisy gradients everywhere
- crowded panels fighting for attention
- over-saturated accent colors
- visual clutter from too many badge styles and container types
- generic admin-template feel
- twitchy animated surfaces

## PDF-inspired elements worth carrying forward

### 1. Strong sectional pacing
The PDF uses clearer progression and cleaner sectional framing than the current app. The rebuilt UI should use:
- stronger section headers
- intentional spacing
- fewer competing surface styles
- clearer content hierarchy

### 2. Softer, editorial visual tone
The PDF feels more like a product and less like a stitched-together operations console. We should borrow:
- gentler neutrals
- restrained accent usage
- stronger typographic hierarchy
- more deliberate whitespace

### 3. Guided workflow framing
The PDF frames the task as a guided process with context and summary. We should keep this idea, but with your operational simplifications:
- clearer current task context
- lighter summaries
- less always-visible pricing complexity

## Color strategy

## Primary palette direction
Use a calmer, richer neutral base with one strong accent family.

### Suggested foundation
- background: warm off-white / soft stone
- cards/surfaces: white or near-white with subtle depth
- text: deep charcoal / ink
- border: low-contrast warm gray
- accent: muted deep blue, slate, or forest-leaning teal

### Suggested emotion
- premium operational software
- not medical white
- not neon SaaS blue
- not dark luxury mode by default

## Proposed semantic roles
- Primary: deep slate-blue or deep blue-green
- Secondary: muted warm gray
- Success: restrained green
- Warning: amber, but less harsh
- Danger: controlled brick/red, not bright alert red everywhere

## Typography

### Direction
- clean sans with strong hierarchy
- bigger, calmer section titles
- less tiny metadata noise
- operational labels still compact, but not cramped

### Rules
- page titles should feel intentional
- step titles / section titles should be stronger than they are now
- supporting copy should help orient, not overwhelm
- reduce excessive microtext where it is not useful

## Layout system

### 1. Fewer competing shells
Each route should have:
- one page shell
- one primary work surface
- one consistent summary/context pattern

### 2. Stable, larger content blocks
Prefer:
- larger unified surfaces
- clearer grouping
- less fragmented box-within-box nesting

### 3. More editorial spacing
Spacing should communicate structure. The current app often relies too much on borders and too little on hierarchy.

### 4. Right-side summary panels only when they truly help
A summary panel can be useful, but it should:
- be stable
- be concise
- not duplicate every decision the main workflow already shows

## Component style guidance

## Buttons
- slightly more refined sizing and rhythm
- fewer visually aggressive button variants
- primary action should stand out clearly

## Inputs
- calmer borders
- more premium field spacing
- stronger label/input relationship
- avoid cramped stacks unless density is truly necessary

## Cards and panels
- cleaner radii
- subtle shadowing only where it helps structure
- avoid every panel looking identical if hierarchy differs

## Progress and workflow indicators
- clearer step/state visibility
- avoid making flows feel fragmented or over-wizarded
- progress should orient, not dominate

## Tables and dense operational lists
- cleaner row spacing
- stronger emphasis on the most important columns
- less visual chrome around secondary metadata

## Design principles for rebuilt workflows

### Check In
- calm guided intake
- no giant form fatigue
- no noisy price review wall
- photos and custom services only when needed
- summary should support, not compete

### Jobs / operations
- summary first
- drill-in second
- avoid tab overload

### Driver flows
- sequence and confirmation clarity over dense back-office styling
- tap confidence matters more than visual cleverness

### Invoicing / estimates
- more polished review/confirmation feel
- still operationally fast

## Theme system recommendation

As the rebuild proceeds, create a more intentional design token layer for:
- colors
- surface/background hierarchy
- radius
- spacing
- shadows
- semantic state colors

Do not let route-by-route rebuild work invent its own styling ad hoc.

## First implementation target

The first visible design reset should happen alongside the first rebuilt workflow.

Recommended first slice:
- Check In page shell
- workflow surface styling
- primary color and neutral palette direction
- buttons, section headers, cards, inputs, and step context

This gives the rebuild a visible identity immediately and helps set the standard for later routes.

## Final recommendation

Use the PDF as inspiration for:
- pacing
- tone
- polish
- hierarchy

Do not use it as a literal template.

The rebuilt product should feel like your own operational platform, just significantly more disciplined, premium, and coherent than the current frontend.
