# Comment Audit – Doubtful/Incomplete Notes

## Findings (verified against current code)
- Virtualizer tailCount test (`src/core/__tests__/virtualizer.test.ts`): Commented doubts are accurate; `computeRange` forces `endIndex = count - 1` whenever `tailCount > 0`, rendering the entire list for most scroll positions. Broken behavior confirmed.
- Hidden measurement pool (`src/components/Or3Scroll.vue`): Comment is stale. `itemsToMeasure` + `measureItems` already render and measure targeted items.
- onItemResize compensation block (`src/components/Or3Scroll.vue`): Comment is obsolete. Code now queues updates (`pendingUpdates`/`flushUpdates`) and performs anchor-based scroll compensation.
- scrollToIndex alignment TODO (`src/components/Or3Scroll.vue`): Still true; only `start` alignment works—`center`/`end` ignored.
- refreshMeasurements placeholder (`src/components/Or3Scroll.vue`): Comment matches reality; function just calls `updateRange()` and provides no memory reclaim or re-measure.
- measureItems test height concern (`src/components/__tests__/Or3Scroll.test.ts`): Concern is partially valid; JSDOM returns 0 heights and the code returns that 0 instead of falling back to `estimateHeight`, making the test nondeterministic.
- tailCount note in engine (`src/core/virtualizer.ts`): Accurate and understates the issue; current logic inflates the range to the whole list when not near the bottom.

## Implementation Plan
1) Fix tailCount range logic in `src/core/virtualizer.ts` to include only the last `tailCount` items without rendering the entire list; add focused tests in `virtualizer.test.ts` to prevent regressions.
2) Clean stale comments in `src/components/Or3Scroll.vue` (hidden pool and onItemResize) to remove outdated doubt.
3) Implement alignment handling (`center`/`end`) in `scrollToIndex` or narrow the API to `start` only; update tests accordingly.
4) Replace `refreshMeasurements` placeholder with a real re-measure pass or remove the method if not needed; adjust exposed API docs/tests.
5) Add measurement fallback that returns `estimateHeight` when DOM reports 0 height; update the `measureItems` test to assert the fallback.
