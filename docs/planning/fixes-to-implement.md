# Fixes to Implement

This document lists concrete fixes that will be implemented based on the code review.

## Critical Fixes (Implementing Now)

### 1. Fix ResizeObserverManager Memory Leak
**File**: `src/lib/measurement/observer.ts`
**Action**: Add proper cleanup and singleton lifecycle management

### 2. Add LICENSE File
**File**: Root directory
**Action**: Add MIT or Apache 2.0 license (user to confirm)

### 3. Fix Unsafe Engine Config Access
**File**: `src/lib/components/Or3Scroll.vue`
**Action**: Add public methods to VirtualizerEngine for config updates

### 4. Verify FenwickTree total() Calculation
**File**: `src/lib/core/fenwick.ts`
**Action**: Review and add test for edge case, fix if needed

### 5. Improve Measurement Race Condition Safety
**File**: `src/lib/components/Or3Scroll.vue`
**Action**: Add AbortController pattern or better cancellation

## High Priority Fixes (Implementing Now)

### 6. Remove Unused Root index.ts
**File**: `index.ts`
**Action**: Delete this file

### 7. Fix Flaky Performance Test
**File**: `src/lib/core/__tests__/performance.test.ts`
**Action**: Increase timeout threshold to 50ms

### 8. Add Null Safety for borderBoxSize
**File**: `src/lib/components/Or3Scroll.vue`
**Action**: Add fallback to contentRect.height

### 9. Replace Any Types
**File**: Multiple locations
**Action**: 
- Fix `el: any` in setItemRef
- Fix `userScrollEndTimeout` typing

### 10. Extract Magic Numbers
**File**: `src/lib/components/Or3Scroll.vue`
**Action**: Create constants for thresholds

## Code Quality Improvements (Implementing Now)

### 11. Improve Public API Exports
**File**: `src/lib/index.ts`
**Action**: Explicitly list exports instead of wildcard

### 12. Add ESLint Auto-fixes
**File**: `src/lib/components/Or3Scroll.vue`
**Action**: Run `eslint --fix` to resolve formatting issues

### 13. Suppress Test Environment Warnings
**File**: Test configuration
**Action**: Only show warnings in non-test environments

### 14. Add Package Files Configuration
**File**: `package.json`
**Action**: Verify files field excludes unnecessary files

## Documentation Fixes (Quick Wins)

### 15. Create CHANGELOG.md
**Action**: Create initial CHANGELOG

### 16. Add Security Note to README
**Action**: Add note about sanitizing user content in slots

### 17. Document Type Requirements
**Action**: Add JSDoc for generic type T requirements

## Items NOT Being Fixed (Out of Scope)

These items are noted but not being fixed in this PR to keep changes minimal:

- Large-scale refactoring into composables (Issue #25) - Too large for pre-publish changes
- FenwickTree abstraction (Issue #26) - Not critical, architectural change
- Performance optimizations for bulkInsert (Issue #9) - Works correctly, optimization can wait
- Debug slot removal (Issue #15) - May be useful for users

## Testing Strategy

After implementing fixes:
1. Run `npm run lint` and ensure all issues resolved
2. Run `npm test` and ensure all tests pass
3. Run `npm run build` and verify build succeeds
4. Verify package.json exports are correct
5. Test import in a sample project
