/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly POSTS_PER_PAGE?: string;
}

/*
 * Astro reaches bindings only through `cloudflare:workers`
 * (`Astro.locals.runtime.env` throws). Every ContactEnv field is optional, so
 * each caller handles a missing binding at runtime.
 */
declare module 'cloudflare:workers' {
  import type { ContactEnv } from './lib/contact-env';
  export const env: ContactEnv;
}
