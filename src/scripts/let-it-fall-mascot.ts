/*
 * The footer mascot's climb onto the Let It Fall heap: its own drawing crouches
 * (squash), leaps on an arc (stretch), lands (squash) and tips to look around.
 * Never mirrored, so its pink throw stays bottom right. Decorative and aria-hidden.
 */
export type Foot = { x: number; y: number };

/*
 * ms: the beat before the first hop so the eye finds the mascot, a hop's crouch, flight
 * and landing (about 630 in all), the pause between hops, the hold on top and each glance.
 */
const BEAT_MS = 300;
const CROUCH_MS = 150;
const HOP_MS = 380;
const LAND_MS = 50;
const BREATH_MS = 250;
const HOLD_MS = 400;
const LOOK_MS = 260;
const GLANCES = 2;
/* deg the box tips to each side for a glance, toward the way it hops in the air. */
const GLANCE_TIP = 6;
const HOP_TIP = 4;
/* px of arc above the higher end of a hop, plus this share of the climb. */
const ARC = 64;
const CLIMB_ARC_SHARE = 0.35;
/* Squash at takeoff and landing, stretch in the air, as scale x and y. */
const CROUCH_SQUASH = [1.08, 0.86];
const LAND_SQUASH = [1.1, 0.84];
const AIR_STRETCH = [0.94, 1.08];
const REST = [1, 1];
const AIR_STRETCH_SHARE = 0.4;

/* A new fall, Put It Back or a stop cancels a running move on purpose; anything else is a real error. */
export const ignoreCancel = (error: unknown): void => {
  if (!(error instanceof DOMException && error.name === 'AbortError')) {
    reportError(error);
  }
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

export const createHopper = (sticker: HTMLImageElement) => {
  const host = sticker.offsetParent;
  if (!(host instanceof HTMLElement)) {
    throw new Error('let-it-fall: the footer mascot has no positioned parent.');
  }
  const feet = document.createElement('span');
  const squash = document.createElement('span');
  const drawing = document.createElement('img');
  feet.className = 'fall-hopper';
  feet.setAttribute('aria-hidden', 'true');
  drawing.alt = '';
  drawing.src = sticker.currentSrc || sticker.src;
  squash.append(drawing);
  feet.append(squash);

  let run = 0;
  let at: Foot = { x: 0, y: 0 };
  /* Where it is drawn now, mid-flight included. */
  let shown: Foot = { x: 0, y: 0 };
  let tip = 0;

  /* Viewport points to the host's own coordinates, which scroll with the page. */
  const local = ({ x, y }: Foot): Foot => {
    const origin = host.getBoundingClientRect();
    return { x: x - origin.left, y: y - origin.top };
  };
  const place = ({ x, y }: Foot) => {
    shown = { x, y };
    feet.style.setProperty(
      'transform',
      `translate(${x}px, ${y}px) rotate(${tip}deg)`,
    );
  };
  /* Held in its style once played, so no finished animation lingers. */
  const squashTo = async ([x, y]: number[], duration: number) => {
    const to = `scale(${x}, ${y})`;
    await squash.animate([{ transform: to }], { duration, easing: 'ease-out' })
      .finished;
    squash.style.setProperty('transform', to);
  };
  const flight = (from: Foot, to: Foot, height: number, mine: number) =>
    new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (now: number) => {
        if (mine !== run) return resolve();
        const t = Math.min(1, (now - start) / HOP_MS);
        const u = easeInOut(t);
        place({
          x: from.x + (to.x - from.x) * u,
          y: from.y + (to.y - from.y) * u - height * 4 * u * (1 - u),
        });
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

  const hop = async (to: Foot, mine: number) => {
    place(at);
    await squashTo(CROUCH_SQUASH, CROUCH_MS);
    if (mine !== run) return;
    squashTo(AIR_STRETCH, HOP_MS * AIR_STRETCH_SHARE).catch(ignoreCancel);
    tip = Math.sign(to.x - at.x) * HOP_TIP;
    const climb = Math.max(0, at.y - to.y);
    await flight(at, to, ARC + climb * CLIMB_ARC_SHARE, mine);
    if (mine !== run) return;
    at = to;
    tip = 0;
    place(at);
    await squashTo(LAND_SQUASH, LAND_MS);
    if (mine !== run) return;
    await squashTo(REST, LAND_MS);
  };

  const lookAround = async (mine: number) => {
    for (let glance = 0; glance < GLANCES && mine === run; glance++) {
      tip = glance % 2 === 0 ? -GLANCE_TIP : GLANCE_TIP;
      place(at);
      await wait(LOOK_MS);
    }
    tip = 0;
    if (mine === run) place(at);
  };

  const home = (): Foot => {
    const box = sticker.getBoundingClientRect();
    return local({ x: box.left + box.width / 2, y: box.bottom });
  };

  const stop = () => {
    run++;
    for (const animation of squash.getAnimations()) animation.cancel();
    squash.style.removeProperty('transform');
    feet.remove();
    feet.removeAttribute('data-settled');
    sticker.removeAttribute('data-away');
  };

  return {
    local,
    stop,
    /* Leaves the sticker for the hopper and climbs the stones, in the host's coordinates from `local`, to the last; `size` scales the drawing. */
    async climb(stones: Foot[], size: number) {
      const mine = ++run;
      await drawing.decode();
      if (mine !== run) return;
      const box = sticker.getBoundingClientRect();
      const wide = box.width * size;
      const tall = box.height * size;
      drawing.style.setProperty('width', `${wide}px`);
      drawing.style.setProperty('height', `${tall}px`);
      drawing.style.setProperty('left', `${-wide / 2}px`);
      drawing.style.setProperty('top', `${-tall}px`);
      at = home();
      tip = 0;
      place(at);
      /* The surfaces it lands on, in the host's coordinates, for tests/let-it-fall.spec.ts. */
      feet.dataset.stones = JSON.stringify(stones);
      host.append(feet);
      sticker.setAttribute('data-away', '');
      await wait(BEAT_MS);
      for (const [index, stone] of stones.entries()) {
        if (mine !== run) return;
        if (index) await wait(BREATH_MS);
        if (mine !== run) return;
        await hop(stone, mine);
      }
      if (mine !== run) return;
      await wait(HOLD_MS);
      if (mine !== run) return;
      await lookAround(mine);
      if (mine === run) feet.setAttribute('data-settled', '');
    },
    /* One leap home, since the heap climbs home under it at once; then the sticker is back. */
    async goHome() {
      const mine = ++run;
      feet.removeAttribute('data-settled');
      for (const animation of squash.getAnimations()) animation.cancel();
      /* From wherever it is, mid-flight included. */
      at = shown;
      if (feet.isConnected) await hop(home(), mine);
      if (mine === run) stop();
    },
  };
};

export type Hopper = ReturnType<typeof createHopper>;
