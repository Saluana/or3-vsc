<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import Or3Scroll from '../../src/lib/components/Or3Scroll.vue';
import { StreamMarkdown, parseBlocks, parseIncompleteMarkdown } from 'streamdown-vue';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  renderedContent?: string; // For storing the repaired/rendered markdown for the stream
}

const apiKey = ref(localStorage.getItem('openrouter_key') || '');
const input = ref('');
const messages = ref<Message[]>([
    {
        id: 'intro',
        role: 'assistant',
        content: 'Hello! I am your AI assistant. Please enter your OpenRouter API key above to start chatting.',
        renderedContent: 'Hello! I am your AI assistant. Please enter your OpenRouter API key above to start chatting.'
    }
]);
const isStreaming = ref(false);
const scroller = ref<any>(null);

// Auto-save API key whenever it changes
watch(apiKey, (newVal) => {
    localStorage.setItem('openrouter_key', newVal);
});

const generateId = () => Math.random().toString(36).substring(2, 9);

const sendMessage = async () => {
    if (!input.value.trim() || !apiKey.value || isStreaming.value) return;

    const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: input.value.trim()
    };

    // Use spread for robust reactivity
    messages.value = [...messages.value, userMsg];
    input.value = '';
    
    // Scroll to bottom after user message
    nextTick(() => scroller.value?.scrollToBottom());

    // Prepare assistant message
    const botMsgId = generateId();
    const botMsg: Message = {
        id: botMsgId,
        role: 'assistant',
        content: '',
        renderedContent: ''
    };

    messages.value = [...messages.value, botMsg];
    isStreaming.value = true;
    
    // We need to find the index in the current array to update it
    // This is safer than holding a reference to the object before it was added
    const botMsgIndex = messages.value.findIndex(m => m.id === botMsgId);

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey.value}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Streamdown Vue Demo'
            },
            body: JSON.stringify({
                model: 'moonshotai/kimi-k2-0905',
                messages: messages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error('No response body');

        let rawBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0]?.delta?.content || '';
                        if (content) {
                            rawBuffer += content;
                            
                            // Update the array item directly using the index
                            if (messages.value[botMsgIndex]) {
                                messages.value[botMsgIndex].content = rawBuffer;
                                
                                // Repair and parse markdown for streaming
                                const repaired = parseIncompleteMarkdown(rawBuffer);
                                const blocks = parseBlocks(repaired);
                                messages.value[botMsgIndex].renderedContent = blocks.join('');
                            }
                        }
                    } catch (e) {
                        console.warn('Error parsing SSE message', e);
                    }
                }
            }
        }
    } catch (e: any) {
        console.error('[ChatDemo] Stream error:', e);
        if (messages.value[botMsgIndex]) {
            messages.value[botMsgIndex].content += `\n\n*Error: ${e.message}*`;
            messages.value[botMsgIndex].renderedContent = messages.value[botMsgIndex].content;
        }
    } finally {
        isStreaming.value = false;
        // Only auto-scroll if user was already at bottom
        nextTick(() => {
            if (scroller.value?.isAtBottom.value) {
                scroller.value?.scrollToBottom();
            }
        });
    }
};
</script>

<template>
  <div class="chat-container">
    <div class="header">
      <div class="title">
        <h1>Streamdown Chat</h1>
        <span class="badge">Beta</span>
      </div>
      <form class="api-config" @submit.prevent>
        <input 
            v-model="apiKey" 
            type="password" 
            placeholder="sk-or-..." 
            autocomplete="on"
            class="api-input"
        />
      </form>
    </div>

    <div class="messages-area">
        <Or3Scroll
            ref="scroller"
            :items="messages"
            item-key="id"
            :estimate-height="80"
            :maintain-bottom="true"
            class="scroller"
        >
            <template #default="{ item }">
                <div :class="['message-wrapper', item.role]">
                    <div class="avatar">
                        {{ item.role === 'user' ? 'You' : 'AI' }}
                    </div>
                    <div class="message-bubble">
                        <StreamMarkdown 
                            v-if="item.role === 'assistant'"
                            :content="item.renderedContent || item.content" 
                            class="markdown-content"
                        />
                        <div v-else class="user-content">
                            {{ item.content }}
                        </div>
                    </div>
                </div>
            </template>
        </Or3Scroll>
    </div>

    <div class="input-area">
        <div class="input-wrapper">
            <textarea 
                v-model="input"
                placeholder="Type a message..."
                @keydown.enter.prevent="sendMessage"
                rows="1"
                :disabled="isStreaming"
            ></textarea>
            <button @click="sendMessage" :disabled="!input.trim() || isStreaming" class="send-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
        </div>
    </div>
  </div>
</template>

<style scoped>
:global(html, body, #app) {
    height: 100%;
}

.chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh; /* lock a real viewport height so Or3Scroll stays virtualized */
    background: #0f0f11;
    color: #e1e1e3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #27272a;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #18181b;
}

.title h1 {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0;
    display: inline-block;
}

.badge {
    font-size: 0.7rem;
    background: #3f3f46;
    color: #a1a1aa;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    margin-left: 0.5rem;
    vertical-align: middle;
}

.api-input {
    background: #27272a;
    border: 1px solid #3f3f46;
    color: #e4e4e7;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    font-size: 0.85rem;
    width: 200px;
    transition: border-color 0.2s;
}

.api-input:focus {
    outline: none;
    border-color: #6366f1;
}

.messages-area {
    flex: 1;
    overflow: hidden; /* Or3Scroll handles scrolling */
    position: relative;
}

.scroller {
    height: 100%;
}

.message-wrapper {
    display: flex;
    gap: 1rem;
    padding: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
}

.message-wrapper.user {
    background: transparent;
}

.message-wrapper.assistant {
    background: #1c1c1e; /* slightly lighter background for assistant */
    border-top: 1px solid #27272a;
    border-bottom: 1px solid #27272a;
}

.avatar {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.8rem;
    flex-shrink: 0;
}

.user .avatar {
    background: #3f3f46;
    color: #e4e4e7;
}

.assistant .avatar {
    background: linear-gradient(135deg, #6366f1, #a855f7);
    color: white;
}

.message-bubble {
    flex: 1;
    min-width: 0; /* prevent overflow */
    line-height: 1.6;
}

.user-content {
    white-space: pre-wrap;
}

/* Markdown Styles matching Streamdown docs or basic prose */
:deep(.markdown-content) {
    color: #e4e4e7;
}

:deep(.markdown-content h1),
:deep(.markdown-content h2),
:deep(.markdown-content h3) {
    margin-top: 1.5rem;
    margin-bottom: 1rem;
    font-weight: 600;
    color: #fff;
}

:deep(.markdown-content p) {
    margin-bottom: 1rem;
}

:deep(.markdown-content code) {
    background: #27272a;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
}

:deep(.markdown-content pre) {
    background: #18181b;
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1rem 0;
    border: 1px solid #27272a;
}

:deep(.markdown-content pre code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
    color: inherit;
}

:deep(.markdown-content ul), 
:deep(.markdown-content ol) {
    padding-left: 1.5rem;
    margin-bottom: 1rem;
}

:deep(.markdown-content blockquote) {
    border-left: 3px solid #6366f1;
    padding-left: 1rem;
    margin-left: 0;
    color: #a1a1aa;
}

.input-area {
    padding: 1.5rem;
    background: #0f0f11;
    border-top: 1px solid #27272a;
}

.input-wrapper {
    max-width: 900px;
    margin: 0 auto;
    background: #27272a;
    border-radius: 12px;
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    border: 1px solid #3f3f46;
    transition: border-color 0.2s;
}

.input-wrapper:focus-within {
    border-color: #6366f1;
}

textarea {
    flex: 1;
    background: transparent;
    border: none;
    color: #fff;
    font-size: 1rem;
    resize: none;
    padding: 0.5rem 0;
    max-height: 200px;
    line-height: 1.5;
    outline: none;
    min-height: 24px;
}

.send-btn {
    background: #6366f1;
    color: white;
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
}

.send-btn:hover:not(:disabled) {
    background: #4f46e5;
}

.send-btn:disabled {
    background: #3f3f46;
    color: #71717a;
    cursor: not-allowed;
}
</style>
