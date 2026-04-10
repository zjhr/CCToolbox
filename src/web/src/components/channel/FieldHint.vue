<template>
  <n-text v-if="text" depth="3" class="field-hint">
    {{ text }}
  </n-text>
</template>

<script setup>
import { NText } from 'naive-ui'

defineProps({
  text: {
    type: String,
    default: ''
  }
})
</script>

