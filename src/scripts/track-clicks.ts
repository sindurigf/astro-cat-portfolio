import {
  CLICK_EVENTS,
  DOWNLOAD_EXTENSIONS,
  MAX_LABEL_LENGTH,
  type ClickEventData,
  type ClickEventName,
} from '../lib/analytics';

/*
 * Not `data-umami-event`: the tracker blocks navigation on its request with no
 * timeout. `umami.track` uses `keepalive` and honors DNT and `data-domains`.
 */

declare global {
  interface Window {
    umami?: { track: (name: string, data?: ClickEventData) => unknown };
  }
}

const CLICKABLE =
  'a[href], button, summary, input[type="submit"], input[type="button"]';

/* `closest` finds the nearest: a menu link reports `menu`, not `header`. */
const AREAS: Readonly<Record<string, string>> = {
  '#mobile-menu-panel': 'menu',
  header: 'header',
  footer: 'footer',
  main: 'main',
};
const AREA_SELECTOR = Object.keys(AREAS).join(', ');
const NO_AREA = 'page';

const MIDDLE_BUTTON = 1;

const labelOf = (element: Element): string => {
  const text =
    element.getAttribute('aria-label') ??
    (element instanceof HTMLInputElement ? element.value : element.textContent);
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH);
};

const areaOf = (element: Element): string => {
  const area = element.closest(AREA_SELECTOR);
  const selector = Object.keys(AREAS).find((key) => area?.matches(key));
  return (selector && AREAS[selector]) ?? NO_AREA;
};

const isDownload = (url: URL): boolean =>
  DOWNLOAD_EXTENSIONS.some((extension) =>
    url.pathname.toLowerCase().endsWith(extension),
  );

const describeLink = (
  link: HTMLAnchorElement,
  origin: string,
): { name: ClickEventName; label?: string; target?: string } => {
  const url = new URL(link.href);

  /* Fixed label: /privacy says an email click never sends the address. */
  if (url.protocol === 'mailto:') {
    return { name: CLICK_EVENTS.email, label: CLICK_EVENTS.email };
  }

  /* No query string: it can carry another site's tokens. */
  if (url.origin !== origin) {
    return {
      name: CLICK_EVENTS.outboundLink,
      target: `${url.origin}${url.pathname}`,
    };
  }

  return {
    name:
      link.hasAttribute('download') || isDownload(url)
        ? CLICK_EVENTS.download
        : CLICK_EVENTS.internalLink,
    target: `${url.pathname}${url.hash}`,
  };
};

const describeClick = (
  target: EventTarget | null,
  origin: string,
): { name: ClickEventName; data: ClickEventData } | null => {
  if (!(target instanceof Element)) return null;

  const element = target.closest(CLICKABLE);
  if (!element) return null;

  const data: ClickEventData = {
    label: labelOf(element),
    area: areaOf(element),
  };

  if (element instanceof HTMLAnchorElement) {
    const { name, label, target: destination } = describeLink(element, origin);
    const linkData = label === undefined ? data : { ...data, label };
    return {
      name,
      data:
        destination === undefined
          ? linkData
          : { ...linkData, target: destination },
    };
  }

  return { name: CLICK_EVENTS.button, data };
};

const send = (event: MouseEvent): void => {
  if (event.type === 'auxclick' && event.button !== MIDDLE_BUTTON) return;

  const click = describeClick(event.target, window.location.origin);
  if (click) window.umami?.track(click.name, click.data);
};

/* Capture phase survives stopPropagation; `auxclick` catches middle clicks. */
document.addEventListener('click', send, { capture: true, passive: true });
document.addEventListener('auxclick', send, { capture: true, passive: true });
