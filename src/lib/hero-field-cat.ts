/* Pure. Paths are in the cat's own drawing units, independent of the box. */
import { FOOT_Y } from './hero-field-scene';
import type { HeroPalette } from './hero-field-scene';

interface Point {
  readonly x: number;
  readonly y: number;
}

const point = (x: number, y: number): Point => ({ x, y });

const LINE_WIDTH = 2.1;
const FAR_ALPHA = 0.45;
const FAR_SHIFT = -5;

/** Share of the hop cycle spent crouching before take-off, and landing after. */
const TAKEOFF = 0.14;
const LAND = 0.88;

/** Body scale at full stretch, crouch and landing squash: [x, y]. */
const STRETCH = [0.14, -0.1] as const;
const CROUCH = [0.07, -0.16] as const;
const SQUASH = [0.1, -0.2] as const;
/** Units the body drops at the bottom of a crouch and a landing. */
const CROUCH_DROP = 8;
const SQUASH_DROP = 5;
const PITCH = 0.22;
/** Nose-down pitch at the bottom of the crouch: the chest drops before the launch. */
const CROUCH_PITCH = 0.24;
/** At the bottom of the crouch the forepaws reach forward and the forelegs bend this much more. */
const CROUCH_REACH = 13;
const CROUCH_BOW = 4;

/** Body-frame joints; the body's path is drawn around the origin. */
const HIP = point(-20, 2);
const SHOULDER = point(17, 2);
const NECK = point(32, -26);
const TAIL_ROOT = point(-28, -10);
/** Body scaling is about the belly line, so a squash lowers the back. */
const BODY_ANCHOR = point(0, 6);

/** Leg and tail widths taper from root to tip. */
const FORE_WIDTH = [6.4, 3.6] as const;
const HIND_WIDTH = [6, 3.6] as const;
const TAIL_WIDTH = [6, 3.4] as const;
/** How far a leg bows backward at its middle, as a joint would. */
const LEG_BOW = 3.5;
const LEG_SAMPLES = 8;
const PAW = { rx: 4.2, ry: 2.4, ahead: 1.5 } as const;

const TAIL_SEGMENTS = 8;
const TAIL_SEGMENT = 4.2;
/** The tail's centre line stays this far above FOOT_Y, so it lies on the ground. */
const TAIL_FLOOR = FOOT_Y - TAIL_WIDTH[0] / 2;
/*
 * Every tail segment points at least this far behind vertical, so the tail
 * never crosses the back or the head. Radians from straight back (pi).
 */
const TAIL_SPREAD = 1.37;
/** Running tail: base angle, curl per segment, lift, and lag per segment in cycles. */
const TAIL_RUN = { angle: 3.66, curl: -0.04, lift: 0.38, lag: 0.05 } as const;
/** Turn per segment that flips sign halfway along, so the running tail is an S. */
const TAIL_S = 0.16;
const TAIL_SIT = { angle: 2.1, curl: 0.24 } as const;
/** The lift peaks here in the cycle: the tail follows through after landing. */
const TAIL_PEAK = 0.8;

/** Sitting rocks the body up about its rump and lowers it onto the ground. */
const SIT_PIVOT = point(-24, 10);
const SIT_ANGLE = -0.42;
const SIT_DROP = 10;

/** Share of the body's pitch the head cancels, so the gaze stays on the route. */
const HEAD_LEVEL = 0.6;
const HEAD = { rx: 10.5, ry: 9 } as const;
const MUZZLE = { x: 7.5, y: 3, rx: 4.8, ry: 3.6 } as const;

/** Paw offsets from the shoulder or hip, keyed over the airborne part of a leap. */
const FORE_KEYS: readonly Point[] = [point(6, 14), point(20, 6), point(13, 15)];
const HIND_KEYS: readonly Point[] = [
  point(-17, 13),
  point(-20, 5),
  point(5, 10),
];
const FORE_GROUND = point(3, 18);
const HIND_GROUND = point(1, 18);

/** Seconds: a quick blink every few seconds, a slow one while sitting. */
const BLINK = { every: 4.3, length: 0.14 } as const;
const SLOW_BLINK = { every: 3.1, length: 0.9 } as const;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smoothstep from `a` to `b`: paws ease between the ground pose and the keys. */
const blend = (a: Point, b: Point, t: number): Point => {
  const e = smooth(clamp01(t));
  return point(mix(a.x, b.x, e), mix(a.y, b.y, e));
};

const keyAt = (keys: readonly Point[], phase: number): Point => {
  const span = keys.length - 1;
  const at = clamp01(phase) * span;
  const index = Math.min(span - 1, Math.floor(at));
  const t = smooth(at - index);
  return point(
    mix(keys[index].x, keys[index + 1].x, t),
    mix(keys[index].y, keys[index + 1].y, t),
  );
};

/** Keeps an angle pointing backward: within TAIL_SPREAD of pi. */
const behind = (angle: number): number => {
  const fromBack = Math.atan2(
    Math.sin(angle - Math.PI),
    Math.cos(angle - Math.PI),
  );
  return Math.PI + Math.max(-TAIL_SPREAD, Math.min(TAIL_SPREAD, fromBack));
};

interface LeapFrame {
  /** 0 on the ground, 1 at the top of the arc. */
  readonly air: number;
  readonly pitch: number;
  /** Body scale about BODY_ANCHOR, and how far the body sinks. */
  readonly scaleX: number;
  readonly scaleY: number;
  readonly drop: number;
  readonly fore: Point;
  readonly hind: Point;
  /** Screen radians per tail segment, y down, pi pointing straight back. */
  readonly tail: readonly number[];
  readonly earFlick: number;
  readonly blink: boolean;
  readonly sit: number;
  /** 0 to 1: how deep the crouch is. */
  readonly crouch: number;
}

interface Phase {
  readonly crouch: number;
  readonly flight: number;
  readonly squash: number;
  /** 0 to 1 across the airborne part only. */
  readonly airPhase: number;
  /** 0 to 1 across the crouch, and across the landing. */
  readonly crouchT: number;
  readonly landT: number;
}

const STILL_PHASE: Phase = {
  crouch: 0,
  flight: 0,
  squash: 0,
  airPhase: 0,
  crouchT: 0,
  landT: 0,
};

/*
 * Crouch, flight, landing. `air` stays 0 through the crouch and the landing,
 * so the caller's arc and shadow start and end with the paws down.
 */
const phaseOf = (cycle: number): Phase => {
  if (cycle < TAKEOFF) {
    const t = cycle / TAKEOFF;
    return { ...STILL_PHASE, crouch: Math.sin(Math.PI * t), crouchT: t };
  }
  if (cycle > LAND) {
    const t = (cycle - LAND) / (1 - LAND);
    return {
      ...STILL_PHASE,
      squash: Math.sin(Math.PI * t),
      airPhase: 1,
      landT: t,
    };
  }
  const airPhase = (cycle - TAKEOFF) / (LAND - TAKEOFF);
  return { ...STILL_PHASE, flight: Math.sin(Math.PI * airPhase), airPhase };
};

/*
 * Pitch: nose up on the rise, down on the fall, eased in over the crouch and
 * out over the landing so it never jumps.
 */
const pitchOf = (cycle: number, phase: Phase): number => {
  if (cycle < TAKEOFF) {
    const t = smooth(cycle / TAKEOFF);
    return CROUCH_PITCH * phase.crouch - PITCH * t * t;
  }
  if (cycle > LAND) return PITCH * (1 - smooth((cycle - LAND) / (1 - LAND)));
  return -PITCH * Math.cos(Math.PI * phase.airPhase);
};

/*
 * Periodic in the cycle, so back-to-back leaps join without a jump: the tail
 * drops as the body rises and lifts after landing, each segment a little late.
 */
const tailOf = (cycle: number, sit: number, sway: number): number[] => {
  const angles: number[] = [];
  let run = TAIL_RUN.angle + sway;
  let rest = TAIL_SIT.angle;
  for (let i = 0; i < TAIL_SEGMENTS; i += 1) {
    const lift =
      TAIL_RUN.lift *
      Math.cos(2 * Math.PI * (cycle - TAIL_PEAK - TAIL_RUN.lag * i));
    angles.push(behind(mix(run + lift, rest + sway * 0.6, sit)));
    const ease = i < 2 ? 0.4 : 1;
    run +=
      TAIL_RUN.curl * ease +
      TAIL_S * Math.cos((Math.PI * i) / (TAIL_SEGMENTS - 1));
    rest += TAIL_SIT.curl * ease;
  }
  return angles;
};

export const hopFrame = (
  cycle: number,
  sit: number,
  seconds: number,
): LeapFrame => {
  const sitting = sit > 0.05;
  const phase = sitting ? STILL_PHASE : phaseOf(cycle);
  const sway = Math.sin(seconds * 1.9) * 0.08;
  const flickOn = Math.sin(seconds * 2.3 + 1.7) > 0.86;
  const blink = sit > 0.6 ? SLOW_BLINK : BLINK;
  const paw = (keys: readonly Point[], ground: Point): Point => {
    if (phase.landT > 0)
      return blend(keys[keys.length - 1], ground, phase.landT);
    if (phase.airPhase > 0) return keyAt(keys, phase.airPhase);
    return blend(ground, keys[0], phase.crouchT);
  };

  return {
    air: phase.flight,
    pitch: sitting ? 0 : pitchOf(cycle, phase),
    scaleX:
      1 +
      STRETCH[0] * phase.flight +
      CROUCH[0] * phase.crouch +
      SQUASH[0] * phase.squash,
    scaleY:
      1 +
      STRETCH[1] * phase.flight +
      CROUCH[1] * phase.crouch +
      SQUASH[1] * phase.squash,
    drop: CROUCH_DROP * phase.crouch + SQUASH_DROP * phase.squash,
    fore: ((p: Point) => point(p.x + CROUCH_REACH * phase.crouch, p.y))(
      paw(FORE_KEYS, FORE_GROUND),
    ),
    hind: paw(HIND_KEYS, HIND_GROUND),
    tail: tailOf(sitting ? 0 : cycle, sit, sway),
    earFlick: flickOn ? Math.sin(seconds * 15) * 0.2 : 0,
    blink: ((seconds % blink.every) + blink.every) % blink.every < blink.length,
    sit,
    crouch: phase.crouch,
  };
};

interface BodyPose {
  readonly angle: number;
  readonly drop: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

const poseOf = (frame: LeapFrame): BodyPose => ({
  angle: frame.pitch + frame.sit * SIT_ANGLE,
  drop: frame.drop + frame.sit * SIT_DROP,
  scaleX: frame.scaleX,
  scaleY: frame.scaleY,
});

/** Body frame to the cat's local frame; `applyBody` is the same on the canvas. */
const place = (pose: BodyPose, p: Point): Point => {
  const sx = BODY_ANCHOR.x + (p.x - BODY_ANCHOR.x) * pose.scaleX - SIT_PIVOT.x;
  const sy = BODY_ANCHOR.y + (p.y - BODY_ANCHOR.y) * pose.scaleY - SIT_PIVOT.y;
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  return point(
    sx * cos - sy * sin + SIT_PIVOT.x,
    sx * sin + sy * cos + SIT_PIVOT.y + pose.drop,
  );
};

const applyBody = (ctx: CanvasRenderingContext2D, pose: BodyPose): void => {
  ctx.translate(SIT_PIVOT.x, SIT_PIVOT.y + pose.drop);
  ctx.rotate(pose.angle);
  ctx.translate(BODY_ANCHOR.x - SIT_PIVOT.x, BODY_ANCHOR.y - SIT_PIVOT.y);
  ctx.scale(pose.scaleX, pose.scaleY);
  ctx.translate(-BODY_ANCHOR.x, -BODY_ANCHOR.y);
};

/*
 * A closed outline around a centre line, `from` wide at its root and `to` at
 * its rounded tip. The root end is straight: it always sits under the body.
 */
const taper = (
  ctx: CanvasRenderingContext2D,
  line: readonly Point[],
  from: number,
  to: number,
): void => {
  const last = line.length - 1;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= last; i += 1) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(last, i + 1)];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / length;
    const ny = (b.x - a.x) / length;
    const half = mix(from, to, i / last) / 2;
    left.push(point(line[i].x + nx * half, line[i].y + ny * half));
    right.push(point(line[i].x - nx * half, line[i].y - ny * half));
  }
  const tip = line[last];
  const before = line[last - 1];
  const heading = Math.atan2(tip.y - before.y, tip.x - before.x);

  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.arc(
    tip.x,
    tip.y,
    to / 2,
    heading + Math.PI / 2,
    heading - Math.PI / 2,
    true,
  );
  for (const p of right.reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

const bowed = (from: Point, to: Point, bow: number): Point[] => {
  const control = point((from.x + to.x) / 2 - bow, (from.y + to.y) / 2);
  const points: Point[] = [];
  for (let i = 0; i <= LEG_SAMPLES; i += 1) {
    const t = i / LEG_SAMPLES;
    const m = 1 - t;
    points.push(
      point(
        m * m * from.x + 2 * m * t * control.x + t * t * to.x,
        m * m * from.y + 2 * m * t * control.y + t * t * to.y,
      ),
    );
  }
  return points;
};

/*
 * `offset` is the paw's keyed offset from its joint. Near the ground it is
 * pulled onto FOOT_Y, which the shadow shares, or the cat hovers on landing.
 */
const leg = (
  ctx: CanvasRenderingContext2D,
  root: Point,
  offset: Point,
  planted: number,
  width: readonly [number, number],
  bow: number,
): void => {
  const paw = point(
    root.x + offset.x,
    mix(root.y + offset.y, FOOT_Y - PAW.ry, planted),
  );
  taper(ctx, bowed(root, paw, bow), width[0], width[1]);
  ctx.beginPath();
  ctx.ellipse(paw.x + PAW.ahead, paw.y, PAW.rx, PAW.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

const drawLegs = (
  ctx: CanvasRenderingContext2D,
  frame: LeapFrame,
  pose: BodyPose,
  shift: number,
): void => {
  const planted = Math.max(frame.sit, 1 - frame.air * 3);
  const hip = place(pose, HIP);
  const shoulder = place(pose, SHOULDER);
  leg(
    ctx,
    point(shoulder.x + shift, shoulder.y),
    frame.fore,
    planted,
    FORE_WIDTH,
    LEG_BOW + CROUCH_BOW * frame.crouch,
  );
  leg(
    ctx,
    point(hip.x + shift, hip.y),
    frame.hind,
    planted,
    HIND_WIDTH,
    LEG_BOW,
  );
};

const drawTail = (
  ctx: CanvasRenderingContext2D,
  frame: LeapFrame,
  pose: BodyPose,
): void => {
  const line: Point[] = [place(pose, TAIL_ROOT)];
  for (const angle of frame.tail) {
    const last = line[line.length - 1];
    line.push(
      point(
        last.x + Math.cos(angle) * TAIL_SEGMENT,
        Math.min(TAIL_FLOOR, last.y + Math.sin(angle) * TAIL_SEGMENT),
      ),
    );
  }
  taper(ctx, line, TAIL_WIDTH[0], TAIL_WIDTH[1]);
};

/* The back rises through the shoulders into the neck, which the head covers. */
const bodyPath = (ctx: CanvasRenderingContext2D): void => {
  ctx.beginPath();
  ctx.moveTo(27, -25);
  ctx.bezierCurveTo(21, -20, 13, -18, 4, -18);
  ctx.bezierCurveTo(-8, -18, -18, -19, -25, -15);
  ctx.bezierCurveTo(-34, -10, -34, 4, -24, 8);
  ctx.bezierCurveTo(-12, 12, 9, 11, 20, 6);
  ctx.bezierCurveTo(26, 3, 30, -2, 32, -8);
  ctx.bezierCurveTo(33, -13, 34, -18, 36, -22);
  ctx.closePath();
};

/* A drumstick haunch: its back edge follows the rump, its point is the knee. */
const haunchPath = (ctx: CanvasRenderingContext2D): void => {
  ctx.beginPath();
  ctx.moveTo(-31, -3);
  ctx.bezierCurveTo(-31, -13, -13, -14, -10, -4);
  ctx.bezierCurveTo(-8, 3, -13, 9, -17, 11);
  ctx.bezierCurveTo(-24, 13, -31, 7, -31, -3);
  ctx.closePath();
};

const drawBody = (ctx: CanvasRenderingContext2D, pose: BodyPose): void => {
  ctx.save();
  applyBody(ctx, pose);
  bodyPath(ctx);
  ctx.fill();
  ctx.stroke();
  haunchPath(ctx);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

const earPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  lean: number,
): void => {
  ctx.save();
  ctx.translate(x, -5);
  ctx.rotate(lean);
  ctx.beginPath();
  ctx.moveTo(-5, 2);
  ctx.lineTo(-1.2, -10.5);
  ctx.quadraticCurveTo(0, -12.5, 1.2, -10.5);
  ctx.lineTo(5, 2);
  ctx.closePath();
  ctx.restore();
};

const drawHead = (
  ctx: CanvasRenderingContext2D,
  palette: HeroPalette,
  frame: LeapFrame,
  pose: BodyPose,
): void => {
  const neck = place(pose, NECK);
  ctx.save();
  ctx.translate(neck.x, neck.y);
  ctx.rotate(pose.angle * (1 - HEAD_LEVEL));

  earPath(ctx, 1.5, 0.28 - frame.earFlick);
  ctx.fill();
  ctx.stroke();
  earPath(ctx, -4.5, -0.12 + frame.earFlick);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, 0, HEAD.rx, HEAD.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  /* The muzzle's fill erases the head's edge inside it; its outer arc closes it. */
  ctx.beginPath();
  ctx.ellipse(MUZZLE.x, MUZZLE.y, MUZZLE.rx, MUZZLE.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    MUZZLE.x,
    MUZZLE.y,
    MUZZLE.rx,
    MUZZLE.ry,
    0,
    -Math.PI * 0.42,
    Math.PI * 0.72,
  );
  ctx.stroke();

  ctx.fillStyle = palette.border;
  ctx.beginPath();
  ctx.arc(MUZZLE.x + MUZZLE.rx - 0.6, MUZZLE.y - 2.2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  if (frame.blink) {
    ctx.beginPath();
    ctx.arc(3.4, -2.6, 2, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(3.6, -2.2, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = LINE_WIDTH * 0.45;
  ctx.beginPath();
  ctx.moveTo(MUZZLE.x + 2, MUZZLE.y + 0.5);
  ctx.lineTo(MUZZLE.x + 13, MUZZLE.y - 1.5);
  ctx.moveTo(MUZZLE.x + 2, MUZZLE.y + 1.8);
  ctx.lineTo(MUZZLE.x + 13, MUZZLE.y + 2.8);
  ctx.stroke();
  ctx.restore();
};

/*
 * Every closed shape fills with the page colour before stroking, or limbs and
 * grass show through. Ink is `border` to match the field.
 */
export const drawCat = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  frame: LeapFrame,
  palette: HeroPalette,
): void => {
  const pose = poseOf(frame);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.border;
  ctx.fillStyle = palette.background;
  ctx.lineWidth = LINE_WIDTH;

  ctx.globalAlpha = FAR_ALPHA;
  drawLegs(ctx, frame, pose, FAR_SHIFT);
  ctx.globalAlpha = 1;
  drawTail(ctx, frame, pose);
  drawLegs(ctx, frame, pose, 0);
  drawBody(ctx, pose);
  drawHead(ctx, palette, frame, pose);

  ctx.restore();
};
