<script setup lang="ts">
// issue #16 status box, "others": "just example for content like raids or
// settler voyage, not for optical stuff" — the mockup's list of
// non-building activity entries. Neither raiding nor settler voyages exist
// as game mechanics yet (no WorldModel/backend support), so this is the
// honest empty state rather than fabricated sample rows; it exists so the
// left-side status box's second panel (sharper edges than BuildQueuePanel,
// per the issue) has somewhere to render real entries once those mechanics
// land.
</script>

<template>
  <div class="activity panel">
    <div class="header">
      <span class="label">Activity</span>
    </div>
    <p class="empty">No raids or settler voyages underway.</p>
  </div>
</template>

<style scoped>
.activity {
  pointer-events: auto;
  width: 232px;
  padding: 14px 15px;
  border-radius: 6px;
}
.header {
  margin-bottom: 8px;
}
.label {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.empty {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-2);
}
</style>
