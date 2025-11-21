<script setup lang="ts">
import { ref } from 'vue';
import Or3Scroll from '../src/components/Or3Scroll.vue';

interface Message {
  id: number;
  text: string;
  type: 'user' | 'bot';
  height?: number; // For variable height simulation
}

const items = ref<Message[]>([]);
const scroller = ref<any>(null);
const isStreaming = ref(false);
const isStreamingText = ref(false);
const streamTextInterval = ref<any>(null);
const log = ref<string[]>([]);

// Generate initial items
const generateItems = (count: number, startId = 0) => {
  return Array.from({ length: count }, (_, i) => {
    const length = Math.floor(Math.random() * (500 - 10 + 1)) + 10;
    const text = `Message ${startId + i} - ` + Math.random().toString(36).substring(7).repeat(Math.ceil(length / 10)).substring(0, length);
    return {
      id: startId + i,
      text,
      type: (Math.random() > 0.5 ? 'user' : 'bot') as 'user' | 'bot',
    };
  });
};

items.value = generateItems(50);

const addLog = (msg: string) => {
  log.value.unshift(`${new Date().toLocaleTimeString()} - ${msg}`);
  if (log.value.length > 20) log.value.pop();
};

const streamLoop = async () => {
  console.log('streamLoop called. isStreaming:', isStreaming.value);
  if (!isStreaming.value) return;

  try {
    const nextId = items.value.length > 0 ? Math.max(...items.value.map(i => i.id)) + 1 : 0;
    console.log('streamLoop: generated nextId:', nextId);
    
    const lastType = items.value.length > 0 ? items.value[items.value.length - 1].type : 'user';
    const nextType = lastType === 'bot' ? 'user' : 'bot';
    
    const newItem: Message = {
      id: nextId,
      text: '',
      type: nextType
    };
    
    console.log('streamLoop: Pushing new item', newItem);
    // Use immutable update to trigger watchers correctly
    items.value = [...items.value, newItem];
    
    // Capture the reactive item reference immediately
    const itemRef = items.value[items.value.length - 1];
    
    // Generate random text content
    const targetText = `Streamed ${nextId} - ` + Math.random().toString(36).substring(7).repeat(Math.floor(Math.random() * 5) + 1);
    console.log('streamLoop: targetText generated:', targetText);
    
    // Stream the text
    let currentText = '';
    for (const char of targetText) {
      if (!isStreaming.value) {
        console.log('streamLoop: Streaming stopped during loop');
        break;
      }
      currentText += char;
      itemRef.text = currentText;
      // Small delay for typing effect
      await new Promise(r => setTimeout(r, 30));
    }
    
    console.log('streamLoop: Finished typing message', nextId);
    
    if (isStreaming.value) {
      // Wait before next message
      console.log('streamLoop: Scheduling next message in 500ms');
      setTimeout(streamLoop, 500);
    }
  } catch (e: any) {
    console.error('streamLoop: Error', e);
    addLog('Error in stream: ' + e.message);
    isStreaming.value = false;
  }
};

const toggleStream = () => {
  console.log('toggleStream called. Current state:', isStreaming.value);
  if (isStreaming.value) {
    isStreaming.value = false;
    addLog('Streaming stopped');
    console.log('toggleStream: Set isStreaming to false');
  } else {
    isStreaming.value = true;
    addLog('Streaming started');
    console.log('toggleStream: Set isStreaming to true, calling streamLoop');
    streamLoop();
  }
};

const toggleTextStream = () => {
  console.log('toggleTextStream called. Current state:', isStreamingText.value);
  if (isStreamingText.value) {
    clearInterval(streamTextInterval.value);
    isStreamingText.value = false;
    addLog('Text streaming stopped');
    console.log('toggleTextStream: Stopped');
  } else {
    isStreamingText.value = true;
    addLog('Text streaming started');
    console.log('toggleTextStream: Started');
    
    try {
      const nextId = items.value.length > 0 ? Math.max(...items.value.map(i => i.id)) + 1 : 0;
      const newItem: Message = {
        id: nextId,
        text: 'Text Stream: ',
        type: 'bot'
      };
      console.log('toggleTextStream: Adding new item', newItem);
      // Use immutable update so Or3Scroll detects the new item
      items.value = [...items.value, newItem];
      
      // We need to get the reference from the new array
      const itemRef = items.value[items.value.length - 1];

      streamTextInterval.value = setInterval(() => {
        if (!isStreamingText.value) {
            console.log('toggleTextStream: Interval check - stopped');
            clearInterval(streamTextInterval.value);
            return;
        }
        const chunk = " " + Math.random().toString(36).substring(7);
        itemRef.text += chunk;
        // console.log('toggleTextStream: appended chunk', chunk); // Commented out to avoid spam
      }, 50);
    } catch (e: any) {
      console.error('toggleTextStream: Error', e);
      addLog('Error in text stream: ' + e.message);
      isStreamingText.value = false;
    }
  }
};

const prependItems = async () => {
  addLog('Prepending 20 items...');
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const firstId = items.value.length > 0 ? Math.min(...items.value.map(i => i.id)) : 0;
  const newItems = generateItems(20, firstId - 20);
  items.value = [...newItems, ...items.value];
  addLog(`Prepended items ${firstId - 20} to ${firstId - 1}`);
};

const scrollToBottom = () => {
  scroller.value?.scrollToBottom();
};

const scrollToRandom = () => {
  const randomIdx = Math.floor(Math.random() * items.value.length);
  scroller.value?.scrollToIndex(randomIdx, { smooth: true });
  addLog(`Scrolled to index ${randomIdx}`);
};

</script>

<template>
  <div class="demo-layout">
    <div class="sidebar">
      <h2>Controls</h2>
      <button @click="toggleStream">{{ isStreaming ? 'Stop Stream' : 'Start Stream' }}</button>
      <button @click="toggleTextStream">{{ isStreamingText ? 'Stop Text Stream' : 'Stream into message' }}</button>
      <button @click="prependItems">Prepend History</button>
      <button @click="scrollToBottom">Scroll to Bottom</button>
      <button @click="scrollToRandom">Scroll to Random</button>
      <div class="stats">
        <h3>Stats</h3>
        <div>Count: {{ items.length }}</div>
      </div>
      <div class="logs">
        <h3>Logs</h3>
        <div v-for="(l, i) in log" :key="i" class="log-item">{{ l }}</div>
      </div>
    </div>
    
    <div class="main">
      <Or3Scroll
        ref="scroller"
        :items="items"
        item-key="id"
        :estimate-height="60"
        :maintain-bottom="true"
        @reachTop="prependItems"
        class="scroller"
      >
        <template #default="{ item }">
          <div class="message-row" :class="item.type">
            <div class="avatar">{{ item.type[0].toUpperCase() }}</div>
            <div class="bubble">
              <div class="header">#{{ item.id }}</div>
              {{ item.text }}
            </div>
          </div>
        </template>
        
        <template #prepend-loading>
          <div class="loading">Loading history...</div>
        </template>
        
        <template #__debug="{ startIndex, endIndex, totalHeight, scrollTop }">
          <div class="debug-overlay">
            Range: {{ startIndex }} - {{ endIndex }} | Total H: {{ totalHeight }} | Top: {{ scrollTop }}
          </div>
        </template>
      </Or3Scroll>
    </div>
  </div>
</template>

<style>
.demo-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 300px;
  background: #2a2a2a;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid #444;
}

.main {
  flex: 1;
  position: relative;
  background: #1e1e1e;
}

.scroller {
  height: 100%;
}

button {
  padding: 10px;
  background: #4a90e2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background: #357abd;
}

.logs {
  margin-top: auto;
  height: 200px;
  overflow-y: auto;
  background: #000;
  padding: 10px;
  font-family: monospace;
  font-size: 12px;
}

.log-item {
  margin-bottom: 4px;
  color: #aaa;
}

.message-row {
  display: flex;
  gap: 10px;
  padding: 10px 20px;
}

.message-row.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 40px;
  height: 40px;
  background: #666;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.bubble {
  background: #333;
  padding: 10px 15px;
  border-radius: 12px;
  max-width: 70%;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.user .bubble {
  background: #4a90e2;
}

.header {
  font-size: 10px;
  opacity: 0.5;
  margin-bottom: 4px;
}

.loading {
  padding: 20px;
  text-align: center;
  color: #888;
}

.debug-overlay {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.8);
  padding: 5px 10px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  pointer-events: none;
  z-index: 100;
}
</style>
