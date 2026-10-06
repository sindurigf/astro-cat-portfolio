<script setup lang="ts">
import { useHeroField } from '../../composables/use-hero-field';

const { mounted, paused, reducedMotion, toggle } = useHeroField();
</script>

<template>
  <!-- A canvas has no animation-play-state; tests/motion.spec.ts reads this. -->
  <div
    ref="host"
    class="hero-field"
    :data-hero-motion="
      mounted && !reducedMotion && !paused ? 'running' : 'paused'
    "
  >
    <canvas ref="back" aria-hidden="true" class="hero-field-layer"></canvas>
    <canvas ref="mid" aria-hidden="true" class="hero-field-layer"></canvas>
    <canvas ref="near" aria-hidden="true" class="hero-field-layer"></canvas>

    <button
      v-if="mounted && !reducedMotion"
      type="button"
      class="motion-toggle hero-motion-toggle"
      @click="toggle"
    >
      <span aria-hidden="true" class="text-label leading-none">{{
        paused ? '▶' : '❚❚'
      }}</span>
      <span class="sr-only">{{
        paused ? 'Play the hero animation' : 'Pause the hero animation'
      }}</span>
    </button>
  </div>
</template>
