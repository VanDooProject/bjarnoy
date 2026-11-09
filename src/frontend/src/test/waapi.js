// Test double for the Web Animations API (jsdom has none): every `animate()`
// call is recorded, and `finished` resolves after delay + duration on the
// (fake) timer clock, so a test can drive a choreography with
// `vi.advanceTimersByTimeAsync`.
import { vi } from 'vitest';
export function installWaapi(reduced = false) {
    const calls = [];
    const original = Element.prototype.animate;
    const originalMatchMedia = window.matchMedia;
    Element.prototype.animate = function (frames, options) {
        calls.push({ el: this, frames, options });
        const ms = Number(options.delay ?? 0) + Number(options.duration ?? 0);
        return {
            finished: new Promise((resolve) => setTimeout(() => resolve({}), ms)),
            playState: 'running',
            effect: {},
            cancel() { },
        };
    };
    window.matchMedia = ((query) => ({
        matches: reduced && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener() { },
        removeEventListener() { },
    }));
    return {
        calls,
        /** Frames recorded for animations on elements matching `selector`. */
        on(selector) {
            return calls.filter((c) => c.el.matches(selector));
        },
        uninstall() {
            Element.prototype.animate = original;
            window.matchMedia = originalMatchMedia;
            vi.useRealTimers();
        },
    };
}
