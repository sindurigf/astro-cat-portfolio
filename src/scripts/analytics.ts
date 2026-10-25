import { init } from '@plausible-analytics/tracker';
import { filterPayload, PLAUSIBLE_ENDPOINT } from '../lib/analytics';

const productionHost = new URL(import.meta.env.SITE).hostname;

/*
 * Built-in link, download and form events stay off: track-clicks.ts sends more
 * detail, and the dialog Close forms would count as submissions.
 */
init({
  domain: productionHost,
  endpoint: PLAUSIBLE_ENDPOINT,
  logging: false,
  transformRequest: (payload) =>
    filterPayload(payload, {
      hostname: window.location.hostname,
      productionHost,
      doNotTrack: navigator.doNotTrack,
    }),
});
