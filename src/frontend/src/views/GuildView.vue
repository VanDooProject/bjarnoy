<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useGuildStore } from '../stores/guild';
import { useWorldStore } from '../stores/world';
import type { GuildBoardTopicKind, GuildFeeTier, GuildRole } from '../api/types';

const world = useWorldStore();
const auth = useAuthStore();
const guild = useGuildStore();

const feeTierLabels: Record<GuildFeeTier, string> = { copper: 'Copper', silver: 'Silver', gold: 'Gold' };
const feeTierOrder: GuildFeeTier[] = ['copper', 'silver', 'gold'];
const roleLabels: Record<GuildRole, string> = { leader: 'Leader', officer: 'Officer', member: 'Member' };

// Local aliases for the store's nullable fields: template `v-if`/`v-else`
// narrows a plain ref/computed cleanly, but not a Pinia state property
// accessed as `guild.current` — see the design doc for why this file
// reads through these instead of the store directly wherever narrowing
// across a v-else boundary matters.
const current = computed(() => guild.current);
const perks = computed(() => guild.perks);
const activeTopic = computed(() => guild.activeTopic);

async function selectGuild(id: string) {
  activeTopicId.value = null;
  await guild.loadGuild(id);
  await Promise.all([guild.loadTopics(id), guild.loadTreaties(id)]);
}

async function loadForCurrentWorld() {
  if (!world.worldId) return;
  await guild.loadGuilds(world.worldId);
  const mine = guild.guilds.find((g) => g.members.some((m) => m.userId === auth.user?.id));
  if (mine) await selectGuild(mine.id);
}

onMounted(loadForCurrentWorld);
watch(() => world.worldId, loadForCurrentWorld);

function backToDirectory() {
  guild.current = null;
}

// --- founding ---

const foundOpen = ref(false);
const foundName = ref('');
const foundTag = ref('');
const foundDescription = ref('');

function openFound() {
  foundName.value = '';
  foundTag.value = '';
  foundDescription.value = '';
  guild.actionError = null;
  foundOpen.value = true;
}

async function submitFound() {
  if (!world.worldId) return;
  const created = await guild.createGuild(world.worldId, {
    name: foundName.value.trim(),
    tag: foundTag.value.trim(),
    description: foundDescription.value.trim() || undefined,
  });
  if (created) {
    foundOpen.value = false;
    await guild.loadGuilds(world.worldId);
    await selectGuild(created.id);
  }
}

// --- membership ---

async function join(guildId: string) {
  const ok = await guild.join(guildId);
  if (ok) {
    await selectGuild(guildId);
    if (world.worldId) await guild.loadGuilds(world.worldId);
  }
}

async function leaveCurrent() {
  if (!current.value) return;
  const ok = await guild.leave(current.value.id);
  if (ok && world.worldId) await guild.loadGuilds(world.worldId);
}

async function kick(userId: string) {
  if (!current.value) return;
  await guild.kick(current.value.id, userId);
}

async function promote(userId: string, role: GuildRole) {
  if (!current.value) return;
  await guild.setRole(current.value.id, userId, role);
}

async function changeFeeTier(tier: GuildFeeTier) {
  if (!current.value) return;
  await guild.setFeeTier(current.value.id, tier);
}

async function payFee() {
  if (!current.value) return;
  await guild.payFee(current.value.id);
}

// --- board ---

const activeTopicId = ref<string | null>(null);
const newTopicTitle = ref('');
const newTopicKind = ref<GuildBoardTopicKind>('discussion');
const newTopicBody = ref('');
const replyBody = ref('');

async function openTopic(topicId: string) {
  if (!current.value) return;
  activeTopicId.value = topicId;
  await guild.loadTopic(current.value.id, topicId);
}

function backToTopics() {
  activeTopicId.value = null;
}

async function submitTopic() {
  if (!current.value) return;
  const topic = await guild.createTopic(current.value.id, {
    title: newTopicTitle.value.trim(),
    kind: newTopicKind.value,
    body: newTopicBody.value.trim(),
  });
  if (topic) {
    newTopicTitle.value = '';
    newTopicBody.value = '';
    newTopicKind.value = 'discussion';
    await openTopic(topic.id);
  }
}

async function submitReply() {
  if (!current.value || !activeTopicId.value) return;
  const ok = await guild.reply(current.value.id, activeTopicId.value, replyBody.value.trim());
  if (ok) replyBody.value = '';
}

// --- treaties ---

const proposeTargetId = ref('');

const treatyCandidates = computed(() =>
  current.value ? guild.guilds.filter((g) => g.id !== current.value!.id) : [],
);

async function submitPropose() {
  if (!current.value || !proposeTargetId.value) return;
  const ok = await guild.proposeTreaty(current.value.id, proposeTargetId.value);
  if (ok) proposeTargetId.value = '';
}

function guildLabel(id: string): string {
  const found = guild.guilds.find((g) => g.id === id);
  return found ? `[${found.tag}] ${found.name}` : id.slice(0, 8);
}

function formattedDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
</script>

<template>
  <div class="guild-view">
    <h1>Guild</h1>

    <p v-if="!world.worldId" class="hint">No live world to show guilds for.</p>

    <template v-else-if="!current">
      <section class="directory">
        <div class="directory-head">
          <h2>Guilds in this world</h2>
          <button v-if="auth.isAuthenticated" @click="openFound">Found a guild</button>
        </div>

        <p v-if="guild.guildsLoading">Loading…</p>
        <p v-else-if="guild.guildsError" class="error">{{ guild.guildsError }}</p>
        <p v-else-if="guild.guilds.length === 0" class="hint">No guilds yet — be the first to found one.</p>

        <ul v-else class="guild-list">
          <li v-for="g in guild.guilds" :key="g.id" class="guild-row">
            <div>
              <strong>[{{ g.tag }}] {{ g.name }}</strong>
              <span class="muted"> · {{ feeTierLabels[g.feeTier] }} · {{ g.memberCount }} members</span>
              <p v-if="g.description" class="muted description">{{ g.description }}</p>
            </div>
            <div class="row">
              <button class="secondary" @click="selectGuild(g.id)">View</button>
              <button v-if="auth.isAuthenticated" :disabled="guild.actionPending" @click="join(g.id)">
                Join
              </button>
            </div>
          </li>
        </ul>

        <div v-if="foundOpen" class="backdrop" @click.self="foundOpen = false">
          <div class="dialog" role="dialog" aria-label="Found a guild">
            <h2>Found a guild</h2>
            <label>Name <input v-model="foundName" maxlength="50" /></label>
            <label>Tag <input v-model="foundTag" maxlength="5" /></label>
            <label>
              Description (optional)
              <textarea v-model="foundDescription" rows="3" maxlength="500"></textarea>
            </label>
            <p v-if="guild.actionError" class="error">{{ guild.actionError }}</p>
            <div class="row">
              <button
                :disabled="guild.actionPending || !foundName.trim() || !foundTag.trim()"
                @click="submitFound"
              >
                Found
              </button>
              <button class="secondary" :disabled="guild.actionPending" @click="foundOpen = false">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="detail">
        <button class="secondary back" @click="backToDirectory">&larr; Back to guild list</button>

        <p v-if="guild.currentLoading">Loading…</p>
        <p v-else-if="guild.currentError" class="error">{{ guild.currentError }}</p>

        <template v-else>
          <header class="head">
            <div>
              <h2>[{{ current.tag }}] {{ current.name }}</h2>
              <p v-if="current.description" class="muted">{{ current.description }}</p>
            </div>
            <div class="row">
              <span class="badge">{{ feeTierLabels[current.feeTier] }}</span>
              <button
                v-if="guild.myMembership"
                class="secondary"
                :disabled="guild.actionPending"
                @click="leaveCurrent"
              >
                {{ guild.isLeader && current.memberCount === 1 ? 'Disband' : 'Leave' }}
              </button>
              <button v-else-if="auth.isAuthenticated" :disabled="guild.actionPending" @click="join(current.id)">
                Join
              </button>
            </div>
          </header>

          <p v-if="guild.actionError" class="error">{{ guild.actionError }}</p>

          <section v-if="perks" class="perks">
            <h3>Perks &amp; caps</h3>
            <dl class="facts">
              <div>
                <dt>Member cap</dt>
                <dd>{{ current.memberCount }} / {{ perks.memberCap }}</dd>
              </div>
              <div>
                <dt>Peace treaty cap</dt>
                <dd>{{ perks.maxActivePeaceTreaties }}</dd>
              </div>
              <div>
                <dt>Trade bonus</dt>
                <dd>+{{ Math.round(perks.tradeCapacityBonus * 100) }}%</dd>
              </div>
              <div>
                <dt>Unit support</dt>
                <dd>{{ perks.allowUnitSupport ? 'Yes' : 'No' }}</dd>
              </div>
            </dl>
            <div v-if="guild.isLeader" class="row">
              <span class="muted">Fee tier:</span>
              <button
                v-for="tier in feeTierOrder"
                :key="tier"
                type="button"
                class="tab"
                :class="{ active: current.feeTier === tier }"
                :disabled="guild.actionPending"
                @click="changeFeeTier(tier)"
              >
                {{ feeTierLabels[tier] }}
              </button>
            </div>
          </section>

          <section v-if="guild.myMembership" class="fee">
            <span :class="{ overdue: guild.myMembership.feeOverdue }">
              Your fee is {{ guild.myMembership.feeOverdue ? 'overdue' : 'paid up' }}.
            </span>
            <button :disabled="guild.actionPending" @click="payFee">Pay fee</button>
          </section>

          <section class="roster">
            <h3>Roster ({{ current.memberCount }})</h3>
            <ul class="member-list">
              <li v-for="m in current.members" :key="m.userId" class="member-row">
                <span class="member-id">{{ m.userId.slice(0, 8) }}</span>
                <span class="badge">{{ roleLabels[m.role] }}</span>
                <span v-if="m.feeOverdue" class="badge overdue">overdue</span>
                <span v-if="guild.isLeader && m.role !== 'leader'" class="row member-actions">
                  <button class="secondary small" :disabled="guild.actionPending" @click="promote(m.userId, 'leader')">
                    Make leader
                  </button>
                  <button
                    v-if="m.role !== 'officer'"
                    class="secondary small"
                    :disabled="guild.actionPending"
                    @click="promote(m.userId, 'officer')"
                  >
                    Make officer
                  </button>
                  <button
                    v-else
                    class="secondary small"
                    :disabled="guild.actionPending"
                    @click="promote(m.userId, 'member')"
                  >
                    Demote
                  </button>
                  <button class="secondary small" :disabled="guild.actionPending" @click="kick(m.userId)">
                    Kick
                  </button>
                </span>
                <button
                  v-else-if="guild.isOfficerOrLeader && m.role === 'member'"
                  class="secondary small"
                  :disabled="guild.actionPending"
                  @click="kick(m.userId)"
                >
                  Kick
                </button>
              </li>
            </ul>
          </section>

          <section class="board">
            <h3>Board</h3>
            <p v-if="guild.topicsLoading">Loading…</p>
            <p v-else-if="guild.topicsError" class="error">{{ guild.topicsError }}</p>

            <template v-else-if="!activeTopicId">
              <ul class="topic-list">
                <li v-if="guild.topics.length === 0" class="muted">No topics yet.</li>
                <li v-for="t in guild.topics" :key="t.id" class="topic-row" @click="openTopic(t.id)">
                  <span v-if="t.pinned" class="badge">pinned</span>
                  <span class="badge">{{ t.kind }}</span>
                  <strong>{{ t.title }}</strong>
                </li>
              </ul>

              <div v-if="guild.myMembership" class="new-topic">
                <h4>Start a topic</h4>
                <input v-model="newTopicTitle" maxlength="120" placeholder="Title" />
                <select v-model="newTopicKind">
                  <option value="discussion">Discussion</option>
                  <option value="announcement">Announcement</option>
                  <option value="report">Report</option>
                </select>
                <textarea v-model="newTopicBody" rows="3" maxlength="4000" placeholder="Message…"></textarea>
                <button
                  :disabled="guild.actionPending || !newTopicTitle.trim() || !newTopicBody.trim()"
                  @click="submitTopic"
                >
                  Post
                </button>
              </div>
            </template>

            <div v-else class="topic-thread">
              <button class="secondary" @click="backToTopics">&larr; Back to topics</button>
              <p v-if="guild.activeTopicLoading">Loading…</p>
              <p v-else-if="guild.activeTopicError" class="error">{{ guild.activeTopicError }}</p>
              <template v-else-if="activeTopic">
                <h4>{{ activeTopic.title }}</h4>
                <ul class="post-list">
                  <li v-for="p in activeTopic.posts" :key="p.id" class="post">
                    <span class="muted">{{ p.authorUserId.slice(0, 8) }} · {{ formattedDate(p.createdAt) }}</span>
                    <p>{{ p.body }}</p>
                  </li>
                </ul>
                <div v-if="guild.myMembership && !activeTopic.locked" class="reply-form">
                  <textarea v-model="replyBody" rows="2" maxlength="4000" placeholder="Reply…"></textarea>
                  <button :disabled="guild.actionPending || !replyBody.trim()" @click="submitReply">Reply</button>
                </div>
              </template>
            </div>
          </section>

          <section class="treaties">
            <h3>Peace treaties</h3>
            <p v-if="guild.treatiesLoading">Loading…</p>
            <p v-else-if="guild.treatiesError" class="error">{{ guild.treatiesError }}</p>
            <ul v-else class="treaty-list">
              <li v-if="guild.treaties.length === 0" class="muted">No treaties yet.</li>
              <li v-for="t in guild.treaties" :key="t.id" class="treaty-row">
                <span>{{ guildLabel(t.proposerGuildId) }} &harr; {{ guildLabel(t.targetGuildId) }}</span>
                <span class="badge">{{ t.status }}</span>
                <span
                  v-if="guild.isOfficerOrLeader && t.status === 'proposed' && t.targetGuildId === current.id"
                  class="row"
                >
                  <button class="secondary small" @click="guild.respondTreaty(t.id, true)">Accept</button>
                  <button class="secondary small" @click="guild.respondTreaty(t.id, false)">Reject</button>
                </span>
                <button
                  v-if="guild.isLeader && t.status === 'active'"
                  class="secondary small"
                  @click="guild.breakTreaty(t.id)"
                >
                  Break
                </button>
              </li>
            </ul>

            <div v-if="guild.isOfficerOrLeader" class="propose-form">
              <select v-model="proposeTargetId">
                <option value="" disabled>Choose a guild…</option>
                <option v-for="g in treatyCandidates" :key="g.id" :value="g.id">[{{ g.tag }}] {{ g.name }}</option>
              </select>
              <button :disabled="guild.actionPending || !proposeTargetId" @click="submitPropose">
                Propose peace
              </button>
            </div>
          </section>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.guild-view {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 16px;
}
.guild-view h1 {
  margin: 0 0 16px;
}
h2,
h3,
h4 {
  margin: 0 0 8px;
}
.directory-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.guild-list,
.topic-list,
.post-list,
.member-list,
.treaty-list {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.guild-row,
.member-row,
.treaty-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 10px 14px;
}
.description {
  margin: 4px 0 0;
}
.topic-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}
.topic-row:hover {
  border-color: var(--gold);
}
.post {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 12px;
}
.post p {
  margin: 4px 0 0;
  white-space: pre-wrap;
}
.member-id {
  font-family: ui-monospace, 'Cascadia Mono', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 12px;
}
.member-actions {
  flex-wrap: wrap;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.back {
  margin-bottom: 12px;
}
section.perks,
section.fee,
section.roster,
section.board,
section.treaties {
  margin-top: 20px;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin: 0 0 12px;
}
.facts dt {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.facts dd {
  margin: 2px 0 0;
  font-weight: 600;
}
.fee {
  display: flex;
  align-items: center;
  gap: 12px;
}
.overdue {
  color: var(--rival);
}
.new-topic,
.reply-form,
.propose-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.propose-form {
  flex-direction: row;
  align-items: center;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.badge {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--muted);
}
.badge.overdue {
  color: var(--rival);
  border-color: var(--rival);
}
.tab {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.tab.active {
  border-color: var(--gold);
  color: var(--gold);
}
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}
.dialog {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 20px;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dialog label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
input,
textarea,
select {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text);
  font-family: inherit;
}
button {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
button.secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--panel-border);
}
button.small {
  padding: 3px 8px;
  font-size: 12px;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.muted {
  color: var(--muted);
}
.hint {
  color: var(--muted);
  font-size: 14px;
}
.error {
  color: var(--rival);
  font-size: 13px;
}
</style>
