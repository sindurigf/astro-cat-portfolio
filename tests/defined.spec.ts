import { expect, test } from './test';
import { NODE } from './tags';
import { defined, itemAt } from '../src/lib/defined';

/** The index guards in src/lib/defined.ts: a present value passes, a missing one throws by name. */

test.describe('defined', NODE, () => {
  test('returns a present value, falsy ones included', () => {
    expect(defined(0, 'count')).toBe(0);
    expect(defined('', 'label')).toBe('');
  });

  test('throws naming what is missing', () => {
    expect(() => defined(undefined, 'the /Root object')).toThrow(
      'Missing the /Root object',
    );
  });
});

test.describe('itemAt', NODE, () => {
  test('returns the item at an index inside the list', () => {
    expect(itemAt(['a', 'b'], 1)).toBe('b');
  });

  test('throws a RangeError past either end', () => {
    expect(() => itemAt(['a', 'b'], 2)).toThrow(RangeError);
    expect(() => itemAt(['a', 'b'], -1)).toThrow(
      'Index -1 is outside a list of 2 items',
    );
  });
});
