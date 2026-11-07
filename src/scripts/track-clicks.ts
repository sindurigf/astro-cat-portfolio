import { track } from '@plausible-analytics/tracker';
import {
  CLICK_EVENTS,
  DOWNLOAD_EXTENSIONS,
  MAX_LABEL_LENGTH,
  type ClickEventData,
  type ClickEventName,
} from '../lib/analytics';

const CLICKABLE =
  'a[href], button, summary, input[type="submit"], input[type="button"]';

/* Inner areas first: a menu link reports `menu`, not `header`. */
const AREAS: Readonly<Record<string, string>> = {
  '#mobile-menu-panel': 'menu',
  header: 'header',
  footer: 'footer',
  main: 'main',
};
const NO_AREA = 'page';

const MIDDLE_BUTTON = 1;

const labelOf = (element: Element): string => {
  const text =
    element.getAttribute('aria-label') ??
    (element instanceof HTMLInputElement ? element.value : element.textContent);
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH);
};

const areaOf = (element: Element): string => {
  const selector = Object.keys(AREAS).find((key) => element.closest(key));
  return (selector && AREAS[selector]) ?? NO_AREA;
};

const isDownload = (url: URL): boolean =>
  DOWNLOAD_EXTENSIONS.some((extension) =>
    url.pathname.toLowerCase().endsWith(extension),
  );

/* An SVG <a> is not an HTMLAnchorElement, so its attribute is resolved by hand. */
const describeLink = (
  link: Element,
  origin: string,
): { name: ClickEventName; label?: string; target?: string } | null => {
  let url: URL;
  try {
    url = new URL(link.getAttribute('href') ?? '', document.baseURI);
  } catch {
    return null;
  }

  /* Fixed label: /privacy says an email click never sends the address. */
  if (url.protocol === 'mailto:') {
    return { name: CLICK_EVENTS.email, label: CLICK_EVENTS.email };
  }

  /* tel:, blob: and other schemes have no usable origin, and a tel: label is the number: /privacy lists no such event. */
  if (!url.protocol.startsWith('http')) return null;

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
  const element = target instanceof Element ? target.closest(CLICKABLE) : null;
  if (!element) return null;

  const data: ClickEventData = {
    label: labelOf(element),
    area: areaOf(element),
  };

  if (!element.matches('a[href]')) return { name: CLICK_EVENTS.button, data };

  const link = describeLink(element, origin);
  if (!link) return null;
  const { name, ...fields } = link;
  return { name, data: { ...data, ...fields } };
};

const send = (event: MouseEvent): void => {
  if (event.type === 'auxclick' && event.button !== MIDDLE_BUTTON) return;

  const click = describeClick(event.target, window.location.origin);
  if (click) track(click.name, { props: click.data });
};

/* Capture phase survives stopPropagation; `auxclick` catches middle clicks; `track` sends with `keepalive`. */
export const trackClicks = (): void => {
  document.addEventListener('click', send, { capture: true, passive: true });
  document.addEventListener('auxclick', send, { capture: true, passive: true });
};
