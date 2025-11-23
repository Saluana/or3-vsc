# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
