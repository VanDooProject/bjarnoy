import { defineStore } from 'pinia';
export const useConnectionStatusStore = defineStore('connectionStatus', {
    state: () => ({
        issues: {},
    }),
    getters: {
        /** The most recently failed poll, or null when everything is healthy. */
        latest(state) {
            let latest = null;
            for (const [key, issue] of Object.entries(state.issues)) {
                if (!latest || issue.at >= latest.at)
                    latest = { key, ...issue };
            }
            return latest;
        },
    },
    actions: {
        report(key, error) {
            this.issues[key] = { error, at: Date.now(), failures: (this.issues[key]?.failures ?? 0) + 1 };
        },
        clear(key) {
            delete this.issues[key];
        },
    },
});
