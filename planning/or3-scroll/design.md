---
artifact_id: c3084ab5-be9c-42cf-90f3-b5a793102cee
title: Design – Or3 Chat Virtual Scroller
---

# Design: Or3 Chat Virtual Scroller

## 1. Overview

The Or3 Chat Virtual Scroller separates scroll math from rendering to deliver a predictable, bottom-anchored chat experience. A headless virtualizer tracks item heights, offsets, and visible windows; a Vue 3 component renders only the necessary slice, manages scroll/resize input, and orchestrates measurement. The design emphasizes: zero external dependencies, mobile-first performance, deterministic batching, and graceful handling of streaming/dynamic content.

## 2. High-Level Architecture

```mermaid

  Messages[(messages array)] -->|props| Component[Or3Scroll.vue]
  Component -- scroll/resize --> State[Scroll State]
  State --> Engine[VirtualizerEngine]
  Component -- RO entries --> Engine
  Engine -->|range + offsets| Renderer[Slice Renderer]
  Renderer --> DOM[Visible DOM Nodes]
  Component -->|events/methods| HostApp
  HiddenPool{{Hidden Measurement Pool}} --> Component
```

-   **Component Shell**: hosts the scroll container, tracks `scrollTop`, `viewportHeight`, and exposes events/methods.
-   **Headless Engine**: maintains prefix sums of heights, answers "which indexes should render?", and returns `offsetY`/`totalHeight` for the slice transform.
-   **Measurement Subsystem**: `ResizeObserver` for live rows, hidden pool for new history rows.

## 3. Detailed Components & Interfaces

### 3.1 Headless Virtualizer Engine

-   Immutable configuration (`estimateHeight`, `overscanPx`, `tailCount`).
-   Mutable state stored in typed arrays for speed (`Float64Array heights`, `Uint8Array flags`).

```typescript
export type Index = number;

export interface VirtualizerConfig {
    estimateHeight: number; // px
    overscanPx: number; // px
    tailCount: number; // ensure last N items always in range
}

// Overscan is expressed strictly in pixels to keep configuration single-dimensional and aligned with scroll physics; if callers prefer item-count semantics they can convert via their own average height heuristics.

export interface RangeResult {
    startIndex: Index;
    endIndex: Index;
    offsetY: number; // sum heights before startIndex
    totalHeight: number; // known + estimated
}

export class VirtualizerEngine {
    constructor(private config: VirtualizerConfig) {}

    setCount(count: number): void;
    setHeight(index: Index, height: number): void;
    bulkInsert(at: Index, heights: readonly number[]): void; // used for prepend

    computeRange(scrollTop: number, viewportHeight: number): RangeResult;
    findIndexForOffset(offset: number): Index; // binary search over prefix sums
    getOffsetForIndex(index: Index): number;
    getTotalHeight(): number;
}
```

**Implementation Notes**

-   Prefix sums stored as Fenwick tree or segmented array to enable `O(log n)` offset lookups.
-   Unknown heights rely entirely on the provided `estimateHeight`; the engine never auto-tunes, keeping behavior predictable and letting hosts adjust the prop if their content profile shifts.
-   `tailCount` enforces inclusion of last messages even when viewport range would otherwise skip them.

### 3.2 Vue Component `Or3Scroll.vue`

-   Exposes props/methods from requirements.
-   Maintains reactive `scrollState`, `virtualRange`, `visibleItems`.
-   Renders structure:

```vue
<template>
    <div ref="container" class="or3-scroll" @scroll.passive="onScroll">
        <div class="or3-scroll-track" :style="{ height: totalHeight + 'px' }">
            <div
                class="or3-scroll-slice"
                :style="{ transform: `translateY(${offsetY}px)` }"
            >
                <slot name="prepend-loading" v-if="loadingHistory" />
                <template
                    v-for="(item, i) in visibleItems"
                    :key="itemKeys[startIndex + i]"
                >
                    <div ref="setItemRef(startIndex + i)">
                        <slot :item="item" :index="startIndex + i" />
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>
```

**Reactive State**

```typescript
const scrollTop = ref(0);
const viewportHeight = ref(0);
const isAtBottom = computed(
    () =>
        scrollHeight.value - (scrollTop.value + viewportHeight.value) <=
        bottomThreshold
);
const followOutput = ref(true);
```

> Placeholder policy: the component ships no built-in skeleton rows; integrators rely on the `prepend-loading` slot (or their own conditional rendering) to present loading affordances without bloating the core bundle.

### 3.3 Measurement System

-   **ResizeObserver Pool**: Single RO observing each rendered row. Callback collects `{ index, newHeight }` entries, dedupes to last value per index, and schedules `applyHeightUpdates()` in `requestAnimationFrame`.
-   **Hidden Measurement Pool**: Teleported DOM subtree rendered off-screen (visibility hidden, width constrained to match chat width). Used only when `loadingHistory` is true. After `nextTick`, heights recorded and fed into the engine before DOM splice occurs, enabling immediate `scrollTop += prependedHeight` compensation.
-   **Scroll Compensation**: For any height delta affecting indexes `< startIndex`, accumulate `deltaAbove` and adjust container `scrollTop += deltaAbove` unless `isUserScrolling` on touch; in that case, queue compensation for `touchend`.

## 4. Key Runtime Flows

### 4.1 Scroll Event Flow

1. Passive `scroll` handler reads `scrollTop` and `clientHeight` (no layout thrash because values come from event target).
2. Update `isUserScrolling` (based on pointer/touch start/stop) and `isAtBottom`.
3. Call `engine.computeRange(scrollTop, viewportHeight)` to obtain new `startIndex`, `endIndex`, `offsetY`.
4. Update `visibleItems = items.slice(startIndex, endIndex + 1)` and set inline styles.
5. Emit `@scroll` event payload.

### 4.2 Streaming Tail Flow

1. Tail message text mutates → DOM height changes.
2. `ResizeObserver` reports new content box size for tail element.
3. `applyHeightUpdates` updates engine height cache and recomputes total height.
4. If `followOutput` true, schedule `scrollToBottom({ smooth: false })` after `requestAnimationFrame` to let DOM settle.

### 4.3 History Prepend Flow

1. Host sets `loadingHistory = true` and provides new `headItems`.
2. Component renders `headItems` inside hidden pool.
3. After `nextTick`, measure heights, call `engine.bulkInsert(0, measuredHeights)`.
4. Splice `items` array to include new entries at front.
5. In same frame, set `container.scrollTop += sum(measuredHeights)`.
6. Set `loadingHistory = false` and clear pool.

### 4.4 Resize / Keyboard Flow

1. `ResizeObserver` on container or `VisualViewport` listener updates `viewportHeight`.
2. Recompute virtual range.
3. If `followOutput` and `isAtBottom`, snap to bottom.

## 5. Data Models

| Structure               | Fields                                                                                                     | Purpose                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `heights: Float64Array` | per-index height or `NaN` for unknown                                                                      | Minimizes GC pressure, fast typed math  |
| `flags: Uint8Array`     | bitmask: measured, needsRO, pinnedTail                                                                     | Quick boolean lookups                   |
| `ScrollState`           | `scrollTop`, `scrollHeight`, `viewportHeight`, `isAtBottom`, `followOutput`, `isUserScrolling`, `tailMode` | Drives behavior flags                   |
| `MeasurementEntry`      | `{ index, newHeight }`                                                                                     | Pending updates from RO before batching |

## 6. Error Handling & Resilience

-   **ResizeObserver unavailable**: fallback to manual `MutationObserver`/`setInterval` measurement best-effort; log warning in dev mode.
-   **RO loop limit**: swallow known benign error and reschedule measurement next frame.
-   **Inconsistent heights**: guard negative/zero heights, clamp between `[minHeight, maxHeight]` (configurable, default `[16, 2048]`).
-   **Scroll snaps**: clamp `scrollTop` between `[0, scrollHeight - clientHeight]` after each programmatic update.

## 7. Performance Considerations

-   Avoid re-render storms by storing `visibleItems` as shallow readonly array and using keyed `v-for` with stable references.
-   Throttle heavy recomputations to animation frames via a `scheduleRecalc()` helper that coalesces multiple triggers.
-   Use `requestIdleCallback` (where available) to refresh long-idle measurements.
-   Overscan default: `Math.max(2 * viewportHeight, 200)` pixels; configuration stays pixel-based to keep math simple and predictable.
-   Height cache remains in-memory typed arrays with no eviction heuristics; if a host wants to reclaim memory it can call `refreshMeasurements()` to rebuild cached values explicitly.

## 8. Testing Strategy

### 8.1 Unit (Bun test)

-   `VirtualizerEngine` binary search correctness with randomized datasets.
-   Height cache invalidation (setHeight, bulkInsert) ensures prefix sums update.
-   `tailCount` guarantees last item inclusion even with short viewport.

### 8.2 Component (Vitest + Vue Test Utils)

-   Rendering: ensures DOM nodes count equals `visibleItems.length`.
-   Bottom follow: simulate `scrollToBottom`, append items, assert final `scrollTop` ≈ bottom.
-   Opt-out follow: scroll up, append item, ensure `scrollTop` unchanged.
-   Dynamic height: mock RO entries above viewport and confirm compensation.
-   History prepend: mock measurement pool to confirm `scrollTop` shift.

### 8.3 Integration / E2E (Playwright)

-   Streaming scenario with 120fps typing simulation verifying no blank frames.
-   Mobile momentum: run on iOS simulator, confirm no forced scroll during fling.
-   Orientation change: rotate viewport and ensure `isAtBottom` recalculated correctly.

### 8.4 Performance Benchmarks

-   Synthetic test that streams 5,000 tokens into tail while prepending 200 messages; log FPS and JS cost.
-   Memory snapshot verifying typed arrays stay within expected bounds.

## 9. Documentation & Developer Experience

-   Provide README sections: installation (Bun + npm), usage snippet, troubleshooting (teleporting, RO errors), advanced recipes (overscan tuning in px, slot-based placeholders), API reference table.
-   Include storybook-style demo showcasing streaming, prepend, and mobile behaviors for manual validation.
