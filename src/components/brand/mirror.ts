/*
 * The light half's copy of live markup: inert and hidden, so ids, labels and
 * references go, and headings become divs that keep the heading look.
 */
export const inertCopy = (html: string): string =>
  html
    .replace(
      /\s(?:id|for|name|form|popovertarget|aria-(?:labelledby|describedby|controls))="[^"]*"/g,
      '',
    )
    .replace(/<h[1-6]\b/g, '<div data-heading')
    .replace(/<\/h[1-6]>/g, '</div>');
