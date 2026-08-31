<script setup lang="ts">
// PR 2 (trade system): a toggleable panel rather than an always-visible
// status-card like BuildQueuePanel — it holds an actual form, not just a
// read-only list, so it opens on demand via the `.trade-toggle` pill.
//
// Design decision (see the top-level task notes): a GuildOnly offer can
// currently never be accepted — the backend hardcodes no guild membership
// yet. Rather than let the click round-trip to a 409 every time, the
// Accept button for a guild-only row is disabled up front with a tooltip
// ("Guild trading isn't available yet"), same as HudNav already does for
// Reports/Alliance. `messageFor` below still knows how to render a
// `GuildOnlyOffer` rejection in case one ever reaches here anyway (e.g. a
// stale board row accepted just as guild membership ships).
import { computed, ref } from 'vue';
import { ApiError } from '../../api/client';
import { DEMO_MODE } from '../../config';
import { DemoTradeError } from '../../lib/map/WorldModel';
import type { ResourceKind } from '../../lib/map/types';
import { validateTradeRatio } from '../../lib/trade/tradeRatio';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();

const RESOURCES: ResourceKind[] = ['wood', 'stone', 'food', 'iron'];

const RESOURCE_LABELS: Record<string, string> = {
  wood: 'Wood',
  stone: 'Stone',
  food: 'Food',
  iron: 'Iron',
};

const RESOURCE_COLORS: Record<string, string> = {
  wood: 'var(--wood)',
  stone: 'var(--stone)',
  food: 'var(--food)',
  iron: 'var(--iron)',
};

// Mirrors TradeEndpoints.Problem's Detail strings (backend) so a rejection
// reads the same whether it came back from a real 409 or from
// WorldModel's demo-mode DemoTradeError.
const REJECTION_MESSAGES: Record<string, string> = {
  ZeroAmount: 'Both amounts must be positive.',
  SameResource: 'Offered and requested resources must differ.',
  RatioExceeded: 'That ratio is outside the allowed corridor (max 2x, or 8x for guild-only offers).',
  NotEnoughResources: 'Not enough resources in stock for that.',
  NotEnoughCarts: 'Not enough carts free to carry that amount.',
  LonghouseTooLow: 'The longhouse is not high enough level to trade yet.',
  OutOfRange: "That settlement is out of the poster's trade range.",
  OfferNotOpen: 'That offer is no longer open.',
  GuildOnlyOffer: "Guild trading isn't available yet.",
  OwnOffer: 'A settlement cannot accept its own offer.',
};

function messageFor(err: unknown): string {
  const rejection =
    err instanceof ApiError ? err.problem?.rejection : err instanceof DemoTradeError ? err.rejection : undefined;
  if (rejection) return REJECTION_MESSAGES[rejection] ?? rejection;
  return err instanceof Error ? err.message : 'Something went wrong.';
}

const guildOnlyTooltip = "Guild trading isn't available yet";

const open = ref(false);
const error = ref('');
const busy = ref(false);

const offeredResource = ref<ResourceKind>('wood');
const offeredAmount = ref(100);
const requestedResource = ref<ResourceKind>('iron');
const requestedAmount = ref(50);
const guildOnly = ref(false);

// Instant client-side feedback against the exact same ratio rule the
// backend enforces (`lib/trade/tradeRatio.ts`), rather than waiting on a
// round trip just to find out the corridor was violated.
const ratioRejection = computed(() =>
  validateTradeRatio(
    offeredResource.value,
    offeredAmount.value,
    requestedResource.value,
    requestedAmount.value,
    guildOnly.value,
  ),
);
const ratioErrorMessage = computed(() =>
  ratioRejection.value ? (REJECTION_MESSAGES[ratioRejection.value] ?? ratioRejection.value) : '',
);

async function submitOffer() {
  error.value = '';
  if (ratioRejection.value) {
    error.value = ratioErrorMessage.value;
    return;
  }
  if (!world.selectedSettlementId) return;
  busy.value = true;
  try {
    if (DEMO_MODE) {
      world.model.postTradeOffer(
        world.selectedSettlementId,
        offeredResource.value,
        offeredAmount.value,
        requestedResource.value,
        requestedAmount.value,
        guildOnly.value,
      );
      world.syncHud();
    } else {
      await world.postTradeOfferLive(
        offeredResource.value,
        offeredAmount.value,
        requestedResource.value,
        requestedAmount.value,
        guildOnly.value,
      );
    }
  } catch (err) {
    error.value = messageFor(err);
  } finally {
    busy.value = false;
  }
}

async function accept(offerId: string) {
  error.value = '';
  if (!world.selectedSettlementId) return;
  try {
    if (DEMO_MODE) {
      world.model.acceptTradeOffer(offerId, world.selectedSettlementId);
      world.syncHud();
    } else {
      await world.acceptTradeOfferLive(offerId);
    }
  } catch (err) {
    error.value = messageFor(err);
  }
}

async function cancelOffer(offerId: string) {
  error.value = '';
  if (!world.selectedSettlementId) return;
  try {
    if (DEMO_MODE) {
      world.model.cancelTradeOffer(offerId, world.selectedSettlementId);
      world.syncHud();
    } else {
      await world.cancelTradeOfferLive(offerId);
    }
  } catch (err) {
    error.value = messageFor(err);
  }
}

// Demo mode has no backend to poll — it reads WorldModel's own in-memory
// offers directly (see WorldModel.postTradeOffer and friends). Live mode
// reads the polled hud snapshot instead (stores/world.ts's
// refreshTradeAsync). `world.hud.tick` is a cheap reactive dependency
// (incremented once a second by syncHud) so these recompute even though
// WorldModel itself is markRaw and not reactive.
const openOffers = computed(() => {
  void world.hud.tick;
  if (!world.selectedSettlementId) return [];
  return DEMO_MODE ? world.model.listOpenTradeOffers(world.selectedSettlementId) : world.hud.tradeBoard;
});

const myOffers = computed(() => {
  void world.hud.tick;
  if (!world.selectedSettlementId) return [];
  return DEMO_MODE ? world.model.listMyTradeOffers(world.selectedSettlementId) : world.hud.myTradeOffers;
});

// Demo mode's acceptTradeOffer settles synchronously (no travel time to
// simulate — see its doc comment), so there is never anything in transit
// to show here.
const shipments = computed(() => {
  void world.hud.tick;
  return DEMO_MODE ? [] : world.hud.shipments;
});

/**
 * Countdown to a shipment's arrival, ticking locally between polls the same
 * way BuildQueuePanel counts down build orders. Unlike a build order's
 * `completesInSeconds`, `ShipmentResponse` only carries an absolute
 * `arrivesAtGameTime` — this assumes the world clock advances 1:1 with real
 * time (true for every world this client talks to today) rather than
 * reading a game/real clock offset that doesn't exist anywhere yet.
 */
function fmtCountdown(arrivesAtGameTime: string): string {
  const remainingMs = new Date(arrivesAtGameTime).getTime() - Date.now();
  if (remainingMs <= 0) return 'arriving';
  const s = Math.round(remainingMs / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
</script>

<template>
  <div class="trade-widget">
    <button type="button" class="trade-toggle pill" @click="open = !open">
      Trade
      <span v-if="myOffers.length" class="trade-badge">{{ myOffers.length }}</span>
    </button>

    <div v-if="open" class="trade-panel panel">
      <div class="trade-panel-header">
        <span class="trade-panel-title">Trade</span>
        <button type="button" class="trade-panel-close" aria-label="Close trade panel" @click="open = false">×</button>
      </div>

      <div v-if="error" class="trade-error">{{ error }}</div>

      <section class="trade-section">
        <h3 class="trade-section-title">Post an offer</h3>
        <form class="trade-form" @submit.prevent="submitOffer">
          <div class="trade-form-row">
            <span class="trade-form-label">Give</span>
            <select v-model="offeredResource" class="trade-select">
              <option v-for="r in RESOURCES" :key="r" :value="r">{{ RESOURCE_LABELS[r] }}</option>
            </select>
            <input v-model.number="offeredAmount" type="number" min="1" class="trade-amount" />
          </div>
          <div class="trade-form-row">
            <span class="trade-form-label">For</span>
            <select v-model="requestedResource" class="trade-select">
              <option v-for="r in RESOURCES" :key="r" :value="r">{{ RESOURCE_LABELS[r] }}</option>
            </select>
            <input v-model.number="requestedAmount" type="number" min="1" class="trade-amount" />
          </div>
          <label class="trade-checkbox">
            <input v-model="guildOnly" type="checkbox" />
            Guild only (up to 8x ratio)
          </label>
          <p v-if="ratioErrorMessage" class="trade-hint">{{ ratioErrorMessage }}</p>
          <button type="submit" class="trade-submit" :disabled="busy || !!ratioRejection">Post offer</button>
        </form>
      </section>

      <section class="trade-section">
        <h3 class="trade-section-title">Open offers</h3>
        <p v-if="!openOffers.length" class="trade-empty">No offers in range right now.</p>
        <div v-for="o in openOffers" :key="o.id" class="trade-row">
          <div class="trade-row-main">
            <span class="res-dot" :style="{ background: RESOURCE_COLORS[o.offeredResource] }" />
            <span>{{ o.offeredAmount }} {{ RESOURCE_LABELS[o.offeredResource] ?? o.offeredResource }}</span>
            <span class="trade-arrow">→</span>
            <span class="res-dot" :style="{ background: RESOURCE_COLORS[o.requestedResource] }" />
            <span>{{ o.requestedAmount }} {{ RESOURCE_LABELS[o.requestedResource] ?? o.requestedResource }}</span>
            <span v-if="o.guildOnly" class="badge badge-guild">Guild only</span>
          </div>
          <button
            type="button"
            class="trade-action"
            :disabled="o.guildOnly"
            :title="o.guildOnly ? guildOnlyTooltip : undefined"
            @click="accept(o.id)"
          >
            Accept
          </button>
        </div>
      </section>

      <section class="trade-section">
        <h3 class="trade-section-title">My offers</h3>
        <p v-if="!myOffers.length" class="trade-empty">You haven't posted anything yet.</p>
        <div v-for="o in myOffers" :key="o.id" class="trade-row">
          <div class="trade-row-main">
            <span class="res-dot" :style="{ background: RESOURCE_COLORS[o.offeredResource] }" />
            <span>{{ o.offeredAmount }} {{ RESOURCE_LABELS[o.offeredResource] ?? o.offeredResource }}</span>
            <span class="trade-arrow">→</span>
            <span class="res-dot" :style="{ background: RESOURCE_COLORS[o.requestedResource] }" />
            <span>{{ o.requestedAmount }} {{ RESOURCE_LABELS[o.requestedResource] ?? o.requestedResource }}</span>
            <span class="badge" :class="`badge-${o.state}`">{{ o.state }}</span>
          </div>
          <button v-if="o.state === 'open'" type="button" class="trade-action" @click="cancelOffer(o.id)">
            Cancel
          </button>
        </div>
      </section>

      <section v-if="!DEMO_MODE" class="trade-section">
        <h3 class="trade-section-title">Shipments</h3>
        <p v-if="!shipments.length" class="trade-empty">No carts on the road.</p>
        <div v-for="s in shipments" :key="s.id" class="trade-row">
          <div class="trade-row-main">
            <span>hex {{ s.fromQ }}-{{ s.fromR }}</span>
            <span class="trade-arrow">→</span>
            <span>hex {{ s.toQ }}-{{ s.toR }}</span>
            <span>{{ s.cargoAmount }} {{ RESOURCE_LABELS[s.cargoResource] ?? s.cargoResource }}</span>
          </div>
          <span class="trade-time">{{ s.delivered ? 'delivered' : fmtCountdown(s.arrivesAtGameTime) }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.trade-toggle {
  position: absolute;
  right: 16px;
  top: 76px;
  z-index: 10;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.trade-toggle:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.trade-badge {
  background: var(--gold);
  color: #20160a;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 7px;
}

.trade-panel {
  position: absolute;
  right: 16px;
  top: 118px;
  z-index: 10;
  width: 320px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 14px 15px;
  border-radius: 0;
}
.trade-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--panel-border);
}
.trade-panel-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text);
}
.trade-panel-close {
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.trade-panel-close:hover {
  color: var(--gold);
}

.trade-error {
  background: rgba(226, 112, 95, 0.15);
  border: 1px solid var(--rival);
  color: var(--text);
  font-size: 12px;
  padding: 6px 8px;
  margin-bottom: 10px;
}

.trade-section + .trade-section {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--panel-border);
}
.trade-section-title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.trade-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.trade-form-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.trade-form-label {
  font-size: 12px;
  color: var(--muted);
  width: 26px;
  flex: none;
}
.trade-select,
.trade-amount {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--panel-border);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  padding: 5px 6px;
  border-radius: 4px;
}
.trade-select {
  flex: 1;
}
.trade-amount {
  width: 80px;
}
.trade-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.trade-hint {
  margin: 0;
  font-size: 12px;
  color: var(--rival);
}
.trade-submit {
  background: var(--gold);
  border: none;
  color: #20160a;
  font-weight: 700;
  font-size: 13px;
  padding: 7px 0;
  border-radius: 4px;
  cursor: pointer;
}
.trade-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.trade-empty {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.trade-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 0;
}
.trade-row + .trade-row {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.trade-row-main {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text);
}
.trade-arrow {
  color: var(--muted);
}
.res-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}
.badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--muted);
}
.badge-open {
  background: rgba(143, 195, 90, 0.2);
  color: var(--food);
}
.badge-accepted {
  background: rgba(111, 143, 168, 0.25);
  color: var(--iron);
}
.badge-delivered {
  background: rgba(255, 197, 92, 0.2);
  color: var(--gold);
}
.badge-cancelled,
.badge-expired {
  background: rgba(226, 112, 95, 0.2);
  color: var(--rival);
}
.badge-guild {
  background: rgba(255, 255, 255, 0.1);
  color: var(--muted);
}
.trade-action {
  flex: none;
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.trade-action:hover:not(:disabled) {
  border-color: var(--gold);
  color: var(--gold);
}
.trade-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.trade-time {
  flex: none;
  font-size: 11px;
  color: var(--muted);
}
</style>
