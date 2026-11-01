/*
 * Behavior for the About cats: which move each cat plays, where on its card
 * it plays it, when they nap, and the one that watches the pointer.
 * src/scripts/about-cats.ts owns the DOM, the frame loop and the dialog.
 */
import { LOOK_BACK } from './about-cats-frames';
import {
  MOVES,
  CAT_WEIGHTS,
  clonePose,
  duration,
  moveExtent,
  mixPose,
  pose,
  poseAt,
  withTurn,
  withApproach,
  moveToPlay,
  scaleTravel,
  scaledExtent,
  EDGE_MOVES,
  TRAVEL_FACTORS,
  TRAVEL_MOVES,
  type Move,
  type MoveName,
  type Pose,
  SWAT_TIP,
} from './about-cats-moves';
import {
  clamp,
  createProp,
  reachOf,
  renderCat,
  isStepping,
  settleFrame,
  type CatRig,
  type PropRig,
} from './about-cats-rig';
import type { Ledge, PropState } from './about-cats-types';
import { CLIMB_CLEAR, CLIMB_START, climbMove } from './about-cats-climb';
import {
  createIdle,
  idleNextDrawAt,
  idleOffsets,
  rearmIdle,
  tickIdle,
  type IdleOffsets,
  type IdleState,
} from './about-cats-idle';

/** The rest after each move, in ms, while the cat idles: cats act in bursts. */
export const PAUSE_MS = [1500, 4500] as const;
/** What a frame did for a cat: drew it, left it settled, or held it in a pause. */
type StepResult = 'draw' | 'still' | 'rest';

/** On-screen play time after waking before a cat naps. */
export const NAP_AFTER_MS = 30_000;

/** Distance from each card end the cat's origin keeps, so its drawing reaches at most MAX_OVERHANG past the end. */
export const TRACK_MARGIN = 48;
/** px a drawing may reach past its band's end: the page gutter on phones (`px-4`), so it stays on screen. */
export const MAX_OVERHANG = 16;
/** Room at the right end for the sleep control. */
export const CONTROL_ROOM = 48;
/** Positions tried along the track when looking for room for a move. */
const FIT_STEPS = 24;
/** Chance a cat on a stepped band climbs to the next brick instead. */
const CLIMB_CHANCE = 0.5;
/** Where a cat stands from the card's edge to push the cup, the track's end: CUP_AHEAD plus its push takes the cup past the edge. */
const CUP_EDGE = TRACK_MARGIN;
/** A pointer that has not moved for this long no longer draws a cat's eye. */
export const POINTER_IDLE_MS = 4000;
const FACE_DEADBAND = 20;
const WATCH_EASE = 0.12;
/** Degrees past LOOK_BACK a cat turns its head while its card is open, so it looks round at you. */
const LOOK_AT_YOU_MARGIN = 8;
const LOOK_AT_YOU = LOOK_BACK + LOOK_AT_YOU_MARGIN;
const TILT_GAIN = 20;
const MAX_TILT = 25;
/** The eases are per 60fps frame; other rates scale to it. */
const FRAME_MS = 1000 / 60;
/** Longest gap one frame may cover, so a stalled tab does not jump the watcher. */
const MAX_FRAMES_PER_STEP = 6;
/** A held cat has settled once no pose value moves more than this per frame. */
const SETTLED = 0.01;
/** ms a prop takes to fade when its move is cut short. */
const PROP_FADE_MS = 250;

/** One cat as the page passes it in: names, roles and the dialog photo. */
export interface CatInfo {
  id: CatRig['id'];
  name: string;
  role: string;
  photo: {
    src: string;
    srcset: string;
    sizes: string;
    width: number;
    height: number;
    alt: string;
  };
}

export interface CatSpot {
  id: CatRig['id'];
  rig: CatRig;
  /** Starting place along the track, 0 to 1. */
  start: number;
  /** Starting direction: 1 faces right. */
  facing: 1 | -1;
}

/** Why a cat holds still: pointed at, keyboard-focused, or its dialog is open. */
export type Hold = 'pointer' | 'focus' | 'card';

/** 'hidden' while the colony does not step the cat: off screen, not yet seen, or reduced motion. */
export type CatMood = 'hidden' | 'playing' | 'holding' | 'asleep';

interface Playing {
  move: Move;
  from: Pose;
  t0: number;
  length: number;
  origin: number;
  dir: number;
  prop: PropRig | undefined;
  /** The prop as last drawn, so a dropped move can fade it out from there. */
  shown?: PropState;
  /** Lying down and getting up play out even while the cat is held. */
  settle: boolean;
  then: (() => void) | undefined;
}

interface CatState extends CatSpot {
  width: number;
  /** The band's bottom, and the floor under the cat: the top of the brick it is on. */
  base: number;
  ledges: Ledge[];
  groundY: number;
  min: number;
  max: number;
  pose: Pose;
  playing?: Playing | undefined;
  asleep: boolean;
  napAt: number;
  holds: Set<Hold>;
  mood: CatMood;
  reportedAsleep: boolean;
  /** When its band left the screen; it is not stepped and its play clock stops meanwhile. */
  hiddenAt: number | undefined;
  /** No new move before this; a nap still starts at once. */
  restUntil: number;
  idle: IdleState;
  /** Resting between moves: glances are drawn on its pose. */
  idling: boolean;
  idleDrawnAt: number;
  /** The idle offsets on screen: a move starts from these, not from offsets a frame newer. */
  idleShown: IdleOffsets;
}

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

const pickWeighted = (weights: Partial<Record<MoveName, number>>): MoveName => {
  const entries = Object.entries(weights) as [MoveName, number][];
  let roll = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, w] of entries) {
    roll -= w;
    if (roll <= 0) return name;
  }
  /* Rounding can leave a sliver of roll; an empty table has the cat look around. */
  return entries[0]?.[0] ?? 'look';
};

const poseGap = (a: Pose, b: Pose): number =>
  Math.max(
    ...(Object.keys(a) as (keyof Pose)[]).flatMap((key) => {
      const u = a[key];
      const v = b[key];
      if (Array.isArray(u) && Array.isArray(v))
        return [Math.abs(u[0] - v[0]), Math.abs(u[1] - v[1])];
      return typeof u === 'number' && typeof v === 'number'
        ? [Math.abs(u - v)]
        : [];
    }),
  );

export interface Colony {
  /** `ledges` are the brick tops under a band, left to right; none means the band's bottom. */
  layout: (
    sizes: Map<
      CatSpot['id'],
      { width: number; height: number; ledges?: Ledge[] }
    >,
  ) => void;
  /** Draws a frame; returns when the next is needed: `now` or earlier, a rest's end, or Infinity. */
  frame: (now: number) => number;
  /** Starts a cat's play clock the first time its band is on screen, and stops it while off. */
  visible: (id: CatSpot['id'], on: boolean, now: number) => void;
  /** Its sleep control: lies down now, then sleeps until woken. */
  nap: (id: CatSpot['id']) => void;
  /** Whether the move fits on the cat's track at this band width, so it can be offered. */
  playable: (id: CatSpot['id'], name: MoveName) => boolean;
  /**
   * A chosen move, or a random one, now: wakes a sleeping cat first, cuts a move
   * in progress short, and trots to the track's nearer end if the move needs room.
   */
  trick: (id: CatSpot['id'], name: MoveName | 'random', now: number) => void;
  wake: (id: CatSpot['id'], now: number) => void;
  hold: (id: CatSpot['id'], reason: Hold, on: boolean) => void;
  /** Reduced motion: drops every move, keeps each cat awake or asleep, and stops its clock. */
  still: () => void;
  /** The loop starts again after idling, so the first frame covers no time. */
  resume: (now: number) => void;
  pointer: (
    x: number,
    y: number,
    now: number,
    rects: Map<CatSpot['id'], DOMRect>,
  ) => void;
  /** Whether any cat on screen is awake to see the pointer. */
  watching: () => boolean;
}

/** Whether a move of this extent, played from `x` heading `dir`, keeps the cat within [min, max]. */
const fitsTrack = (
  x: number,
  [back, forward]: readonly [number, number],
  dir: number,
  min: number,
  max: number,
): boolean => {
  const a = x + dir * back;
  const b = x + dir * forward;
  return Math.min(a, b) >= min && Math.max(a, b) <= max;
};

/**
 * How a cat at `x` facing `facing` plays `name` on [min, max]: ahead if it fits,
 * else back; a travel move scales to the room on the roomier side. Null if not.
 */
export const planMove = (
  name: MoveName,
  x: number,
  facing: number,
  min: number,
  max: number,
): { move: Move; dir: number } | null => {
  const [back, forward] = moveExtent(name);
  for (const dir of [facing, -facing])
    if (fitsTrack(x, [back, forward], dir, min, max))
      return { move: moveToPlay(name), dir };
  if (!TRAVEL_MOVES.has(name) || forward <= 0) return null;
  const room = (dir: number) => (dir > 0 ? max - x : x - min);
  const dir = room(facing) >= room(-facing) ? facing : -facing;
  /* Props keep their distance from the cat when it travels less, so each scale is measured, not assumed. */
  for (const factor of TRAVEL_FACTORS)
    if (fitsTrack(x, scaledExtent(name, factor), dir, min, max))
      return { move: scaleTravel(moveToPlay(name), factor), dir };
  return null;
};

/**
 * The cup push from anywhere on the track, heading left: a trot and a creep to
 * `edge`, the track's left end, so the cup goes over the card's or the step's edge.
 * Left only: the right end is the sleep control's corner.
 */
export const cupPush = (x: number, edge = CUP_EDGE): Move =>
  withApproach(moveToPlay('knock'), Math.max(0, x - edge));

export const createColony = (
  spots: CatSpot[],
  onMoodChange: (id: CatSpot['id'], mood: CatMood, asleep: boolean) => void,
): Colony => {
  const cats: CatState[] = spots.map((spot) => ({
    ...spot,
    width: 0,
    base: 0,
    ledges: [],
    groundY: 0,
    min: 0,
    max: 0,
    pose: pose('sit', { face: spot.facing }),
    asleep: false,
    napAt: Infinity,
    holds: new Set<Hold>(),
    mood: 'hidden' as CatMood,
    reportedAsleep: false,
    hiddenAt: 0,
    restUntil: 0,
    idle: createIdle(),
    idling: false,
    idleDrawnAt: 0,
    idleShown: { hr: 0 },
  }));
  const watcherId = cats[Math.floor(Math.random() * cats.length)]?.id ?? '';
  const pointerAt = new Map<CatSpot['id'], { x: number; y: number }>();
  let pointerTime = -Infinity;
  let lastFrame = -Infinity;

  const find = (id: CatSpot['id']): CatState | undefined =>
    cats.find((cat) => cat.id === id);

  /** The ledge under `x`, or -1 on a flat band. */
  const ledgeIndex = (cat: CatState, x: number): number => {
    const i = cat.ledges.findIndex((l) => x < l.x1);
    return i < 0 ? cat.ledges.length - 1 : i;
  };

  /** Puts the cat on the brick under it: its floor, and a track that keeps to that brick. */
  const onLedge = (cat: CatState): void => {
    const i = ledgeIndex(cat, cat.pose.x);
    const l = cat.ledges[i] ?? { x0: 0, x1: cat.width, drop: 0 };
    cat.groundY = cat.base + l.drop;
    cat.min = l.x0 + (i > 0 ? CLIMB_CLEAR : TRACK_MARGIN);
    cat.max = Math.max(
      cat.min,
      l.x1 -
        (i < cat.ledges.length - 1 ? CLIMB_CLEAR : TRACK_MARGIN + CONTROL_ROOM),
    );
    cat.pose.x = clamp(cat.pose.x, cat.min, cat.max);
    for (const layer of [cat.rig.props, cat.rig.propsFront])
      layer.setAttribute('transform', `translate(0 ${cat.groundY})`);
  };

  /* Asleep is reported on its own too: a hidden cat can be asleep, and its control says so. */
  const updateMood = (cat: CatState): void => {
    const mood: CatMood =
      cat.hiddenAt !== undefined
        ? 'hidden'
        : cat.asleep
          ? 'asleep'
          : cat.holds.size > 0
            ? 'holding'
            : 'playing';
    if (mood === cat.mood && cat.asleep === cat.reportedAsleep) return;
    cat.mood = mood;
    cat.reportedAsleep = cat.asleep;
    onMoodChange(cat.id, mood, cat.asleep);
  };

  const setAsleep = (cat: CatState, asleep: boolean): void => {
    cat.asleep = asleep;
    updateMood(cat);
  };

  const addIdle = (p: Pose, { hr }: IdleOffsets): void => {
    p.hr += hr;
  };

  const draw = (cat: CatState, now: number): void => {
    const p = clonePose(cat.pose);
    if (cat.idling) addIdle(p, cat.idleShown);
    renderCat(cat.rig, p, now, p.x, cat.groundY);
  };

  /** A cut-short move's prop fades out over PROP_FADE_MS instead of vanishing. */
  const fading: { prop: PropRig; shown: PropState; t0: number }[] = [];

  const drop = (cat: CatState, fade = false, cut = true): void => {
    const playing = cat.playing;
    /* Cut short mid-climb, the cat sits on the brick it is over. */
    if (cut && playing?.move.rise) {
      cat.pose = pose('sit', { x: cat.pose.x, face: cat.pose.face });
      onLedge(cat);
    }
    if (playing?.prop && playing.shown && fade)
      fading.push({
        prop: playing.prop,
        shown: playing.shown,
        t0: performance.now(),
      });
    else playing?.prop?.remove();
    cat.playing = undefined;
    cat.pose.face = Math.sign(cat.pose.face) || 1;
  };

  const endMove = (cat: CatState): void => {
    const playing = cat.playing;
    if (!playing) return;
    if (playing.move.rise) {
      if (playing.move.rise > 0) cat.pose.by -= playing.move.rise;
      onLedge(cat);
    }
    drop(cat, false, false);
    if (!playing.settle) cat.restUntil = performance.now() + rand(...PAUSE_MS);
    playing.then?.();
  };

  const play = (
    cat: CatState,
    move: Move,
    now: number,
    dir: number,
    then?: () => void,
    settle = false,
  ): void => {
    const from = clonePose(cat.pose);
    /* The move starts from the pose last drawn, glance included. */
    if (cat.idling) {
      addIdle(from, cat.idleShown);
      cat.idling = false;
    }
    /* A climb down plays on the lower floor, so the cat starts the step's height up. */
    if (move.rise && move.rise < 0) {
      cat.groundY -= move.rise;
      from.by -= move.rise;
    }
    const origin = from.x;
    from.x = 0;
    from.face = from.face * dir;
    if (from.face < 0) move = withTurn(move, from);
    const prop = move.prop
      ? createProp(cat.rig.props, cat.rig.propsFront, move.prop)
      : undefined;
    cat.playing = {
      move,
      from,
      t0: now,
      length: duration(move),
      origin,
      dir,
      prop,
      settle,
      then,
    };
  };

  /** Faces the band's middle first if its head, lying down, would reach past the band's end. */
  const sleepFacing = (cat: CatState): number => {
    const facing = Math.sign(cat.pose.face) || 1;
    const [left, right] = reachOf(pose('sleep', { face: facing }));
    const past =
      cat.pose.x + left < -MAX_OVERHANG ||
      cat.pose.x + right > cat.width + MAX_OVERHANG;
    return past ? -facing : facing;
  };

  /* Asleep from the first frame, so the control offers to wake it while it lies down. */
  const lieDown = (cat: CatState, now: number): void => {
    setAsleep(cat, true);
    const dir = sleepFacing(cat);
    const turning = dir !== (Math.sign(cat.pose.face) || 1);
    play(cat, MOVES.sleep(turning), now, dir, undefined, true);
  };

  const planFor = (cat: CatState, name: MoveName) =>
    planMove(name, cat.pose.x, Math.sign(cat.pose.face) || 1, cat.min, cat.max);

  /** Walks to the step beside its brick and climbs it; false on a flat band. */
  const climb = (cat: CatState, now: number): boolean => {
    const i = ledgeIndex(cat, cat.pose.x);
    const here = cat.ledges[i];
    const sides = [i - 1, i + 1].filter((j) => here && cat.ledges[j]);
    if (sides.length === 0) return false;
    const j = sides[Math.floor(Math.random() * sides.length)] ?? i;
    const there = cat.ledges[j];
    if (!here || !there) return false;
    const dir = j > i ? 1 : -1;
    const edge = dir > 0 ? here.x1 : here.x0;
    const h = here.drop - there.drop;
    const rising = h > 0;
    const start = edge - dir * CLIMB_START[rising ? 'up' : 'down'];
    const walk = withApproach(
      { steps: [], mods: [] },
      Math.max(0, (start - cat.pose.x) * dir),
    );
    play(cat, walk, now, dir, () =>
      play(
        cat,
        climbMove(rising, Math.abs(h)),
        performance.now(),
        dir,
        undefined,
        true,
      ),
    );
    return true;
  };

  /** The spot on the track nearest the cat where `name` fits, or null if it fits nowhere. */
  const fitPoint = (cat: CatState, name: MoveName): number | null => {
    if (EDGE_MOVES.has(name)) return cat.pose.x;
    let best: number | null = null;
    for (let i = 0; i <= FIT_STEPS; i += 1) {
      const x = cat.min + ((cat.max - cat.min) * i) / FIT_STEPS;
      const fits = [1, -1].some((facing) =>
        planMove(name, x, facing, cat.min, cat.max),
      );
      if (
        fits &&
        (best === null ||
          Math.abs(x - cat.pose.x) < Math.abs(best - cat.pose.x))
      )
        best = x;
    }
    return best;
  };

  /** Plays `name` from where the cat stands; false if it fits nowhere on the track. */
  const begin = (cat: CatState, name: MoveName, now: number): boolean => {
    if (EDGE_MOVES.has(name)) {
      play(cat, cupPush(cat.pose.x, cat.min), now, -1);
      return true;
    }
    const plan = planFor(cat, name);
    if (!plan) return false;
    play(cat, plan.move, now, plan.dir);
    return true;
  };

  const next = (cat: CatState, now: number): void => {
    if (cat.asleep || cat.holds.has('card')) return;
    if (now >= cat.napAt) {
      lieDown(cat, now);
      return;
    }
    if (cat.holds.size > 0 || now < cat.restUntil) return;
    if (Math.random() < CLIMB_CHANCE && climb(cat, now)) return;
    begin(cat, pickWeighted(CAT_WEIGHTS[cat.id]), now);
  };

  /* One test for both reading and waking: written two ways, float rounding can make them disagree at the deadline. */
  const pointerLive = (now: number): boolean =>
    now - pointerTime <= POINTER_IDLE_MS;

  /** Where the pointer is from this cat, while it is still moving. */
  const pointerFor = (
    cat: CatState,
    now: number,
  ): { x: number; y: number } | undefined => {
    const target = pointerAt.get(cat.id);
    return target && pointerLive(now) ? target : undefined;
  };

  const tiltTowards = (cat: CatState, target: { x: number; y: number }) =>
    clamp(
      -Math.atan2(cat.groundY - target.y, Math.abs(target.x - cat.pose.x) + 1) *
        TILT_GAIN,
      -MAX_TILT,
      0,
    );

  /** An ease per 60fps frame, applied over `frames` of them. */
  const eased = (ease: number, frames: number): number =>
    1 - (1 - ease) ** frames;

  /** A held cat sits where it is and turns its head to the pointer, or to you while its card is open; true until it settles. */
  const look = (cat: CatState, now: number, frames: number): boolean => {
    const target = pointerFor(cat, now);
    const carded = cat.holds.has('card');
    const dx = target ? target.x - cat.pose.x : 0;
    const want =
      Math.abs(dx) > FACE_DEADBAND
        ? Math.sign(dx)
        : Math.sign(cat.pose.face) || 1;
    const aim = pose('sit', {
      x: cat.pose.x,
      hr: carded ? LOOK_AT_YOU : target ? tiltTowards(cat, target) : 0,
    });
    aim.face = want;
    const toward = (frameCount: number): Pose => {
      const next = mixPose(cat.pose, aim, eased(WATCH_EASE, frameCount));
      next.x = cat.pose.x;
      /* A flat sticker flips; easing the width through zero shows a sliver. */
      next.face = want;
      return next;
    };
    /* Settled is judged on one frame's step, so a long frame cannot ease the residue past SETTLED and redraw a still cat. */
    if (poseGap(cat.pose, toward(1)) <= SETTLED) return false;
    cat.pose = toward(frames);
    return true;
  };

  /** Turns to a moving pointer and tilts its head to it; with none, the watcher plays like the others. */
  const watch = (
    cat: CatState,
    target: { x: number; y: number },
    frames: number,
  ): void => {
    const dx = target.x - cat.pose.x;
    const want =
      Math.abs(dx) > FACE_DEADBAND
        ? Math.sign(dx)
        : Math.sign(cat.pose.face) || 1;
    const calm = mixPose(
      cat.pose,
      pose('sit', { x: cat.pose.x, hr: tiltTowards(cat, target) }),
      eased(WATCH_EASE, frames),
    );
    calm.x = cat.pose.x;
    calm.face = want;
    cat.pose = calm;
  };

  const advance = (cat: CatState, playing: Playing, now: number): void => {
    const t = Math.min(now - playing.t0, playing.length);
    const p = poseAt(playing.move, playing.from, t);
    p.x = playing.origin + playing.dir * p.x;
    p.face *= playing.dir;
    cat.pose = p;
    if (playing.prop && playing.move.propAt) {
      const s = playing.move.propAt(t);
      const [ahead, up] = playing.move.atSwatTip
        ? [
            SWAT_TIP[cat.id][0] - SWAT_TIP.minerva[0],
            SWAT_TIP[cat.id][1] - SWAT_TIP.minerva[1],
          ]
        : [0, 0];
      playing.shown = {
        ...s,
        x: playing.origin + playing.dir * (s.x + ahead),
        y: s.y - up,
      };
      playing.prop.draw(playing.shown, now);
    }
    if (t >= playing.length) endMove(cat);
  };

  /** Moves one cat a frame on: drawn, left as it is, or held in a pause. */
  const step = (cat: CatState, now: number, frames: number): StepResult => {
    const held = cat.holds.size > 0;
    const playing = cat.playing;
    if (playing && (playing.settle || !held)) {
      advance(cat, playing, now);
      return 'draw';
    }
    if (cat.asleep) return 'still';
    if (playing) drop(cat, true);
    const napDue = now >= cat.napAt && !cat.holds.has('card');
    if (held && !napDue) return look(cat, now, frames) ? 'draw' : 'still';
    const target = cat.id === watcherId ? pointerFor(cat, now) : undefined;
    if (!napDue && target) {
      watch(cat, target, frames);
      return 'draw';
    }
    if (!napDue && now < cat.restUntil) return 'rest';
    next(cat, now);
    return 'draw';
  };

  const frame = (now: number): number => {
    const frames = clamp((now - lastFrame) / FRAME_MS, 0, MAX_FRAMES_PER_STEP);
    lastFrame = now;
    let wakeAt = Infinity;
    for (const fade of [...fading]) {
      const { prop, shown, t0 } = fade;
      const k = (now - t0) / PROP_FADE_MS;
      if (k >= 1) {
        prop.remove();
        fading.splice(fading.indexOf(fade), 1);
        continue;
      }
      prop.draw({ ...shown, o: shown.o * (1 - k) }, now);
      wakeAt = now;
    }
    for (const cat of cats) {
      if (cat.hiddenAt !== undefined) continue;
      const result = step(cat, now, frames);
      const frameStepping = isStepping(cat.rig, now);
      const resting = result === 'rest';
      /* Timers run only while resting, so each rest starts them afresh; its first frame draws at once. */
      const restStarts = resting && !cat.idling;
      if (restStarts) rearmIdle(cat.idle);
      cat.idling = resting;
      if (cat.idling) {
        tickIdle(cat.idle, now);
        const due =
          restStarts ||
          now >= idleNextDrawAt(cat.idle, cat.idleDrawnAt, frameStepping);
        /* Next frame: the next idle one, the pause's end, or the nap. */
        wakeAt = Math.min(
          wakeAt,
          cat.restUntil,
          cat.napAt,
          idleNextDrawAt(cat.idle, due ? now : cat.idleDrawnAt, frameStepping),
        );
        if (!due) continue;
        cat.idleDrawnAt = now;
        cat.idleShown = idleOffsets(cat.idle, now);
      } else {
        /* A held cat relaxes its head when the pointer goes idle, and may nap: no other cat need wake the loop for it. */
        if (cat.holds.size > 0 && !cat.asleep)
          wakeAt = Math.min(
            wakeAt,
            /* A cat with its card open does not nap (step), so its nap time is no reason to wake. */
            cat.holds.has('card') ? Infinity : cat.napAt,
            /* A frame after the loop slept covers no time, so it cannot ease the head: one more follows. */
            frames === 0
              ? now
              : pointerLive(now)
                ? pointerTime + POINTER_IDLE_MS
                : Infinity,
          );
        /* A settled or sleeping cat keeps its last drawing. */
        if (result !== 'draw' && !frameStepping) continue;
        wakeAt = now;
      }
      draw(cat, now);
      /* The draw can leave a frame waiting its turn, so a resting cat wakes for it. */
      if (cat.idling && isStepping(cat.rig, now))
        wakeAt = Math.min(wakeAt, idleNextDrawAt(cat.idle, now, true));
    }
    return wakeAt;
  };

  /** Getting up, then `after` (default: a stretch and a yawn in place, as a cat does on waking). */
  const wakeCat = (cat: CatState, now: number, after?: () => void): void => {
    cat.napAt = now + NAP_AFTER_MS;
    if (!cat.asleep) return;
    setAsleep(cat, false);
    const facing = Math.sign(cat.pose.face) || 1;
    play(
      cat,
      MOVES.wake(),
      now,
      facing,
      after ??
        /* Straight into play after the stretch: endMove's pause is cleared. */
        (() =>
          play(cat, moveToPlay('stretch'), performance.now(), facing, () => {
            cat.restUntil = 0;
          })),
      true,
    );
  };

  return {
    layout: (sizes) => {
      for (const cat of cats) {
        const size = sizes.get(cat.id);
        if (!size) continue;
        const first = cat.width === 0;
        if (cat.playing?.move.rise) drop(cat);
        cat.width = size.width;
        cat.base = size.height;
        cat.ledges = size.ledges ?? [];
        if (first)
          cat.pose.x =
            TRACK_MARGIN +
            (size.width - 2 * TRACK_MARGIN - CONTROL_ROOM) * cat.start;
        onLedge(cat);
        settleFrame(cat.rig);
        draw(cat, performance.now());
      }
    },
    frame,
    visible: (id, on, now) => {
      const cat = find(id);
      if (!cat) return;
      if (!on) {
        cat.hiddenAt ??= now;
        updateMood(cat);
        return;
      }
      const hiddenAt = cat.hiddenAt;
      if (hiddenAt === undefined) return;
      cat.hiddenAt = undefined;
      /* Back on screen mid-rest: timers start afresh. */
      cat.idling = false;
      updateMood(cat);
      if (cat.napAt === Infinity) {
        wakeCat(cat, now);
        return;
      }
      if (cat.napAt > hiddenAt) cat.napAt += now - hiddenAt;
      if (cat.playing) cat.playing.t0 += now - hiddenAt;
    },
    nap: (id) => {
      const cat = find(id);
      if (!cat || cat.asleep) return;
      /* Drops any move, getting up included, so it is still within 5 s. */
      drop(cat, true);
      cat.napAt = -Infinity;
    },
    playable: (id, name) => {
      const cat = find(id);
      return cat !== undefined && fitPoint(cat, name) !== null;
    },
    trick: (id, name, now) => {
      const cat = find(id);
      if (!cat || cat.hiddenAt !== undefined) return;
      drop(cat, true);
      const start = (): void => {
        cat.restUntil = 0;
        const at = performance.now();
        if (name === 'random') {
          next(cat, at);
          return;
        }
        if (begin(cat, name, at)) return;
        /* The list offers only moves that fit somewhere, so a null here is a band that shrank. */
        const x = fitPoint(cat, name) ?? cat.pose.x;
        const trot = withApproach(
          { steps: [], mods: [] },
          Math.abs(x - cat.pose.x),
        );
        play(cat, trot, at, Math.sign(x - cat.pose.x) || 1, () =>
          begin(cat, name, performance.now()),
        );
      };
      if (cat.asleep) wakeCat(cat, now, start);
      else {
        cat.napAt = now + NAP_AFTER_MS;
        start();
      }
    },
    wake: (id, now) => {
      const cat = find(id);
      if (cat?.asleep) wakeCat(cat, now);
    },
    hold: (id, reason, on) => {
      const cat = find(id);
      if (!cat) return;
      if (on) cat.holds.add(reason);
      else cat.holds.delete(reason);
      /* The look ends with the card, not after the rest that follows it. */
      if (reason === 'card' && !on && !cat.asleep) {
        cat.pose.hr = 0;
        draw(cat, performance.now());
      }
      updateMood(cat);
    },
    still: () => {
      const now = performance.now();
      for (const { prop } of fading.splice(0)) prop.remove();
      for (const cat of cats) {
        drop(cat);
        cat.idling = false;
        cat.pose = pose(cat.asleep ? 'sleep' : 'sit', {
          x: cat.pose.x,
          face: Math.sign(cat.pose.face) || cat.facing,
        });
        onLedge(cat);
        cat.hiddenAt ??= now;
        updateMood(cat);
        settleFrame(cat.rig);
        draw(cat, now);
      }
    },
    resume: (now) => {
      lastFrame = now;
    },
    pointer: (x, y, now, rects) => {
      pointerTime = now;
      for (const [id, rect] of rects)
        pointerAt.set(id, { x: x - rect.left, y: y - rect.top });
    },
    watching: () =>
      cats.some((cat) => cat.hiddenAt === undefined && !cat.asleep),
  };
};
