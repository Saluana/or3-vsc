# or3-scroll audit

Date: 2026-07-22

Scope: `src/lib`, public package surface, unit/integration tests, current uncommitted scroll hardening changes.

Validation: four independent review passes, followed by a main-agent source review. The existing suite passes (124/124), as do lint, build/type declarations, package dry-run, and `git diff --check`. No P0 issue was found.

Counts: 7 P1, 19 P2, 7 P3.

Resolution update: all seven P1 findings were fixed in the working tree on 2026-07-22. Focused regressions were added, bringing the suite to 131 passing tests. The P2 and P3 findings below remain open.

## P1 — Resize measurements capture the anchor after layout has already moved

Location: `src/lib/components/Or3Scroll.vue:172-220`, `src/lib/components/Or3Scroll.vue:578-581`, `src/lib/components/Or3Scroll.vue:612-640`

`ResizeObserver` runs after layout. `flushUpdates()` then calls the DOM-based `captureAnchor()`, so a height change above the viewport has already moved the mounted rows before the anchor is captured. Applying the new height to the engine preserves that post-shift position instead of restoring the pre-change position. The current tests use fixed mocked rectangles and cannot reproduce the browser delivery order.

Consequence: dynamic content above the viewport can still visibly jump even though anchor compensation runs.

Fix: capture measurement anchors from the old virtualizer model before applying queued heights. Reserve DOM-derived anchors for structural mutations where the DOM and old model intentionally differ. Add a real-browser test where an above-viewport row grows and assert the same keyed row remains at the same viewport offset.

## P1 — A content reset leaves old scroll work active

Location: `src/lib/components/Or3Scroll.vue:409-518`, `src/lib/components/Or3Scroll.vue:831-860`

`resetForNewContent()` does not clear `userScrollEndTimeout`, cancel `scrollFrame`, or reset `isUserScrolling`. A timeout or frame created while viewing content A can run after `contentKey` switches to content B and commit/anchor the new list using stale interaction state.

Consequence: switching conversations during or immediately after a scroll can cause a delayed jump, wrong mode transition, or delayed track-height commit in the new list.

Fix: clear the timeout, cancel the pending scroll frame, set `isUserScrolling = false`, synchronize processed/latest scroll positions, and guard delayed callbacks with the content generation.

## P1 — The item ref-setter cache grows with every row ever visited

Location: `src/lib/components/Or3Scroll.vue:559-590`, `src/lib/components/Or3Scroll.vue:643-654`

When a virtualized row unmounts, its element is removed from `itemElements`, but its callback remains in `itemRefSetters`. It is deleted only if the item leaves the data array. Traversing 100,000 retained rows can therefore retain about 100,000 closures even though the DOM window remains small.

Consequence: long sessions accumulate avoidable heap use and GC pressure.

Fix: delete the setter when its ref receives `null`, or use lifecycle-bounded ref callbacks. Add diagnostics and a browser memory test proving ref-related state stays proportional to the mounted window.

## P1 — History measurement mounts the whole prepend batch through the real slot

Location: `src/lib/components/Or3Scroll.vue:529-543`, `src/lib/components/Or3Scroll.vue:706-714`, `src/lib/components/Or3Scroll.vue:1152-1168`

With `loadingHistory`, every prepended row is rendered simultaneously in the hidden pool using the production slot. A 10,000-row prepend mounts 10,000 Vue subtrees and can repeat row side effects such as image requests, subscriptions, analytics, component setup, or duplicate IDs.

Consequence: virtualization is defeated during large history loads, producing main-thread stalls, memory spikes, and potentially duplicated behavior.

Fix: insert with estimates and converge through visible observers, or measure bounded batches across frames. If hidden rendering remains supported, expose a separate documented side-effect-free measurement slot.

## P1 — `prepend-loading` is inside the translated virtual slice

Location: `src/lib/components/Or3Scroll.vue:1133-1150`

The loading slot is normal-flow content before the rows, but the entire slice is translated to `offsetY`. The loader follows the current virtual window rather than staying at the real list top, and its height shifts every visible row without being represented in the virtualizer.

Consequence: row offsets, track height, anchoring, and scrollbar geometry disagree by the loader height.

Fix: render the loader separately at the actual track top. Make it an overlay, or explicitly measure it and model it as top padding.

## P1 — Native `scrollend` can finish before the pending scroll frame

Location: `src/lib/components/Or3Scroll.vue:409-481`, `src/lib/components/Or3Scroll.vue:515-518`

A `scroll` event schedules `processScrollFrame()`. If `scrollend` runs first, `finishScrolling()` clears the scrolling state, then the stale frame sees an unprocessed delta, sets `isUserScrolling` back to true, and starts another 140ms timer.

Consequence: a phantom second scrolling period delays layout commits and can produce a late compensation bump after the gesture visibly ended.

Fix: flush or cancel the pending frame before finishing, and synchronize `latestScrollTop` and `processedScrollTop` in `finishScrolling()`. Add a test that dispatches `scroll` and `scrollend` in the same frame.

## P1 — The fallback timer can finish a touch gesture while the finger is still down

Location: `src/lib/components/Or3Scroll.vue:495-503`, `src/lib/components/Or3Scroll.vue:1115-1123`

`touchstart` immediately starts the 140ms inactivity timer, but no `touchend`, `touchcancel`, `pointerup`, or `pointercancel` state is tracked. A touch-and-hold longer than 140ms is treated as finished even though the gesture remains active.

Consequence: pending layout changes can commit under the finger, and a later drag begins from incorrect interaction state.

Fix: track pointer-down state independently and never finish while a pointer is active. Prefer pointer events with down/up/cancel handling, using scroll inactivity only after release.

## P2 — Append/prepend fast paths do not verify the retained key sequence

Location: `src/lib/components/Or3Scroll.vue:736-800`

The same-length path checks only first and last keys. Append and prepend paths also check only boundary keys. A changed or reordered middle element is accepted as unchanged, leaving `currentKeys`, `indexByKey`, rendered Vue keys, and measured heights out of sync.

Consequence: measurements can be applied to the wrong item and `scrollToItemKey()` can target a stale index.

Fix: compare the complete retained sequence before using a fast path; on any mismatch, fall back to full reconciliation. Add middle-replacement and middle-reorder tests in default mutation mode.

## P2 — Viewport resize compensation can fight an active user gesture

Location: `src/lib/components/Or3Scroll.vue:964-975`

`onViewportResize()` commits model height and may follow the bottom without checking `isUserScrolling`, unlike other layout paths.

Consequence: browser chrome changes, keyboard appearance, or container resizing during a gesture can overwrite the user's scroll position.

Fix: route viewport changes through the same deferred commit policy as measurements and disable bottom-follow compensation while the user controls the scroll.

## P2 — Any descendant mouse click is classified as scrolling

Location: `src/lib/components/Or3Scroll.vue:495-503`, `src/lib/components/Or3Scroll.vue:1119-1122`

The bubbling `mousedown` handler marks the container as user-scrolling and cancels active jumps for ordinary button, link, input, selection, and context-menu interactions.

Consequence: unrelated clicks can delay height commits, change scroll mode, and cancel programmatic navigation.

Fix: remove the generic handler. Detect actual scrollbar/pointer dragging explicitly, and otherwise rely on real scroll deltas, wheel, keyboard, and touch/pointer movement.

## P2 — Content resets retain boundary-event latches

Location: `src/lib/components/Or3Scroll.vue:95-96`, `src/lib/components/Or3Scroll.vue:385-400`, `src/lib/components/Or3Scroll.vue:831-860`

`resetForNewContent()` leaves `reachedTop` and `reachedBottom` unchanged.

Consequence: if content A ended at a boundary and content B starts at the same boundary, B may never emit its initial `reachTop` or `reachBottom`; history loading can silently fail.

Fix: reset both latches before refreshing structural state.

## P2 — The tail range activates at an exact non-overlap boundary

Location: `src/lib/core/virtualizer.ts:188-237`

`visibleEnd` is treated as an inclusive offset and tail mode activates on `visibleEnd >= tailStartOffset`. At exact equality, a one-pixel movement can change a modest range such as 39–49 into the entire 40–99 tail.

Consequence: a large mount cliff occurs before the tail is actually visible.

Fix: use half-open offset semantics and activate tail mode only when the range truly overlaps (`visibleEnd > tailStartOffset`). Add an exact-boundary test.

## P2 — Public `maxWindow` can violate the advertised `tailCount`

Location: `src/lib/core/virtualizer.ts:5-11`, `src/lib/core/virtualizer.ts:204-237`

`VirtualizerEngine` is publicly exported. Configurations such as `tailCount: 10, maxWindow: 4` are accepted, but the cap can render fewer than ten tail rows despite the contract saying the last N are ensured.

Consequence: public engine behavior contradicts its type documentation.

Fix: reject contradictory configuration or normalize `maxWindow` to at least `tailCount`.

## P2 — Large replacements and prepends can throw due to argument spreading

Location: `src/lib/components/Or3Scroll.vue:657-659`, `src/lib/components/Or3Scroll.vue:722-724`

`splice(...keys)` and `unshift(...records.map(...))` pass one function argument per item. Browser argument-count limits are commonly reached around large six-figure lists, yielding `RangeError: Maximum call stack size exceeded`.

Consequence: the component crashes on inputs that the core virtualizer otherwise supports.

Fix: copy keys with indexed loops or replace array contents without variadic calls. Add a 200,000-key reconciliation test.

## P2 — Large suffix shrink is synchronous and retains peak allocation

Location: `src/lib/core/virtualizer.ts:48-73`

Shrinking calls a Fenwick update for every removed item and retains the old typed-array capacity. A reviewed benchmark took about 50ms and retained roughly 136MB when shrinking a five-million-row engine to one row.

Consequence: large resets can block the main thread and keep high-water memory alive.

Fix: use a bulk truncate/rebuild path when the removed ratio is large and release capacity with sensible hysteresis.

## P2 — Smooth keyed jumps start a second smooth animation one frame later

Location: `src/lib/components/Or3Scroll.vue:900-940`

`scrollToIndex()` performs one smooth estimated scroll and then, after `nextTick` plus a frame, starts another smooth scroll to the measured target.

Consequence: the second native animation can restart velocity, create extra `scrollend` activity, and cause visible settling.

Fix: make the correction instant and only above an epsilon, or wait for the first smooth animation to finish before starting a correction.

## P2 — `useScrollJump` drops requests made before the component ref is ready

Location: `src/lib/composables/useScrollJump.ts:59-95`

If the target item exists but `scrollerRef` is still null, `completeJump()` returns false and the request goes idle. No watcher retries when the component mounts.

Consequence: jumps during mount, route transition, or conditional rendering silently disappear.

Fix: wait for both target availability and a non-null scroller, or return an explicit failure result so the caller can retry.

## P2 — Superseded history loads keep running

Location: `src/lib/composables/useScrollJump.ts:77-136`

Settling `activeWait` cancels only the local race. The previous `loadHistoryUntil()` promise continues and may still perform network/database work and mutate shared items.

Consequence: repeated jumps can leave several pagination loops active and apply stale data.

Fix: add `AbortSignal` to the loader contract and abort the previous controller whenever a jump is superseded.

## P2 — Changing `itemKey` does not reconcile default mutation mode

Location: `src/lib/components/Or3Scroll.vue:1037-1045`

The default watcher tracks only item-array identity and length. Changing `itemKey` alone immediately changes template keys but does not rebuild `currentKeys` or `indexByKey`.

Consequence: observer updates are dropped, keyed jumps use stale indexes, and Vue keys diverge from virtualizer keys.

Fix: watch `itemKey` and fully reconcile, or explicitly make it immutable and enforce that contract.

## P2 — Viewport size switches between two different box metrics

Location: `src/lib/components/Or3Scroll.vue:977-988`

Mount uses `clientHeight`, while ResizeObserver updates use `entry.contentRect.height`. These differ when the scroll root has padding or borders, but other calculations continue using `clientHeight`.

Consequence: range selection, bottom distance, and anchor validation disagree after the first resize callback.

Fix: use `target.clientHeight` consistently; the observer only needs to signal that size changed.

## P2 — Every row clips consumer content

Location: `src/lib/components/Or3Scroll.vue:1205-1208`

`overflow: hidden` prevents margin collapse but also clips focus rings, shadows, menus, tooltips, sticky content, and positioned decorations.

Consequence: arbitrary slot content can be visually broken or inaccessible.

Fix: use `display: flow-root` for margin containment, or document the row-layout constraint instead of globally clipping content.

## P2 — Virtualization can unmount the focused row without focus management

Location: `src/lib/components/Or3Scroll.vue:112-115`, `src/lib/components/Or3Scroll.vue:1138-1149`

The render range is geometry-only. When a focused button, input, or link leaves the window, Vue removes it and browser focus typically falls back to the document.

Consequence: keyboard and assistive-technology users lose their place.

Fix: retain the keyed row containing `document.activeElement` until focus moves, or deliberately transfer focus to the scroll region before removal.

## P2 — Keyboard scrolling is not reliably accessible

Location: `src/lib/components/Or3Scroll.vue:505-513`, `src/lib/components/Or3Scroll.vue:1115-1124`

The root has a key handler but no `tabindex`, role, or accessible name. Events from focused inputs also bubble and can incorrectly mark typing/navigation as scrolling.

Consequence: the advertised keyboard path varies by browser and can interfere with interactive row content.

Fix: support a focusable, named scroll region and ignore key events originating from editable/interactive descendants unless the container itself owns the action.

## P2 — `itemKey` types permit unsupported object-valued properties

Location: `src/lib/components/types.ts:3-18`, `src/lib/components/Or3Scroll.vue:117-130`

`keyof T` accepts any property name, even when that property resolves to an object. Runtime warns but casts it to `string | number`.

Consequence: object identity enters key maps and Vue keys despite the public contract promising primitive keys.

Fix: restrict property names to keys whose values extend `string | number`, while preserving the callback form.

## P2 — Layout-number props are not consistently normalized

Location: `src/lib/components/Or3Scroll.vue:224-244`, `src/lib/components/Or3Scroll.vue:360-380`

Padding and threshold props feed arithmetic directly. Negative values, `NaN`, or infinity can produce invalid track heights, scroll targets, and bottom decisions.

Consequence: malformed but type-valid runtime props corrupt layout state.

Fix: normalize every numeric prop through shared finite/non-negative helpers and test invalid values.

## P2 — Arbitrary reconciliation repeatedly allocates list-sized structures

Location: `src/lib/components/Or3Scroll.vue:643-670`, `src/lib/components/Or3Scroll.vue:1037-1045`, `src/lib/core/virtualizer.ts:410-415`

Each arbitrary mutation maps all keys in the watcher, maps again during reconciliation, creates a full `Set`, creates another full heights array, and rebuilds a capacity-sized prefix buffer.

Consequence: frequently resorted large lists generate O(N) allocation and GC spikes even for small logical changes.

Fix: accept keyed change sets/version signals, reuse scratch storage, and avoid materializing the same key list multiple times.

## P3 — Fenwick search assumes an invariant that public methods do not enforce

Location: `src/lib/core/fenwick.ts:5-8`, `src/lib/core/fenwick.ts:80-116`

The documented invariant requires non-negative values so prefix sums remain monotonic, but `build()` and `update()` accept negative values. For example, `[10, -20, 30]` makes offset-search results invalid.

Consequence: direct public use can silently return wrong lower/upper bounds.

Fix: enforce non-negative stored values or make the tree internal and clearly separate generic sum operations from monotonic search operations.

## P3 — ResizeObserver border-box fallback mishandles older object-shaped values

Location: `src/lib/components/Or3Scroll.vue:578-581`

The code assumes `borderBoxSize` is an array. Implementations exposing a single object fall through to content-box height, losing padding and borders.

Consequence: measured row height can be too small in affected browsers.

Fix: normalize array and object forms, then fall back to `getBoundingClientRect().height`.

## P3 — HMR can disconnect measurements for already-mounted rows

Location: `src/lib/measurement/observer.ts:49`

HMR disposal clears the shared observer callbacks, but mounted components are not guaranteed to rerun template refs and register again.

Consequence: dynamic height updates can stop during development until a remount.

Fix: force component reload with the observer module or expose an HMR generation signal that re-registers mounted rows.

## P3 — Browser scroll physics have no real-browser regression suite

Location: `src/lib/components/Or3Scroll.vue:133-137`, component tests under `src/lib/components/__tests__`

All component scroll tests run in JSDOM, and production animation frames are replaced by microtasks. Native smooth scrolling, compositor timing, scrollbar dragging, ResizeObserver delivery order, touch gestures, and actual `scrollend` ordering are not exercised.

Consequence: 124 passing tests can still ship the exact jumps and end-of-scroll bumps recently seen in Brave.

Fix: add Playwright coverage for wheel scrolling, thumb dragging, touch/pointer gestures, smooth jumps, above-viewport growth, reorders, and long traversal in Chromium and WebKit.

## P3 — Several performance/memory tests have vacuous assertions

Location: `src/lib/components/__tests__/memory.test.ts:51-78`, `__tests__/integration/demo1-streaming.test.ts:320-345`, `__tests__/integration/streaming-robustness.test.ts:390-430`

Examples assert `true`, count only DOM nodes while claiming to inspect internal growth, or merely verify that `scrollTop` exists while claiming to detect layout thrashing.

Consequence: reassuring test names do not guard the behavior they describe.

Fix: expose development diagnostics or instrument observer counts, cache sizes, engine calls, geometry reads, and scroll writes; assert concrete upper bounds.

## P3 — Timing tests are random and machine-dependent

Location: `src/lib/core/__tests__/performance.test.ts:16-76`, `src/lib/core/__tests__/virtualizer.extended.test.ts:386-438`

Regular unit tests use `Math.random()` and wall-clock thresholds without controlled warm-up or stable sampling.

Consequence: CI can be noisy while meaningful regressions remain hard to detect.

Fix: seed data, move benchmarks out of correctness tests, warm up explicitly, and compare medians or complexity ratios over multiple samples.

## P3 — Package-surface tests bypass real package resolution

Location: `tests/package-surface.test.ts:74-83`

The tests import absolute files from `dist`; they do not install the packed tarball and resolve `or3-scroll` and `or3-scroll/style.css` as a consumer.

Consequence: broken export maps, declaration paths, or install-time contents can pass.

Fix: pack into a temporary consumer fixture, install the tarball, and run ESM, CJS, stylesheet, and TypeScript imports through the package exports.

## Checked-safe areas

- SSR import does not eagerly construct `ResizeObserver`.
- Observer targets are unregistered on row/component cleanup.
- Async prepend, measurement, jump, and content reset paths use generation guards for several stale-completion cases.
- Native `scrollend` and timer completion are mostly idempotent after the current uncommitted hardening.
- The new epsilon guard prevents recursive no-op anchor writes.
- The core virtualizer's steady-state lookup and height-update paths remain logarithmic.
- Typed-array growth is geometric, and large full replacements can release capacity.
- The package dry-run contains ESM, CJS, declarations, stylesheet, README, changelog, and license.
