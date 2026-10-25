/*
 * Plausible Analytics (EU); on when src/site.config.ts sets it (analytics-site.ts). No cookies or browser storage: tests/privacy.spec.ts.
 * Bundled from @plausible-analytics/tracker, so `script-src` stays same-origin.
 */
import type { PlausibleRequestPayload } from '@plausible-analytics/tracker';

export const PLAUSIBLE_ORIGIN = 'https://plausible.io';

/* CSP `connect-src` names this URL: tests/headers-rules.spec.ts. */
export const PLAUSIBLE_ENDPOINT = `${PLAUSIBLE_ORIGIN}/api/event`;

/* Each name is a goal in the Plausible dashboard; what was clicked goes in the props. */
export const CLICK_EVENTS = {
  internalLink: 'Internal link',
  outboundLink: 'Outbound link',
  download: 'Download',
  email: 'Email link',
  button: 'Button',
} as const;

export type ClickEventName = (typeof CLICK_EVENTS)[keyof typeof CLICK_EVENTS];

/* Custom properties show only on Plausible's Business plan. */
export type ClickEventData = {
  label: string;
  area: string;
  target?: string;
};

/* Labels are site text, never user input. */
export const MAX_LABEL_LENGTH = 100;

export const DOWNLOAD_EXTENSIONS = ['.pdf'] as const;

const DO_NOT_TRACK_ON = '1';

/** /privacy says no address is sent with anything after a ? or #. */
export const withoutQuery = (address: string): string => {
  if (!URL.canParse(address)) return '';
  const { origin, pathname } = new URL(address);
  return `${origin}${pathname}`;
};

export interface SendContext {
  hostname: string;
  productionHost: string;
  doNotTrack: string | null;
}

/** Production only, never under Do Not Track. */
export const canSend = ({
  hostname,
  productionHost,
  doNotTrack,
}: SendContext): boolean =>
  hostname === productionHost && doNotTrack !== DO_NOT_TRACK_ON;

/** The payload to send, or null to send nothing. */
export const filterPayload = (
  payload: PlausibleRequestPayload,
  context: SendContext,
): PlausibleRequestPayload | null => {
  if (!canSend(context)) return null;
  return {
    ...payload,
    u: withoutQuery(payload.u),
    r: payload.r ? withoutQuery(payload.r) : null,
  };
};
