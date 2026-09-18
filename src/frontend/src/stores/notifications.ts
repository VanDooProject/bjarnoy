import { defineStore } from 'pinia';
import { ApiError, api } from '../api/client';
import type { NotificationConfigResponse } from '../api/types';
import { pushSupport, type PushSupport } from '../push/capability';
import { currentSubscription, deviceLabelFromUserAgent, subscribe, unsubscribe } from '../push/subscription';

/** Set once a player explicitly turns notifications off on this device — see docs/plans/push-notifications.md's multi-device table. */
const DISABLED_HERE_KEY = 'bjarnoy.push.disabledHere';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

function currentPermission(support: PushSupport): NotificationPermissionState {
  if (support === 'unsupported') return 'unsupported';
  return (typeof Notification !== 'undefined' ? Notification.permission : 'default') as
    | 'default'
    | 'granted'
    | 'denied';
}

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    support: 'unsupported' as PushSupport,
    permission: 'unsupported' as NotificationPermissionState,
    config: null as NotificationConfigResponse | null,
    /** This device's own subscription id, once known — null if not subscribed here. */
    thisDeviceSubscriptionId: null as string | null,
    configLoading: false,
    configError: null as string | null,
    subscribing: false,
    subscribeError: null as string | null,
    sendingTest: false,
    testSent: false,
  }),
  getters: {
    /** True once we know push both works in this browser and is turned on server-side. */
    enabledHere: (state) => state.thisDeviceSubscriptionId !== null,
    disabledHereByChoice: () => {
      try {
        return localStorage.getItem(DISABLED_HERE_KEY) === 'true';
      } catch {
        return false;
      }
    },
  },
  actions: {
    /** Loads /config and, if enabled, checks whether this browser already has a subscription the server also knows about. */
    async load() {
      this.support = pushSupport();
      this.permission = currentPermission(this.support);
      this.configLoading = true;
      this.configError = null;
      try {
        this.config = await api.getNotificationConfig();
        await this.syncThisDevice();
      } catch (err) {
        this.configError = err instanceof ApiError ? err.message : 'Could not load notification settings.';
      } finally {
        this.configLoading = false;
      }
    },
    /** Reconciles this browser's own PushSubscription (if any) against the server's list — sets thisDeviceSubscriptionId. */
    async syncThisDevice() {
      if (this.support === 'unsupported' || !this.config?.enabled) {
        this.thisDeviceSubscriptionId = null;
        return;
      }

      const local = await currentSubscription();
      if (!local) {
        this.thisDeviceSubscriptionId = null;
        return;
      }

      try {
        const subscriptions = await api.listPushSubscriptions();
        // The server never returns the endpoint, so identity here is
        // "some subscription exists for this account" once permission is
        // granted and a local PushSubscription is present — precise
        // per-endpoint matching (and cross-device revoke detection) is
        // phase 3's device-management reconcile().
        this.thisDeviceSubscriptionId = subscriptions[0]?.id ?? null;
      } catch {
        this.thisDeviceSubscriptionId = null;
      }
    },
    /** Requests permission (must run from a click handler) and subscribes this device. */
    async enable() {
      if (!this.config?.vapidPublicKey) return;

      this.subscribing = true;
      this.subscribeError = null;
      try {
        const pushSubscription = await subscribe(this.config.vapidPublicKey);
        const keys = pushSubscription.toJSON().keys;
        const saved = await api.upsertPushSubscription({
          endpoint: pushSubscription.endpoint,
          p256dh: keys?.p256dh ?? '',
          auth: keys?.auth ?? '',
          deviceLabel: deviceLabelFromUserAgent(navigator.userAgent),
          userAgent: navigator.userAgent,
        });
        this.thisDeviceSubscriptionId = saved.id;
        this.permission = currentPermission(this.support);
        try {
          localStorage.removeItem(DISABLED_HERE_KEY);
        } catch {
          // Best-effort — a private window may refuse storage writes.
        }
      } catch (err) {
        this.subscribeError = err instanceof ApiError ? err.message : (err as Error).message;
        this.permission = currentPermission(this.support);
      } finally {
        this.subscribing = false;
      }
    },
    /** Turns notifications off on this device only. */
    async disableThisDevice() {
      this.subscribing = true;
      this.subscribeError = null;
      try {
        await unsubscribe();
        if (this.thisDeviceSubscriptionId) {
          await api.deletePushSubscription(this.thisDeviceSubscriptionId);
        }
        this.thisDeviceSubscriptionId = null;
        try {
          localStorage.setItem(DISABLED_HERE_KEY, 'true');
        } catch {
          // Best-effort, same as above.
        }
      } catch (err) {
        this.subscribeError = err instanceof ApiError ? err.message : (err as Error).message;
      } finally {
        this.subscribing = false;
      }
    },
    async sendTest() {
      if (!this.thisDeviceSubscriptionId) return;
      this.sendingTest = true;
      this.testSent = false;
      try {
        await api.sendTestPushNotification(this.thisDeviceSubscriptionId);
        this.testSent = true;
      } catch (err) {
        this.subscribeError = err instanceof ApiError ? err.message : (err as Error).message;
      } finally {
        this.sendingTest = false;
      }
    },
  },
});
