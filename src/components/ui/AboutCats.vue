<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
} from 'vue';
import { IDLE, useMotionLoop } from '../../composables/use-motion-loop';
import { markFailed } from '../../scripts/failed-frame';
import { clamp, createCatRig } from '../../lib/about-cats-rig';
import type { CatId } from '../../lib/about-cats-types';
import { EXTENT_WARMUPS } from '../../lib/about-cats-moves';
import {
  createColony,
  type CatInfo,
  type CatSpot,
  type CatMood,
  type Colony,
  type Hold,
} from '../../lib/about-cats';

/*
 * The cats render into `#cat-spot-<id>` on the page, only after mount: no
 * server HTML, so nothing moves or waits without JavaScript. Each cat opens its
 * card; the Zz or paw beside it puts it to sleep or wakes it (SC 2.2.2).
 */

const props = defineProps<{
  cats: CatInfo[];
  inspiration: { name: string; href: string };
}>();

/* Where each cat starts on its card, 0 to 1, and which way it faces. */
const PLACES: Record<CatId, { start: number; facing: 1 | -1 }> = {
  pepper: { start: 0.85, facing: -1 },
  mochi: { start: 0.8, facing: -1 },
  biscuit: { start: 0.8, facing: -1 },
};

/** Fallback slot between warm-ups where requestIdleCallback is missing (Safari). */
const WARM_GAP_MS = 50;

let cancelWarm = (): void => {};

/* One extent per idle slot, so the first move never samples on a frame. */
const warmExtents = (jobs: readonly (() => unknown)[]): void => {
  const [job, ...rest] = jobs;
  if (!job) return;
  job();
  /* The DOM types always declare it, but Safari lacks it. */
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => warmExtents(rest));
    cancelWarm = () => window.cancelIdleCallback(id);
  } else {
    const id = setTimeout(() => warmExtents(rest), WARM_GAP_MS);
    cancelWarm = () => clearTimeout(id);
  }
};

const mounted = ref(false);
const moods = ref<Partial<Record<CatId, CatMood>>>({});
const sleeping = ref<Partial<Record<CatId, boolean>>>({});
const openId = ref<CatId | ''>('');
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const card = useTemplateRef<HTMLDivElement>('card');

const open = computed(() => props.cats.find((cat) => cat.id === openId.value));

const svgs = new Map<CatId, SVGSVGElement>();
let colony: Colony | null = null;
let pointerAt: { x: number; y: number; time: number } | null = null;
let resizeObserver: ResizeObserver | null = null;

const setSvg = (id: CatId, node: unknown): void => {
  if (node instanceof SVGSVGElement) svgs.set(id, node);
};

const spots = (): HTMLElement[] =>
  props.cats
    .map((cat) => document.getElementById(`cat-spot-${cat.id}`))
    .filter((node): node is HTMLElement => node !== null);

const asleep = (id: CatId): boolean => sleeping.value[id] === true;

const napLabel = (cat: CatInfo): string =>
  asleep(cat.id) ? `Wake ${cat.name}` : `Put ${cat.name} to sleep`;

const toggleNap = (id: CatId): void => {
  if (!colony) return;
  if (asleep(id)) colony.wake(id, performance.now());
  else colony.nap(id);
  start();
};

/* Rects are read here, once a frame before drawing, not on every pointermove. */
const feedPointer = (): void => {
  if (!colony || !pointerAt) return;
  const rects = new Map<CatId, DOMRect>();
  for (const [id, svg] of svgs) rects.set(id, svg.getBoundingClientRect());
  colony.pointer(pointerAt.x, pointerAt.y, pointerAt.time, rects);
  pointerAt = null;
};

const tick = (now: number): number => {
  if (!colony) return IDLE;
  feedPointer();
  return colony.frame(now);
};

const hold = (id: CatId, reason: Hold, on: boolean): void => {
  colony?.hold(id, reason, on);
  start();
};

/*
 * Only keyboard focus holds a cat still. Not `:focus-visible`: WebKit matches it
 * when a dialog closed by mouse hands focus back to the button.
 */
let keyboardLast = false;
const onKeyDown = (): void => {
  keyboardLast = true;
};
const onPointerDown = (): void => {
  keyboardLast = false;
};

const onFocus = (id: CatId): void => {
  if (keyboardLast) hold(id, 'focus', true);
};

const spotId = (node: Element): CatId | undefined =>
  props.cats.find((cat) => node.id === `cat-spot-${cat.id}`)?.id;

/** Each cat's play clock runs only while its own band is on screen. */
const showSpot = (node: Element, on: boolean): void => {
  const id = spotId(node);
  if (!id || !colony || reducedMotion.value) return;
  colony.visible(id, on, performance.now());
};

const layout = (): void => {
  if (!colony) return;
  const sizes = new Map<CatId, { width: number; height: number }>();
  for (const cat of props.cats) {
    const svg = svgs.get(cat.id);
    if (!svg) continue;
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    sizes.set(cat.id, { width, height });
  }
  colony.layout(sizes);
};

const onPointer = (event: PointerEvent): void => {
  if (!colony || !running() || !colony.watching()) return;
  pointerAt = { x: event.clientX, y: event.clientY, time: performance.now() };
  start();
};

/* A background tab is off screen too, so it does not use up play time. */
const onVisibility = (): void => {
  for (const node of spots())
    showSpot(node, !document.hidden && node.hasAttribute('data-cat-visible'));
};

const onReducedMotion = (reduced: boolean): void => {
  if (!colony) return;
  if (reduced) {
    /* The sleep control goes; focus on it moves to its cat rather than the page. */
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.matches('.cat-nap'))
      focused.parentElement?.querySelector<HTMLElement>('.cat-button')?.focus();
    colony.still();
  } else {
    for (const node of spots())
      showSpot(node, node.hasAttribute('data-cat-visible'));
  }
};

const loop = useMotionLoop({
  frame: tick,
  resume: (now) => colony?.resume(now),
  canRun: () => mounted.value,
  onReducedMotion,
  onVisibility,
});
const { reducedMotion, running, start } = loop;

/* `close` fires a task later, so a quick second cat can open before it lands. */
let shownFor: CatId | '' = '';

const afterClose = (): void => {
  const id = shownFor;
  shownFor = '';
  if (id) hold(id, 'card', false);
};

/** Space between the card and its cat, or the band on narrow screens. */
const CARD_GAP = 16;
/** The page's side gutter, kept round the card. */
const CARD_MARGIN = 16;
/** From here the card sits beside the cat; below it, above or below the band. */
const SIDE_BY_SIDE = '(min-width: 40rem)';
let placeFrame = 0;
let cardObserver: ResizeObserver | null = null;

const placeCard = (): void => {
  placeFrame = 0;
  const node = dialog.value;
  const spot = openId.value
    ? document.getElementById(`cat-spot-${openId.value}`)
    : null;
  const cat = spot?.querySelector('.cat-hit-area')?.getBoundingClientRect();
  if (!node?.open || !spot || !cat) return;
  const band = spot.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  let x: number;
  let y: number;
  if (window.matchMedia(SIDE_BY_SIDE).matches) {
    const toRight = cat.left + cat.width / 2 < width / 2;
    x = toRight ? cat.right + CARD_GAP : cat.left - CARD_GAP - box.width;
    y = cat.top + cat.height / 2 - box.height / 2;
  } else {
    x = (width - box.width) / 2;
    const below = band.bottom + CARD_GAP;
    y =
      below + box.height <= height - CARD_MARGIN
        ? below
        : band.top - CARD_GAP - box.height;
  }
  x = clamp(x, CARD_MARGIN, width - box.width - CARD_MARGIN);
  y = clamp(y, CARD_MARGIN, height - box.height - CARD_MARGIN);
  /* CSSOM custom properties: the CSP refuses style attributes, not these. */
  node.style.setProperty('--cat-card-x', `${x}px`);
  node.style.setProperty('--cat-card-y', `${y}px`);
  node.dataset.placed = '';
};

const schedulePlace = (): void => {
  if (!placeFrame) placeFrame = requestAnimationFrame(placeCard);
};

const followCat = (on: boolean): void => {
  if (on) {
    window.addEventListener('resize', schedulePlace);
    window.addEventListener('scroll', schedulePlace, {
      capture: true,
      passive: true,
    });
  } else {
    window.removeEventListener('resize', schedulePlace);
    window.removeEventListener('scroll', schedulePlace, { capture: true });
  }
  cardObserver?.disconnect();
  cardObserver = null;
  if (on && card.value) {
    cardObserver = new ResizeObserver(schedulePlace);
    cardObserver.observe(card.value);
  }
  if (!on) {
    cancelAnimationFrame(placeFrame);
    placeFrame = 0;
    delete dialog.value?.dataset.placed;
  }
};

const openCat = (id: CatId): void => {
  if (shownFor && !dialog.value?.open) afterClose();
  shownFor = id;
  openId.value = id;
  void nextTick(() => {
    if (!dialog.value || dialog.value.open) return;
    dialog.value.showModal();
    /* Placed in the frame it opens, so it never jumps from the center. */
    placeCard();
    followCat(true);
  });
};

const onCatClick = (id: CatId): void => {
  if (!reducedMotion.value) hold(id, 'card', true);
  openCat(id);
};

/* Rendered after load, so failed-images.ts never sees this photo. */
const onPhotoError = (event: Event): void => {
  if (event.target instanceof HTMLImageElement) markFailed(event.target);
};

const onDialogClose = (): void => {
  if (dialog.value?.open) return;
  followCat(false);
  openId.value = '';
  afterClose();
};

/* A drag that starts on the card, selecting text, may end on the backdrop. */
let pressedInCard = false;
const onDialogPointerDown = (event: PointerEvent): void => {
  pressedInCard =
    event.target instanceof Node && Boolean(card.value?.contains(event.target));
};

/* Outside the card is the backdrop; the dialog's own padding keeps the shadow in view. */
const onDialogClick = (event: MouseEvent): void => {
  /* Only the dialog itself: a click on the link or text inside the card never closes it. */
  if (event.target !== dialog.value || pressedInCard) return;
  const box = card.value?.getBoundingClientRect();
  if (!box) return;
  const inside =
    event.clientX >= box.left &&
    event.clientX <= box.right &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom;
  if (!inside) dialog.value?.close();
};

onMounted(async () => {
  mounted.value = true;
  await nextTick();

  const catSpots: CatSpot[] = [];
  for (const cat of props.cats) {
    const svg = svgs.get(cat.id);
    if (!svg) continue;
    const rig = createCatRig(svg, cat.id);
    catSpots.push({ id: cat.id, rig, ...PLACES[cat.id] });
  }
  colony = createColony(catSpots, (id, mood, isAsleep) => {
    moods.value = { ...moods.value, [id]: mood };
    sleeping.value = { ...sleeping.value, [id]: isAsleep };
  });
  layout();
  if (reducedMotion.value) colony.still();
  else warmExtents(EXTENT_WARMUPS);

  resizeObserver = new ResizeObserver(layout);
  for (const node of spots()) resizeObserver.observe(node);
  loop.observe(spots(), {
    onEntries: (entries) => {
      for (const entry of entries) {
        entry.target.toggleAttribute('data-cat-visible', entry.isIntersecting);
        showSpot(entry.target, entry.isIntersecting);
      }
    },
  });
  document.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('keydown', onKeyDown, { capture: true });
  document.addEventListener('pointerdown', onPointerDown, { capture: true });
});

onBeforeUnmount(() => {
  followCat(false);
  cancelWarm();
  resizeObserver?.disconnect();
  document.removeEventListener('pointermove', onPointer);
  document.removeEventListener('keydown', onKeyDown, { capture: true });
  document.removeEventListener('pointerdown', onPointerDown, {
    capture: true,
  });
});
</script>

<template>
  <template v-if="mounted">
    <Teleport v-for="cat in cats" :key="cat.id" :to="`#cat-spot-${cat.id}`">
      <button
        type="button"
        class="cat-button"
        :data-cat="cat.id"
        :data-cat-state="moods[cat.id] ?? 'hidden'"
        aria-haspopup="dialog"
        @click="onCatClick(cat.id)"
        @focus="onFocus(cat.id)"
        @blur="hold(cat.id, 'focus', false)"
        @pointerenter="hold(cat.id, 'pointer', true)"
        @pointerleave="hold(cat.id, 'pointer', false)"
      >
        <svg
          :ref="(node) => setSvg(cat.id, node)"
          class="cat-svg"
          aria-hidden="true"
          focusable="false"
        ></svg>
        <span class="sr-only">Meet {{ cat.name }}</span>
      </button>
      <button
        v-if="!reducedMotion"
        type="button"
        class="motion-toggle cat-nap"
        @click="toggleNap(cat.id)"
      >
        <svg
          v-if="asleep(cat.id)"
          class="cat-nap-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle class="cat-nap-solid" cx="6" cy="10" r="2" />
          <circle class="cat-nap-solid" cx="10" cy="6" r="2" />
          <circle class="cat-nap-solid" cx="14" cy="6" r="2" />
          <circle class="cat-nap-solid" cx="18" cy="10" r="2" />
          <path
            class="cat-nap-solid"
            d="M12 11c3 0 5.5 3.3 5.5 6 0 2-1.7 3-3.2 2.5-1-.3-1.5-.8-2.3-.8s-1.3.5-2.3.8C8.2 20 6.5 19 6.5 17c0-2.7 2.5-6 5.5-6z"
          />
        </svg>
        <svg
          v-else
          class="cat-nap-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4 11h6l-6 7h6" />
          <path d="M13 4h6l-6 7h6" />
        </svg>
        <span class="sr-only">{{ napLabel(cat) }}</span>
      </button>
    </Teleport>
  </template>

  <dialog
    ref="dialog"
    class="cat-dialog"
    :aria-labelledby="open ? `cat-dialog-${open.id}` : undefined"
    @close="onDialogClose"
    @pointerdown="onDialogPointerDown"
    @click="onDialogClick"
  >
    <div ref="card" class="cat-card">
      <form method="dialog" class="flex justify-end">
        <button class="btn-secondary cat-close">Close</button>
      </form>
      <div v-if="open" :key="open.id" class="cat-dialog-body">
        <div class="cat-photo">
          <div class="aspect-frame aspect-square w-full border-4 border-border">
            <img
              :src="open.photo.src"
              :srcset="open.photo.srcset"
              :sizes="open.photo.sizes"
              :width="open.photo.width"
              :height="open.photo.height"
              :alt="open.photo.alt"
              @error="onPhotoError"
            />
          </div>
          <h2 :id="`cat-dialog-${open.id}`" class="cat-name">
            {{ open.name }}
          </h2>
        </div>
        <p class="mt-8 text-label text-text">{{ open.role }}</p>
        <p class="mt-4 text-label text-subtle">
          Thank you for the inspiration,
          <a :href="inspiration.href">{{ inspiration.name }}</a
          >.
        </p>
      </div>
    </div>
  </dialog>
</template>
