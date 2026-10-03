// Firefox scrolls a focused element only when none of it is on screen, so a partly
// visible control stays under the sticky header: https://github.com/mozilla-firefox/firefox/blob/9fe49371caf63b6192901f006b61769fdcee38a2/dom/base/nsFocusManager.cpp#L3225-L3226
// Keyboard focus only, so a click never moves the page.
document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.matches(':focus-visible')) {
    target.scrollIntoView({ block: 'nearest' });
  }
});
