<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { api } from '../../api/client';
import type { AdminUserLookupResponse } from '../../api/types';

// Account autocomplete (`GET /admin/users/lookup`): matches user names and also
// settlement and jarl names, resolved to the owning account. Search-as-you-type,
// debounced, stale answers dropped. Emits the picked account; the caller decides
// what picking means (owner, extra account, ...). Used wherever an admin picks an account.

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    /** Accounts that cannot be picked (already chosen). */
    exclude?: string[];
    testid?: string;
  }>(),
  { placeholder: '', exclude: () => [], testid: 'user-lookup' },
);

const emit = defineEmits<{ pick: [user: AdminUserLookupResponse] }>();

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

const query = ref('');
const results = ref<AdminUserLookupResponse[]>([]);
const open = ref(false);
const active = ref(-1);
let timer: ReturnType<typeof setTimeout> | null = null;
let controller: AbortController | null = null;

function cancelPending() {
  if (timer) clearTimeout(timer);
  timer = null;
  controller?.abort();
  controller = null;
}

async function run(text: string) {
  controller = new AbortController();
  const mine = controller;
  try {
    const found = await api.adminLookupUsers(text, mine.signal);
    if (controller !== mine) return;
    results.value = found.filter((u) => !props.exclude.includes(u.userId));
  } catch {
    if (controller !== mine) return;
    results.value = [];
  }
  active.value = results.value.length > 0 ? 0 : -1;
  open.value = true;
}

watch(query, (text) => {
  cancelPending();
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHARS) {
    results.value = [];
    open.value = false;
    return;
  }
  timer = setTimeout(() => void run(trimmed), DEBOUNCE_MS);
});

function choose(user: AdminUserLookupResponse) {
  cancelPending();
  emit('pick', user);
  query.value = '';
  results.value = [];
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false;
  } else if (event.key === 'ArrowDown' && results.value.length > 0) {
    event.preventDefault();
    open.value = true;
    active.value = (active.value + 1) % results.value.length;
  } else if (event.key === 'ArrowUp' && results.value.length > 0) {
    event.preventDefault();
    active.value = (active.value - 1 + results.value.length) % results.value.length;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const user = results.value[active.value];
    if (open.value && user) choose(user);
  }
}

onBeforeUnmount(cancelPending);
</script>

<template>
  <div class="lookup">
    <input
      v-model="query"
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      :aria-expanded="open && results.length > 0"
      :placeholder="placeholder"
      :data-testid="`${testid}-input`"
      @keydown="onKeydown"
      @blur="open = false"
    />
    <ul v-if="open && results.length > 0" class="results" role="listbox" :data-testid="`${testid}-results`">
      <li
        v-for="(user, index) in results"
        :key="user.userId"
        role="option"
        :aria-selected="index === active"
        :class="{ active: index === active }"
        :data-testid="`${testid}-pick-${user.userId}`"
        @mousedown.prevent="choose(user)"
      >
        <strong>{{ user.userName }}</strong>
        <span class="role">({{ user.role }})</span>
        <span v-if="user.via !== 'user'" class="via">
          {{ $t(`adminApiKeys.lookup.via.${user.via}`, { name: user.matchedName ?? '' }) }}<template v-if="user.worldName">
            · {{ user.worldName }}</template>
        </span>
        <span v-else-if="user.displayName" class="via">{{ user.displayName }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lookup {
  position: relative;
  flex: 1;
  min-width: 200px;
}
.lookup input {
  width: 100%;
  box-sizing: border-box;
}
.results {
  position: absolute;
  z-index: 10;
  left: 0;
  right: 0;
  margin: 2px 0 0;
  padding: 4px 0;
  list-style: none;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.results li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 14px;
}
.results li.active,
.results li:hover {
  background: color-mix(in srgb, var(--gold) 18%, transparent);
}
.role,
.via {
  color: var(--muted);
  font-size: 12px;
}
</style>
