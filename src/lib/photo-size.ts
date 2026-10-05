import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

/** A photo's own width and height, for an `.aspect-sizer` frame that shows it uncropped. */
export const photoSize = async (image: ImageMetadata) => {
  /* Via getImage, not `image.width`: reading the Proxy ships the original (check:untransformed). */
  const { options } = await getImage({ src: image });
  if (options.width === undefined || options.height === undefined) {
    throw new Error(`photoSize: no size for ${image.src}.`);
  }
  return { width: options.width, height: options.height };
};
