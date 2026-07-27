# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-27

### Changed

-   Promotes the tested 0.1.0 release-candidate line to a stable release.

### Added

-   Keyed arbitrary-mutation reconciliation, content epochs, media prefetching,
    and explicit bottom-following, browsing, jump, and layout-compensation modes.

### Fixed

-   Hardens SSR imports, dynamic-height compensation, cancellable jumps,
    mutation handling, virtualizer input validation, and browsing anchors.

## [0.1.0-rc.3] - 2026-07-21

### Fixed

-   Settles superseded and target-resolved history jumps even when their
    history loader remains pending, including in-place list mutations.
-   Keeps virtual ranges aligned with top padding and re-registers same-key
    measurements when `contentKey` changes.
-   Freezes committed scrollbar height for the complete active browsing gesture
    and refreshes boundary state after structural mutations.
-   Validates virtualizer indices, counts, and heights so invalid public input
    cannot hang or poison Fenwick prefix sums.
-   Correctly builds Fenwick trees from value arrays shorter than their capacity
    and releases stale high-water capacity before small arbitrary rebuilds.

### Documentation

-   Documents the exported stylesheet path and the complete prefetch,
    reconciliation, content epoch, event, and reset APIs.

## [0.1.0-rc.2] - 2026-07-21

### Fixed

-   Preserves the visible row and within-row offset during height compensation
    when the virtual track uses top padding, preventing repeated late media
    measurements from walking a browsing viewport toward the top.

## [0.1.0-rc.1] - 2026-07-20

### Added

-   Keyed arbitrary-mutation reconciliation and `contentKey` epochs.
-   Independent `prefetchOverscan` and `prefetchRange` media warming API.
-   Explicit bottom-following, browsing, jump, and layout-compensation modes.

### Changed

-   Geometrically grows virtualizer storage while clearing truncated values.
-   Coalesces native scroll processing and public scroll events per frame.
-   Commits track height without moving the visible keyed anchor while browsing.
-   Makes keyed jumps cancellable and preserves numeric keys and alignment.

### Fixed

-   Package imports no longer construct `ResizeObserver` during SSR.
-   Observer registration is stable for an existing item element.
-   Tail window capping cannot remove rows required by the viewport.
-   Boundary events use crossing semantics with subpixel hysteresis.

## [0.0.2] - 2025-11-22

### Improved

-   **Smart Auto-Scroll**: Implemented directional locking logic for natural chat behavior.
    -   **Breaking Free**: Scrolling UP uses a tight `autoscrollThreshold` (default 10px) to allow easy escape from the bottom.
    -   **Re-Locking**: Scrolling DOWN uses the `bottomThreshold` (default 3px) to re-engage the lock without needing to hit the absolute bottom.
-   **Jank-Free Updates**: Switched scroll correction from `requestAnimationFrame` to `queueMicrotask`. This eliminates 1-frame visual glitches ("shake") during rapid content updates by applying corrections within the same frame as layout shifts.
-   **Stale State Fix**: Fixed a race condition where the scroller read stale DOM heights during updates. Now uses the virtualizer's calculated height for immediate and accurate state updates.

### Changed

-   **Props**:
    -   Added `autoscrollThreshold` prop (default `10`).
    -   Changed default `bottomThreshold` from `50` to `3` to prevent aggressive re-locking when reading near the bottom.

## [0.0.1] - 2024-11-22

### Added

-   Initial release of or3-scroll
-   Bottom-anchored virtual scrolling for chat interfaces
-   Dynamic height measurement with ResizeObserver
-   Prepend support for loading history
-   Hidden measurement pool for accurate scroll offsets
-   Asymmetric overscan for optimized rendering
-   Jump-to-message composable with history loading
-   Tail rendering optimization with maxWindow constraint
-   Viewport resize handling for mobile keyboards
-   TypeScript support with full type definitions

### Features

-   `Or3Scroll` component with Vue 3 composition API
-   `useScrollJump` composable for navigation
-   `VirtualizerEngine` for efficient virtual scrolling
-   FenwickTree (Binary Indexed Tree) for O(log n) prefix sums
-   ResizeObserver-based measurement system
-   Comprehensive test suite with 79 tests

### Documentation

-   Complete README with API reference
-   Usage examples for common patterns
-   Troubleshooting guide
-   Performance tips and caveats
