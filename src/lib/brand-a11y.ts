/* What each /brand part keeps for accessibility, by part id. */
export const PART_ACCESSIBILITY: Readonly<Record<string, string>> = {
  'primary-button':
    '4px focus ring, 44px target, and unavailable stays focusable with aria-disabled.',
  'secondary-button': 'Same ring, target and unavailable state as the primary.',
  'gold-buttons': 'The focus ring turns dark on gold.',
  'text-links': 'Underlined at rest, so color is never the only cue.',
  'standalone-links': 'A 44px minimum height keeps the target large enough.',
  card: 'Text on the gold block reads at 7:1 or more.',
  'card-solid': 'Ink text on the light fill reads at 7:1 or more.',
  'post-card': 'One tab stop: only the title is a link.',
  'fact-strip':
    'A description list, so each label stays paired with its value.',
  'pause-control': 'The name says what pressing it will do.',
  'sleep-control': 'The name says what pressing it will do.',
  'theme-switch': 'Shows the theme in use; the menu marks the choice.',
  'focus-ring': 'Never removed: 4px with a gap on every control.',
  form: 'Visible labels, required fields said in words, and a submit that is never disabled.',
  'hero-full': "The page's only h1.",
  chips: 'The current chip carries a marker, never color alone.',
  'tag-chips': "Each chip leads to the tag's page.",
  breadcrumb: 'The slashes are hidden from screen readers.',
  pager: 'The current page is marked and read as Page 1.',
  'contents-list':
    'A native details element: no script, and it works from the keyboard.',
  'photo-strip':
    'The strip takes keyboard focus, and shows its arrows, only while it overflows.',
  prose: 'Links are underlined; lines run about 70 characters.',
  'code-block':
    'Takes keyboard focus while it overflows, so a keyboard can scroll it.',
};
