<template>
  <n-collapse
    v-model:expanded-names="expandedNames"
    :default-expanded-names="defaultExpanded"
    :trigger-areas="['arrow']"
  >
    <n-collapse-item
      v-for="group in groups"
      :key="group.key || group.title"
      :name="group.key || group.title"
    >
      <template #header>
        <div class="task-header">
          <span v-if="group.total > 0" class="task-progress-text">
            {{ group.done }}/{{ group.total }}
          </span>
          <div
            v-if="group.total > 0"
            class="task-checkbox-wrap"
            @mousedown.stop
            @mouseup.stop
            @click.stop
            @keydown.stop
            @touchstart.stop
          >
            <n-checkbox
              class="task-checkbox task-checkbox--group"
              :checked="group.done === group.total"
              :indeterminate="group.done > 0 && group.done < group.total"
              @update:checked="(checked) => emitToggleGroup(group, checked)"
            />
          </div>
          <span class="task-title">{{ group.title }}</span>
        </div>
      </template>

      <div v-if="group.description" class="task-description">
        {{ group.description }}
      </div>

      <div class="task-items">
        <n-checkbox
          v-for="task in group.tasks"
          :key="task.line"
          class="task-checkbox task-checkbox--item"
          :checked="task.checked"
          @update:checked="(checked) => emitToggleTask(task, checked)"
        >
          <span
            class="task-checkbox-text"
            @mousedown.stop
            @click.stop
            @keydown.stop
          >
            {{ task.text }}
          </span>
        </n-checkbox>
      </div>
    </n-collapse-item>
  </n-collapse>
</template>

<script setup>
import { ref, watch } from 'vue'
import { NCheckbox, NCollapse, NCollapseItem } from 'naive-ui'

const props = defineProps({
  groups: {
    type: Array,
    default: () => []
  },
  defaultExpanded: {
    type: Array,
    default: () => []
  },
  resetKey: {
    type: [String, Number],
    default: ''
  }
})

const emit = defineEmits(['toggle-task', 'toggle-group'])
const expandedNames = ref([])

function normalizeExpanded(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value))
}

watch(
  () => props.resetKey,
  () => {
    expandedNames.value = normalizeExpanded(props.defaultExpanded)
  },
  { immediate: true }
)

function emitToggleTask(task, checked) {
  emit('toggle-task', task, checked)
}

function emitToggleGroup(group, checked) {
  emit('toggle-group', group, checked)
}
</script>

<style scoped>
.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.task-title {
  flex: 1;
  font-weight: 600;
}

.task-progress-text {
  font-size: 12px;
  color: #8a5a2f;
}

.task-checkbox-wrap {
  display: flex;
  align-items: center;
}

.task-checkbox {
  transform: scale(1.2);
  transform-origin: left center;
}

.task-checkbox-text {
  display: inline-block;
}

.task-description {
  padding: 6px 0 10px;
  color: #666;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.task-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
