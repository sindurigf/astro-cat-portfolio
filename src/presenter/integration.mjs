/*
 * Injected only for `astro dev`, so speaker notes can never reach dist/
 * (tests/talk.spec.ts checks). Not a guarded page under src/pages/: a
 * prerendered page is built whatever its body does.
 */
export const presenter = () => ({
  name: 'talk-presenter',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command !== 'dev') return;
      injectRoute({
        pattern: '/talks/[deck]/presenter',
        entrypoint: './src/presenter/presenter.astro',
        prerender: false,
      });
    },
  },
});
