<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useAdminWorldStore } from '../../stores/adminWorld';

// Shared shell for every /admin/* tab (issue #27; #29 and #30 add their own
// tabs to the same nav). Access itself is enforced by the router's
// `requiresAdmin` guard — this component only renders the chrome around it.
const auth = useAuthStore();
const router = useRouter();
const adminWorld = useAdminWorldStore();

onMounted(() => {
  void adminWorld.loadWorlds();
});

async function onLogout() {
  await auth.logout();
  await router.push('/');
}
</script>

<template>
  <div class="admin">
    <header class="topbar">
      <span class="brand">Fjørdhold admin</span>
      <nav class="tabs">
        <router-link to="/admin/worlds" class="tab">Worlds</router-link>
        <router-link to="/admin/users" class="tab">Users</router-link>
        <router-link to="/admin/settlements" class="tab">Settlements</router-link>
        <router-link to="/admin/reports" class="tab">Reports</router-link>
        <router-link to="/admin/activity" class="tab">Activity</router-link>
      </nav>
      <div class="world-select">
        <select
          v-if="adminWorld.worlds.length > 0"
          :value="adminWorld.selectedWorldId ?? ''"
          @change="adminWorld.selectWorld(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="world in adminWorld.worlds" :key="world.id" :value="world.id">
            {{ world.name }}
          </option>
        </select>
        <router-link v-else-if="!adminWorld.loading" to="/admin/worlds" class="no-worlds">
          No worlds yet — create one
        </router-link>
      </div>
      <div class="account">
        <span class="who">{{ auth.user?.displayName ?? auth.user?.userName }}</span>
        <button class="logout" @click="onLogout">Log out</button>
      </div>
    </header>
    <main class="body">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.admin {
  width: 100vw;
  min-height: 100vh;
  background: var(--shell);
  color: var(--text);
}
.topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 28px;
  border-bottom: 1px solid var(--panel-border);
}
.brand {
  font-weight: 600;
  font-size: 18px;
}
.tabs {
  display: flex;
  gap: 4px;
  flex: 1;
}
.tab {
  padding: 8px 14px;
  border-radius: 8px;
  color: var(--muted);
  text-decoration: none;
  font-size: 14px;
}
.tab.router-link-active {
  background: var(--panel-bg);
  color: var(--text);
}
.tab.disabled {
  opacity: 0.4;
  cursor: default;
}
.world-select select {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text);
  font-size: 14px;
}
.no-worlds {
  color: var(--muted);
  font-size: 14px;
}
.account {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}
.who {
  color: var(--muted);
}
.logout {
  background: none;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 6px 12px;
  color: var(--text);
  cursor: pointer;
}
.body {
  padding: 24px 28px 60px;
}
</style>
