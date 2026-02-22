<script setup lang="ts">
import Icon from '../ui/Icon.vue'
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
  height: 1.75rem; /* h-7 */
  width: 100%;
  background-color: var(--radix-gray-1);
  border-top: 1px solid rgba(53, 158, 255, 0.2); /* primary/20 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 1rem; /* pr-4 */
  font-size: 0.625rem; /* text-[10px] */
  color: var(--text-muted);
  font-family: var(--font-mono);
  flex-shrink: 0;
  z-index: 40;
  user-select: none;
  box-shadow: 0 -1px 10px rgba(0, 0, 0, 0.3);
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
  border-right: 1px solid var(--border-cold);
  background-color: var(--radix-gray-1);
  margin-right: 1rem; /* mr-4 */
}

.mode-btn {
  height: 100%;
  padding: 0 0.75rem; /* px-3 */
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em; /* tracking-wider */
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.mode-btn:hover {
  background-color: var(--radix-gray-3);
  color: white;
}

.mode-btn.active {
  background-color: var(--primary-dim);
  color: var(--primary);
  border-bottom: 2px solid var(--primary);
}

.active-bg {
  position: absolute;
  inset: 0;
  background-color: rgba(53, 158, 255, 0.05); /* primary/5 */
}

.status-group {
  display: flex;
  align-items: center;
  gap: 1.25rem; /* gap-5 */
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.375rem; /* gap-1.5 */
}

.status-item.online {
  color: var(--primary);
}

.status-dot {
  width: 0.375rem; /* size-1.5 */
  height: 0.375rem;
  border-radius: 50%;
  background-color: #46A758;
  box-shadow: 0 0 6px #46A758;
}

.right-section {
  display: flex;
  align-items: center;
  gap: 1.25rem; /* gap-5 */
}

.footer-link {
  cursor: pointer;
  transition: color 0.2s;
}

.footer-link:hover {
  color: var(--text-main);
}

.footer-icon {
  cursor: pointer;
  transition: color 0.2s;
}

.footer-icon:hover {
  color: var(--primary);
}
</style>
