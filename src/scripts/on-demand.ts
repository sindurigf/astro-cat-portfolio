/* Contract and rejected alternatives: ARCHITECTURE.md "Scripts loaded on demand". */
const triggers = document.querySelectorAll<HTMLElement>('[data-on-demand]');
const loads = new Map<string, Promise<unknown>>();

const run = (trigger: HTMLElement): void => {
  const url = trigger.dataset.onDemand!;
  let load = loads.get(url);
  if (!load) loads.set(url, (load = import(url)));
  load.then(
    () => trigger.dispatchEvent(new Event('on-demand')),
    (error: unknown) => {
      loads.delete(url);
      reportError(error);
    },
  );
};

for (const trigger of triggers) trigger.hidden = false;

addEventListener('click', (event) => {
  const trigger = (event.target as Element).closest<HTMLElement>(
    '[data-on-demand]',
  );
  if (trigger) run(trigger);
});

export {};
