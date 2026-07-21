# or3-scroll

A headless, chat-optimized virtual scroller for Vue 3. Designed for bottom-anchored layouts, streaming content, and dynamic item heights.

## Features

-   **Smart Auto-Scroll**: Locks to the bottom with a tight, configurable threshold (default 10px), allowing users to easily "break free" to read history without fighting the scroller.
-   **Stable Browsing**: Commits layout changes at scroll end while preserving the visible keyed row and its within-row offset.
-   **Bottom Anchoring**: Keeps the scroll position pinned to the bottom as new content arrives (chat style).
-   **Dynamic Heights**: Handles items with variable and changing heights without jitter.
-   **Prepend Support**: Seamlessly handles loading history (prepending items) while maintaining scroll position.
-   **Hidden Measurement**: Measures items in a hidden pool before rendering to ensure accurate scroll offsets.
-   **Optimized Tail Rendering**: Smart tail region handling with `maxWindow` constraint prevents excessive DOM nodes while keeping recent messages always rendered.
-   **Viewport Resize Handling**: Gracefully handles container height changes (e.g., mobile keyboards) with `ResizeObserver` integration.
-   **Jump-to-Message**: Built-in `useScrollJump` composable for ID-based navigation with partial history loading support.
-   **Media Prefetch Range**: Warms media ahead of the viewport without mounting additional rows.
-   **SSR-Safe Import**: Browser observers are constructed lazily after mounting.

## Scroll Physics & Auto-Scroll Behavior

`or3-scroll` implements a sophisticated auto-scroll logic designed specifically for high-frequency chat applications:

1.  **Explicit Scroll Intent**:

    -   Following-bottom, user-browsing, programmatic-jump, and layout-compensation work are tracked separately.
    -   Wheel, pointer, touch, keyboard, scrollbar, and unexplained upward movement suspend bottom following.
    -   Reaching the bottom or calling `scrollToBottom()` resumes following when `maintainBottom` is enabled.

2.  **Committed Scrollbar & Keyed Anchor**:

    -   While browsing, model height changes are batched until native `scrollend` or the inactivity fallback fires.
    -   The visible keyed row and within-row offset are preserved when the committed height changes.
    -   While following, the new track height and bottom position are committed together.

3.  **Frame-Coalesced Work**:
    -   Native scroll events, range calculation, prefetch calculation, and the public `scroll` event are coalesced to the latest position once per animation frame.

## Installation

```bash
npm install or3-scroll
# or
yarn add or3-scroll
# or
pnpm add or3-scroll
# or
bun add or3-scroll
```

## Basic Usage

Here is a minimal example of a chat interface using `<Or3Scroll>`.

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { Or3Scroll } from 'or3-scroll';
import 'or3-scroll/style.css'; // Required for structural layout

const messages = ref([
    { id: 1, text: 'Hello!' },
    { id: 2, text: 'How are you?' },
    // ... more messages
]);

const onReachTop = () => {
    console.log('Load more history...');
    // prepend logic here
};
</script>

<template>
    <div class="chat-container">
        <Or3Scroll
            :items="messages"
            item-key="id"
            :estimate-height="32"
            @reachTop="onReachTop"
        >
            <template #default="{ item }">
                <div class="message">
                    {{ item.text }}
                </div>
            </template>
        </Or3Scroll>
    </div>
</template>

<style>
.chat-container {
    height: 400px; /* Must have a fixed height */
}
.message {
    padding: 8px;
    border-bottom: 1px solid #eee;
}
</style>
```

## Using Methods

To use exposed methods like `scrollToBottom` or `scrollToItemKey`, attach a `ref` to the component.

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { Or3Scroll } from 'or3-scroll';

// 1. Create a ref typed with the component instance
const scrollRef = ref<InstanceType<typeof Or3Scroll> | null>(null);

const jumpToBottom = () => {
    // 2. Call methods on the ref
    scrollRef.value?.scrollToBottom();
};

const jumpToMessage = (id: number) => {
    scrollRef.value?.scrollToItemKey(id, { smooth: true, align: 'center' });
};
</script>

<template>
    <div class="controls">
        <button @click="jumpToBottom">Go to Bottom</button>
        <button @click="jumpToMessage(50)">Jump to #50</button>
    </div>

    <div class="chat-container">
        <Or3Scroll ref="scrollRef" :items="messages" item-key="id">
            <!-- ... -->
        </Or3Scroll>
    </div>
</template>
```

## Jump to Message with History Loading

For "jump to message" functionality with partial history loading, use the `useScrollJump` composable:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { Or3Scroll, useScrollJump } from 'or3-scroll';

const messages = ref([...]);
const scrollerRef = ref<InstanceType<typeof Or3Scroll> | null>(null);

// Setup jump-to-message with history loading
const { jumpTo, jumpState } = useScrollJump({
  scrollerRef,
  items: messages,
  getItemId: (msg) => msg.id,
  loadHistoryUntil: async (targetId, direction) => {
    // Load messages until targetId is found
    while (!messages.value.find(m => m.id === targetId)) {
      const olderMessages = await fetchOlderMessages();
      if (olderMessages.length === 0) break;
      messages.value = [...olderMessages, ...messages.value];
    }
  }
});

// Later: jump to a message that might not be loaded yet
jumpTo('message-123', { align: 'center' });
</script>

<template>
    <div class="chat-container">
        <!-- Show a loading indicator while searching history -->
        <div v-if="jumpState.state === 'waitingForHistory'" class="jump-loader">
            Locating message...
        </div>

        <Or3Scroll ref="scrollerRef" :items="messages" item-key="id">
            <!-- ... -->
        </Or3Scroll>
    </div>
</template>
```

## API Reference

### Props

| Prop                  | Type                                      | Default | Description                                                                                                      |
| --------------------- | ----------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `items`               | `T[]`                                     | —       | The array of data items to render.                                                                               |
| `itemKey`             | `keyof T \| ((item: T) => string \| number)` | —       | Required stable, unique key accessor.                                                                            |
| `estimateHeight`      | `number`                                  | `50`    | Estimated row height in pixels.                                                                                  |
| `overscan`            | `number`                                  | `200`   | Extra pixels of mounted rows above and below the viewport.                                                       |
| `prefetchOverscan`    | `number`                                  | `0`     | Extra pixels used only for `prefetchRange`; it never mounts rows or changes track height.                        |
| `maintainBottom`      | `boolean`                                 | `true`  | Follows new tail content unless the user is browsing.                                                            |
| `loadingHistory`      | `boolean`                                 | `false` | Enables measured prepend handling.                                                                              |
| `tailCount`           | `number`                                  | `0`     | Number of tail rows kept mounted when the overscanned range reaches the tail.                                    |
| `paddingBottom`       | `number`                                  | `0`     | Extra scroll-track padding below the rows.                                                                       |
| `paddingTop`          | `number`                                  | `0`     | Extra scroll-track padding above the rows.                                                                       |
| `bottomThreshold`     | `number`                                  | `3`     | Maximum distance used to report the physical bottom.                                                            |
| `autoscrollThreshold` | `number`                                  | `10`    | Upward distance that breaks bottom-following intent.                                                             |
| `mutationMode`        | `'append-prepend' \| 'arbitrary'`         | `'append-prepend'` | Selects streaming fast paths or full keyed reconciliation.                                         |
| `contentKey`          | `string \| number`                        | —       | Content epoch; changing it cancels stale work, resets measurements, and establishes the initial position.       |

### Slots

| Slot              | Props                        | Description                                                                                        |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `default`         | `{ item: T, index: number }` | The content for each item.                                                                         |
| `prepend-loading` | -                            | Content to show at the top of the list when `loadingHistory` is true. Useful for loading spinners. |

### Events

| Event           | Payload                                                 | Description                                                        |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| `reachTop`      | —                                                       | Emitted once when crossing into the top boundary.                  |
| `reachBottom`   | —                                                       | Emitted once when crossing into the bottom boundary.               |
| `scroll`        | `{ scrollTop, scrollHeight, clientHeight, isAtBottom }` | Emitted at most once per animation frame.                           |
| `prefetchRange` | `{ startIndex, endIndex }`                              | Key-index range to warm without changing the rendered row window.  |

### Methods (Exposed via ref)

| Method                | Arguments                                                                                       | Description                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `scrollToBottom`      | `()`                                                                                            | Scrolls to the bottom of the list.                              |
| `scrollToIndex`       | `(index: number, options?: { align?: 'start' \| 'center' \| 'end', smooth?: boolean })`         | Scrolls to a specific item index.                               |
| `scrollToItemKey`     | `(key: string \| number, options?: { align?: 'start' \| 'center' \| 'end', smooth?: boolean })` | Scrolls to a specific item by its key.                          |
| `refreshMeasurements` | `()`                                                                                            | Forces a re-measurement of all items.                           |
| `reset`                | `()`                                                                                            | Clears measurements and re-establishes the initial position.    |
| `isAtBottom`          | `boolean`                                                                                       | Property indicating if the scroller is currently at the bottom. |

## Recipes

### Infinite History Preload

To implement infinite scrolling upwards (loading history):

1. Listen to the `@reachTop` event.
2. Fetch older messages.
3. Prepend them to your `items` array.
4. `or3-scroll` will automatically adjust the scroll position so the user doesn't lose their place.

```ts
const isLoadingHistory = ref(false);

const onReachTop = async () => {
    if (isLoadingHistory.value) return;
    isLoadingHistory.value = true;

    try {
        const olderMessages = await fetchHistory();
        messages.value = [...olderMessages, ...messages.value];
    } finally {
        isLoadingHistory.value = false;
    }
};
```

And in your template:

```vue
<Or3Scroll
    :items="messages"
    :loading-history="isLoadingHistory"
    @reachTop="onReachTop"
>
  <template #prepend-loading>
    <div class="spinner">Loading history...</div>
  </template>
  <!-- ... -->
</Or3Scroll>
```

### AI Streaming Tail

For AI chat interfaces where the last message grows in real-time:

1. Ensure `maintainBottom` is `true`.
2. When the AI response updates, update the last item in your `items` array (immutably or deeply reactive).
3. The scroller will keep the bottom in view as the content expands.

## Performance Tips

-   **Tail Count**: Set `tailCount` to the number of recent messages you want always rendered (e.g., 10-20). This prevents flickering during rapid updates while keeping total DOM nodes low.
-   **Viewport Resize**: The component automatically handles container height changes via `ResizeObserver`. On mobile, this means smooth behavior when the keyboard opens/closes.

## Caveats / Gotchas

-   **Fixed Height Container**: The parent container of `<Or3Scroll>` **must** have a fixed height (e.g., `height: 100vh` or `height: 500px`) and `overflow: hidden` (the component handles the scrolling internally).
-   **Images**: If items contain images, their height might change after loading. It's best to define image dimensions explicitly or use the `refreshMeasurements` method after images load if you see layout shifts.
-   **ResizeObserver**: The component uses `ResizeObserver` for viewport height tracking. This is supported in all modern browsers but not in test environments like JSDOM by default.

## Security Considerations

**⚠️ Important**: This component renders user-provided content through Vue slots. Always sanitize and validate user-generated content before passing it to the component to prevent XSS (Cross-Site Scripting) attacks. The component itself does not perform any sanitization.

```vue
<!-- ❌ BAD: Rendering unsanitized user input -->
<Or3Scroll :items="messages">
  <template #default="{ item }">
    <div v-html="item.userContent"></div> <!-- Dangerous! -->
  </template>
</Or3Scroll>

<!-- ✅ GOOD: Sanitize user input or use text interpolation -->
<Or3Scroll :items="messages">
  <template #default="{ item }">
    <div>{{ item.userContent }}</div> <!-- Safe text interpolation -->
  </template>
</Or3Scroll>
```

## Troubleshooting

### Warnings

-   **`[or3-scroll] Container has 0 height`**: The parent element of `<Or3Scroll>` must have a defined height (e.g., `height: 500px` or `flex: 1` in a flex container). If the height is 0, the virtualizer cannot calculate the visible range.
-   **`[or3-scroll] Duplicate item key detected`**: Ensure every item in the `items` array has a unique key (defined by `itemKey`). Duplicate keys cause rendering artifacts.
-   **`[or3-scroll] estimateHeight must be positive`**: The `estimateHeight` prop must be greater than 0.
