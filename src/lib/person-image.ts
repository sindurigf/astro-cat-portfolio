import { getImage } from 'astro:assets';

/*
 * Injected by `vite.define` in astro.config.mjs: false in the on-demand bundle,
 * where the import below would make the build ship the original photo
 * (scripts/check-untransformed.mjs).
 */
declare const __PRERENDERED__: boolean;

const PERSON_IMAGE_WIDTH = 640;

/** The Person's portrait as built, absolute; none on the on-demand route. */
export const personImageUrl = async (site: URL): Promise<URL | undefined> => {
  if (!__PRERENDERED__) return undefined;
  const portrait = await getImage({
    src: import('../assets/photos/tabby-duvet.jpg'),
    width: PERSON_IMAGE_WIDTH,
  });
  return new URL(portrait.src, site);
};
