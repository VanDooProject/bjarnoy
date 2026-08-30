<script setup lang="ts">
// Issue #40 phase 7: the premium fight simulator. `/simulator` carries
// `meta: { requiresAuth: true }` (router/index.ts) so an unauthenticated
// visitor is redirected to /login before this component even mounts — but
// that only proves they're logged in, not that they're premium. There is no
// client-side premium flag anywhere (UserResponse doesn't expose IsPremium
// today — see AuthContracts.cs), so this view can't gate itself ahead of
// time: it always renders the form, and only finds out on an actual 403
// when the player clicks Simulate. That 403 is the everyday, expected
// response for a non-premium account, not a bug state, so it gets real
// friendly copy instead of the raw problem text most other rejections show.
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api/client';
import { DEMO_MODE } from '../config';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import BattleReportCard from '../components/battle/BattleReportCard.vue';
import { buildSimulatorRequest, isPremiumRequiredError } from '../lib/units/simulator';
import type { SimulatorResponse } from '../api/types';

const catalogue = useUnitCatalogueStore();
onMounted(() => catalogue.load());

const attackerCounts = reactive<Record<string, number>>({});
const defenderCounts = reactive<Record<string, number>>({});
const guestCounts = reactive<Record<string, number>>({});
const towerLevel = ref(0);
const mission = ref<'attack' | 'raid'>('attack');
const seedText = ref('');

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const premiumRequired = ref(false);
const result = ref<SimulatorResponse | null>(null);

function countFor(bucket: Record<string, number>, unit: string): number {
  return bucket[unit] ?? 0;
}
function setCount(bucket: Record<string, number>, unit: string, raw: string) {
  const n = Math.max(0, Math.floor(Number(raw) || 0));
  bucket[unit] = n;
}

const seed = computed<number | undefined>(() => {
  const trimmed = seedText.value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
});

async function runSimulation() {
  errorMessage.value = null;
  premiumRequired.value = false;
  result.value = null;

  const request = buildSimulatorRequest(
    attackerCounts,
    defenderCounts,
    guestCounts,
    towerLevel.value,
    mission.value,
    seed.value,
  );
  if (!request) {
    errorMessage.value = 'Add at least one attacking unit first.';
    return;
  }

  loading.value = true;
  try {
    result.value = await api.simulate(request);
  } catch (err) {
    if (isPremiumRequiredError(err)) {
      premiumRequired.value = true;
    } else {
      errorMessage.value = err instanceof Error ? err.message : 'Simulation failed.';
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="simulator-view">
    <header class="topbar">
      <span class="brand">Fjørdhold</span>
      <router-link to="/reports" class="back">← Reports</router-link>
    </header>

    <main class="body">
      <h1>Fight simulator</h1>
      <p class="subtitle">
        A premium feature: resolve a hypothetical battle with no army, settlement, or database
        involved — nothing here touches your real game state.
      </p>

      <p v-if="DEMO_MODE" class="hint">
        The simulator calls the real backend and needs a logged-in premium account — it isn't
        wired up in demo mode.
      </p>

      <template v-else>
        <div v-if="premiumRequired" class="premium-card">
          <h2>Premium feature</h2>
          <p>
            The fight simulator is a premium feature. This account isn't premium, so the server
            turned that last request down.
          </p>
          <p class="honest-note">
            There's no upgrade flow in this game yet — nowhere here actually sells premium — so
            there's nothing more to click. Ask whoever runs this world if you think that's wrong.
          </p>
        </div>

        <form class="sim-form" @submit.prevent="runSimulation">
          <section class="stack-section">
            <h2>Attacker</h2>
            <div class="unit-grid">
              <label v-for="def in catalogue.definitions" :key="'a-' + def.type" class="unit-field">
                <span>{{ def.type }}</span>
                <input
                  type="number"
                  min="0"
                  :value="countFor(attackerCounts, def.type)"
                  @input="setCount(attackerCounts, def.type, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </section>

          <section class="stack-section">
            <h2>Defender</h2>
            <p class="section-hint">Leave empty to simulate an undefended settlement.</p>
            <div class="unit-grid">
              <label v-for="def in catalogue.definitions" :key="'d-' + def.type" class="unit-field">
                <span>{{ def.type }}</span>
                <input
                  type="number"
                  min="0"
                  :value="countFor(defenderCounts, def.type)"
                  @input="setCount(defenderCounts, def.type, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </section>

          <section class="stack-section">
            <h2>Guest defenders</h2>
            <p class="section-hint">Optional — combined with the defender's own garrison, like a real Support army.</p>
            <div class="unit-grid">
              <label v-for="def in catalogue.definitions" :key="'g-' + def.type" class="unit-field">
                <span>{{ def.type }}</span>
                <input
                  type="number"
                  min="0"
                  :value="countFor(guestCounts, def.type)"
                  @input="setCount(guestCounts, def.type, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </section>

          <section class="options-row">
            <label class="option-field">
              <span>Tower level</span>
              <input type="number" min="0" v-model.number="towerLevel" />
            </label>
            <label class="option-field">
              <span>Mission</span>
              <select v-model="mission">
                <option value="attack">Attack</option>
                <option value="raid">Raid</option>
              </select>
            </label>
            <label class="option-field">
              <span>Seed (optional)</span>
              <input type="number" v-model="seedText" placeholder="random" />
            </label>
          </section>

          <p v-if="errorMessage" class="hint error">{{ errorMessage }}</p>

          <button type="submit" class="simulate-btn" :disabled="loading">
            {{ loading ? 'Simulating…' : 'Simulate' }}
          </button>
        </form>

        <BattleReportCard v-if="result" :report="result" side="attacker" />
      </template>
    </main>
  </div>
</template>

<style scoped>
.simulator-view {
  width: 100vw;
  min-height: 100vh;
  overflow: auto;
  background: var(--shell);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  color: var(--text);
}
.back {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  text-decoration: none;
}
.back:hover {
  border-color: var(--gold);
}
.body {
  max-width: 90ch;
  margin: 0 auto;
  padding: 0 28px 60px;
  color: var(--text);
}
.subtitle {
  color: var(--muted);
  font-size: 13px;
  max-width: 60ch;
}
.hint {
  color: var(--muted);
}
.hint.error {
  color: #e08a8a;
}
.premium-card {
  margin: 16px 0;
  padding: 18px 20px;
  background: var(--panel-bg);
  border: 1px solid var(--gold);
  border-radius: 4px;
}
.premium-card h2 {
  margin: 0 0 8px;
  color: var(--gold);
  font-size: 16px;
}
.premium-card p {
  margin: 6px 0;
  font-size: 13px;
}
.honest-note {
  color: var(--muted);
}
.sim-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 16px;
}
.stack-section h2 {
  margin: 0 0 6px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.section-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--muted);
}
.unit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}
.unit-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--text);
  text-transform: capitalize;
}
.unit-field input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 13px;
  width: 100%;
}
.options-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
.option-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--muted);
}
.option-field input,
.option-field select {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
}
.simulate-btn {
  align-self: flex-start;
  background: var(--gold);
  color: #20160a;
  border: none;
  padding: 10px 22px;
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
  font-size: 14px;
}
.simulate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
