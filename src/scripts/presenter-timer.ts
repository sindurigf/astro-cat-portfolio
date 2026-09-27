/*
 * The button's name is its action, with no `aria-pressed`, as for the hero's
 * pause control. The time is not a live region, which would speak every second.
 */

const SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const format = (seconds: number): string =>
  `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(
    seconds % SECONDS_PER_MINUTE,
  ).padStart(2, '0')}`;

const toggle = document.querySelector<HTMLButtonElement>('[data-timer-toggle]');
const display = document.querySelector<HTMLTimeElement>('[data-timer]');

if (toggle && display) {
  let elapsed = 0;
  let startedAt: number | undefined;
  let tick: number | undefined;

  const seconds = () =>
    Math.floor(
      (elapsed + (startedAt === undefined ? 0 : Date.now() - startedAt)) /
        SECOND,
    );

  const render = () => {
    display.textContent = format(seconds());
    display.dateTime = `PT${seconds()}S`;
  };

  toggle.addEventListener('click', () => {
    if (startedAt === undefined) {
      startedAt = Date.now();
      tick = window.setInterval(render, SECOND);
      toggle.textContent = 'Pause timer';
    } else {
      elapsed += Date.now() - startedAt;
      startedAt = undefined;
      window.clearInterval(tick);
      toggle.textContent = 'Start timer';
    }
    render();
  });
}
