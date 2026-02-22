<script setup lang="ts">
import Icon from '../ui/Icon.vue'
import Avatar from '../ui/Avatar.vue'
import NavItem from './NavItem.vue'
</script>

<template>
  <aside class="app-sidebar">
    <div class="logo-section">
      <div class="logo-box">
        <Icon name="widgets" :size="20" />
      </div>
    </div>
    
    <nav class="nav-section">
      <NavItem icon="book" title="Library" active />
      <NavItem icon="image" title="Assets" />
      <NavItem icon="palette" title="Tokens" />
    </nav>
    
    <div class="bottom-section">
      <NavItem icon="settings" title="Settings" />
      <div class="avatar-wrapper">
        <Avatar src="https://lh3.googleusercontent.com/aida-public/AB6AXuCfFsT0qoU8OVPjGY9w0-pzY2FqrbXTaVRjWtC23Pchv7BNT5r0nomUwwIsreFZvkQk341RGbtAYOXROtEFphdvpo2RY8j-HvvhiJirM3aPL6gGQqGzt6X0IgdBfthXHcE0_81zrW5XxhBqWdVoyhXjZq3OaeBowDX1puKV-9aUaeLzNWf8dkjtJBsu4-iAIUlr9Y3qAzwucoio6rSRS1J52W9BYrhZ6xBxyzEHmSH5ez2Wy98I9mXlm7niqHarwcOSBm9T9Sx8tJM" />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  width: 3.5rem; /* w-14 */
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 0; /* py-3 */
  background-color: var(--radix-gray-1);
  border-right: 1px solid var(--border-cold);
  flex-shrink: 0;
  z-index: 20;
}

.logo-section {
  margin-bottom: 1rem; /* mb-4 */
}

.logo-box {
  width: 2.25rem; /* size-9 */
  height: 2.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(53, 158, 255, 0.3); /* primary/30 */
  background-color: rgba(53, 158, 255, 0.1); /* primary/10 */
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* gap-3 */
  width: 100%;
  padding: 0 0.5rem; /* px-2 */
}

.bottom-section {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* gap-3 */
  width: 100%;
  padding: 0 0.5rem 0.5rem; /* px-2 pb-2 */
}

.avatar-wrapper {
  width: 2rem; /* size-8 */
  margin: 0 auto;
}
</style>
