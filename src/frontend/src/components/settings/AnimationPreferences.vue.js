/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Graphics preferences (per device, localStorage): the motion settings and
// "Smooth edges". Buildings = the map's `buildings-anim` clip art
// (lib/perf/animationPreference.ts); water, fog and HUD menus are
// lib/perf/motionPreferences.ts. Each motion row is Auto | On | Off, where
// Auto follows the device's own "reduce motion" setting, shown at the top so
// the player can see what Auto resolves to and where to change it. Same
// segmented control as HudPreferences.vue directly above it, so the two
// sections read as one set.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { animationPreference } from '../../lib/perf/animationPreference';
import { antialiasPreference } from '../../lib/perf/antialiasPreference';
import { currentDeviceOs } from '../../lib/perf/deviceOs';
import { motionPreferences } from '../../lib/perf/motionPreferences';
const { t } = useI18n({ useScope: 'global' });
const SETTINGS = ['auto', 'on', 'off'];
const ANTIALIAS_SETTINGS = ['on', 'off'];
// AnimationReason ('forced-on', ...) -> profile.graphics.status's camelCase
// key ('forcedOn', ...) — kept as a lookup rather than a string transform so
// a typo here is a missing-property error against MessageSchema instead of
// a silently-wrong runtime key.
const STATUS_KEY = {
    'forced-on': 'forcedOn',
    'forced-off': 'forcedOff',
    'reduced-motion': 'reducedMotion',
    'save-data': 'saveData',
    measuring: 'measuring',
    'auto-on': 'autoOn',
    'auto-off-slow': 'autoOffSlow',
};
const statusText = computed(() => t(`profile.graphics.status.${STATUS_KEY[animationPreference.reason]}`));
// Live readout of the 'auto' fps measurement (animationPreference's governor).
const measureText = computed(() => {
    const { fps, goodMs, requiredMs, thresholdFps } = animationPreference.progress;
    if (fps === null)
        return t('profile.graphics.measure.none');
    return t('profile.graphics.measure.fps', {
        fps: Math.round(fps),
        good: Math.floor(goodMs / 1000),
        required: Math.round(requiredMs / 1000),
        threshold: thresholdFps,
    });
});
const deviceReduced = computed(() => animationPreference.reducedMotion);
const osHint = computed(() => t(`profile.graphics.device.hint.${currentDeviceOs()}`));
const ROWS = [
    { id: 'buildings', group: 'map', current: () => animationPreference.setting, set: (v) => (animationPreference.setting = v) },
    { id: 'water', group: 'map', current: () => motionPreferences.water, set: (v) => (motionPreferences.water = v) },
    { id: 'lakes', group: 'map', current: () => motionPreferences.lakes, set: (v) => (motionPreferences.lakes = v) },
    { id: 'fog', group: 'map', current: () => motionPreferences.fog, set: (v) => (motionPreferences.fog = v) },
    { id: 'menus', group: 'hud', current: () => motionPreferences.hud, set: (v) => (motionPreferences.hud = v) },
];
const GROUPS = ['map', 'hud'];
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(deviceReduced, {});
    __VLS_withDotValue(ROWS, {});
    __VLS_withDotValue(antialiasPreference, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['option']} */ ;
    /** @type {__VLS_StyleScopedClasses['option']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['field-label']} */ ;
    /** @type {__VLS_StyleScopedClasses['device-badge']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "animation-preferences" },
    });
    /** @type {__VLS_StyleScopedClasses['animation-preferences']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_unwrap(t, {})('profile.graphics.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_unwrap(t, {})('profile.graphics.hint'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "device-line" },
        'data-testid': "device-motion",
    });
    /** @type {__VLS_StyleScopedClasses['device-line']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "device-state" },
    });
    /** @type {__VLS_StyleScopedClasses['device-state']} */ ;
    (__VLS_unwrap(t, {})('profile.graphics.device.label'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
        ...{ class: "device-badge" },
        ...{ class: ({ on: deviceReduced.value }) },
        'data-testid': "device-motion-state",
    });
    /** @type {__VLS_StyleScopedClasses['device-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
    (deviceReduced.value ? __VLS_unwrap(t, {})('profile.graphics.device.on') : __VLS_unwrap(t, {})('profile.graphics.device.off'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "muted small" },
    });
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    (__VLS_unwrap(osHint, {}));
    (__VLS_unwrap(t, {})('profile.graphics.device.autoNote'));
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(GROUPS, {})));
    for (const [group] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
            key: (group),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "group-label" },
        });
        /** @type {__VLS_StyleScopedClasses['group-label']} */ ;
        (__VLS_unwrap(t, {})(group === 'map' ? 'profile.graphics.groupMap' : 'profile.graphics.groupHud'));
        const __VLS_1 = __VLS_tryAsConstant((ROWS.value.filter((r) => r.group === group)));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (row.id),
                ...{ class: "row" },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "field-label" },
            });
            /** @type {__VLS_StyleScopedClasses['field-label']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                id: (`motion-${row.id}-label`),
            });
            (__VLS_unwrap(t, {})(`profile.graphics.${row.id}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "sub" },
            });
            /** @type {__VLS_StyleScopedClasses['sub']} */ ;
            (__VLS_unwrap(t, {})(`profile.graphics.${row.id}Sub`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "setting-toggle" },
                role: "group",
                'aria-labelledby': (`motion-${row.id}-label`),
                'data-testid': (`motion-${row.id}`),
            });
            /** @type {__VLS_StyleScopedClasses['setting-toggle']} */ ;
            const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(SETTINGS, {})));
            for (const [setting] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            return (row.set(setting));
                            // @ts-ignore
                            [t, t, t, t, t, t, t, t, t, deviceReduced, deviceReduced, osHint, GROUPS, ROWS, SETTINGS,];
                        } },
                    key: (setting),
                    type: "button",
                    ...{ class: "option" },
                    ...{ class: ({ active: row.current() === setting }) },
                    'aria-pressed': (row.current() === setting),
                });
                /** @type {__VLS_StyleScopedClasses['option']} */ ;
                /** @type {__VLS_StyleScopedClasses['active']} */ ;
                (__VLS_unwrap(t, {})(`profile.graphics.${setting}`));
                // @ts-ignore
                [t,];
            }
            if (row.id === 'buildings') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "status muted" },
                });
                /** @type {__VLS_StyleScopedClasses['status']} */ ;
                /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                (__VLS_unwrap(statusText, {}));
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "status muted small" },
                    'data-testid': "animation-measure",
                });
                /** @type {__VLS_StyleScopedClasses['status']} */ ;
                /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                /** @type {__VLS_StyleScopedClasses['small']} */ ;
                (__VLS_unwrap(measureText, {}));
            }
            // @ts-ignore
            [statusText, measureText,];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        id: "map-antialias-label",
        ...{ class: "field-label antialias-label" },
    });
    /** @type {__VLS_StyleScopedClasses['field-label']} */ ;
    /** @type {__VLS_StyleScopedClasses['antialias-label']} */ ;
    (__VLS_unwrap(t, {})('profile.graphics.antialias'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "setting-toggle antialias-toggle" },
        role: "group",
        'aria-labelledby': "map-antialias-label",
    });
    /** @type {__VLS_StyleScopedClasses['setting-toggle']} */ ;
    /** @type {__VLS_StyleScopedClasses['antialias-toggle']} */ ;
    const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(ANTIALIAS_SETTINGS, {})));
    for (const [setting] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    __VLS_withDotValue(antialiasPreference, {});
                    return (antialiasPreference.value.setting = setting);
                    // @ts-ignore
                    [t, ANTIALIAS_SETTINGS, antialiasPreference,];
                } },
            key: (setting),
            type: "button",
            ...{ class: "option" },
            ...{ class: ({ active: antialiasPreference.value.setting === setting }) },
            'aria-pressed': (antialiasPreference.value.setting === setting),
        });
        /** @type {__VLS_StyleScopedClasses['option']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_unwrap(t, {})(`profile.graphics.${setting}`));
        // @ts-ignore
        [t, antialiasPreference, antialiasPreference,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "status muted" },
    });
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    (__VLS_unwrap(t, {})('profile.graphics.antialiasHint'));
    // @ts-ignore
    [t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
