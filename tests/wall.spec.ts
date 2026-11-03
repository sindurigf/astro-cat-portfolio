import { expect, test } from './test';
import { packRows, wallClasses } from '../src/lib/wall';
import { NODE } from './tags';

test.describe('wall steps', () => {
  test('packs spans into rows of the given columns', NODE, () => {
    expect(packRows([2, 1, 1, 2], 2)).toEqual([[0], [1, 2], [3]]);
    expect(packRows([2, 1], 3)).toEqual([[0, 1]]);
  });

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
