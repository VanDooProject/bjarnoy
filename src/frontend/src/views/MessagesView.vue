<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../api/client';
import type { ConversationResponse } from '../api/types';
import type { MessageSchema } from '../i18n/schema';

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const conversations = ref<ConversationResponse[]>([]);
const page = ref(1);
const pageSize = 20;
const loading = ref(true);
const loadError = ref<string | null>(null);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const result = await api.listConversations({ page: page.value, pageSize });
    conversations.value = result.items;
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : t('messages.loadError');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function changePage(delta: number) {
  const next = page.value + delta;
  if (next < 1) return;
  page.value = next;
  void load();
}

function preview(body: string): string {
  return body.length > 80 ? `${body.slice(0, 80)}…` : body;
}
</script>

<template>
  <div class="messages">
    <h1>{{ $t('messages.title') }}</h1>

    <p v-if="loading" class="muted">{{ $t('common.states.loading') }}</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="conversations.length === 0" class="muted">
      {{ $t('messages.empty') }}
    </p>

    <template v-else>
      <ul class="conversations">
        <li v-for="conversation in conversations" :key="conversation.otherUserId">
          <router-link
            class="conversation"
            :to="`/messages/${conversation.otherUserId}`"
          >
            <span class="who">
              {{ conversation.otherDisplayName || conversation.otherUserName }}
              <span v-if="conversation.unreadCount > 0" class="unread">{{ conversation.unreadCount }}</span>
            </span>
            <span class="preview">{{ preview(conversation.lastMessage.body) }}</span>
            <span class="when">{{ d(new Date(conversation.lastMessage.sentAt), 'long') }}</span>
          </router-link>
        </li>
      </ul>

      <div class="pager">
        <button :disabled="page <= 1" @click="changePage(-1)">{{ $t('messages.pager.previous') }}</button>
        <span>{{ $t('messages.pager.page', { page }) }}</span>
        <button :disabled="conversations.length < pageSize" @click="changePage(1)">
          {{ $t('messages.pager.next') }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.messages {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
}
.conversations {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  overflow: hidden;
}
.conversation {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  padding: 12px 16px;
  text-decoration: none;
  color: var(--text);
  border-bottom: 1px solid var(--panel-border);
}
.conversation:last-child {
  border-bottom: none;
}
.conversation:hover {
  background: var(--panel-bg);
}
.who {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.unread {
  background: var(--gold);
  color: #1a1208;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
}
.preview {
  grid-column: 1 / 2;
  color: var(--muted);
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.when {
  grid-row: 1 / 3;
  grid-column: 2;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.pager {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--muted);
}
.muted {
  color: var(--muted);
}
.error {
  color: var(--rival);
}
button {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
