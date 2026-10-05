<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { NEXT_FRAME, useMotionLoop } from '../../composables/use-motion-loop';
import { createHeroField } from '../../lib/hero-field';
import { MAX_PIXEL_RATIO } from '../../lib/image-densities';
import type { HeroField, HeroPalette } from '../../lib/hero-field-scene';

/*
 * Drawing lives in src/lib/hero-field.ts. Motion and its SC 2.2.2 pause
 * control both wait for `mounted`, so one never ships without the other.
 * Reduced motion draws one fixed frame and renders no button.
 */

/** A moment with some flowers open and some in bud, for the reduced-motion still. */
const STILL_SECONDS = 40;

/*
 * Each frame repaints three canvases, so 60fps would double main-thread cost
 * for motion this slow.
 */
const MAX_FRAME_RATE = 30;

/** Caps a stalled tab's step; must exceed one frame interval or the field runs slow. */
const MAX_DELTA = 2 / MAX_FRAME_RATE;

const RESIZE_DEBOUNCE = 150;
const VIEW_MARGIN = '120px';

const host = useTemplateRef<HTMLDivElement>('host');
const backCanvas = useTemplateRef<HTMLCanvasElement>('back');
const midCanvas = useTemplateRef<HTMLCanvasElement>('mid');
const nearCanvas = useTemplateRef<HTMLCanvasElement>('near');

const mounted = ref(false);
const paused = ref(false);

let field: HeroField | null = null;
let elapsed = 0;
let lastStep = 0;
let ratio = 1;
let resizeTimer = 0;
let boxWidth = 0;
let boxHeight = 0;

let resizeObserver: ResizeObserver | null = null;
/* Watches data-theme itself, so the hero imports nothing from the switch's module. */
let themeObserver: MutationObserver | null = null;

/* From the host, not the root: light mode sets these tokens on <main>. */
const readPalette = (): HeroPalette | null => {
  if (!host.value) return null;
  const style = getComputedStyle(host.value);
  const read = (token: string): string => style.getPropertyValue(token).trim();
  /* Gold-surface tokens: the dark set fails SC 1.4.3 and 1.4.11 on gold. */
  const palette: HeroPalette = {
    border: read('--color-gold-border'),
    subtle: read('--color-gold-muted'),
    bud: read('--color-gold-bud'),
    background: read('--color-hero-ground'),
    veil: read('--color-hero-veil'),
    veilEdge: read('--color-hero-veil-edge'),
    floor: read('--color-hero-floor'),
    floorEdge: read('--color-hero-floor-edge'),
    flower: read('--color-hero-flower'),
    blush: read('--color-hero-blush'),
  };
  /* Missing tokens mean no stylesheet yet; draw nothing rather than black on black. */
  return Object.values(palette).every((value) => value.length > 0)
    ? palette
    : null;
};

const prepare = (
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
): void => {
  if (!canvas) return;
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
};

const contextOf = (
  canvas: HTMLCanvasElement | null,
): CanvasRenderingContext2D | null => {
  const ctx = canvas?.getContext('2d') ?? null;
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
};

const draw = (seconds: number): void => {
  if (!field) return;
  /* Cached, not `clientWidth`: reading it per frame forces layout. */
  const width = boxWidth;
  const height = boxHeight;
  if (width < 1 || height < 1) return;

  const back = contextOf(backCanvas.value);
  const mid = contextOf(midCanvas.value);
  const near = contextOf(nearCanvas.value);
  if (!back || !mid || !near) return;

  back.clearRect(0, 0, width, height);
  mid.clearRect(0, 0, width, height);
  near.clearRect(0, 0, width, height);

  field.back(back, seconds);
  field.mid(mid, seconds);
  /* Out of focus through the canvas's own CSS filter, which `relayout` sets. */
  field.near(near, seconds);
};

const tick = (now: number): number => {
  if (field) {
    const delta = Math.min(MAX_DELTA, Math.max(0, (now - lastStep) / 1000));
    lastStep = now;
    elapsed += delta;
    field.step(elapsed, delta);
    draw(elapsed);
  }
  return NEXT_FRAME;
};

const onReducedMotion = (reduced: boolean): void => {
  if (!reduced) return;
  elapsed = STILL_SECONDS;
  relayout();
};

const loop = useMotionLoop({
  frame: tick,
  resume: (now) => {
    lastStep = now;
  },
  canRun: () => mounted.value && !paused.value && field !== null,
  maxFrameRate: MAX_FRAME_RATE,
  onReducedMotion,
});
const reducedMotion = loop.reducedMotion;

const relayout = (): void => {
  if (!field || !host.value) return;
  const width = host.value.clientWidth;
  const height = host.value.clientHeight;
  if (width < 1 || height < 1) return;
  boxWidth = width;
  boxHeight = height;

  ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);

  prepare(backCanvas.value, width, height);
  prepare(midCanvas.value, width, height);
  prepare(nearCanvas.value, width, height);

  field.layout(width, height);

  /*
   * CSS filter, not `ctx.filter`: canvas blur blows the frame budget on a
   * throttled phone. Via the CSSOM, since a `:style` binding renders a `style`
   * attribute the CSP refuses.
   */
  if (nearCanvas.value) {
    nearCanvas.value.style.filter = `blur(${field.nearBlur()}px)`;
  }

  /* Always redraw: resizing clears the canvas, and the next frame can be late in headless WebKit. */
  draw(currentSeconds());
};

const currentSeconds = (): number =>
  reducedMotion.value ? STILL_SECONDS : elapsed;

/*
 * ResizeObserver also fires on focus and subpixel reflow; a rebuild snaps every
 * bent stem straight and flakes tests/motion.spec.ts. Only rebuild on a real change.
 */
const onResize = (): void => {
  if (!host.value) return;
  if (
    host.value.clientWidth === boxWidth &&
    host.value.clientHeight === boxHeight
  ) {
    return;
  }
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(relayout, RESIZE_DEBOUNCE);
};

/* Stems are built in their colours, so a new palette needs a new field. */
const onThemeChange = (): void => {
  const palette = readPalette();
  if (!palette) return;
  field = createHeroField(palette);
  relayout();
};

const toggle = (): void => {
  paused.value = !paused.value;
  if (paused.value) loop.stop();
  else loop.start();
};

onMounted(() => {
  const palette = readPalette();
  if (!palette) return;

  field = createHeroField(palette);

  mounted.value = true;
  elapsed = reducedMotion.value ? STILL_SECONDS : 0;
  relayout();

  if (host.value) {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(host.value);
    loop.observe([host.value], {
      rootMargin: VIEW_MARGIN,
      assumeOnScreen: true,
    });
  }

  themeObserver = new MutationObserver(onThemeChange);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  loop.start();
});

onBeforeUnmount(() => {
  window.clearTimeout(resizeTimer);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
});
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
