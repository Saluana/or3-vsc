---
artifact_id: remed-001
title: Remediation Plan – Or3 Scroll Bugs
---

# Remediation Plan

## Objectives
- Fix prepend/history handling so scroll position stays stable and hidden measurement only runs when requested.
- Stop scroll compensation from fighting active user input.
- Reduce virtualizer memory churn during list growth.
- Strengthen tests to cover prepend, scroll range updates, and user interaction tracking.

## Tasks
1. **Prepend + loadingHistory integration** — ✅
   - Detect prepends without relying solely on the first key; measure new head items when `loadingHistory` is true before `bulkInsert`.
   - Use measured heights for offset compensation so `scrollTop` shifts by the real prepended height.
2. **Scroll compensation gating** — ✅
   - In `flushUpdates`, skip applying `delta` while `isUserScrolling` is true and defer until input ends.
   - Consolidate user scroll tracking (scroll/touch/wheel) to avoid wheel timeouts causing false negatives.
3. **Virtualizer perf/resilience** — ✅
   - Add incremental resize/append support to `FenwickTree`/engine to avoid full `Float64Array` rebuilds on every `setCount`/prepend.
   - Cover tailCount behavior while preserving a single contiguous range.
4. **Hidden measurement pool hygiene** — ✅
   - Only render/measure when history loading or an explicit `measureItems` call is active; ensure pool mirrors slice width but stays inert otherwise.
5. **Test hardening** — ✅
   - Component: simulate prepend with `loadingHistory=true`, verify scroll offset compensation and visible range; add scroll range update test that changes `scrollTop`.
   - Interaction: validate `isUserScrolling` stays true during wheel/touch and compensation waits until end.
   - Engine: add growth benchmark/assertions for `setCount`/`bulkInsert` without full rebuilds; tighten tailCount expectations.
6. **Cleanup + dependencies** — ✅
   - Decide on a single DOM test env (jsdom vs happy-dom) and drop the unused one; prune demo/favicon and other assets only if they are unused.

## Exit Criteria
- Prepend flow keeps the previous first item anchored with measured offsets.
- Scroll compensation never runs during active user input but still corrects after measurements.
- `setCount`/prepend no longer allocate O(n) arrays per mutation.
- New tests fail on regressions in prepend, scrolling, or user interaction tracking.
