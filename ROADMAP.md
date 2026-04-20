# SplitTime Team Native Roadmap

Last updated: 2026-04-18

## Product Pillars (Launch Track)
1. Premium onboarding/login flow.
2. Full backend wiring for all core features.
3. Premium You > Overview UX (more insights + charts).
4. Richer workout/activity metrics (heart rate, cadence, etc.).
5. More customizable premium settings.
6. Attendance tracking in roster.

## Recommended Build Order
1. Backend data model + sync reliability first.
2. Workout completion -> athlete account -> activities feed pipeline.
3. Onboarding/login premium UX polish.
4. You tab overview redesign (charts, trends, weekly summaries).
5. Extended workout metrics in activities detail.
6. Settings depth and team/athlete customization.
7. Attendance tracker in roster and coach reporting.

## Why this order
- It prevents rework: UI polish is fastest after data contracts are stable.
- It raises launch confidence: sync, state, and history correctness first.
- It gives immediate visible value: once workout data lands in feed correctly, many later features become easier.

## Execution Phases

### Phase 1: Data Foundation
- Unify backend contracts for activities, workouts, comments, and schedule references.
- Ensure each workout result is linked to athlete account IDs (not just local state).
- Add server-side validation for required IDs, ownership, and role permissions.
- Add migration notes/checklists for Cloudflare Worker + D1 updates.

### Phase 2: Activity Pipeline
- Persist completed workouts as first-class feed activities.
- Merge imported runs (Strava) and in-app workouts into one activity timeline model.
- Support feed comments/coach feedback consistently across sources.

### Phase 3: Onboarding + Auth Polish
- Improve first-run flow, account creation, role selection, and team join UX.
- Add polished sign-in methods (Google, Apple, Strava) + recovery UX.
- Remove dead ends and make error states feel premium/clear.

### Phase 4: You Tab Premiumization
- Overview: weekly graph, trend cards, pace/time/load summaries.
- Activities: richer detail cards and smooth drill-down.
- Details: map + key stats + comments with clean visual hierarchy.

### Phase 5: Settings + Attendance
- Team and athlete preferences (notifications, units, privacy, defaults).
- Coach controls for schedule/workout/team behavior.
- Attendance tracker in roster (present/absent/late, notes, history summaries).

## Definition of Done (per feature)
- Works on coach and athlete roles as intended.
- Syncs across devices and survives app relaunch.
- Cloudflare Worker + D1 schema updates documented.
- Error handling + empty/loading states are polished.
- Basic QA checklist completed on simulator + device.

