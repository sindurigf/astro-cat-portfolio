import { expect, test } from './test';
import { packRows, stackRows, wallClasses, wallSteps } from '../src/lib/wall';
import { NODE } from './tags';

test.describe('wall steps', () => {
  test('packs spans into rows of the given columns', NODE, () => {
    expect(packRows([2, 1, 1, 2], 2)).toEqual([[0], [1, 2], [3]]);
    expect(packRows([2, 1], 3)).toEqual([[0, 1]]);
  });

  test(
    'one row climbs right: the last of two rises fully, the second of three by half',
    NODE,
    () => {
      expect(wallSteps([[0, 1]], 2).rise).toEqual([0, 2]);
      expect(wallSteps([[0, 1, 2]], 3).rise).toEqual([0, 1, 2]);
    },
  );

  test(
    'stacked rows bring the right edge in, at most twice, and never rise',
    NODE,
    () => {
      const { rise, step } = wallSteps(stackRows(4), 4);
      expect(rise).toEqual([0, 0, 0, 0]);
      expect(step).toEqual([0, 1, 2, 2]);
    },
  );

  test(
    'a brick spanning rows takes no step; the last brick of each row does',
    NODE,
    () => {
      expect(
        wallSteps(
          [
            [0, 1],
            [0, 2],
          ],
          3,
        ).step,
      ).toEqual([0, 0, 1]);
    },
  );

  test(
    'classes change only where a breakpoint changes the layout',
    NODE,
    () => {
      const { wall, bricks } = wallClasses({ lg: [[0, 1]] }, 2);
      expect(wall).toBe('lg:card-rise-room');
      expect(bricks).toEqual([
        '',
        'card-step-1 lg:card-rise-full lg:card-step-0',
      ]);
    },
  );
});
