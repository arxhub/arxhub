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
  height: var(--size-md);
  background-color: var(--gray-1);
  border-bottom: 1px solid var(--gray-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  flex-shrink: 0;
  z-index: var(--z-index-docked);
  user-select: none;
  font-size: var(--font-size-xs);
}

.left-section, .center-section, .right-section {
  width: 33.333%;
  display: flex;
  align-items: center;
}

.left-section {
  gap: 0.75rem;
}

.center-section {
  justify-content: center;
  gap: 0.5rem;
  color: var(--gray-11);
  font-family: var(--font-mono);
}

.right-section {
  justify-content: flex-end;
  gap: 0.25rem;
}

.traffic-lights {
  display: flex;
  gap: 0.5rem;
  opacity: 0.8;
}

.light {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: var(--radius-full);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.light.red { background-color: #E5484D; }
.light.yellow { background-color: #FFB224; }
.light.green { background-color: #30A46C; }

.breadcrumb {
  letter-spacing: var(--letter-spacing-tight);
}

.icon-btn {
  width: var(--size-xs);
  height: var(--size-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--gray-11);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color var(--duration-normal);
}

.icon-btn:hover {
  background-color: var(--gray-2);
}

.divider {
  height: 0.75rem;
  width: 1px;
  background-color: var(--gray-6);
  margin: 0 0.25rem;
}

.publish-btn {
  padding: 0 0.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--accent-a3);
  background-color: var(--accent-a2);
  color: var(--accent-9);
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  cursor: pointer;
}
</style>
