// Main component export
import Or3Scroll from './components/Or3Scroll.vue';
export { Or3Scroll };
export type {
  Or3ScrollAnchorPoint,
  Or3ScrollItemKey,
  Or3ScrollPrefetchRange,
  Or3ScrollProps,
  Or3ScrollViewState,
} from './components/types';

// Composables for advanced usage
export { useScrollJump } from './composables/useScrollJump';
export type {
  UseScrollJumpOptions,
  Or3ScrollRef,
  JumpState,
  ScrollJumpAlignment,
} from './composables/useScrollJump';

// Core engine types (for advanced users who need direct access)
export { VirtualizerEngine } from './core/virtualizer';
export type { VirtualizerConfig, RangeResult, Index } from './core/virtualizer';
