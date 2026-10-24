/** `value`, or a thrown error naming the missing `what`. */
export const defined = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`Missing ${what}`);
  return value;
};

/** `list[index]`, or a thrown RangeError when `index` is outside `list`. */
export const itemAt = <T>(list: readonly T[], index: number): T => {
  const item = list[index];
  if (item === undefined)
    throw new RangeError(
      `Index ${index} is outside a list of ${list.length} items`,
    );
  return item;
};
