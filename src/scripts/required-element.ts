/** Finds elements for the script named `scope`; markup that is missing or the wrong type throws, naming both. */
export const requiredElementIn =
  (scope: string) =>
  <T extends Element>(
    root: ParentNode,
    selector: string,
    type: abstract new () => T,
  ): T => {
    const node = root.querySelector(selector);
    if (!(node instanceof type))
      throw new Error(
        `${scope}: ${selector} is missing or not a ${type.name}.`,
      );
    return node;
  };
