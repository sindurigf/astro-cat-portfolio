import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { NODE } from './tags';
import { PAD, SHEET } from '../src/lib/about-cats-sheet';
import { frameHeight } from '../src/lib/about-cats-frames';
import { HOME_CAT, POSE_FRAMES } from '../src/lib/home-cat';

const HOME_CSS = 'src/styles/components/home.css';
/* Sheet pixels are twice the drawn size; the foot is the ground line, PAD below the cat's own box top plus its height. */
const SHEET_SCALE = 2;

/* Build correctness: home.css draws the homepage cat by number from its About sheet, so the numbers must be the sheet's. */
test.describe('the homepage cat', NODE, () => {
  test('home.css draws each pose from the sheet frame POSE_FRAMES gives it', () => {
    const css = readFileSync(HOME_CSS, 'utf8');
    const read = (block: string, name: string) =>
      Number(new RegExp(`--${name}:\\s*(-?[\\d.]+);`).exec(block)?.[1]);
    for (const [pose, frame] of Object.entries(POSE_FRAMES)) {
      const [x, y, w, h, , , , ownH] = SHEET[HOME_CAT][frame];
      const block =
        new RegExp(
          `\\.home-cat\\[data-pose='${pose}'\\] > i \\{([^}]*)\\}`,
        ).exec(css)?.[1] ?? '';
      expect(
        {
          x: read(block, 'x'),
          y: read(block, 'y'),
          w: read(block, 'w'),
          h: read(block, 'h'),
          fx: read(block, 'fx'),
          fy: read(block, 'fy'),
        },
        `home.css draws the ${pose} pose from another frame than ${frame}.`,
      ).toEqual({
        x,
        y,
        w,
        h,
        fx: w / SHEET_SCALE,
        fy: Number((SHEET_SCALE * (PAD + ownH)).toFixed(1)),
      });
    }
  });

  test("home.css names the cat's own sheet at its real width", async () => {
    const css = readFileSync(HOME_CSS, 'utf8');
    const src = `src/assets/about-cats-${HOME_CAT}.avif`;
    const { width = 0 } = await sharp(src).metadata();
    expect(width, `${src} has no width`).toBeGreaterThan(0);
    expect(
      css,
      `home.css draws the cat from another sheet than ${src}.`,
    ).toContain(`url('../../assets/about-cats-${HOME_CAT}.avif')`);
    expect(
      css,
      'home.css sizes the sheet to another width than the file has.',
    ).toContain(`background-size: calc(${width} * var(--k)) auto;`);
  });

  test('every pose keeps the cat one size at one scale', () => {
    for (const frame of Object.values(POSE_FRAMES)) {
      const [, , , , , , ownW, ownH] = SHEET[HOME_CAT][frame];
      expect(
        frameHeight(HOME_CAT, frame, ownW, ownH),
        `the ${frame} frame is drawn at another size than its own on /about, so one scale here changes the cat's size.`,
      ).toBeCloseTo(ownH, 1);
    }
  });
});
