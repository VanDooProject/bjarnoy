<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useNotificationsStore } from '../stores/notifications';

const auth = useAuthStore();
const notifications = useNotificationsStore();

onMounted(() => {
  if (auth.isAuthenticated) {
    void notifications.load();
  }
});

// One state per row of docs/plans/push-notifications.md's "This device"
// card — mutually exclusive, checked in this order.
type ThisDeviceState = 'unsupported' | 'needs-install' | 'denied' | 'on' | 'off';

const thisDeviceState = computed<ThisDeviceState>(() => {
  if (notifications.support === 'unsupported') return 'unsupported';
  if (notifications.support === 'needs-install') return 'needs-install';
  if (notifications.permission === 'denied') return 'denied';
  return notifications.enabledHere ? 'on' : 'off';
});
</script>

<template>
  <div class="notification-settings">
    <h1>{{ $t('notifications.title') }}</h1>

    <p v-if="!auth.isAuthenticated" class="muted">
      {{ $t('notifications.anonymous') }}
      <router-link to="/register">{{ $t('notifications.createAccount') }}</router-link>
    </p>

    <template v-else>
      <p v-if="notifications.configLoading" class="muted">{{ $t('common.states.loading') }}</p>
      <p v-else-if="notifications.configError" class="error">{{ notifications.configError }}</p>
      <p v-else-if="notifications.config && !notifications.config.enabled" class="muted">
        {{ $t('notifications.unavailable') }}
      </p>

      <section v-else-if="notifications.config" class="card this-device">
        <h2>{{ $t('notifications.thisDevice.title') }}</h2>

        <p v-if="thisDeviceState === 'unsupported'" class="muted">
          {{ $t('notifications.thisDevice.unsupported') }}
        </p>
        <p v-else-if="thisDeviceState === 'needs-install'" class="muted">
          {{ $t('notifications.thisDevice.needsInstall') }}
        </p>
        <p v-else-if="thisDeviceState === 'denied'" class="error">
          {{ $t('notifications.thisDevice.denied') }}
        </p>
        <template v-else>
          <p :class="thisDeviceState === 'on' ? 'status-on' : 'muted'">
            {{ thisDeviceState === 'on' ? $t('notifications.thisDevice.on') : $t('notifications.thisDevice.off') }}
          </p>

          <p v-if="notifications.subscribeError" class="error">{{ notifications.subscribeError }}</p>
          <p v-if="notifications.testSent" class="status-on">{{ $t('notifications.thisDevice.testSent') }}</p>

          <div class="row">
            <button
              v-if="thisDeviceState === 'off'"
              :disabled="notifications.subscribing"
              @click="notifications.enable()"
            >
              {{ $t('notifications.thisDevice.enable') }}
            </button>
            <template v-else>
              <button
                class="secondary"
                :disabled="notifications.sendingTest"
                @click="notifications.sendTest()"
              >
                {{ $t('notifications.thisDevice.sendTest') }}
              </button>
              <button
                class="secondary"
                :disabled="notifications.subscribing"
                @click="notifications.disableThisDevice()"
              >
                {{ $t('notifications.thisDevice.disable') }}
              </button>
            </template>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.notification-settings {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px;
}
.card {
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
}
.card h2 {
  margin: 0 0 8px;
}
.muted {
  color: var(--muted);
}
.error {
  color: var(--rival);
  font-size: 13px;
}
.status-on {
  color: var(--food);
}
.row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
</style>
