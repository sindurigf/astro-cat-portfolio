/** Tests that never open a page: the `node` project runs them once, the browser projects skip them. */
export const NODE_TAG = '@node';

export const NODE = { tag: NODE_TAG } as const;
