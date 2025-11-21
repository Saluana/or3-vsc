---
artifact_id: 1b7d59a1-6d53-4a2c-b1fe-02979042f2ef
title: Requirements – Or3 Chat Virtual Scroller
---

# Requirements: Or3 Chat Virtual Scroller

## 1. Introduction & Scope

The **Or3 Chat Virtual Scroller** is a dependency-free Vue 3 component that virtualizes long chat transcripts while honoring chat-specific behaviors (bottom anchoring, AI streaming, history prepends, dynamic item growth). The scope includes the headless virtualization engine, the Vue presentation component, and the measurement pipeline required to deliver a stable scroll experience on desktop and mobile. Out of scope: non-vertical layouts, non-Vue frameworks, and animation libraries.

## 2. Stakeholders, Assumptions, Constraints

-   **Stakeholders**: Or3 Chat end users, Or3 frontend developers, QA engineers validating chat regressions, Product owners measuring chat UX.
-   **Assumptions**: Messages are provided in chronological order, the host app controls data fetching, and browsers support `ResizeObserver` (with reduced UX but graceful degradation when unavailable).
-   **Constraints**: Zero runtime dependencies, packaging as an npm module built with Bun, TypeScript-first codebase, and container-based scrolling only.

## 3. Functional Requirements (User Stories with Acceptance Criteria)

### 3.1 Core Virtualization (R1)

**User Story**: As a developer, I need the scroller to render only the visible slice plus overscan so that DOM cost stays low even for thousands of messages.

-   **AC-1**: WHEN the dataset size reaches 10,000 items, THEN the DOM SHALL contain ≤ 60 message rows (visible + overscan) at any time.
-   **AC-2**: WHEN the user scrolls rapidly from top to bottom, THEN frames SHALL render without blank gaps, and items SHALL recycle seamlessly.
-   **AC-3**: GIVEN message heights are unknown, THEN the engine SHALL use an `estimateHeight` to keep totalHeight predictions within ±20% of the actual value until measurements arrive.

### 3.2 Scroll Container (R2)

**User Story**: As an integrator, I want the scroll container to manage its own window so my app only supplies `items` and templates.

-   **AC-1**: GIVEN the component mount, THEN it SHALL create a container with `overflow-y: auto`, `overflow-anchor: none`, and pointer/touch listeners marked `passive`.
-   **AC-2**: WHEN `items` changes length or order, THEN the virtual window SHALL recompute on the next animation frame without app intervention.

### 3.3 Bottom Anchoring & Follow Output (R3)

**User Story**: As a chat reader, I want the viewport to stay pinned to the newest content unless I intentionally scroll away.

-   **AC-1**: IF `scrollHeight - (scrollTop + clientHeight) ≤ threshold`, THEN `isAtBottom` SHALL be true and `followOutput` SHALL be eligible.
-   **AC-2**: WHEN `followOutput` is true and a new message appends, THEN the viewport SHALL remain within 5px of the bottom after layout settles.
-   **AC-3**: WHEN the user scrolls upward beyond the threshold, THEN `followOutput` SHALL switch to false within the same scroll event and remain false until the user returns to the bottom or calls `scrollToBottom`.

### 3.4 Streaming Tail Handling (R4)

**User Story**: As an AI user, I want the last streaming message to grow naturally without jitter.

-   **AC-1**: WHEN characters stream into the tail message, THEN its DOM element SHALL stay observed and update its measured height within 16ms of the browser `ResizeObserver` callback.
-   **AC-2**: IF `followOutput` is true during streaming, THEN the component SHALL re-pin to `scrollHeight - clientHeight` after each animation frame where totalHeight changes.
-   **AC-3**: IF `followOutput` is false, THEN the scroller SHALL not auto-scroll even while the tail grows.

### 3.5 Dynamic Heights Inside/Above Viewport (R5)

**User Story**: As a reader, I want expanding messages or media loads to avoid teleports.

-   **AC-1**: WHEN a visible item increases height, THEN lower items SHALL shift via normal DOM flow without absolute positioning.
-   **AC-2**: WHEN an off-screen (above viewport) item changes height by `Δh`, THEN `scrollTop` SHALL adjust by the same delta within the batch update so that the previously visible message remains aligned.
-   **AC-3**: Height updates SHALL be batched per animation frame to prevent thrashing.

### 3.6 History Prepend (R6)

**User Story**: As a user scrolling up, I want older messages to load seamlessly.

-   **AC-1**: WHEN `reachTop` fires and the host loads N older items, THEN the component SHALL measure them in the hidden pool before inserting into the main list when `loadingHistory` is true.
-   **AC-2**: AFTER prepending, the message that was at the previous top of the viewport SHALL remain within ±2px of its prior position.
-   **AC-3**: The prepend operation SHALL complete within one animation frame after measurements resolve to avoid visible flashes.

### 3.7 Mobile & Accessibility (R7)

**User Story**: As a mobile user, I expect native-feeling scrolling and correct behavior when the keyboard toggles.

-   **AC-1**: Touch scroll events SHALL not be interrupted by programmatic `scrollTop` changes while `isUserScrolling` is true; compensation may defer until touchend.
-   **AC-2**: WHEN `clientHeight` changes (keyboard/orientation), THEN the component SHALL recompute `viewportHeight`, `isAtBottom`, and the virtual window within 1 animation frame.
-   **AC-3**: The component SHALL expose ARIA roles/hooks so that screen readers encounter a consistent list (`role="list"` / `role="listitem"`).

### 3.8 API Surface (R8)

**User Story**: As a developer, I want a clear API that fits Vue patterns.

-   **AC-1**: Props SHALL include `items`, `itemKey`, `estimateHeight`, `overscan`, `maintainBottom`, `loadingHistory`, and optional `tailCount` with documented defaults.
-   **AC-2**: Events SHALL emit payloads `{ scrollTop, scrollHeight, clientHeight, isAtBottom }` for `@scroll`, along with simple signals for `@reachTop`/`@reachBottom`.
-   **AC-3**: Methods exposed via `defineExpose` SHALL include `scrollToBottom`, `scrollToIndex`, `scrollToItemKey`, and `refreshMeasurements`, each supporting `{ smooth?: boolean, align?: 'start'|'center'|'end' }` where applicable.

### 3.9 Diagnostics & Telemetry (R9)

**User Story**: As a developer, I want insight into virtualization state for debugging.

-   **AC-1**: The component SHALL expose a dev-only `__debug` slot or emitted event that reports `startIndex`, `endIndex`, `totalHeight`, and cache hit stats when `process.env.NODE_ENV !== 'production'`.
-   **AC-2**: The engine SHALL track cache misses vs. hits to help tune `estimateHeight` (aggregated counters, not per item objects, to keep memory low).

## 4. Non-Functional Requirements

-   **Performance**: Scroll handler work SHALL be ≤ 1ms per event on mid-range mobile (A14). Virtual range computations SHALL be `O(log n)` via prefix sums. Memory overhead per item SHALL stay ≤ 24 bytes (height + flags).
-   **Stability**: Component SHALL recover gracefully if `ResizeObserver` is unavailable by reverting to `estimateHeight` without crashing.
-   **Compatibility**: Support latest two major versions of Chrome, Safari, Firefox, Edge. Support Vue 3.4+ with script setup and Composition API.
-   **Packaging**: Ship ESM, CJS, and type declarations. Provide `exports` map and `types` entry for TypeScript consumers.
-   **Operational**: Provide documentation covering integration, troubleshooting (e.g., scroll loops), and migration guidance from legacy virtualizers.

## 5. Success Metrics & Acceptance Plan

-   **Latency**: Rendering 1,000 messages SHALL take < 50ms on a cold mount on desktop, verified via synthetic benchmark.
-   **Scroll Smoothness**: Dropped frame rate SHALL remain < 5% on mobile stress test (60fps target) when streaming and loading history simultaneously.
-   **Adoption**: Or3 Chat beta build switches from legacy virtualizer to this component without UX regressions in smoke tests.

## 6. Open Questions

1. **Overscan Units** → **Pixels-only**. Pixel values align with scroll physics, keep config single-dimensional, and avoid extra conversion math. Developers needing item-count semantics can trivially convert (`items * avgHeight`), so the core stays lean.
2. **`estimateHeight` Strategy** → **Static with manual override**. Auto-tuning introduces subtle feedback loops and extra state tracking. A stable default plus documented guidance for apps to update the prop when they detect different content keeps behavior predictable and code minimal.
3. **Skeleton Support** → **Rely on `prepend-loading` slot**. The slot keeps responsibility with the host UI, avoids bundling additional DOM/styles, and still lets teams inject any placeholder without touching the virtualizer internals.
4. **Low-Memory Behavior** → **No special cache limiter**. Height cache already stores primitive numbers, so overhead is tiny compared to message data. Introducing eviction heuristics would add complexity and risk jitter; instead we’ll document how to reset measurements (`refreshMeasurements`) if a host truly needs to recycle state.
