/* Folds each module body of a post in a native <details>, its h2 outside, both in one panel. Not slides. */

import { TALKS_PATH } from './post-figure.mjs';
import {
  FOLD_CLASS,
  MODULE_PANEL_CLASS,
  MODULE_TOGGLE_LABEL,
  moduleName,
} from '../lib/post-folds.ts';

const text = (value) => ({ type: 'text', value });

const element = (tagName, properties, children) => ({
  type: 'element',
  tagName,
  properties,
  children,
});

/*
 * "Steps", named "Steps for Module 3": the visible word comes first in the name
 * (SC 2.5.3). The name stays the same open or closed; the native state and the
 * +/- marker carry the state (GOV.UK details).
 */
const summary = (name) =>
  element('summary', { className: ['post-contents-summary'] }, [
    element('span', { className: ['fold-label'] }, [
      text(MODULE_TOGGLE_LABEL),
      element('span', { className: ['sr-only'] }, [text(` for ${name}`)]),
    ]),
    element(
      'span',
      { className: ['post-contents-marker'], ariaHidden: 'true' },
      [],
    ),
  ]);

const button = (action, label) =>
  element(
    'button',
    { type: 'button', className: ['btn-secondary'], dataModules: action },
    [text(label)],
  );

/* Hidden until src/scripts/post-folds.ts wires them: without JavaScript they would do nothing. */
const moduleControls = () =>
  element('div', { className: ['module-controls'], hidden: true }, [
    button('close', 'Close All Modules'),
    button('open', 'Open All Modules'),
  ]);

const isH2 = (node) => node.type === 'element' && node.tagName === 'h2';

/* GFM footnotes follow the last module with their own sr-only h2; they are not its body. */
const endsModule = (node) =>
  isH2(node) ||
  (node.type === 'element' &&
    node.tagName === 'section' &&
    node.properties?.dataFootnotes !== undefined);

/* Each module's body after its h2, in a <details open>, so nothing is hidden on load. */
const groupModules = (ctx, siblings) => {
  const out = [];
  let controlsPlaced = false;
  for (let index = 0; index < siblings.length; index += 1) {
    const node = siblings[index];
    const name = isH2(node) ? moduleName(ctx.textContent(node)) : undefined;
    if (!name) {
      out.push(node);
      continue;
    }
    if (!controlsPlaced) {
      out.push(moduleControls());
      controlsPlaced = true;
    }
    const body = [];
    while (index + 1 < siblings.length && !endsModule(siblings[index + 1])) {
      index += 1;
      body.push(siblings[index]);
    }
    out.push(
      element('div', { className: [MODULE_PANEL_CLASS] }, [
        node,
        element(
          'details',
          { className: [FOLD_CLASS], dataModule: '', open: true },
          [summary(name), ...body],
        ),
      ]),
    );
  }
  return out;
};

export const moduleFold = ({ fileURL } = {}) => {
  let done = false;

  return {
    name: 'module-fold',

    element: {
      filter: ['h2'],

      visit(node, ctx) {
        if (done || String(fileURL ?? '').includes(TALKS_PATH)) return;
        if (!moduleName(ctx.textContent(node))) return;
        done = true;
        const parent = ctx.parent(node);
        /* One child-list swap on the parent: the visitor runs once per post. */
        ctx.setProperty(parent, 'children', groupModules(ctx, parent.children));
      },
    },
  };
};
