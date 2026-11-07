/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { useGuildStore } from '../stores/guild';
import { useWorldStore } from '../stores/world';
import { useUnsavedInput } from '../composables/useUnsavedInput';
const world = useWorldStore();
const auth = useAuthStore();
const guild = useGuildStore();
const { t, d } = useI18n({ useScope: 'global' });
const roleLabels = {
    leader: t('guild.role.leader'),
    officer: t('guild.role.officer'),
    member: t('guild.role.member'),
};
// Local aliases for the store's nullable fields: template `v-if`/`v-else`
// narrows a plain ref/computed cleanly, but not a Pinia state property
// accessed as `guild.current` — see the design doc for why this file
// reads through these instead of the store directly wherever narrowing
// across a v-else boundary matters.
const current = computed(() => guild.current);
const caps = computed(() => guild.caps);
const activeTopic = computed(() => guild.activeTopic);
async function selectGuild(id) {
    activeTopicId.value = null;
    await guild.loadGuild(id);
    await Promise.all([guild.loadTopics(id), guild.loadTreaties(id)]);
}
async function loadForCurrentWorld() {
    if (!world.worldId)
        return;
    await guild.loadGuilds(world.worldId);
    const mine = guild.guilds.find((g) => g.members.some((m) => m.userId === auth.user?.id));
    if (mine)
        await selectGuild(mine.id);
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
    if (!world.worldId)
        return;
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
async function join(guildId) {
    const ok = await guild.join(guildId);
    if (ok) {
        await selectGuild(guildId);
        if (world.worldId)
            await guild.loadGuilds(world.worldId);
    }
}
async function leaveCurrent() {
    if (!current.value)
        return;
    const ok = await guild.leave(current.value.id);
    if (ok && world.worldId)
        await guild.loadGuilds(world.worldId);
}
async function kick(userId) {
    if (!current.value)
        return;
    await guild.kick(current.value.id, userId);
}
async function promote(userId, role) {
    if (!current.value)
        return;
    await guild.setRole(current.value.id, userId, role);
}
// --- board ---
const activeTopicId = ref(null);
const newTopicTitle = ref('');
const newTopicKind = ref('discussion');
const newTopicBody = ref('');
const replyBody = ref('');
useUnsavedInput(() => [foundName, foundTag, foundDescription, newTopicTitle, newTopicBody, replyBody].some((field) => field.value.trim() !== ''));
async function openTopic(topicId) {
    if (!current.value)
        return;
    activeTopicId.value = topicId;
    await guild.loadTopic(current.value.id, topicId);
}
function backToTopics() {
    activeTopicId.value = null;
}
async function submitTopic() {
    if (!current.value)
        return;
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
    if (!current.value || !activeTopicId.value)
        return;
    const ok = await guild.reply(current.value.id, activeTopicId.value, replyBody.value.trim());
    if (ok)
        replyBody.value = '';
}
// --- treaties ---
const proposeTargetId = ref('');
const treatyCandidates = computed(() => current.value ? guild.guilds.filter((g) => g.id !== current.value.id) : []);
async function submitPropose() {
    if (!current.value || !proposeTargetId.value)
        return;
    const ok = await guild.proposeTreaty(current.value.id, proposeTargetId.value);
    if (ok)
        proposeTargetId.value = '';
}
function guildLabel(id) {
    const found = guild.guilds.find((g) => g.id === id);
    return found ? `[${found.tag}] ${found.name}` : id.slice(0, 8);
}
function formattedDate(iso) {
    return d(new Date(iso), 'long');
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(current, {});
    __VLS_withDotValue(auth, {});
    __VLS_withDotValue(guild, {});
    __VLS_withDotValue(foundOpen, {});
    __VLS_withDotValue(foundName, {});
    __VLS_withDotValue(foundTag, {});
    __VLS_withDotValue(caps, {});
    __VLS_withDotValue(roleLabels, {});
    __VLS_withDotValue(activeTopicId, {});
    __VLS_withDotValue(newTopicTitle, {});
    __VLS_withDotValue(newTopicBody, {});
    __VLS_withDotValue(activeTopic, {});
    __VLS_withDotValue(replyBody, {});
    __VLS_withDotValue(proposeTargetId, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['guild-view']} */ ;
    /** @type {__VLS_StyleScopedClasses['topic-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['post']} */ ;
    /** @type {__VLS_StyleScopedClasses['facts']} */ ;
    /** @type {__VLS_StyleScopedClasses['facts']} */ ;
    /** @type {__VLS_StyleScopedClasses['propose-form']} */ ;
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "guild-view" },
    });
    /** @type {__VLS_StyleScopedClasses['guild-view']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('guild.title'));
    if (!world.value.worldId) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('guild.noWorld'));
    }
    else if (!current.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "directory" },
        });
        /** @type {__VLS_StyleScopedClasses['directory']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "directory-head" },
        });
        /** @type {__VLS_StyleScopedClasses['directory-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('guild.directory.title'));
        if (auth.value.isAuthenticated) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (openFound) },
            });
            (__VLS_ctx.$t('guild.directory.found'));
        }
        if (guild.value.guildsLoading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
            (__VLS_ctx.$t('guild.directory.loading'));
        }
        else if (guild.value.guildsError) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (guild.value.guildsError);
        }
        else if (guild.value.guilds.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            (__VLS_ctx.$t('guild.directory.empty'));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                ...{ class: "guild-list" },
            });
            /** @type {__VLS_StyleScopedClasses['guild-list']} */ ;
            const __VLS_0 = __VLS_tryAsConstant((guild.value.guilds));
            for (const [g] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (g.id),
                    ...{ class: "guild-row" },
                });
                /** @type {__VLS_StyleScopedClasses['guild-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (g.tag);
                (g.name);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "muted" },
                });
                /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                (__VLS_ctx.$t('guild.directory.memberCount', { count: g.memberCount }));
                if (g.description) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "muted description" },
                    });
                    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                    /** @type {__VLS_StyleScopedClasses['description']} */ ;
                    (g.description);
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "row" },
                });
                /** @type {__VLS_StyleScopedClasses['row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(!world.value.worldId))
                                throw 0;
                            if (!(!current.value))
                                throw 0;
                            if (!!(guild.value.guildsLoading))
                                throw 0;
                            if (!!(guild.value.guildsError))
                                throw 0;
                            if (!!(guild.value.guilds.length === 0))
                                throw 0;
                            return (selectGuild(g.id));
                            // @ts-ignore
                            [$t, $t, $t, $t, $t, $t, $t, world, current, auth, guild, guild, guild, guild, guild,];
                        } },
                    ...{ class: "secondary" },
                });
                /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                (__VLS_ctx.$t('guild.directory.view'));
                if (auth.value.isAuthenticated) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(!world.value.worldId))
                                    throw 0;
                                if (!(!current.value))
                                    throw 0;
                                if (!!(guild.value.guildsLoading))
                                    throw 0;
                                if (!!(guild.value.guildsError))
                                    throw 0;
                                if (!!(guild.value.guilds.length === 0))
                                    throw 0;
                                if (!(auth.value.isAuthenticated))
                                    throw 0;
                                return (join(g.id));
                                // @ts-ignore
                                [$t, auth,];
                            } },
                        disabled: (guild.value.actionPending),
                    });
                    (__VLS_ctx.$t('guild.directory.join'));
                }
                // @ts-ignore
                [$t, guild,];
            }
        }
        if (foundOpen.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(!world.value.worldId))
                            throw 0;
                        if (!(!current.value))
                            throw 0;
                        if (!(foundOpen.value))
                            throw 0;
                        return (foundOpen.value = false);
                        // @ts-ignore
                        [foundOpen, foundOpen,];
                    } },
                ...{ class: "backdrop" },
            });
            /** @type {__VLS_StyleScopedClasses['backdrop']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "dialog" },
                role: "dialog",
                'aria-label': (__VLS_ctx.$t('guild.foundDialog.ariaLabel')),
            });
            /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
            (__VLS_ctx.$t('guild.foundDialog.title'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('guild.foundDialog.name'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                maxlength: "50",
            });
            (foundName.value);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('guild.foundDialog.tag'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                maxlength: "5",
            });
            (foundTag.value);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('guild.foundDialog.description'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
                value: (__VLS_unwrap(foundDescription, {})),
                rows: "3",
                maxlength: "500",
            });
            if (guild.value.actionError) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "error" },
                });
                /** @type {__VLS_StyleScopedClasses['error']} */ ;
                (guild.value.actionError);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "row" },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (submitFound) },
                disabled: (guild.value.actionPending || !foundName.value.trim() || !foundTag.value.trim()),
            });
            (__VLS_ctx.$t('guild.foundDialog.found'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(!world.value.worldId))
                            throw 0;
                        if (!(!current.value))
                            throw 0;
                        if (!(foundOpen.value))
                            throw 0;
                        return (foundOpen.value = false);
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, guild, guild, guild, foundOpen, foundName, foundName, foundTag, foundTag, foundDescription,];
                    } },
                ...{ class: "secondary" },
                disabled: (guild.value.actionPending),
            });
            /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
            (__VLS_ctx.$t('guild.foundDialog.cancel'));
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "detail" },
        });
        /** @type {__VLS_StyleScopedClasses['detail']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (backToDirectory) },
            ...{ class: "secondary back" },
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        /** @type {__VLS_StyleScopedClasses['back']} */ ;
        (__VLS_ctx.$t('guild.detail.back'));
        if (guild.value.currentLoading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
            (__VLS_ctx.$t('guild.detail.loading'));
        }
        else if (guild.value.currentError) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (guild.value.currentError);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
                ...{ class: "head" },
            });
            /** @type {__VLS_StyleScopedClasses['head']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
            (current.value.tag);
            (current.value.name);
            if (current.value.description) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "muted" },
                });
                /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                (current.value.description);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "row" },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            if (guild.value.myMembership) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (leaveCurrent) },
                    ...{ class: "secondary" },
                    disabled: (guild.value.actionPending),
                });
                /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                (guild.value.isLeader && current.value.memberCount === 1 ? __VLS_ctx.$t('guild.detail.disband') : __VLS_ctx.$t('guild.detail.leave'));
            }
            else if (auth.value.isAuthenticated) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(!world.value.worldId))
                                throw 0;
                            if (!!(!current.value))
                                throw 0;
                            if (!!(guild.value.currentLoading))
                                throw 0;
                            if (!!(guild.value.currentError))
                                throw 0;
                            if (!!(guild.value.myMembership))
                                throw 0;
                            if (!(auth.value.isAuthenticated))
                                throw 0;
                            return (join(current.value.id));
                            // @ts-ignore
                            [$t, $t, $t, $t, $t, current, current, current, current, current, current, auth, guild, guild, guild, guild, guild, guild, guild,];
                        } },
                    disabled: (guild.value.actionPending),
                });
                (__VLS_ctx.$t('guild.detail.join'));
            }
            if (guild.value.actionError) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "error" },
                });
                /** @type {__VLS_StyleScopedClasses['error']} */ ;
                (guild.value.actionError);
            }
            if (caps.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
                    ...{ class: "caps" },
                });
                /** @type {__VLS_StyleScopedClasses['caps']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
                (__VLS_ctx.$t('guild.caps.title'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({
                    ...{ class: "facts" },
                });
                /** @type {__VLS_StyleScopedClasses['facts']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
                (__VLS_ctx.$t('guild.caps.memberCap'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
                (current.value.memberCount);
                (caps.value.memberCap);
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
                (__VLS_ctx.$t('guild.caps.peaceTreatyCap'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
                (caps.value.maxActivePeaceTreaties);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
                ...{ class: "roster" },
            });
            /** @type {__VLS_StyleScopedClasses['roster']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
            (__VLS_ctx.$t('guild.roster.title', { count: current.value.memberCount }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                ...{ class: "member-list" },
            });
            /** @type {__VLS_StyleScopedClasses['member-list']} */ ;
            const __VLS_1 = __VLS_tryAsConstant((current.value.members));
            for (const [m] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (m.userId),
                    ...{ class: "member-row" },
                });
                /** @type {__VLS_StyleScopedClasses['member-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "member-id" },
                });
                /** @type {__VLS_StyleScopedClasses['member-id']} */ ;
                (m.userId.slice(0, 8));
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "badge" },
                });
                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                (roleLabels.value[m.role]);
                if (guild.value.isLeader && m.role !== 'leader') {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "row member-actions" },
                    });
                    /** @type {__VLS_StyleScopedClasses['row']} */ ;
                    /** @type {__VLS_StyleScopedClasses['member-actions']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(!world.value.worldId))
                                    throw 0;
                                if (!!(!current.value))
                                    throw 0;
                                if (!!(guild.value.currentLoading))
                                    throw 0;
                                if (!!(guild.value.currentError))
                                    throw 0;
                                if (!(guild.value.isLeader && m.role !== 'leader'))
                                    throw 0;
                                return (promote(m.userId, 'leader'));
                                // @ts-ignore
                                [$t, $t, $t, $t, $t, current, current, current, guild, guild, guild, guild, caps, caps, caps, roleLabels,];
                            } },
                        ...{ class: "secondary small" },
                        disabled: (guild.value.actionPending),
                    });
                    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                    /** @type {__VLS_StyleScopedClasses['small']} */ ;
                    (__VLS_ctx.$t('guild.roster.makeLeader'));
                    if (m.role !== 'officer') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!!(!world.value.worldId))
                                        throw 0;
                                    if (!!(!current.value))
                                        throw 0;
                                    if (!!(guild.value.currentLoading))
                                        throw 0;
                                    if (!!(guild.value.currentError))
                                        throw 0;
                                    if (!(guild.value.isLeader && m.role !== 'leader'))
                                        throw 0;
                                    if (!(m.role !== 'officer'))
                                        throw 0;
                                    return (promote(m.userId, 'officer'));
                                    // @ts-ignore
                                    [$t, guild,];
                                } },
                            ...{ class: "secondary small" },
                            disabled: (guild.value.actionPending),
                        });
                        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                        /** @type {__VLS_StyleScopedClasses['small']} */ ;
                        (__VLS_ctx.$t('guild.roster.makeOfficer'));
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!!(!world.value.worldId))
                                        throw 0;
                                    if (!!(!current.value))
                                        throw 0;
                                    if (!!(guild.value.currentLoading))
                                        throw 0;
                                    if (!!(guild.value.currentError))
                                        throw 0;
                                    if (!(guild.value.isLeader && m.role !== 'leader'))
                                        throw 0;
                                    if (!!(m.role !== 'officer'))
                                        throw 0;
                                    return (promote(m.userId, 'member'));
                                    // @ts-ignore
                                    [$t, guild,];
                                } },
                            ...{ class: "secondary small" },
                            disabled: (guild.value.actionPending),
                        });
                        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                        /** @type {__VLS_StyleScopedClasses['small']} */ ;
                        (__VLS_ctx.$t('guild.roster.demote'));
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(!world.value.worldId))
                                    throw 0;
                                if (!!(!current.value))
                                    throw 0;
                                if (!!(guild.value.currentLoading))
                                    throw 0;
                                if (!!(guild.value.currentError))
                                    throw 0;
                                if (!(guild.value.isLeader && m.role !== 'leader'))
                                    throw 0;
                                return (kick(m.userId));
                                // @ts-ignore
                                [$t, guild,];
                            } },
                        ...{ class: "secondary small" },
                        disabled: (guild.value.actionPending),
                    });
                    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                    /** @type {__VLS_StyleScopedClasses['small']} */ ;
                    (__VLS_ctx.$t('guild.roster.kick'));
                }
                else if (guild.value.isOfficerOrLeader && m.role === 'member') {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(!world.value.worldId))
                                    throw 0;
                                if (!!(!current.value))
                                    throw 0;
                                if (!!(guild.value.currentLoading))
                                    throw 0;
                                if (!!(guild.value.currentError))
                                    throw 0;
                                if (!!(guild.value.isLeader && m.role !== 'leader'))
                                    throw 0;
                                if (!(guild.value.isOfficerOrLeader && m.role === 'member'))
                                    throw 0;
                                return (kick(m.userId));
                                // @ts-ignore
                                [$t, guild, guild,];
                            } },
                        ...{ class: "secondary small" },
                        disabled: (guild.value.actionPending),
                    });
                    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                    /** @type {__VLS_StyleScopedClasses['small']} */ ;
                    (__VLS_ctx.$t('guild.roster.kick'));
                }
                // @ts-ignore
                [$t, guild,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
                ...{ class: "board" },
            });
            /** @type {__VLS_StyleScopedClasses['board']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
            (__VLS_ctx.$t('guild.board.title'));
            if (guild.value.topicsLoading) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                (__VLS_ctx.$t('guild.board.loading'));
            }
            else if (guild.value.topicsError) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "error" },
                });
                /** @type {__VLS_StyleScopedClasses['error']} */ ;
                (guild.value.topicsError);
            }
            else if (!activeTopicId.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                    ...{ class: "topic-list" },
                });
                /** @type {__VLS_StyleScopedClasses['topic-list']} */ ;
                if (guild.value.topics.length === 0) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                        ...{ class: "muted" },
                    });
                    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                    (__VLS_ctx.$t('guild.board.noTopics'));
                }
                const __VLS_2 = __VLS_tryAsConstant((guild.value.topics));
                for (const [t] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(!world.value.worldId))
                                    throw 0;
                                if (!!(!current.value))
                                    throw 0;
                                if (!!(guild.value.currentLoading))
                                    throw 0;
                                if (!!(guild.value.currentError))
                                    throw 0;
                                if (!!(guild.value.topicsLoading))
                                    throw 0;
                                if (!!(guild.value.topicsError))
                                    throw 0;
                                if (!(!activeTopicId.value))
                                    throw 0;
                                return (openTopic(t.id));
                                // @ts-ignore
                                [$t, $t, $t, guild, guild, guild, guild, guild, activeTopicId,];
                            } },
                        key: (t.id),
                        ...{ class: "topic-row" },
                    });
                    /** @type {__VLS_StyleScopedClasses['topic-row']} */ ;
                    if (t.pinned) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "badge" },
                        });
                        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                        (__VLS_ctx.$t('guild.board.pinned'));
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "badge" },
                    });
                    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                    (t.kind);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                    (t.title);
                    // @ts-ignore
                    [$t,];
                }
                if (guild.value.myMembership) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "new-topic" },
                    });
                    /** @type {__VLS_StyleScopedClasses['new-topic']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
                    (__VLS_ctx.$t('guild.board.startTopic'));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                        maxlength: "120",
                        placeholder: (__VLS_ctx.$t('guild.board.titlePlaceholder')),
                    });
                    (newTopicTitle.value);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                        value: (__VLS_unwrap(newTopicKind, {})),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        value: "discussion",
                    });
                    (__VLS_ctx.$t('guild.board.discussion'));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        value: "announcement",
                    });
                    (__VLS_ctx.$t('guild.board.announcement'));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        value: "report",
                    });
                    (__VLS_ctx.$t('guild.board.report'));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
                        value: (newTopicBody.value),
                        rows: "3",
                        maxlength: "4000",
                        placeholder: (__VLS_ctx.$t('guild.board.messagePlaceholder')),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (submitTopic) },
                        disabled: (guild.value.actionPending || !newTopicTitle.value.trim() || !newTopicBody.value.trim()),
                    });
                    (__VLS_ctx.$t('guild.board.post'));
                }
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "topic-thread" },
                });
                /** @type {__VLS_StyleScopedClasses['topic-thread']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (backToTopics) },
                    ...{ class: "secondary" },
                });
                /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                (__VLS_ctx.$t('guild.board.backToTopics'));
                if (guild.value.activeTopicLoading) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                    (__VLS_ctx.$t('guild.board.loading'));
                }
                else if (guild.value.activeTopicError) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "error" },
                    });
                    /** @type {__VLS_StyleScopedClasses['error']} */ ;
                    (guild.value.activeTopicError);
                }
                else if (activeTopic.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
                    (activeTopic.value.title);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                        ...{ class: "post-list" },
                    });
                    /** @type {__VLS_StyleScopedClasses['post-list']} */ ;
                    const __VLS_3 = __VLS_tryAsConstant((activeTopic.value.posts));
                    for (const [p] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                            key: (p.id),
                            ...{ class: "post" },
                        });
                        /** @type {__VLS_StyleScopedClasses['post']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "muted" },
                        });
                        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                        (p.authorUserId.slice(0, 8));
                        (formattedDate(p.createdAt));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                        (p.body);
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, $t, $t, $t, guild, guild, guild, guild, guild, newTopicTitle, newTopicTitle, newTopicKind, newTopicBody, newTopicBody, activeTopic, activeTopic, activeTopic,];
                    }
                    if (guild.value.myMembership && !activeTopic.value.locked) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "reply-form" },
                        });
                        /** @type {__VLS_StyleScopedClasses['reply-form']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.textarea, __VLS_intrinsics.textarea)({
                            value: (replyBody.value),
                            rows: "2",
                            maxlength: "4000",
                            placeholder: (__VLS_ctx.$t('guild.board.replyPlaceholder')),
                        });
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (submitReply) },
                            disabled: (guild.value.actionPending || !replyBody.value.trim()),
                        });
                        (__VLS_ctx.$t('guild.board.reply'));
                    }
                }
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
                ...{ class: "treaties" },
            });
            /** @type {__VLS_StyleScopedClasses['treaties']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
            (__VLS_ctx.$t('guild.treaties.title'));
            if (guild.value.treatiesLoading) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                (__VLS_ctx.$t('guild.treaties.loading'));
            }
            else if (guild.value.treatiesError) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "error" },
                });
                /** @type {__VLS_StyleScopedClasses['error']} */ ;
                (guild.value.treatiesError);
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                    ...{ class: "treaty-list" },
                });
                /** @type {__VLS_StyleScopedClasses['treaty-list']} */ ;
                if (guild.value.treaties.length === 0) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                        ...{ class: "muted" },
                    });
                    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                    (__VLS_ctx.$t('guild.treaties.noTreaties'));
                }
                const __VLS_4 = __VLS_tryAsConstant((guild.value.treaties));
                for (const [t] of __VLS_vFor(__VLS_nonNull(__VLS_4))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                        key: (t.id),
                        ...{ class: "treaty-row" },
                    });
                    /** @type {__VLS_StyleScopedClasses['treaty-row']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (`${guildLabel(t.proposerGuildId)} ↔ ${guildLabel(t.targetGuildId)}`);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "badge" },
                    });
                    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                    (t.status);
                    if (guild.value.isOfficerOrLeader && t.status === 'proposed' && t.targetGuildId === current.value.id) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "row" },
                        });
                        /** @type {__VLS_StyleScopedClasses['row']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!!(!world.value.worldId))
                                        throw 0;
                                    if (!!(!current.value))
                                        throw 0;
                                    if (!!(guild.value.currentLoading))
                                        throw 0;
                                    if (!!(guild.value.currentError))
                                        throw 0;
                                    if (!!(guild.value.treatiesLoading))
                                        throw 0;
                                    if (!!(guild.value.treatiesError))
                                        throw 0;
                                    if (!(guild.value.isOfficerOrLeader && t.status === 'proposed' && t.targetGuildId === current.value.id))
                                        throw 0;
                                    return (guild.value.respondTreaty(t.id, true));
                                    // @ts-ignore
                                    [$t, $t, $t, $t, $t, current, guild, guild, guild, guild, guild, guild, guild, guild, guild, activeTopic, replyBody, replyBody,];
                                } },
                            ...{ class: "secondary small" },
                        });
                        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                        /** @type {__VLS_StyleScopedClasses['small']} */ ;
                        (__VLS_ctx.$t('guild.treaties.accept'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!!(!world.value.worldId))
                                        throw 0;
                                    if (!!(!current.value))
                                        throw 0;
                                    if (!!(guild.value.currentLoading))
                                        throw 0;
                                    if (!!(guild.value.currentError))
                                        throw 0;
                                    if (!!(guild.value.treatiesLoading))
                                        throw 0;
                                    if (!!(guild.value.treatiesError))
                                        throw 0;
                                    if (!(guild.value.isOfficerOrLeader && t.status === 'proposed' && t.targetGuildId === current.value.id))
                                        throw 0;
                                    return (guild.value.respondTreaty(t.id, false));
                                    // @ts-ignore
                                    [$t, guild,];
                                } },
                            ...{ class: "secondary small" },
                        });
                        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                        /** @type {__VLS_StyleScopedClasses['small']} */ ;
                        (__VLS_ctx.$t('guild.treaties.reject'));
                    }
                    if (guild.value.isLeader && t.status === 'active') {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!!(!world.value.worldId))
                                        throw 0;
                                    if (!!(!current.value))
                                        throw 0;
                                    if (!!(guild.value.currentLoading))
                                        throw 0;
                                    if (!!(guild.value.currentError))
                                        throw 0;
                                    if (!!(guild.value.treatiesLoading))
                                        throw 0;
                                    if (!!(guild.value.treatiesError))
                                        throw 0;
                                    if (!(guild.value.isLeader && t.status === 'active'))
                                        throw 0;
                                    return (guild.value.breakTreaty(t.id));
                                    // @ts-ignore
                                    [$t, guild, guild,];
                                } },
                            ...{ class: "secondary small" },
                        });
                        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                        /** @type {__VLS_StyleScopedClasses['small']} */ ;
                        (__VLS_ctx.$t('guild.treaties.break'));
                    }
                    // @ts-ignore
                    [$t,];
                }
            }
            if (guild.value.isOfficerOrLeader) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "propose-form" },
                });
                /** @type {__VLS_StyleScopedClasses['propose-form']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                    value: (proposeTargetId.value),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    value: "",
                    disabled: true,
                });
                (__VLS_ctx.$t('guild.treaties.chooseGuild'));
                const __VLS_5 = __VLS_tryAsConstant((__VLS_unwrap(treatyCandidates, {})));
                for (const [g] of __VLS_vFor(__VLS_nonNull(__VLS_5))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                        key: (g.id),
                        value: (g.id),
                    });
                    (g.tag);
                    (g.name);
                    // @ts-ignore
                    [$t, guild, proposeTargetId, treatyCandidates,];
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (submitPropose) },
                    disabled: (guild.value.actionPending || !proposeTargetId.value),
                });
                (__VLS_ctx.$t('guild.treaties.proposePeace'));
            }
        }
    }
    // @ts-ignore
    [$t, guild, proposeTargetId,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
