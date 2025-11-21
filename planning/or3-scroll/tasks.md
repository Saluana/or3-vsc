---
artifact_id: f2c0ec30-3f8f-4f0f-bb1e-1f0a8c9b6b50
title: Tasks – Or3 Chat Virtual Scroller
---

# Tasks: Or3 Chat Virtual Scroller

## 1. Foundation & Tooling

-   [x] **1.1 Bootstrap project structure** (Req: R1, R2)
    -   Initialize Bun workspace, add `package.json`, align `module` + `types` fields.
    -   Install dev deps: `vue`, `vite`, `typescript`, `vitest`, `@vue/test-utils`.
    -   Author `tsconfig.json` (strict mode, path aliases for `@/core`, etc.).
    -   Scaffold folders per architecture layout (`components`, `core`, `composables`, `measurement`, `styles`).
-   [x] **1.2 Build tooling + scripts** (Req: R8, Non-func Packaging)
    -   Configure Vite library build (ESM + CJS outputs, externalize Vue).
    -   Add Bun scripts: `bun run dev`, `bun run build`, `bun run test`, `bun run lint`.
    -   Set up ESLint + Prettier or Biome with Vue/TS rules to ensure consistent output.

## 2. Headless Virtualizer Engine

-   [x] **2.1 Implement data structures** (Req: R1, R4)
    -   Create typed arrays for heights/flags, Fenwick tree helper for prefix sums.
    -   Document invariants (heights ≥ 0, unknown = `NaN`).
-   [x] **2.2 Core APIs** (Req: R1, R3)
    -   `setCount`, `setHeight`, `bulkInsert`, `computeRange`, `findIndexForOffset`, `getOffsetForIndex`, `getTotalHeight`.
    -   Support `tailCount` to force final items into visible range.
    -   Keep `estimateHeight` purely configuration-driven—no auto-tuning or moving averages inside the engine.
-   [x] **2.3 Engine tests** (Req: R1, R9)
    -   Unit tests covering mixed known/unknown heights, streaming growth, prepend insert, overscan logic, and `tailCount` enforcement.

## 3. Vue Component Shell

-   [x] **3.1 Base template + props** (Req: R2, R8)
    -   Implement `.or3-scroll` container with `overflow-y:auto` and `overflow-anchor:none`.
    -   Define props with defaults (`estimateHeight`, `overscan`, `maintainBottom`, `loadingHistory`, `tailCount`, `itemKey`).
    -   Clarify in props/docs that `overscan` is pixel-based only; if callers want item-count semantics they must convert externally.
    -   Provide slots (`default`, `prepend-loading`) and `defineExpose` methods placeholders, emphasizing that `prepend-loading` is the sanctioned way to show placeholders (no built-in skeleton DOM).
-   [x] **3.2 Scroll state composable** (Req: R2, R3)
    -   Track `scrollTop`, `viewportHeight`, `distanceFromBottom`, `isAtBottom`, `followOutput`, `isUserScrolling`.
    -   Emit `@scroll`, `@reachTop`, `@reachBottom` events with payloads.
-   [x] **3.3 Virtual slice renderer** (Req: R1, R5)
    -   Glue component state to engine: compute `visibleItems`, `startIndex`, `offsetY` each animation frame.
    -   Apply `transform: translateY(offsetY)` to slice wrapper; ensure keys align with `itemKey` lookup map.

## 4. Measurement & Dynamic Heights

-   [x] **4.1 Shared ResizeObserver** (Req: R4, R5)
    -   Create singleton RO that registers/deregisters nodes as they enter/leave slice.
    -   Normalize entries → `{ index, blockSize }`, dedupe per frame, feed engine.
-   [x] **4.2 Scroll compensation logic** (Req: R5)
    -   Detect total delta for indexes < `startIndex` and adjust container `scrollTop` (defer if `isUserScrolling`).
    -   Batch updates with `requestAnimationFrame` to avoid thrash.
-   [x] **4.3 Hidden measurement pool** (Req: R6)
    -   Implement off-screen container that mirrors chat width and uses same slots to guarantee identical layout.
    -   Provide `measureItems(items: T[]): Promise<number[]>` helper returning ordered heights for prepend flow.

## 5. Chat-Specific Behaviors

-   [x] **5.1 Bottom anchoring + follow state machine** (Req: R3, R4)
    -   Derive `followOutput` from `isAtBottom` and `maintainBottom`.
    -   Implement `scrollToBottom({ smooth })` to re-enable follow mode and clamp values.
-   [ ] **5.2 Streaming tail guarantees** (Req: R4)
    -   Keep last `tailCount` indexes in render window even if off-screen; ensure RO always attached.
    -   Auto-scroll only when `followOutput` true and user not dragging.
-   [x] **5.3 History prepend lifecycle** (Req: R6)
    -   Wire `loadingHistory` prop to hidden pool measurement, engine insertion, and `scrollTop` compensation.
    -   Emit `@reachTop` when `scrollTop <= topThreshold` and throttle to avoid spam.

## 6. API Surface & Developer Experience

-   [x] **6.1 Exposed methods + key lookups** (Req: R8)
    -   Implement `scrollToIndex`, `scrollToItemKey` (with `itemKey` map), `refreshMeasurements`.
    -   Document smooth scrolling behavior and fallback for browsers lacking `scrollBehavior`.
    -   Call out that `refreshMeasurements` doubles as the manual lever for reclaiming memory; no automatic cache eviction is planned.
-   [x] **6.2 Diagnostics hooks** (Req: R9)
    -   Provide dev-only `__debug` slot or event with virtualization stats.
    -   Add warnings for missing keys, RO failures, measurement pool misuse.

## 7. Quality Assurance

-   [x] **7.1 Component tests** (Req: R1–R6)
    -   Use Vue Test Utils + Vitest to simulate scroll, append, prepend, streaming, and verify DOM counts + scroll positions.
-   [ ] **7.2 E2E scenarios** (Req: R3–R7)
    -   Playwright scripts for desktop + mobile emulation: rapid scroll, streaming tail, history load, orientation/keyboard change.
-   [ ] **7.3 Performance & regression harness** (Req: Non-func Performance)
    -   Synthetic benchmark page with 5k messages; record FPS/JS cost via Performance API.
    -   Regression tests ensuring `scrollTop` remains stable when toggling image placeholders.

## 8. Packaging & Documentation

-   [x] **8.1 Build artifacts + type declarations** (Req: Non-func Packaging)
    -   Ensure `dist/` includes ESM, CJS, `.d.ts`, and CSS; verify exports map for Node + bundlers.
-   [ ] **8.2 README + demos** (Req: R8)
    -   Document installation (npm, Bun), basic usage snippet, API tables, troubleshooting tips.
    -   Add Storybook/VitePress demo page showing streaming + history interactions, including an example of a custom `prepend-loading` slot in lieu of built-in skeletons.
-   [ ] **8.3 Release checklist**
    -   Run `bun test`, `bun run lint`, `bun run build`.
    -   Tag semantic version, publish to npm, update changelog.
