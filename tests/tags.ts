/** Tests that never open a page: the `node` project runs them once, the browser projects skip them. */
export const NODE_TAG = '@node';

export const NODE = { tag: NODE_TAG } as const;

/** Tests that read only markup and attributes, the same in every engine: Chromium runs them, the other browsers skip them. */
export const ENGINE_INVARIANT_TAG = '@engine-invariant';

export const ENGINE_INVARIANT = { tag: ENGINE_INVARIANT_TAG } as const;
