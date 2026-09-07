<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../api/client';
import type { ProfileResponse } from '../api/types';
import type { MessageSchema } from '../i18n/schema';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const auth = useAuthStore();
const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const profile = ref<ProfileResponse | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

// The route is /profile/:userName; /profile (no param) is the caller's own
// profile, which the router only allows when logged in.
const targetUserName = computed(
  () => (route.params.userName as string | undefined) || auth.user?.userName || '',
);

const isOwnProfile = computed(
  () =>
    auth.user !== null &&
    profile.value !== null &&
    auth.user.id === profile.value.id,
);

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
  } catch (err) {
    loadError.value =
      err instanceof ApiError && err.status === 404 ? t('profile.noSuchPlayer') : t('profile.loadError');
  } finally {
    loading.value = false;
  }
}

watch(targetUserName, load, { immediate: true });

// --- Own-bio editing ---

const editingBio = ref(false);
const bioDraft = ref('');
const bioSaving = ref(false);
const bioError = ref<string | null>(null);
const BIO_MAX = 2000;

function startEditBio() {
  bioDraft.value = profile.value?.bio ?? '';
  bioError.value = null;
  editingBio.value = true;
}

async function saveBio() {
  if (bioSaving.value) return;
  if (bioDraft.value.length > BIO_MAX) {
    bioError.value = t('profile.bio.tooLong', { max: BIO_MAX });
    return;
  }
  bioSaving.value = true;
  bioError.value = null;
  try {
    profile.value = await api.updateMyBio({ bio: bioDraft.value || null });
    editingBio.value = false;
  } catch (err) {
    bioError.value = err instanceof ApiError ? err.message : t('profile.bio.saveError');
  } finally {
    bioSaving.value = false;
  }
}

// --- Reporting ---

const reportOpen = ref(false);
const reportReason = ref('');
const reportNote = ref('');
const reportSending = ref(false);
const reportError = ref<string | null>(null);
const reportDone = ref(false);

const canReport = computed(() => auth.isAuthenticated && !isOwnProfile.value);

function openReport() {
  reportReason.value = '';
  reportNote.value = '';
  reportError.value = null;
  reportOpen.value = true;
}

async function sendReport() {
  if (reportSending.value || !profile.value) return;
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
  } catch (err) {
    reportError.value = err instanceof ApiError ? err.message : t('profile.reportDialog.sendError');
  } finally {
    reportSending.value = false;
  }
}

function joinedDate(iso: string): string {
  return d(new Date(iso), 'dateLong');
}
</script>

<template>
  <div class="profile">
    <p v-if="loading" class="muted">{{ $t('common.states.loading') }}</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <template v-else-if="profile">
      <header class="head">
        <div>
          <h1>{{ profile.displayName || profile.userName }}</h1>
          <p v-if="profile.displayName" class="muted">{{ `@${profile.userName}` }}</p>
        </div>
        <div class="head-actions">
          <router-link v-if="canReport" class="secondary" :to="`/messages/${profile.id}`">
            {{ $t('profile.message') }}
          </router-link>
          <button v-if="canReport && !reportDone" class="secondary" @click="openReport">
            {{ $t('profile.report') }}
          </button>
          <span v-if="reportDone" class="muted">{{ $t('profile.reportSent') }}</span>
        </div>
      </header>

      <dl class="facts">
        <div>
          <dt>{{ $t('profile.joined') }}</dt>
          <dd>{{ joinedDate(profile.createdAt) }}</dd>
        </div>
        <div>
          <dt>{{ $t('profile.settlements') }}</dt>
          <dd>{{ profile.settlementCount }}</dd>
        </div>
      </dl>

      <section class="bio-section">
        <div class="bio-head">
          <h2>{{ $t('profile.bio.title') }}</h2>
          <button v-if="isOwnProfile && !editingBio" class="secondary" @click="startEditBio">
            {{ profile.bio ? $t('profile.bio.edit') : $t('profile.bio.add') }}
          </button>
        </div>

        <template v-if="editingBio">
          <!--
            The bio is plain text with significant whitespace (ASCII art).
            It is rendered below through Vue's escaped interpolation only —
            never v-html — so nothing in it can become markup.
          -->
          <textarea
            v-model="bioDraft"
            class="bio-editor"
            rows="10"
            :maxlength="BIO_MAX"
            spellcheck="false"
            :placeholder="$t('profile.bio.placeholder')"
          ></textarea>
          <p class="muted counter">{{ bioDraft.length }} / {{ BIO_MAX }}</p>
          <p v-if="bioError" class="error">{{ bioError }}</p>
          <div class="row">
            <button :disabled="bioSaving" @click="saveBio">{{ $t('common.buttons.save') }}</button>
            <button class="secondary" :disabled="bioSaving" @click="editingBio = false">
              {{ $t('common.buttons.cancel') }}
            </button>
          </div>
        </template>

        <pre v-else-if="profile.bio" class="bio">{{ profile.bio }}</pre>
        <p v-else class="muted">{{ $t('profile.bio.empty') }}</p>
      </section>

      <div v-if="reportOpen" class="report-backdrop" @click.self="reportOpen = false">
        <div class="report-dialog" role="dialog" :aria-label="$t('profile.reportDialog.ariaLabel')">
          <h2>{{ $t('profile.reportDialog.title', { userName: profile.userName }) }}</h2>
          <p class="muted">{{ $t('profile.reportDialog.hint') }}</p>
          <label>
            {{ $t('profile.reportDialog.reason') }}
            <input
              v-model="reportReason"
              type="text"
              maxlength="200"
              :placeholder="$t('profile.reportDialog.reasonPlaceholder')"
              @keyup.enter="sendReport"
            />
          </label>
          <label>
            {{ $t('profile.reportDialog.note') }}
            <textarea v-model="reportNote" rows="3" maxlength="2000"></textarea>
          </label>
          <p v-if="reportError" class="error">{{ reportError }}</p>
          <div class="row">
            <button :disabled="reportSending" @click="sendReport">
              {{ $t('profile.reportDialog.send') }}
            </button>
            <button class="secondary" :disabled="reportSending" @click="reportOpen = false">
              {{ $t('common.buttons.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.profile {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.head h1 {
  margin: 0;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.facts {
  display: flex;
  gap: 32px;
  margin: 16px 0 24px;
}
.facts dt {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.facts dd {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 600;
}
.bio-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bio-head h2 {
  margin: 0 0 8px;
}
/*
 * white-space: pre — not pre-wrap — so ASCII art keeps its exact column
 * alignment; long lines scroll inside the box instead of wrapping.
 */
.bio {
  white-space: pre;
  overflow-x: auto;
  font-family: ui-monospace, 'Cascadia Mono', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.35;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 12px;
  margin: 0;
}
.bio-editor {
  width: 100%;
  box-sizing: border-box;
  white-space: pre;
  overflow-x: auto;
  font-family: ui-monospace, 'Cascadia Mono', 'Source Code Pro', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.35;
  resize: vertical;
}
.counter {
  font-size: 12px;
  margin: 4px 0 8px;
  text-align: right;
}
.row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.muted {
  color: var(--muted);
}
.error {
  color: var(--rival);
  font-size: 13px;
}
.report-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}
.report-dialog {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 20px;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.report-dialog h2 {
  margin: 0;
}
.report-dialog label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
input,
textarea {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text);
}
button {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
}
button.secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--panel-border);
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
a.secondary {
  display: inline-flex;
  align-items: center;
  background: transparent;
  color: var(--text);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
}
</style>
