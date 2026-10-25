import { init } from '@plausible-analytics/tracker';
import {
  canSend,
  filterPayload,
  PLAUSIBLE_ENDPOINT,
  type SendContext,
} from '../lib/analytics';
import { trackClicks } from './track-clicks';

const productionHost = new URL(import.meta.env.SITE).hostname;

const sendContext = (): SendContext => ({
  hostname: window.location.hostname,
  productionHost,
  doNotTrack: navigator.doNotTrack,
});

/*
 * Built-in link, download and form events stay off: track-clicks.ts sends more
 * detail, and the dialog Close forms would count as submissions.
 */
if (canSend(sendContext())) {
  init({
    domain: productionHost,
    endpoint: PLAUSIBLE_ENDPOINT,
    logging: false,
    transformRequest: (payload) => filterPayload(payload, sendContext()),
  });
  trackClicks();
}
