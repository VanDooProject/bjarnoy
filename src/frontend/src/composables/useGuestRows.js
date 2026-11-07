// Shared guest-army rows behind TrainingQueuePanel.vue's Guests section and
// QueueDrawer's — the host's view of who is stationed at this settlement
// (issue #40 phase 4) plus its "Send home" action, so desktop and the mobile
// drawer don't each re-derive the rows or the pending/error handling.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError } from '../api/client';
import { useWorldStore } from '../stores/world';
import { unitName } from '../i18n/catalogueNames';
export function useGuestRows() {
    const world = useWorldStore();
    const { t } = useI18n({ useScope: 'global' });
    const guests = computed(() => world.guestArmies.map((g) => ({
        key: g.armyId,
        ownerName: world.model.getSettlement(g.ownerSettlementId)?.name ?? t('hud.trainingQueue.unknownSettlement'),
        composition: g.stacks
            .filter((s) => s.count > 0)
            .map((s) => t('hud.trainingQueue.orderName', { count: s.count, unit: unitName(s.unit) }))
            .join(', ') || '—',
    })));
    const sendingId = ref(null);
    const error = ref(null);
    async function sendHome(armyId) {
        sendingId.value = armyId;
        error.value = null;
        try {
            await world.sendGuestHomeLive(armyId);
        }
        catch (err) {
            error.value = err instanceof ApiError ? err.message : t('hud.trainingQueue.sendHomeError');
        }
        finally {
            sendingId.value = null;
        }
    }
    return { guests, sendingId, error, sendHome };
}
