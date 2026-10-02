# Manual accessibility testing

The checks a machine cannot decide, for every route in `tests/routes.ts`.
Automated coverage is in [ACCESSIBILITY.md](../ACCESSIBILITY.md) §6.

Results: filled blanks stay in this file. A passed check goes in
ACCESSIBILITY.md [§6 Manual](../ACCESSIBILITY.md#manual); a failed or
unreached check goes in its [§7 Known gaps](../ACCESSIBILITY.md#7-known-gaps).

## Setup

```sh
npm run build && npm run preview   # http://localhost:4340
```

- `preview` serves on 4340, clear of the test ports (`tests/ports.ts`). If
  4340 is taken, `astro preview` logs the port it picked.
- Astro may background `preview`; `ps aux | grep astro` finds a stale one.
- A number that changes between two attempts is environmental until proved
  otherwise. Record browser, version, viewport and zoom beside every number:
  headless Chromium gives a 320px viewport a 320px box, headed Chrome 305px.
- Checks that need real sentences: `/career`,
  `/blog/sample-talk`, `/privacy`, `/accessibility`.

| Tool          | Needed for | Platform                       |
| ------------- | ---------- | ------------------------------ |
| Google Chrome | all but §6 | any                            |
| Firefox       | §2, §6, §8 | any                            |
| Orca          | §6, §13    | Linux (tested: GNOME, Wayland) |
| NVDA          | §6.10      | Windows                        |
| VoiceOver     | §6.10, §8  | macOS, iOS                     |

### Teardown

| Setting                     | Set in                        | Restore                                                                 |
| --------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Orca Capitalization style   | `Orca+Space` → Voice, §6.4    | The value recorded in §6.4.1                                            |
| Firefox "Zoom text only"    | Settings → General → Zoom, §7 | Untick, then Ctrl+0                                                     |
| GNOME animations            | `gsettings`, §4               | `gsettings set org.gnome.desktop.interface enable-animations true`      |
| Browser zoom                | Ctrl+`+`, §3 and §7           | Ctrl+0 in every window                                                  |
| Orca and its log            | §6.1                          | `Super+Alt+S`, `rm /tmp/orca-pass.log`                                  |
| GTK `toolkit-accessibility` | §6.1 fallback only            | `gsettings set org.gnome.desktop.interface toolkit-accessibility false` |

- [ ] Teardown done.

## 1. Keyboard: header and footer

Setup: Chrome, 1280px, `/`, focus in the address bar.

- [ ] First Tab lands on "Skip to main content", visible at top left. → SC 2.4.1, 2.4.7
- [ ] Enter on it: focus moves to main, which shows a cyan outline. → SC 2.4.1
- [ ] Next Tab reaches the first control in the page (the hero pause control on `/`), not the header. → SC 2.4.1
- [ ] Reload and Tab through: skip link, logo, About, Career, Blog, Get in
      touch, the page, footer Site (Home, About, Career, Blog), About this site
      (Accessibility, Privacy, Credits), Social (GitHub, LinkedIn, Instagram,
      Bluesky, Mastodon, Email). Re-read `Footer.astro` when a footer
      link changes. → SC 2.4.3
- [ ] Every stop shows a cyan ring with a visible gap. → SC 2.4.7
- [ ] Shift+Tab back out: the order reverses exactly. → SC 2.1.2
- [ ] No stop swallows Tab, Escape or arrow keys. → SC 2.1.2
- [ ] The footer mascot is never a tab stop. → SC 1.1.1

## 2. The mobile menu, keyboard only

Setup: Chrome at 375px. No mouse.

- [ ] The menu button shows a focus ring. → SC 2.4.7
- [ ] Enter opens the panel; Escape closes; Space reopens. → SC 2.1.1
- [ ] On open, focus is on the first link. → SC 2.4.3
- [ ] Tab cycles Home, About, Career, Blog, Get in touch, Close, one stop in
      the browser UI (correct `<dialog>` behaviour), Home. Focus never reaches
      the page behind. → SC 2.1.2
- [ ] Shift+Tab from the first item goes to Close. → SC 2.1.2
- [ ] Escape closes and focus returns to the menu button. → SC 2.1.2, 2.4.3
- [ ] Close button: focus returns to the menu button. → SC 2.4.3
- [ ] A nav link activated with Enter navigates. → SC 2.1.1
- [ ] Arrow keys and Page Down do not scroll the page behind. → SC 2.1.1
- [ ] Repeat in Firefox. → SC 2.1.2

## 3. Reflow: 400% zoom at 1280px

Setup: Chrome, window 1280px wide, Ctrl+`+` to 400% (about 320px CSS).
Resizing is not zooming, so this stays manual even though
`tests/reflow.spec.ts` covers the widths.

- [ ] No horizontal scrollbar. → SC 1.4.10
- [ ] No heading cut mid-word (e.g. `ANNOUNCEM / ENTS`); if one is, it needs a
      soft hyphen. → SC 1.4.10
- [ ] Content sits 16px from both edges: box 273px at a real 305px viewport. → SC 1.4.10
- [ ] Card content box on a category route, measured: `______` px on
      `__________` at `____` px, `____`%, in `__________`. → SC 1.4.10
- [ ] The mobile menu button replaces the desktop nav and the menu is fully
      operable. → SC 1.4.10
- [ ] Nothing overlaps or is cut off. → SC 1.4.10
- [ ] Tab through: the 96px sticky header never covers the focused element. → SC 2.4.11
- [ ] Repeat on `/blog/sample-talk`. → SC 1.4.10, 2.4.11
- [ ] Repeat at 200% and 250%. → SC 1.4.10
- [ ] Repeat at 400% in a window 1024px tall (256px CSS): the header does not
      fill the screen and the focused element stays in view. → SC 1.4.10, 2.4.11

## 4. Reduced motion

Setup: `gsettings set org.gnome.desktop.interface enable-animations false`.
`matchMedia('(prefers-reduced-motion: reduce)').matches` returns `true`.

- [ ] Press and hold a primary button, a `/blog` chip, a footer sticker and
      the logo: each loses its shadow but does not move. → SC 2.3.3
- [ ] Nothing else moves, fades or slides. → SC 2.3.3
- [ ] `/`: the hero field is drawn once, reads as a picture, and has no pause
      control. → SC 2.3.3, 2.2.2
- [ ] `/about`: the cats sit still and have no sleep controls. → SC 2.3.3, 2.2.2
- [ ] Turn it back on: the button moves and the field animates. → SC 2.3.3

## 5. Focus indicator visibility

The ring is 4px cyan at a 4px offset plus the element's shadow (4px or 8px);
`#131313` on gold. Look, do not measure.

- [ ] On `#131313`: header links, footer. → SC 1.4.11, 2.4.7
- [ ] On `#1A1A1A`: a link in a card. → SC 1.4.11, 2.4.7
- [ ] Chips and footer tiles: the ring sits past the pink shadow, follows the
      tilt, and never touches the next chip. → SC 1.4.11, 2.4.7
- [ ] Current nav item and current chip: the ring reads as separate from the
      block. → SC 1.4.11, 2.4.7
- [ ] Logo and contact cards (8px shadow, ring 12px out): the ring still reads
      as belonging to the control. → SC 1.4.11, 2.4.7
- [ ] Gold skip link and "Get in touch": the ring is on the dark ground, never
      on gold. → SC 1.4.11
- [ ] On a gold slab or band: the `#131313` ring is visible. → SC 1.4.11
- [ ] No ring is clipped by a parent or hidden under the header. → SC 2.4.11
- [ ] Focus is never shown by shadow alone. → SC 2.4.7

## 5a. Header height, roundel and hero edge

### 5a.1 The header at short viewport heights

Setup: Chrome at about 740x380. `short:static` makes the header static below
30rem (480px) of height.

- [ ] Below 30rem the header scrolls away; above, it is sticky. Check both
      sides. → SC 1.4.10
- [ ] Shift+Tab up the page at 740x380: no control lands under the header. → SC 2.4.11
- [ ] The nav fits on one line, nothing wraps mid-word or overlaps. → SC 1.4.10

### 5a.2 The roundel and the gold hero edge

Setup: `/career`, `/contact`, `/blog`; `/about` (photo) as the control.

Forced colours (DevTools → Rendering → forced-colors: active, or the OS
high-contrast theme):

- [ ] The roundel is a disc with a visible edge. → SC 1.4.11
- [ ] The bottom of the hero is findable. Say what marks it; "nothing" is a
      finding. → SC 1.4.1
- [ ] The `h1` and buttons are readable; a focused control shows a ring. → SC 1.4.11, 2.4.7

Zoom (forced colours off, 1280px, 200% then 400%):

- [ ] The roundel covers no text in the hero or below. Its `16vw` term does
      not grow with zoom. → SC 1.4.10
- [ ] At 400% it is at its 3.5rem floor and still on the edge. → SC 1.4.10
- [ ] Repeat on `/contact`. → SC 1.4.10

## 6. Screen reader: the Orca pass

Closes part of ACCESSIBILITY.md §7 gap 2. Firefox throughout, except §6.4,
which needs Chrome: only Chromium puts the `text-transform` string into the
accessibility tree. A strange Chrome result is a question, not a finding.

Run order: 6.4, 6.5, 6.12.1, 6.6 to 6.9, 6.12.2 to 6.12.5. 6.12.1 goes after
6.5 because its failure is silence, which means nothing until 6.5 proves Orca
is speaking.

### 6.1 Setting up

```sh
npm run build && npm run preview                     # terminal 1
orca --replace --debug-file=/tmp/orca-pass.log &     # terminal 2
tail -f /tmp/orca-pass.log | grep --line-buffered "SPEECH OUTPUT"   # terminal 3
```

- The log is the transcript: paste `SPEECH OUTPUT` lines, do not paraphrase.
- `Super+Alt+S` toggles Orca; `pkill -f orca` if it hangs.
- Browser silent: restart it with Orca running; then
  `gsettings set org.gnome.desktop.interface toolkit-accessibility true` and
  restart again.
- Chrome still silent: leave the §6.4 blanks empty and say so.
- Detach DevTools into its own window before using it, or Orca reads it.

### 6.2 The keys you need

The Orca modifier is `CapsLock` (Laptop layout) or `Insert` (Desktop). `Orca+H`
enters Learn Mode, `Esc` leaves it.

| Key                 | Action                               |
| ------------------- | ------------------------------------ |
| `Super+Alt+S`       | Orca on and off                      |
| `Orca+S`            | Silence speech, and back on          |
| `Orca+V`            | Toggle verbosity                     |
| `Orca+Return`       | Where Am I (keypad Enter on Desktop) |
| `Orca+Slash`        | Read the window title                |
| `Orca+Space`        | Preferences                          |
| `Orca+Z`            | Single-letter navigation off and on  |
| `Tab` / `Shift+Tab` | Move focus                           |
| `Up` / `Down`       | Previous / next line                 |
| `Ctrl+Home`         | Top of the document                  |
| `H` / `Shift+H`     | Next / previous heading              |
| `1` to `6`          | Next heading at that level           |
| `Alt+Shift+H`       | List headings                        |
| `K` / `Shift+K`     | Next / previous link                 |
| `Alt+Shift+K`       | List links                           |
| `M` / `Shift+M`     | Next / previous landmark             |
| `Alt+Shift+M`       | List landmarks                       |
| `B`                 | Next button                          |
| `G`                 | Next image                           |
| `L` / `I`           | Next list / list item                |

Single-letter keys type into the form fields on `/contact`; leave the field
first.

### 6.3 How to fill this in

Write what you heard word for word, or paste the `SPEECH OUTPUT` line. An
empty blank is an untested check; a ticked box with an empty blank is not
valid.

### 6.4 The uppercase question

Chromium exposes markup `About` as the name `"ABOUT"`; Firefox and WebKit do
not transform it. What a reader says for an all-caps name is unverified. The
answer applies to every heading, `.label`, `.badge`, button, `.nav-cta`, menu
link and the skip link.

**6.4.1** Record Orca's Capitalization style, then set it to None.

- [ ] It was: `________________________`

**6.4.2 Firefox (control).** `/about` at 1280px, click the page, `Ctrl+Home`,
`K` to the header link Career, then `Orca+Return`.

- [ ] Heard: `________________________`
- [ ] `SPEECH OUTPUT:` `________________________`

**6.4.3 Chrome.** The same steps.

- [ ] Heard: `________________________`
- [ ] `SPEECH OUTPUT:` `________________________`

**6.4.4 Outcomes.**

1. Both read "career": replace "untested" in STYLEGUIDE.md
   [Uppercase](STYLEGUIDE.md#uppercase) with both quotes, and narrow
   ACCESSIBILITY.md §7 gap 2.
2. Chrome spells it out, Firefox does not: record it as a cross-engine
   difference; it supports keeping sentence case in the markup.
3. Anything else: record verbatim, repeat once, do not interpret.

No outcome changes the practice: sentence case in markup, `text-transform` in
CSS. Dropping uppercase would be a design decision, not a fix.

**6.4.5 Chrome, other elements.**

- [ ] `/privacy` `h1` ("Privacy"): `________________________`
- [ ] `/404` "Go to the homepage" (`.btn-primary`): `________________________`
- [ ] 6.4.3 again at the other verbosity (`Orca+V`): `________________________`

### 6.5 Skip link

Setup: Firefox, 1280px, `/`, click the address bar, Tab once.

- [ ] It is the first thing announced, as "Skip to main content". → SC 2.4.1, 2.4.4
- [ ] Enter: something is announced. → SC 2.4.1
- [ ] `Down` reads from inside main (pause control or `h1`), not the header:
      the reading cursor moved. → SC 2.4.1
- [ ] Tab lands on the hero pause control (the next control under reduced
      motion). → SC 2.4.1

Heard: `________________________`

### 6.6 Header, footer, landmarks and headings

Setup: Firefox, 1280px, `/about`, JavaScript on. Re-derive the counts from the
build after any change to `/about`.

- [ ] `Alt+Shift+M` lists 13 landmarks: banner, navigation "Primary", main,
      navigation "On this page", five regions (one per `SECTIONS` entry in
      `src/pages/about.astro`),
      contentinfo, navigation "Site", "About this site", "Social". None
      unnamed or duplicated. Judge whether the list is useful or crowded. → SC 1.3.1
- [ ] `M` from the top steps through them in that order. → SC 1.3.1
- [ ] `Alt+Shift+H` lists six headings: `h1` "About me", then one `h2` per
      spread. The "On this page" nav lists all five spreads. → SC 1.3.1, 2.4.6
- [ ] `G` skips the header logo mark; the home link is `site.name`. → SC 1.1.1
- [ ] `G` finds no footer mascot. → SC 1.1.1
- [ ] `K` to About: announced as the current page. → SC 4.1.2
- [ ] The current-page box adds nothing to the announcement. → SC 1.3.1
- [ ] `Alt+Shift+K`: every link name stands alone; no two destinations share
      a name. → SC 2.4.4
- [ ] Nothing is announced twice in a row. → SC 1.3.1

Heard / listed: `________________________`

### 6.7 The mobile menu at 320px

Setup: Firefox at 320px (window, or Responsive Design Mode with DevTools
detached), `/`, `Ctrl+Home`, Tab three times to the menu button.

- [ ] The button says "Menu", "button" and collapsed. → SC 4.1.2
- [ ] Enter: "Menu" and "dialog" announced. → SC 4.1.2
- [ ] `Down` reads the first nav link. → SC 4.1.2
- [ ] `Ctrl+Home` then `Down`: never reads the header, footer or page `h1`. → SC 4.1.2
- [ ] `Alt+Shift+M`: one unnamed navigation inside the dialog. No test runs
      `landmark-unique` with the panel open. → SC 1.3.1
- [ ] Escape: back on the button, collapsed. → SC 2.1.2, 4.1.2
- [ ] `Orca+Return` right after Escape describes the button, not the document. → SC 2.4.3
- [ ] Same after Close. → SC 2.4.3
- [ ] A nav link navigates and the new page is announced. → SC 2.1.1

This is the Firefox result only; the dialog in Chrome with Orca is unknown.

Heard: `________________________`

### 6.8 A blog post

Setup: Firefox, 1280px, `/blog/sample-talk` (25 headings:
1 `h1`, 12 `h2`, 12 `h3`).

- [ ] `Alt+Shift+H`: `h1` first, then the body's headings in source order.
      Every `h3` has an `h2` above it. → SC 1.3.1, 2.4.6
- [ ] `H` from the top walks the same headings, each with its level. → SC 1.3.1
- [ ] `Alt+Shift+M` lists ten landmarks: banner, navigation "Primary", main,
      navigation "Breadcrumb", "In this post", "Tags", contentinfo, "Site",
      "About this site", "Social". No `article` or inner `header`. → SC 1.3.1
- [ ] From main, `Down` reads breadcrumb, `h1`, teaser, date, body. → SC 1.3.2
- [ ] The breadcrumb is Home, Blog, Open source. In `Alt+Shift+K`, judge
      whether "Open source" and "Blog" make sense alone. → SC 2.4.4
- [ ] The date reads as a date ("10 July 2026"), not the ISO string. → SC 1.3.1
- [ ] Tags: announced by name, then a list of five links. → SC 1.3.1

Heard: `________________________`

### 6.9 The 404 page

Setup: Firefox, 1280px, `/404` (preview serves it with 200;
`tests/not-found.spec.ts` covers the status).

- [ ] Reading from the top, it is soon clear the address was wrong. → SC 1.3.1
- [ ] `Orca+Slash` includes "Page not found". → SC 2.4.2
- [ ] One heading, the `h1` "These are not the droids you are looking for."
      Judge whether it alone makes the reason clear. → SC 1.3.1, 2.4.6
- [ ] `G` finds only the header mark; the gold logo tile is silent. → SC 1.1.1
- [ ] "Episode 404" reads as text. Record how "404" is spoken.
- [ ] Three links: "Go to the homepage", "Read the blog" (a list of two), and
      "tell me about the broken link" in the body. Judge the third hardest. → SC 2.4.4, 1.3.1

Heard: `________________________`

### 6.10 NVDA and VoiceOver

Not run: needs Windows and Apple hardware. Open in ACCESSIBILITY.md §7 gap 2.

- [ ] NVDA: §6 in Chrome and Firefox, plus browse and focus mode in the dialog. → needs Windows
- [ ] VoiceOver: Safari (`Cmd+F5`, rotor `Ctrl+Opt+U`) and iOS on the mobile
      menu. → needs a Mac and an iPhone

### 6.11 What to do with the results

| Result                  | Where it goes                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Every filled blank      | This file                                                                                                   |
| The 6.4 answers         | STYLEGUIDE.md [Uppercase](STYLEGUIDE.md#uppercase), ACCESSIBILITY.md §6 and §7 gap 2                        |
| Everything else, passed | ACCESSIBILITY.md §6 Manual; narrow §7 gap 2, naming browser and versions                                    |
| A failed check          | Fix it, add a test if machine-detectable, otherwise a new gap in ACCESSIBILITY.md §7 quoting what was heard |
| A check not reached     | Leave the blank empty and say so in ACCESSIBILITY.md §7                                                     |

### 6.12 Dynamic states, by ear

Firefox, Orca with the log.

#### 6.12.1 The offline contact path

Run third, after 6.5. `src/scripts/contact-sending.ts` blocks the submit
offline and writes into `<p role="status" data-contact-status>`; that region is
the only signal. Nothing automated can hear it.

Setup: `/contact`, 1280px, DevTools (detached) → Network → Offline. Fill the
form, submit, then wait several seconds without touching anything.

- [ ] An announcement says the message was not sent. → SC 4.1.3
      Heard: `________________________` `SPEECH OUTPUT:` `______________`
- [ ] Silence is the failure: record it, and what had focus. → SC 4.1.3
- [ ] Online, submit; offline, submit again: the replaced text is announced. → SC 4.1.3
- [ ] The typed message is still in the textarea. → SC 3.3.1

#### 6.12.2 The "In this post" disclosure

Setup: `/blog/sample-talk` at 1280px (open), then below 1280px
(closed). `<nav aria-labelledby>` around `<details>`; the `+`/`−` marker is
`aria-hidden`.

- [ ] The landmark is named "In this post". → SC 1.3.1
- [ ] The summary announces a state (collapsed or expanded). → SC 4.1.2
- [ ] No "plus", "minus" or stray character in the name. → SC 4.1.2
- [ ] Enter: state flips; an ordered list of 12 items. → SC 1.3.1
- [ ] At 1280px it is announced expanded on arrival. → SC 4.1.2
- [ ] An entry moves to its heading, which is announced. → SC 2.4.1

Heard: `________________________`

#### 6.12.3 A failed photo's alt text

Setup: `/about`, DevTools → Network → block `*.webp`, reload. The visible copy
of the alt text is `aria-hidden`.

- [ ] `G` reaches the photo once; its alt is announced once. → SC 1.1.1
- [ ] The full `alt` is read, not the clamped visible copy. → SC 1.1.1
- [ ] The frame announces nothing of its own. → SC 1.1.1
- [ ] With `javascript.enabled` false in `about:config`: alt announced once.
      Restore it afterwards. → SC 1.1.1

Heard: `________________________`

#### 6.12.4 The contact error summary

Setup: a rate-limited or server-failed submit (`npm run test:worker` serves
it, or submit on preview until the limit trips).

- [ ] The summary is announced on arrival without a key press. → SC 3.3.1
- [ ] "Your message was not sent" comes before the reason. → SC 3.3.1
- [ ] The reason tells a rate limit from a server failure. → SC 3.3.1
- [ ] The typed message is still there and reachable with `Down`. → SC 3.3.1

Heard: `________________________`

#### 6.12.5 Focus return when the menu's breakpoint disappears

Setup: Firefox at 320px on `/`. Open the menu, widen past 768px, press Escape.

- [ ] Focus is on a header nav link. → SC 2.4.3
- [ ] `Orca+Return` describes that link, not the document. → SC 2.4.3
- [ ] `Alt+Shift+M`: one navigation "Primary", no dialog. → SC 1.3.1

Heard: `________________________`

#### 6.12.6 The About cats

Setup: `/about` at 1280px, the cats' band on screen. Each cat is a "Meet"
button with a sleep control beside it; one `<dialog>` holds the card. The
drawings are `aria-hidden`.

- [ ] Tab reaches each cat, then its sleep control; a focused cat holds
      still. → SC 2.4.3, 2.2.2
- [ ] Each cat is a button named "Meet Pepper", "Meet Mochi" or "Meet Biscuit". → SC 4.1.2
- [ ] Enter opens the card: focus is on Close, and the dialog is named after
      the cat. → SC 2.4.3, 4.1.2
- [ ] Tab reaches Close and the thank-you link, never the page behind. → SC 2.1.2
- [ ] Escape closes the card and focus returns to the same cat. → SC 2.4.3
- [ ] The sleep control reads "Put Pepper to sleep"; Enter stops the cat
      within 5 s and the control then reads "Wake Pepper". → SC 2.2.2, 4.1.2
- [ ] The drawings announce nothing; "The moving cats are drawn with AI" is
      read. → SC 1.1.1

Heard: `________________________`

## 6a. Voice control → SC 2.5.3

Speech users say the words they see, so a control's name must start with its
visible label. The rule is
[Understanding SC 2.5.3](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html);
the method follows the DWP Accessibility Manual's
[voice controller testing](https://accessibility-manual.dwp.gov.uk/best-practice/voice-controller-testing):
one common voice controller at least. A visible `<label for>` gives the most
reliable name (opinion:
[Adrian Roselli](https://adrianroselli.com/2020/01/my-priority-of-methods-for-labeling-a-control.html)).

Setup: one of Dragon on Windows, Voice Access on Windows 11, or Voice Control
on macOS, which works fully only in Safari. Record the tool, its version and
the browser.

- [ ] Say "click About", "click Career" and "click Blog": each header link
      opens. → SC 2.5.3
- [ ] At 320px, say "click Menu": the menu opens; say a menu link's words:
      it opens. → SC 2.5.3
- [ ] On a post, say a tag chip's word, such as "click Community": the tag page
      opens. → SC 2.5.3
- [ ] On `/contact`, say "click Name", "click Email" and "click Message": each
      field takes focus; dictate into it; say "click Send message". → SC 2.5.3
- [ ] Icon-only controls (footer profiles, theme switch, hero pause): reachable
      by the tool's numbers or grid overlay. → SC 2.1.1
- [ ] Note any command that did nothing, and the words that were said.

## 7. Text zoom and text spacing

### 200% text-only zoom → SC 1.4.4

Setup: Firefox, Settings → General → Zoom → "Zoom text only", Ctrl+`+` to 200%.

- [ ] No text clipped, truncated or hidden.
- [ ] Header and footer labels fit their boxes, the current-page box included.
- [ ] Nothing spills out of the 96px header.
- [ ] The mobile menu, if shown, works.
- [ ] Repeat on `/blog/sample-talk`.

### Text spacing override → SC 1.4.12

Paste into the console on each page (`tests/reflow.spec.ts` applies the same):

```js
document.head.insertAdjacentHTML(
  'beforeend',
  `<style>
* { line-height: 1.5 !important; letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important; }
p, li, h1, h2, h3, h4, h5, h6 { margin-bottom: 2em !important; }
</style>`,
);
```

- [ ] No text clipped, lost or overlapping.
- [ ] Buttons and links grow to fit their labels.
- [ ] No horizontal scroll.

## 8. Cross-browser

Chromium, Firefox and WebKit run the automated suite (WebKit in CI, or
`npm run test:webkit` in Docker). Headless WebKit is not Safari.

- [ ] Firefox: §2 by hand.
- [ ] Firefox: the focus ring is visible on every stop, by eye.
- [ ] Safari on macOS: open, needs hardware. Not N/A: it applies and has not
      been run.
- [ ] Safari on a Mac and an iPhone: the homepage hero moves smoothly and its
      pause control stops it. Headless WebKit has no GPU, so CI cannot judge
      this. → needs Apple hardware
- [x] WebKit: covered by CI.

## 9. Target size → SC 2.5.8

Every target passes on its own size; the spacing exception is not used.
`tests/target-size.spec.ts` measures all of them. Confirm in DevTools after a
header or nav layout change.

- [ ] At 320px, content sits 16px from both edges on `/about` and a blog
      route. → SC 1.4.10
- [ ] Header nav links are at least 24px tall (expected 40.8px: 16.8px line,
      `py-2`, `border-4`) and equal height, current or not.
- [ ] Mobile menu button 48x48, 40x40 below 21rem (336px).
- [ ] Footer profile tiles 56x56, 48x48 on a phone.
- [ ] Mobile menu links at 320px at least 24px tall.
- [ ] Breadcrumb links above a post `h1` are 32.8px tall (`py-2 -my-2`): the
      hit area is taller than the words and the gap to the `h1` looks right.

## 10. Exploratory tools

Not dependencies; nothing here gates CI.

[keyboard-a11y-tester](https://github.com/ezufelt/keyboard-a11y-tester) (MIT,
needs an LLM, so it cannot gate a build). One run on `/`:

| Finding                                     | Verdict                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `sr-duplicate-landmark` (banner, main)      | False: one of each; the count tracks the tool's snapshots                                       |
| `sr-focusable-not-exposed` (BlogCard links) | False: no `tabindex` or `aria-hidden`; the crawl did not reach them                             |
| `focus-appearance-weak` (SC 2.4.13, AAA)    | Figure not reproduced; led to ring contrast being measured in `tests/focus.spec.ts` (SC 1.4.11) |

Re-run after a navigation or card redesign, and check every finding against
the DOM.

## 11. Items from external checklists

From the Accessible Astro checklist and
<https://specification.website/checklist/>, both opinion, not WCAG.

- **Automated:** heading hierarchy and one `h1`, content in landmarks, skip
  link, page titles, forced colours, reduced motion, focus contrast, duplicate
  IDs (`duplicate-id-aria` runs under `wcag2a`).
- **Not applicable:** new-tab links (no `target=`), captions and audio
  description (no published video), dragging, authentication, redundant entry,
  consistent help.
- **By construction:** content behind the menu is inert (native `<dialog>`
  with `showModal()`).
- **Rejected:** 44x44 targets (SC 2.5.5, AAA; the target is SC 2.5.8 at 24x24)
  and "do not link the logo on the homepage" (no WCAG basis).

## 12. What this checklist does not cover

- Contact form criteria (SC 1.3.5, 3.3.1, 3.3.2, 3.3.3, 4.1.3) by a person:
  ACCESSIBILITY.md §7 gap 1.
- Plain language: gap 5.
- Whether the hero field's still frame reads as a picture: §4.

## 13. Published PDFs

`public/talks/sample-talk.pdf` (from `/blog/sample-talk`), and a CV when
`person.cv` is set (from `/career`).

1. Run `npm run check:pdf` first
   ([DEVELOPMENT.md](DEVELOPMENT.md#published-pdfs)). Fix what it reports
   before listening.
2. Viewer: Firefox's built-in PDF viewer with Orca, set up as in §6.1.
3. `pdftotext` shows content-stream order, not reading order: do not use it
   for §13.2.

### 13.1 What veraPDF already decides

Do not re-check: structure tree present, document and passage language,
Figure alt text present, headings start at H1 without skips, links tagged with
`Contents`, title displayed.

### 13.2 Reading order → SC 1.3.2

Arrow through with Orca. Fail: caption before its figure, columns read across,
page numbers or running headers read as content, decoration announced.

- [ ] CV read in full, order recorded.
- [ ] Deck read in full, order recorded.

### 13.3 Alternative texts → SC 1.1.1

"Image", a file name or a repeated caption is a failure a validator passes.

- [ ] CV: the portrait is not announced; it is decoration.
- [ ] Deck: same.

### 13.4 Headings and tables

- [ ] CV: heading tags match the visual hierarchy.
- [ ] Deck: heading tags match the visual hierarchy.
- [ ] Any table has tagged, scoped header cells.

### 13.5 The talk slideshow and the deck

`/talks/sample-talk/` carries the same `slides.md` as the PDF.
`tests/slideshow.spec.ts` drives controls, keys, the live region and focus.

- [ ] The PDF in a screen reader: each slide's heading, cards in order, links
      by text, any image by its alt text.
- [ ] Orca and NVDA: Next, Previous and arrow keys speak "Slide N of 18" and
      the title once; the slide text can be read after.
- [ ] VoiceOver on iOS: slides can be moved through and read without a
      keyboard.
- [ ] At 400% zoom a slide reads down the page and the controls stay
      reachable.
