<script setup lang="ts">
import Icon from '../ui/Icon.vue'
</script>

<template>
  <header class="app-header">
    <div class="left-section">
      <div class="traffic-lights" aria-hidden="true">
        <div class="light red"></div>
        <div class="light yellow"></div>
        <div class="light green"></div>
      </div>
    </div>
    
    <div class="center-section">
      <Icon name="extension" :size="14" aria-hidden="true" />
      <span class="breadcrumb">System / Library / UI Components</span>
    </div>
    
    <div class="right-section">
      <button class="icon-btn" aria-label="Search">
        <Icon name="search" :size="16" />
      </button>
      <div class="divider" aria-hidden="true"></div>
      <button class="publish-btn">
        <Icon name="publish" :size="14" aria-hidden="true" />
        <span>Publish</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  height: 2.5rem; /* h-10 */
  background-color: var(--radix-gray-1);
  border-bottom: 1px solid var(--border-cold);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem; /* px-4 */
  flex-shrink: 0;
  z-index: 30;
  user-select: none;
  font-size: 0.75rem; /* text-xs */
}

.left-section, .center-section, .right-section {
  width: 33.333%;
  display: flex;
  align-items: center;
}

.left-section {
  gap: 0.75rem; /* gap-3 */
}

.center-section {
  justify-content: center;
  gap: 0.5rem; /* gap-2 */
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.right-section {
  justify-content: flex-end;
  gap: 0.25rem; /* gap-1 */
}

.traffic-lights {
  display: flex;
  gap: 0.5rem; /* gap-2 */
  opacity: 0.8;
}

.light {
  width: 0.75rem; /* size-3 */
  height: 0.75rem;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.light.red { background-color: #E5484D; }
.light.yellow { background-color: #FFB224; }
.light.green { background-color: #30A46C; }

.breadcrumb {
  letter-spacing: -0.025em; /* tracking-tight */
}

.icon-btn {
  width: 2rem; /* size-8 */
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.icon-btn:hover {
  background-color: var(--radix-gray-3);
}

.divider {
  height: 0.75rem; /* h-3 */
  width: 1px;
  background-color: var(--border-cold);
  margin: 0 0.25rem; /* mx-1 */
}

.publish-btn {
  padding: 0 0.5rem; /* px-2 */
  height: 1.5rem; /* h-6 */
  display: flex;
  align-items: center;
  gap: 0.375rem; /* gap-1.5 */
  border-radius: var(--radius-md);
  border: 1px solid rgba(53, 158, 255, 0.3); /* primary/30 */
  background-color: rgba(53, 158, 255, 0.1); /* primary/10 */
  color: var(--primary);
  font-size: 0.625rem; /* text-[10px] */
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em; /* tracking-wider */
  cursor: pointer;
}
</style>
