<script setup lang="ts">
import { ref } from 'vue';
import { usePlayerStore } from '../../stores/player';

const emit = defineEmits<{ close: [] }>();
const player = usePlayerStore();
const name = ref('');

function submit() {
  const trimmed = name.value.trim();
  if (trimmed) player.setNickname(trimmed);
  emit('close');
}
</script>

<template>
  <div class="scrim">
    <div class="prompt panel">
      <h2>Landfall made.</h2>
      <p>
        Your longship has broken ground. Name your jarl before the sea takes notice —
        no account, no password, just a name.
      </p>
      <form @submit.prevent="submit">
        <input
          v-model="name"
          type="text"
          maxlength="24"
          placeholder="Your jarl's name"
          autofocus
        />
        <div class="actions">
          <button type="button" class="skip" @click="emit('close')">Skip for now</button>
          <button type="submit" class="confirm">Set name</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  background: rgba(5, 8, 10, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}
.prompt {
  width: min(380px, 90vw);
  padding: 26px;
}
h2 {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
}
p {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--muted);
}
input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 14px;
}
input:focus {
  outline: none;
  border-color: var(--gold);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
button {
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
}
.skip {
  background: transparent;
  color: var(--muted);
  border-color: var(--panel-border);
}
.skip:hover {
  color: var(--text);
}
.confirm {
  background: var(--gold);
  color: #20160a;
  font-weight: 600;
}
</style>
