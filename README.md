# or3-scroll

A headless, chat-optimized virtual scroller for Vue 3. Designed for bottom-anchored layouts, streaming content, and dynamic item heights.

## Features

- **Bottom Anchoring**: Keeps the scroll position pinned to the bottom as new content arrives (chat style).
- **Dynamic Heights**: Handles items with variable and changing heights without jitter.
- **Prepend Support**: Seamlessly handles loading history (prepending items) while maintaining scroll position.
- **Hidden Measurement**: Measures items in a hidden pool before rendering to ensure accurate scroll offsets.
- **Tail Rendering**: Optimizes rendering for the "tail" of the chat to prevent flickering during rapid updates.

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
import 'or3-scroll/dist/style.css'; // Import styles if needed (though it's mostly headless)

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
    <Or3Scroll
      ref="scrollRef"
      :items="messages"
      item-key="id"
    >
      <!-- ... -->
    </Or3Scroll>
  </div>
</template>
```

## API Reference

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `any[]` | `[]` | The array of data items to render. |
| `itemKey` | `string` | `'id'` | The property name to use as a unique key for each item. |
| `estimateHeight` | `number` | `50` | Estimated height of an item in pixels. Used for initial calculations. |
| `overscan` | `number` | `200` | Extra buffer in pixels to render above/below the visible viewport. |
| `maintainBottom` | `boolean` | `true` | Whether to keep the scroll position pinned to the bottom when new items are added. |
| `loadingHistory` | `boolean` | `false` | Whether history is currently loading (affects prepend behavior). |
| `tailCount` | `number` | `0` | Number of items at the bottom to always keep rendered/measured. |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `reachTop` | - | Emitted when the user scrolls to the top of the list. |
| `reachBottom` | - | Emitted when the user scrolls to the bottom of the list. |
| `scroll` | `{ scrollTop, scrollHeight, clientHeight, isAtBottom }` | Emitted when the scroll position changes. |

### Methods (Exposed via ref)

| Method | Arguments | Description |
|--------|-----------|-------------|
| `scrollToBottom` | `()` | Scrolls to the bottom of the list. |
| `scrollToIndex` | `(index: number, options?: { align?: 'start' \| 'center' \| 'end', smooth?: boolean })` | Scrolls to a specific item index. |
| `scrollToItemKey` | `(key: string \| number, options?: { align?: 'start' \| 'center' \| 'end', smooth?: boolean })` | Scrolls to a specific item by its key. |
| `refreshMeasurements` | `()` | Forces a re-measurement of all items. |
| `isAtBottom` | `boolean` | Property indicating if the scroller is currently at the bottom. |

## Recipes

### Infinite History Preload

To implement infinite scrolling upwards (loading history):

1. Listen to the `@reachTop` event.
2. Fetch older messages.
3. Prepend them to your `items` array.
4. `or3-scroll` will automatically adjust the scroll position so the user doesn't lose their place.

```ts
const onReachTop = async () => {
  if (isLoadingHistory) return;
  isLoadingHistory = true;
  const olderMessages = await fetchHistory();
  messages.value = [...olderMessages, ...messages.value];
  isLoadingHistory = false;
};
```

### AI Streaming Tail

For AI chat interfaces where the last message grows in real-time:

1. Ensure `maintainBottom` is `true`.
2. When the AI response updates, update the last item in your `items` array (immutably or deeply reactive).
3. The scroller will keep the bottom in view as the content expands.

## Caveats / Gotchas

- **Fixed Height Container**: The parent container of `<Or3Scroll>` **must** have a fixed height (e.g., `height: 100vh` or `height: 500px`) and `overflow: hidden` (the component handles the scrolling internally).
- **Mobile Keyboards**: On mobile, when the keyboard opens, the viewport height changes. Ensure your layout handles this (e.g., using `interactive-widget=resizes-content` in viewport meta or listening to resize events).
- **Images**: If items contain images, their height might change after loading. It's best to define image dimensions explicitly or use the `refreshMeasurements` method after images load if you see layout shifts.

## Troubleshooting

### Warnings

- **`[or3-scroll] Container has 0 height`**: The parent element of `<Or3Scroll>` must have a defined height (e.g., `height: 500px` or `flex: 1` in a flex container). If the height is 0, the virtualizer cannot calculate the visible range.
- **`[or3-scroll] Duplicate item key detected`**: Ensure every item in the `items` array has a unique key (defined by `itemKey`). Duplicate keys cause rendering artifacts.
- **`[or3-scroll] estimateHeight must be positive`**: The `estimateHeight` prop must be greater than 0.
