<template>
  <div class="dashboard-tab">
    <StatCards :stats="store.data.dashboard" />
    <div class="section">
      <div class="section-title">快捷入口</div>
      <QuickActions :stats="store.data.dashboard || {}" />
    </div>
  </div>
</template>

<script setup>
import { useOpenSpecStore } from '../../../stores/openspec'
import StatCards from '../components/StatCards.vue'
import QuickActions from '../components/QuickActions.vue'

const store = useOpenSpecStore()
</script>

<style scoped>
.dashboard-tab {
  padding: 8px 4px;
}

.section {
  margin-top: 12px;
}

.section-title {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
}
</style>
