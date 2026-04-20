# SplitTimeTeamNative Port Plan

## Objective

Replace `SplitTimeTeamApp` with a native iOS app in Swift/SwiftUI while preserving current product behavior and Cloudflare compatibility.

This is a rewrite, not a translation. The React Native codebase is the behavior reference only.

## Source Of Truth

Current product reference:

- [`/Users/cooperostler/RunningTimeApp/SplitTimeTeamApp`](/Users/cooperostler/RunningTimeApp/SplitTimeTeamApp)

Current backend reference:

- [`/Users/cooperostler/RunningTimeApp/SplitTimeTeamApp/cloudflare/worker.js`](/Users/cooperostler/RunningTimeApp/SplitTimeTeamApp/cloudflare/worker.js)

## Native Architecture

### App Shell

- `SwiftUI` app lifecycle
- `NavigationStack` per top-level tab
- role-aware `TabView`
- native `Form`, `List`, `Map`, `PhotosPicker`, `confirmationDialog`, `sheet`, and `fullScreenCover`

### Dependency Structure

- `AppEnvironment`: immutable dependency container
- `AppModel`: app-wide auth/session/onboarding state
- protocol-driven services
- feature-specific view models

### Data And Persistence

- `UserDefaults`-backed session store first
- clean service layer for Cloudflare-backed features
- local persistence to follow for templates, timer runtime, roster-only local athletes, and workout history
- eventual native persistence target: `SwiftData` for local-only and cached entities

### Native Framework Targets

- `SwiftUI` for UI
- `MapKit` for event previews and location details
- `PhotosUI` for chat image sending
- `URLSession` for networking
- `UserDefaults` / `SwiftData` for persistence

## Feature Inventory

### Global

- splash / launch transition
- onboarding flow
- auth gating
- coach vs athlete role-based navigation

### Auth

- coach login
- coach signup
- athlete signup with join code
- persisted session
- `/auth/login`
- `/auth/signup`
- `/auth/me`

### Team

- top sections: `Overview`, `Roster`, `Chat`
- announcements feed
- coach posting announcements
- local athletes and groups
- remote team roster sync
- shared team chat
- photo messages
- full-screen image viewing

### Schedule

- coach create/edit/delete
- athlete read-only
- recurring and one-time events
- event kind: practice/race
- event category
- location search and map preview
- event detail screen
- full map screen and Apple/Google Maps open-out
- schedule settings
- team-shared Cloudflare sync

### Timer

- start workout from scratch or template
- athlete selection before start
- split tracking
- explicit stop control
- group organization
- timer settings

### Workouts

- templates
- history
- step builder
- repeat groups
- workout details and splits

### You

- user identity
- logout

## Parity Constraints

The native port should preserve current behavior, including:

- coach tabs: `Timer`, `Schedule`, `Team`, `Workouts`, `You`
- athlete tabs: `Schedule`, `Team`, `You`
- manually coach-added athletes remain local-only unless product direction changes later
- schedule, chat, announcements, and remote roster continue to use the current Cloudflare API

## Implementation Phases

### Phase 1: Foundation

- app shell
- session bootstrap
- role-aware tabs
- typed domain models
- API client
- live auth service
- live schedule service

### Phase 2: Schedule

- native schedule list
- event detail
- create/edit event flows
- recurrence UX
- location search and MapKit detail
- schedule settings

### Phase 3: Team

- announcements
- roster
- groups
- chat
- image sending and viewing

### Phase 4: Timer And Workouts

- template storage
- history storage
- active timer runtime
- structured workout progression
- timer settings

### Phase 5: Polish

- launch animation
- onboarding visuals
- empty states
- accessibility
- motion tuning
- test coverage

## Initial Native Code Written In This Pass

- app environment and root flow
- reusable design system foundation
- domain models
- session storage
- API client
- live services for auth, schedule, announcements, chat, roster
- auth scene
- schedule scene
- team / timer / workouts / you scene shells

## Immediate Next Steps

1. Generate the Xcode project from [`project.yml`](/Users/cooperostler/RunningTimeApp/SplitTimeTeamNative/project.yml).
2. Wire native assets and app icon.
3. Finish the schedule port first, since it is already Cloudflare-backed and product-critical.
4. Port the team tab next, including announcements and chat.
5. Port timer/workouts after schedule and team are stable.
