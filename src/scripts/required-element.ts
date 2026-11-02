/** The element `selector` finds in `root`, checked to be a `type`; markup that does not match throws. */
export const requiredElement = <T extends Element>(
  root: ParentNode,
  selector: string,
  type: abstract new () => T,
): T => {
  const node = root.querySelector(selector);
  if (!(node instanceof type))
    throw new Error(`${selector} is missing or not a ${type.name}.`);
  return node;
};
