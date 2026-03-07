<script setup lang="ts">
import Icon from '../../core/ui/Icon.vue'
</script>

<template>
  <footer class="app-footer">
    <div class="left-section">
      <div class="view-modes">
        <button class="mode-btn">Surface</button>
        <button class="mode-btn active">
          <span class="active-bg"></span>
          Content
        </button>
        <button class="mode-btn">Blueprint</button>
        <button class="mode-btn">System</button>
      </div>

      <div class="status-group">
        <div class="status-item online">
          <span class="status-dot"></span>
          ONLINE
        </div>
        <div class="status-item">
          <Icon name="code" :size="12" />
          <span>V1.4.0-STABLE</span>
        </div>
      </div>
    </div>

    <div class="right-section">
      <span class="footer-link">Radix Gray / Cyan</span>
      <span class="footer-link">STORYBOOK</span>
      <Icon name="terminal" :size="14" class="footer-icon" />
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  height: 1.75rem;
  width: 100%;
  background-color: var(--gray-1);
  border-top: 1px solid var(--accent-a2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 1rem;
  font-size: 0.625rem;
  color: var(--gray-11);
  font-family: var(--font-mono);
  flex-shrink: 0;
  z-index: var(--z-index-docked);
  user-select: none;
  box-shadow: var(--shadow-md);
}

.left-section {
  display: flex;
  align-items: center;
  height: 100%;
}

.view-modes {
  display: flex;
  align-items: center;
  height: 100%;
  border-right: 1px solid var(--gray-6);
  background-color: var(--gray-1);
  margin-right: 1rem;
}

.mode-btn {
  height: 100%;
  padding: 0 0.75rem;
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  color: var(--gray-11);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: var(--letter-spacing-wider);
  cursor: pointer;
  transition: all var(--duration-normal);
  position: relative;
}

.mode-btn:hover {
  background-color: var(--gray-3);
  color: var(--gray-12);
}

.mode-btn.active {
  background-color: var(--accent-a3);
  color: var(--accent-9);
  border-bottom: 2px solid var(--accent-9);
}

.active-bg {
  position: absolute;
  inset: 0;
  background-color: var(--accent-a1);
}

.status-group {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.status-item.online {
  color: var(--accent-9);
}

.status-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: var(--radius-full);
  background-color: var(--success-9);
  box-shadow: 0 0 6px var(--success-9);
}

.right-section {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.footer-link {
  cursor: pointer;
  transition: color var(--duration-normal);
}

.footer-link:hover {
  color: var(--gray-12);
}

.footer-icon {
  cursor: pointer;
  transition: color var(--duration-normal);
}

.footer-icon:hover {
  color: var(--accent-9);
}
</style>
