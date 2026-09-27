import { cssColorToken } from './source';

/** WCAG floors: AA_TEXT SC 1.4.3, AA_LARGE its large-text floor, NON_TEXT SC 1.4.11. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
export const NON_TEXT = 3;

/** Large text under SC 1.4.3, in CSS pixels at a 16px root. */
export const LARGE_TEXT_PX = 24;
export const LARGE_TEXT_BOLD_PX = 18.66;

/** `--color-gold` as 0-255 channels; the token is six-digit hex. */
const GOLD_CHANNELS = [1, 3, 5].map((at) =>
  parseInt(cssColorToken('--color-gold').slice(at, at + 2), 16),
);

/**
 * Contrast maths spliced into `page.evaluate`, which cannot reach Node imports.
 * One copy so importers cannot drift by a rounding rule.
 */
export const PAGE_HELPERS = `
  const parse = (value) => {
    const m = String(value).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };

  const channel = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const luminance = (c) =>
    0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  /* Source-over composite: a translucent border is measured as painted (SC 1.4.11). */
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  // Nearest opaque background, or null for an image, gradient or translucent layer.
  // Skips an ancestor whose padding box the element misses: an overhanging
  // positioned child is not on its fill.
  const effectiveBackground = (element) => {
    const box = element instanceof Element ? element.getBoundingClientRect() : null;
    const paintedInside = (node) => {
      if (!box || node === element) return true;
      const host = node.getBoundingClientRect();
      const edge = getComputedStyle(node);
      const left = host.left + parseFloat(edge.borderLeftWidth);
      const right = host.right - parseFloat(edge.borderRightWidth);
      const top = host.top + parseFloat(edge.borderTopWidth);
      const bottom = host.bottom - parseFloat(edge.borderBottomWidth);
      return box.right > left && box.left < right && box.bottom > top && box.top < bottom;
    };
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') return null;
      const colour = parse(style.backgroundColor);
      if (!colour) return null;
      if (colour.a === 0) continue;
      if (!paintedInside(node)) continue;
      if (colour.a < 1) return null;
      return colour;
    }
    return null;
  };

  // Composites translucent backgrounds onto the first opaque one. Null for images.
  const compositeBackground = (element) => {
    const layers = [];
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') return null;
      const colour = parse(style.backgroundColor);
      if (!colour) return null;
      if (colour.a === 0) continue;
      if (colour.a < 1) {
        layers.push(colour);
        continue;
      }
      return layers.reduceRight((ground, layer) => over(layer, ground), colour);
    }
    return null;
  };

  const isGold = (colour) =>
    colour !== null &&
    colour.r === ${GOLD_CHANNELS[0]} &&
    colour.g === ${GOLD_CHANNELS[1]} &&
    colour.b === ${GOLD_CHANNELS[2]};

  /* Tracks paren depth: each layer's rgb() has commas of its own. */
  const shadowLayers = (value) => {
    if (value === 'none') return [];
    const parts = [];
    let depth = 0;
    let current = '';
    for (const character of String(value)) {
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      if (character === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += character;
    }
    parts.push(current);
    return parts
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map((part) => ({
        text: part,
        colour: parse(part),
        inset: part.includes('inset'),
      }));
  };

  const describe = (element) => {
    const id = element.id ? '#' + element.id : '';
    const cls = element.className && typeof element.className === 'string'
      ? '.' + element.className.trim().split(/\\s+/).join('.')
      : '';
    return element.tagName.toLowerCase() + id + cls;
  };

  const hasOwnText = (element) =>
    [...element.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
    );

  // Opaque fill: flag a same-colour fill (< 1.05, a detector, not SC 1.4.11).
  // Translucent fill: each border edge must reach NON_TEXT. Borderless prose
  // links are delimited by colour and underline.
  const BORDER_EDGES = ['top', 'right', 'bottom', 'left'];

  const invisibleControls = (root) => {
    const out = [];
    const rgb = (c) =>
      'rgb(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ')';

    for (const element of root.querySelectorAll('a, button, [role="button"]')) {
      const style = getComputedStyle(element);
      const label = (element.textContent ?? '').trim().slice(0, 40);
      const fill = parse(style.backgroundColor);
      const behind = effectiveBackground(element.parentElement);

      // An unreadable fill or ground is reported, not skipped past the census.
      if (fill === null || behind === null) {
        out.push({
          selector: describe(element),
          detail:
            'undecidable: fill ' +
            style.backgroundColor +
            (behind === null ? ' on a ground that could not be resolved' : ''),
          label,
        });
        continue;
      }

      const ground = rgb(behind);

      if (fill.a === 1) {
        if (ratio(fill, behind) < 1.05) {
          out.push({
            selector: describe(element),
            detail: 'fill ' + style.backgroundColor + ' on ' + ground,
            label,
          });
        }
        continue;
      }

      /* Grouped by colour so a uniform border reports one line. */
      const failing = new Map();

      for (const edge of BORDER_EDGES) {
        const cap = edge[0].toUpperCase() + edge.slice(1);
        if (['none', 'hidden'].includes(style['border' + cap + 'Style'])) continue;
        if (parseFloat(style['border' + cap + 'Width']) <= 0) continue;

        const declared = parse(style['border' + cap + 'Color']);
        if (declared === null) continue;

        const painted = over(declared, behind);
        const measured = ratio(painted, behind);
        if (measured >= ${NON_TEXT}) continue;

        const key = rgb(painted) + '|' + measured.toFixed(2);
        if (!failing.has(key)) failing.set(key, { painted, measured, edges: [] });
        failing.get(key).edges.push(edge);
      }

      for (const entry of failing.values()) {
        out.push({
          selector: describe(element),
          detail:
            'border-' + entry.edges.join('/') + ' ' + rgb(entry.painted) +
            ' on ' + ground + ' at ' + entry.measured.toFixed(2) + ':1, needs ' +
            ${NON_TEXT},
          label,
        });
      }
    }
    return out;
  };
`;
