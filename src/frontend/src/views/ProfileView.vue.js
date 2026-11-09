/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useUnsavedInput } from '../composables/useUnsavedInput';
const { defineExpose, } = {};
const route = useRoute();
const auth = useAuthStore();
const { t, d } = useI18n({ useScope: 'global' });
const profile = ref(null);
const loading = ref(true);
const loadError = ref(null);
// The route is /profile/:userName; /profile (no param) is the caller's own
// profile, which the router only allows when logged in.
const targetUserName = computed(() => route.params.userName || auth.user?.userName || '');
const isOwnProfile = computed(() => auth.user !== null &&
    profile.value !== null &&
    auth.user.id === profile.value.id);
async function load() {
    if (!targetUserName.value) {
        loadError.value = t('profile.noProfile');
        loading.value = false;
        return;
    }
    loading.value = true;
    loadError.value = null;
    profile.value = null;
    try {
        profile.value = await api.getProfileByName(targetUserName.value);
    }
    catch (err) {
        loadError.value =
            err instanceof ApiError && err.status === 404 ? t('profile.noSuchPlayer') : t('profile.loadError');
    }
    finally {
        loading.value = false;
    }
}
watch(targetUserName, load, { immediate: true });
// ProfileModal.vue reads this to show the profile's name in its mobile
// header bar, without fetching the profile a second time itself.
const __VLS_exposed = { profile };
defineExpose(__VLS_exposed);
// --- Own-bio editing ---
const editingBio = ref(false);
const bioDraft = ref('');
const bioSaving = ref(false);
const bioError = ref(null);
const BIO_MAX = 2000;
function startEditBio() {
    bioDraft.value = profile.value?.bio ?? '';
    bioError.value = null;
    editingBio.value = true;
}
async function saveBio() {
    if (bioSaving.value)
        return;
    if (bioDraft.value.length > BIO_MAX) {
        bioError.value = t('profile.bio.tooLong', { max: BIO_MAX });
        return;
    }
    bioSaving.value = true;
    bioError.value = null;
    try {
        profile.value = await api.updateMyBio({ bio: bioDraft.value || null });
        editingBio.value = false;
    }
    catch (err) {
        bioError.value = err instanceof ApiError ? err.message : t('profile.bio.saveError');
    }
    finally {
        bioSaving.value = false;
    }
}
// --- Reporting ---
const reportOpen = ref(false);
const reportReason = ref('');
const reportNote = ref('');
useUnsavedInput(() => (editingBio.value && bioDraft.value !== (profile.value?.bio ?? '')) ||
    reportReason.value.trim() !== '' ||
    reportNote.value.trim() !== '');
const reportSending = ref(false);
const reportError = ref(null);
const reportDone = ref(false);
const canReport = computed(() => auth.isAuthenticated && !isOwnProfile.value);
// Focused on open so an Escape press reaches this dialog's own keydown
// handler (below, in the template) rather than the profile modal's — see
// ProfileModal.vue's own comment on why that ordering closes only the
// report dialog, not the whole profile modal, while it's open.
const reportDialogEl = ref(null);
function openReport() {
    reportReason.value = '';
    reportNote.value = '';
    reportError.value = null;
    reportOpen.value = true;
    void nextTick(() => reportDialogEl.value?.focus());
}
async function sendReport() {
    if (reportSending.value || !profile.value)
        return;
    if (!reportReason.value.trim()) {
        reportError.value = t('profile.reportDialog.reasonRequired');
        return;
    }
    reportSending.value = true;
    reportError.value = null;
    try {
        await api.reportProfile(profile.value.id, {
            reason: reportReason.value.trim(),
            note: reportNote.value.trim() || undefined,
        });
        reportOpen.value = false;
        reportDone.value = true;
    }
    catch (err) {
        reportError.value = err instanceof ApiError ? err.message : t('profile.reportDialog.sendError');
    }
    finally {
        reportSending.value = false;
    }
}
function joinedDate(iso) {
    return d(new Date(iso), 'dateLong');
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(profile, {});
    __VLS_withDotValue(canReport, {});
    __VLS_withDotValue(reportDone, {});
    __VLS_withDotValue(isOwnProfile, {});
    __VLS_withDotValue(editingBio, {});
    __VLS_withDotValue(bioDraft, {});
    __VLS_withDotValue(bioError, {});
    __VLS_withDotValue(reportOpen, {});
    __VLS_withDotValue(reportError, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    /** @type {__VLS_StyleScopedClasses['facts']} */ ;
    /** @type {__VLS_StyleScopedClasses['facts']} */ ;
    /** @type {__VLS_StyleScopedClasses['bio-head']} */ ;
    /** @type {__VLS_StyleScopedClasses['report-dialog']} */ ;
    /** @type {__VLS_StyleScopedClasses['report-dialog']} */ ;
    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "profile" },
    });
    /** @type {__VLS_StyleScopedClasses['profile']} */ ;
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('common.states.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (loadError.value);
    }
    else if (profile.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
            ...{ class: "head" },
        });
        /** @type {__VLS_StyleScopedClasses['head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
            id: "profile-modal-name",
        });
        (profile.value.displayName || profile.value.userName);
        if (profile.value.displayName) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (`@${profile.value.userName}`);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "head-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['head-actions']} */ ;
        if (canReport.value) {
            let __VLS_0;
            /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
            routerLink;
            // @ts-ignore
            const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
                // @ts-ignore
                ...{ class: "secondary" }, to: (`/messages/${profile.value.id}`),
            }));
            const __VLS_2 = __VLS_1({
                ...{ class: "secondary" },
                to: (`/messages/${profile.value.id}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_1));
            /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
            var __VLS_3;
            const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
            (__VLS_ctx.$t('profile.message'));
            // @ts-ignore
            [loading, $t, $t, loadError, loadError, profile, profile, profile, profile, profile, profile, canReport,];
        }
        if (canReport.value && !reportDone.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (openReport) },
                ...{ class: "secondary" },
            });
            /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
            (__VLS_ctx.$t('profile.report'));
        }
        if (reportDone.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('profile.reportSent'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({
            ...{ class: "facts" },
        });
        /** @type {__VLS_StyleScopedClasses['facts']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        (__VLS_ctx.$t('profile.joined'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (joinedDate(profile.value.createdAt));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        (__VLS_ctx.$t('profile.settlements'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (profile.value.settlementCount);
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "bio-section" },
        });
        /** @type {__VLS_StyleScopedClasses['bio-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "bio-head" },
        });
        /** @type {__VLS_StyleScopedClasses['bio-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('profile.bio.title'));
        if (isOwnProfile.value && !editingBio.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (startEditBio) },
                ...{ class: "secondary" },
            });
            /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
            (profile.value.bio ? __VLS_ctx.$t('profile.bio.edit') : __VLS_ctx.$t('profile.bio.add'));
        }
        if (editingBio.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
                value: (bioDraft.value),
                ...{ class: "bio-editor" },
                rows: "10",
                maxlength: (__VLS_unwrap(BIO_MAX, {})),
                spellcheck: "false",
                placeholder: (__VLS_ctx.$t('profile.bio.placeholder')),
            });
            /** @type {__VLS_StyleScopedClasses['bio-editor']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted counter" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            /** @type {__VLS_StyleScopedClasses['counter']} */ ;
            (bioDraft.value.length);
            (__VLS_unwrap(BIO_MAX, {}));
            if (bioError.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "error" },
                });
                /** @type {__VLS_StyleScopedClasses['error']} */ ;
                (bioError.value);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "row" },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (saveBio) },
                disabled: (__VLS_unwrap(bioSaving, {})),
            });
            (__VLS_ctx.$t('common.buttons.save'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!(profile.value))
                            throw 0;
                        if (!(editingBio.value))
                            throw 0;
                        return (editingBio.value = false);
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, $t, $t, $t, profile, profile, profile, canReport, reportDone, reportDone, isOwnProfile, editingBio, editingBio, editingBio, bioDraft, bioDraft, BIO_MAX, BIO_MAX, bioError, bioError, bioSaving,];
                    } },
                ...{ class: "secondary" },
                disabled: (__VLS_unwrap(bioSaving, {})),
            });
            /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
            (__VLS_ctx.$t('common.buttons.cancel'));
        }
        else if (profile.value.bio) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.pre, __VLS_intrinsics.pre)({
                ...{ class: "bio" },
            });
            /** @type {__VLS_StyleScopedClasses['bio']} */ ;
            (profile.value.bio);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('profile.bio.empty'));
        }
        if (reportOpen.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!(profile.value))
                            throw 0;
                        if (!(reportOpen.value))
                            throw 0;
                        return (reportOpen.value = false);
                        // @ts-ignore
                        [$t, $t, profile, profile, bioSaving, reportOpen, reportOpen,];
                    } },
                ...{ class: "report-backdrop" },
            });
            /** @type {__VLS_StyleScopedClasses['report-backdrop']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onKeydown: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!(profile.value))
                            throw 0;
                        if (!(reportOpen.value))
                            throw 0;
                        return (reportOpen.value = false);
                        // @ts-ignore
                        [reportOpen,];
                    } },
                ref: "reportDialogEl",
                ...{ class: "report-dialog" },
                role: "dialog",
                tabindex: "-1",
                'aria-label': (__VLS_ctx.$t('profile.reportDialog.ariaLabel')),
            });
            /** @type {__VLS_StyleScopedClasses['report-dialog']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
            (__VLS_ctx.$t('profile.reportDialog.title', { userName: profile.value.userName }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('profile.reportDialog.hint'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('profile.reportDialog.reason'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onKeyup: (sendReport) },
                value: (__VLS_unwrap(reportReason, {})),
                type: "text",
                maxlength: "200",
                placeholder: (__VLS_ctx.$t('profile.reportDialog.reasonPlaceholder')),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('profile.reportDialog.note'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
                value: (__VLS_unwrap(reportNote, {})),
                rows: "3",
                maxlength: "2000",
            });
            if (reportError.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "error" },
                });
                /** @type {__VLS_StyleScopedClasses['error']} */ ;
                (reportError.value);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "row" },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (sendReport) },
                disabled: (__VLS_unwrap(reportSending, {})),
            });
            (__VLS_ctx.$t('profile.reportDialog.send'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!(profile.value))
                            throw 0;
                        if (!(reportOpen.value))
                            throw 0;
                        return (reportOpen.value = false);
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, $t, profile, reportOpen, reportReason, reportNote, reportError, reportError, reportSending,];
                    } },
                ...{ class: "secondary" },
                disabled: (__VLS_unwrap(reportSending, {})),
            });
            /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
            (__VLS_ctx.$t('common.buttons.cancel'));
        }
    }
    // @ts-ignore
    [$t, reportSending,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
});
export default {};
