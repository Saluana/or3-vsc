// Main component export
import Or3Scroll from './components/Or3Scroll.vue';
export { Or3Scroll };

// Composables for advanced usage
export { useScrollJump } from './composables/useScrollJump';
export type { UseScrollJumpOptions, Or3ScrollRef, JumpState } from './composables/useScrollJump';

// Core engine types (for advanced users who need direct access)
export { VirtualizerEngine } from './core/virtualizer';
export type { VirtualizerConfig, RangeResult, Index } from './core/virtualizer';
