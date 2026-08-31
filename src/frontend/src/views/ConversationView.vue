<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '../api/client';
import type { MessageResponse, ProfileResponse } from '../api/types';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const auth = useAuthStore();

const otherUserId = computed(() => route.params.userId as string);

const otherProfile = ref<ProfileResponse | null>(null);
const messages = ref<MessageResponse[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

// Oldest-first for display — the API returns newest-first for paging.
const orderedMessages = computed(() => [...messages.value].reverse());

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const [profile, page] = await Promise.all([
      api.getProfile(otherUserId.value),
      api.getConversation(otherUserId.value, { page: 1, pageSize: 50 }),
    ]);
    otherProfile.value = profile;
    messages.value = page.items;
    void api.markConversationRead(otherUserId.value);
  } catch (err) {
    loadError.value =
      err instanceof ApiError && err.status === 404 ? 'No such player.' : 'Could not load this conversation.';
  } finally {
    loading.value = false;
  }
}

watch(otherUserId, load, { immediate: true });

// --- Sending ---

const draft = ref('');
const sending = ref(false);
const sendError = ref<string | null>(null);
const BODY_MAX = 2000;

async function send() {
  if (sending.value) return;
  const body = draft.value.trim();
  if (!body) return;

  sending.value = true;
  sendError.value = null;
  try {
    const message = await api.sendMessage({ recipientUserId: otherUserId.value, body });
    messages.value = [message, ...messages.value];
    draft.value = '';
  } catch (err) {
    sendError.value = err instanceof ApiError ? err.message : 'Could not send the message.';
  } finally {
    sending.value = false;
  }
}

// --- Reporting ---

const reportingId = ref<string | null>(null);
const reportReason = ref('');
const reportSending = ref(false);
const reportError = ref<string | null>(null);
const reportedIds = ref(new Set<string>());

function openReport(messageId: string) {
  reportingId.value = messageId;
  reportReason.value = '';
  reportError.value = null;
}

async function sendReport() {
  if (reportSending.value || !reportingId.value) return;
  if (!reportReason.value.trim()) {
    reportError.value = 'A reason is required.';
    return;
  }
  reportSending.value = true;
  reportError.value = null;
  try {
    await api.reportMessage(reportingId.value, { reason: reportReason.value.trim() });
    reportedIds.value.add(reportingId.value);
    reportingId.value = null;
  } catch (err) {
    reportError.value = err instanceof ApiError ? err.message : 'Could not send the report.';
  } finally {
    reportSending.value = false;
  }
}

function isMine(message: MessageResponse): boolean {
  return message.senderUserId === auth.user?.id;
}

function readStatus(message: MessageResponse): string | null {
  if (!isMine(message)) return null;
  if (!message.readReceiptVisible) return null;
  return message.readAt ? `Read ${new Date(message.readAt).toLocaleString()}` : 'Unread';
}
</script>

<template>
  <div class="conversation-view">
    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <template v-else>
      <header class="head">
        <router-link v-if="otherProfile" class="who" :to="`/profile/${otherProfile.userName}`">
          {{ otherProfile.displayName || otherProfile.userName }}
        </router-link>
        <router-link to="/messages" class="back">Back to messages</router-link>
      </header>

      <ul class="thread">
        <li
          v-for="message in orderedMessages"
          :key="message.id"
          :class="['bubble-row', { mine: isMine(message) }]"
        >
          <div class="bubble">
            <p class="body">{{ message.body }}</p>
            <div class="meta">
              <span>{{ new Date(message.sentAt).toLocaleString() }}</span>
              <span v-if="readStatus(message)">· {{ readStatus(message) }}</span>
              <button
                v-if="!reportedIds.has(message.id)"
                class="report-link"
                type="button"
                @click="openReport(message.id)"
              >
                Report
              </button>
              <span v-else class="reported">Reported</span>
            </div>
          </div>
        </li>
      </ul>

      <div class="composer">
        <textarea
          v-model="draft"
          rows="2"
          :maxlength="BODY_MAX"
          placeholder="Write a message…"
          @keydown.enter.exact.prevent="send"
        ></textarea>
        <button :disabled="sending || !draft.trim()" @click="send">Send</button>
      </div>
      <p v-if="sendError" class="error">{{ sendError }}</p>

      <div v-if="reportingId" class="report-backdrop" @click.self="reportingId = null">
        <div class="report-dialog" role="dialog" aria-label="Report message">
          <h2>Report this message</h2>
          <p class="muted">A moderator will review it.</p>
          <label>
            Reason
            <input
              v-model="reportReason"
              type="text"
              maxlength="500"
              placeholder="e.g. harassment"
              @keyup.enter="sendReport"
            />
          </label>
          <p v-if="reportError" class="error">{{ reportError }}</p>
          <div class="row">
            <button :disabled="reportSending" @click="sendReport">Send report</button>
            <button class="secondary" :disabled="reportSending" @click="reportingId = null">Cancel</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.conversation-view {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.who {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
}
.back {
  color: var(--muted);
  font-size: 13px;
  text-decoration: none;
}
.thread {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bubble-row {
  display: flex;
}
.bubble-row.mine {
  justify-content: flex-end;
}
.bubble {
  max-width: 70%;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 10px 14px;
}
.bubble-row.mine .bubble {
  background: var(--gold);
  color: #1a1208;
}
.body {
  margin: 0 0 6px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: var(--muted);
}
.bubble-row.mine .meta {
  color: #3a2c14;
}
.report-link {
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  font-size: 11px;
}
.reported {
  font-style: italic;
}
.composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.composer textarea {
  flex: 1;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--text);
  font-family: inherit;
  resize: vertical;
}
.muted {
  color: var(--muted);
}
.error {
  color: var(--rival);
  font-size: 13px;
}
button {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
}
button.secondary {
  background: none;
  border: 1px solid var(--panel-border);
  color: var(--text);
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.report-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.report-dialog {
  background: var(--shell, #14100a);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 20px;
  width: min(420px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.report-dialog label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.report-dialog input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text);
  font-family: inherit;
}
.row {
  display: flex;
  gap: 8px;
}
</style>
