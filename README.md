# SplitTimeTeamNative

Native iOS rewrite of `SplitTimeTeamApp`, built in Swift/SwiftUI.

This directory is intentionally separate from the React Native app. The RN app is the product reference for behavior and feature parity, but the native app is being rewritten from scratch with native patterns, native UI controls, and cleaner platform-specific architecture.

## Goals

- Match the current `SplitTimeTeamApp` feature set exactly.
- Prefer native Apple frameworks over custom abstractions whenever possible.
- Keep the codebase modular, typed, testable, and reusable.
- Avoid porting React Native implementation details or UI quirks.

## Structure

- [`App`](/Users/cooperostler/RunningTimeApp/SplitTimeTeamNative/App): app bootstrap, root flow, dependency container
- [`Core`](/Users/cooperostler/RunningTimeApp/SplitTimeTeamNative/Core): design system, domain models, networking, persistence
- [`Features`](/Users/cooperostler/RunningTimeApp/SplitTimeTeamNative/Features): SwiftUI scenes by product area
- [`Services`](/Users/cooperostler/RunningTimeApp/SplitTimeTeamNative/Services): protocol-driven live services
- [`Docs`](/Users/cooperostler/RunningTimeApp/SplitTimeTeamNative/Docs): inventory, plan, and parity tracking

## Current Status

This pass establishes:

- the port plan and feature inventory
- a native app shell with role-aware tabs
- typed domain models for the current app surface
- a reusable API client and session store
- live service implementations for auth, schedule, announcements, chat, and roster
- initial SwiftUI scenes for auth, schedule, team, timer, workouts, and you

The actual feature-by-feature port continues from this foundation.

## Project Generation

A starter XcodeGen spec lives at [`project.yml`](/Users/cooperostler/RunningTimeApp/SplitTimeTeamNative/project.yml).

`xcodegen` is not installed in this environment, so the `.xcodeproj` has not been generated yet. Once it is available, the intended flow is:

```bash
cd /Users/cooperostler/RunningTimeApp/SplitTimeTeamNative
xcodegen generate
open SplitTimeTeamNative.xcodeproj
```

## Backend

The native app is intended to target the same Cloudflare Worker surface currently used by the React Native app:

- `/auth/login`
- `/auth/signup`
- `/auth/me`
- `/team/roster`
- `/announcements`
- `/chat/messages`
- `/chat/image`
- `/schedule`
- `/schedule/events`
- `/schedule/occurrences`

The base URL should be supplied through the `API_BASE_URL` Info.plist key or the `API_BASE_URL` process environment variable.
