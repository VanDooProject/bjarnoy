<script setup lang="ts">
// "Join another world" (UI half — store/API already landed, see
// stores/world.ts's `joinWorld` and api/client.ts's `listJoinableWorlds`/
// `getWorldMembership`). Reachable from ReturningPlayerMenu.vue, anonymous
// or logged in alike (see router/index.ts — no `requiresAuth`): an
// anonymous visitor already has a stable local id (stores/player.ts) they
// can found a new realm under, or already hold a realm under, in any world.
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import TopBar from '../components/hud/TopBar.vue';
import LocaleSwitcher from '../components/LocaleSwitcher.vue';
import { api, ApiError } from '../api/client';
import type { JoinableWorldResponse } from '../api/types';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { useAuthStore } from '../stores/auth';
import type { MessageSchema } from '../i18n/schema';

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const router = useRouter();
const world = useWorldStore();
const player = usePlayerStore();
const auth = useAuthStore();

const worlds = ref<JoinableWorldResponse[]>([]);
const loading = ref(true);
const loadError = ref(false);

// Per-world "does this owner already have a realm there" lookup — a plain
// per-row `getWorldMembership` call each, awaited alongside the list itself
// in `load()` below before anything renders (world counts here are
// realistically small; no bulk endpoint exists, and adding one just for
// this list would be over-engineering, and awaiting them up front avoids a
// Join-button flash before a Return one replaces it). `null` means "checked,
// no realm there"; absent (the row matching the world already joined,
// skipped entirely) is never read — `isCurrent` is checked first.
const membership = reactive<Record<string, string | null>>({});

const joiningWorldId = ref<string | null>(null);
const joinError = ref<string | null>(null);

async function checkMembership(worldId: string) {
  try {
    const result = await api.getWorldMembership(worldId, player.id);
    membership[worldId] = result.settlementId;
  } catch {
    // Best effort — a failed check just falls back to "no realm known
    // here", which only ever under-offers a Return button in favour of a
    // Join one; the backend's own founding checks are the real authority.
    membership[worldId] = null;
  }
}

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    worlds.value = await api.listJoinableWorlds();
    await Promise.all(
      worlds.value.filter((w) => w.id !== world.worldId).map((w) => checkMembership(w.id)),
    );
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function isCurrent(w: JoinableWorldResponse): boolean {
  return w.id === world.worldId;
}

function hasRealm(w: JoinableWorldResponse): boolean {
  return !!membership[w.id];
}

// Reuses `landing.joinBlocked`'s existing copy where the reason strings
// match — see WorldContracts.cs's `JoinableWorldResponse.From`, which
// mirrors `WorldResponse.From`'s own `joinability.Reason.ToString()
// .ToLowerInvariant()` (so the wire values are e.g. `notstartedyet`,
// `joinsclosed`, not the PascalCase enum names) — rather than a second copy
// of the same messages under the new `worlds` namespace.
function blockedLabel(w: JoinableWorldResponse): string {
  if (w.joinableReason === 'notstartedyet' && w.startsAt) {
    return t('landing.joinBlocked.opensAt', { date: d(new Date(w.startsAt), 'long') });
  }
  if (w.joinableReason === 'joinsclosed') {
    return t('landing.joinBlocked.joinsClosed');
  }
  return t('landing.joinBlocked.notAcceptingPlayers');
}

async function joinOrReturn(w: JoinableWorldResponse) {
  if (joiningWorldId.value) return;
  joiningWorldId.value = w.id;
  joinError.value = null;
  try {
    await world.joinWorld(w.id);
    router.push('/');
  } catch (err) {
    joinError.value = err instanceof ApiError ? err.message : t('worlds.joinError');
    joiningWorldId.value = null;
  }
}
</script>

<template>
  <div class="world-picker">
    <TopBar docked title="Bjarnoy">
      <LocaleSwitcher />
    </TopBar>

    <main class="content">
      <div class="head">
        <h1>{{ t('worlds.title') }}</h1>
        <p class="lede">{{ t('worlds.lede') }}</p>
      </div>

      <div class="panel list">
        <p v-if="loading" class="status">{{ t('worlds.loading') }}</p>
        <p v-else-if="loadError" class="status error">{{ t('worlds.error') }}</p>
        <p v-else-if="worlds.length === 0" class="status">{{ t('worlds.empty') }}</p>
        <ul v-else class="rows">
          <li v-for="w in worlds" :key="w.id" class="row" data-testid="world-picker-row">
            <div class="info">
              <span class="name">{{ w.name }}</span>
              <span class="meta">
                {{ t('worlds.players', { count: w.playerCount, max: w.maxPlayers }) }}
                · {{ t('worlds.speed', { factor: w.speedFactor }) }}
              </span>
            </div>
            <div class="state">
              <span v-if="isCurrent(w)" class="tag">{{ t('worlds.youAreHere') }}</span>
              <template v-else-if="hasRealm(w)">
                <span class="tag">{{ t('worlds.yourRealm') }}</span>
                <button
                  type="button"
                  class="action"
                  data-testid="world-picker-join"
                  :disabled="joiningWorldId === w.id"
                  @click="joinOrReturn(w)"
                >
                  {{ joiningWorldId === w.id ? t('worlds.joining') : t('worlds.return') }}
                </button>
              </template>
              <template v-else-if="w.joinable">
                <button
                  type="button"
                  class="action"
                  data-testid="world-picker-join"
                  :disabled="joiningWorldId === w.id"
                  @click="joinOrReturn(w)"
                >
                  {{ joiningWorldId === w.id ? t('worlds.joining') : t('worlds.join') }}
                </button>
              </template>
              <span v-else class="tag blocked">{{ blockedLabel(w) }}</span>
            </div>
          </li>
        </ul>
        <p v-if="joinError" class="status error">{{ joinError }}</p>
      </div>

      <p v-if="!auth.isAuthenticated" class="login-nudge">{{ t('worlds.loginNudge') }}</p>
    </main>
  </div>
</template>

<style scoped>
.world-picker {
  width: 100%;
  height: 100vh;
  overflow: auto;
  background: var(--shell);
}
.content {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 20px 60px;
}
.head h1 {
  margin: 0;
  font-size: 28px;
  color: var(--text);
}
.lede {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}
.list {
  margin-top: 28px;
  padding: 8px;
}
.status {
  margin: 0;
  padding: 20px 12px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}
.status.error {
  color: var(--rival);
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 12px;
  flex-wrap: wrap;
}
.row + .row {
  border-top: 1px solid var(--panel-border);
}
.info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}
.meta {
  font-size: 12px;
  color: var(--muted);
}
.state {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.tag {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}
.tag.blocked {
  color: var(--rival);
  max-width: 220px;
  white-space: normal;
  text-align: right;
}
.action {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 7px 16px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.action:disabled {
  opacity: 0.6;
  cursor: default;
}
.login-nudge {
  margin: 18px 4px 0;
  color: var(--muted);
  font-size: 13px;
}
</style>
