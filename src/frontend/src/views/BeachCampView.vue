<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { unitName } from '../i18n/catalogueNames';
import { BEACH_CAMP_BUILD_SECONDS, BEACH_CAMP_COST, CAMP_BUILDERS_PER_CAMP } from '../lib/founding';
import { formatCostLine } from '../lib/units/trainingEconomy';

// The beach camp page: what a camp is for, how you set one up, what it holds and claims, and how it can be lost. The figures are the
// camp's rules mirrored in lib/founding.ts (the camp has no catalogue entry of its own to read them from).

const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const buildings = useBuildingCatalogueStore();
onMounted(() => {
  void buildings.load();
});

const loaded = computed(() => !!buildings.byType.cartworkshop?.length);
const cost = computed(() => formatCostLine(BEACH_CAMP_COST));
const minutes = BEACH_CAMP_BUILD_SECONDS / 60;
const CAMP_CAP = 2000;

const tocLinks = computed(() =>
  ['what', 'setup', 'holds', 'claim', 'risks'].map((id) => ({ href: `#${id}`, label: t(`docs.beachCamp.toc.${id}`) })),
);
</script>

<template>
  <DocsPageLayout class="beach-camp" :title="$t('docs.beachCamp.title')" caption="DOCS · BEACH CAMP" :intro="$t('docs.beachCamp.intro')">
    <DocsToc :links="tocLinks" />

    <p v-if="buildings.loading" class="muted">{{ $t('docs.status.loading') }}</p>

    <template v-if="loaded">
      <section id="what" class="block">
        <h2>{{ $t('docs.beachCamp.what.heading') }}</h2>
        <p class="text">{{ $t('docs.beachCamp.what.body') }}</p>
      </section>

      <section id="setup" class="block">
        <h2>{{ $t('docs.beachCamp.setup.heading') }}</h2>
        <i18n-t keypath="docs.beachCamp.setup.body" tag="p" class="text" scope="global">
          <template #count>{{ CAMP_BUILDERS_PER_CAMP }}</template>
          <template #builders>{{ unitName('campbuilder') }}</template>
          <template #workshop><BuildingLink type="cartworkshop" /></template>
          <template #cost>{{ cost }}</template>
          <template #minutes>{{ minutes }}</template>
        </i18n-t>
        <ul class="rules">
          <li>{{ $t('docs.beachCamp.setup.rules.site') }}</li>
          <li>{{ $t('docs.beachCamp.setup.rules.inside') }}</li>
          <li>{{ $t('docs.beachCamp.setup.rules.waiting') }}</li>
          <li>{{ $t('docs.beachCamp.setup.rules.garrison') }}</li>
          <li>{{ $t('docs.beachCamp.setup.rules.home') }}</li>
        </ul>
      </section>

      <section id="holds" class="block">
        <h2>{{ $t('docs.beachCamp.holds.heading') }}</h2>
        <p class="text">{{ $t('docs.beachCamp.holds.body', { cap: n(CAMP_CAP) }) }}</p>
        <p class="text">{{ $t('docs.beachCamp.holds.nothing') }}</p>
      </section>

      <section id="claim" class="block">
        <h2>{{ $t('docs.beachCamp.claim.heading') }}</h2>
        <i18n-t keypath="docs.beachCamp.claim.body" tag="p" class="text" scope="global">
          <template #realm>
            <DocsPageLink to="/docs/realm">{{ $t('docs.beachCamp.claim.realmLink') }}</DocsPageLink>
          </template>
        </i18n-t>
        <p class="text">{{ $t('docs.beachCamp.claim.limit') }}</p>
      </section>

      <section id="risks" class="block">
        <h2>{{ $t('docs.beachCamp.risks.heading') }}</h2>
        <p class="text">{{ $t('docs.beachCamp.risks.attacked') }}</p>
        <p class="text">{{ $t('docs.beachCamp.risks.falls') }}</p>
        <p class="text">{{ $t('docs.beachCamp.risks.guarded') }}</p>
        <p class="text">{{ $t('docs.beachCamp.risks.destroyed') }}</p>
        <p class="text">{{ $t('docs.beachCamp.risks.troopsOut') }}</p>
        <p class="text">{{ $t('docs.beachCamp.risks.onTheWay') }}</p>
        <p class="text">{{ $t('docs.beachCamp.risks.withoutHome') }}</p>
      </section>
    </template>
  </DocsPageLayout>
</template>

<style scoped>
.block {
  margin-top: 32px;
  scroll-margin-top: 84px;
}
.block h2 {
  margin: 0 0 10px;
}
.text {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--muted);
}
.muted {
  color: var(--muted);
  line-height: 1.6;
}
.rules {
  margin: 0;
  padding-left: 20px;
  line-height: 1.6;
  color: var(--muted);
}
.rules li {
  margin-bottom: 6px;
}
</style>
