/*
 * Claims on /privacy and /contact that can change outside this repo.
 * tests/platform-facts.spec.ts fails when `checkedOn` goes stale: re-check at
 * `check`, then move the date. D1's EU jurisdiction is immutable, so not here.
 */

interface PlatformFact {
  claim: string;
  check: string;
  /** `YYYY-MM-DD`. */
  checkedOn: string;
}

/** Umami Hobby plan. */
export const UMAMI_RETENTION_MONTHS = 6;

/** Workers Free plan. */
export const WORKER_LOG_RETENTION_DAYS = 3;

/** D1 Time Travel on the Free plan. */
export const D1_RESTORE_WINDOW_DAYS = 7;

export const PLATFORM_FACTS: Readonly<Record<string, PlatformFact>> = {
  umamiRetention: {
    claim: `Umami keeps the visit counts for ${UMAMI_RETENTION_MONTHS} months`,
    check: 'Umami Cloud > Settings > Billing: the data retention of the plan',
    checkedOn: '2026-09-13',
  },
  umamiRegion: {
    claim: 'Umami stores the visit counts on servers in the European Union',
    check: 'Umami Cloud > Settings: the region the account is hosted in',
    checkedOn: '2026-09-19',
  },
  workerLogRetention: {
    claim: `Worker logs and traces are deleted after ${WORKER_LOG_RETENTION_DAYS} days`,
    check:
      'Cloudflare dashboard > Workers & Pages > <worker name> > Observability: ' +
      'the log and trace retention of the plan ' +
      '(developers.cloudflare.com/workers/observability/traces)',
    checkedOn: '2026-09-25',
  },
  d1RestoreWindow: {
    claim: `A deleted message stays restorable for ${D1_RESTORE_WINDOW_DAYS} days`,
    check:
      'Cloudflare dashboard > Storage & Databases > D1 > <database name> > ' +
      'Time Travel',
    checkedOn: '2026-09-19',
  },
  networkErrorLogging: {
    claim:
      '/privacy: Cloudflare asks browsers to report failed requests only ' +
      '(success_fraction 0.0) to a.nel.cloudflare.com',
    check:
      "curl -sI <site url>/ | grep -iE '^(nel|report-to):', and " +
      "Cloudflare's Network Error Logging docs for what a report holds",
    checkedOn: '2026-09-25',
  },
  registrarForwarding: {
    claim:
      '/contact: the form goes to the same inbox as the contact address, because ' +
      'the domain registrar forwards that address to the CONTACT_NOTIFY_TO inbox',
    check:
      'The registrar > the domain > Email Forwarding, ' +
      'compared with the CONTACT_NOTIFY_TO secret under Cloudflare dashboard ' +
      '> Workers & Pages > <worker name> > Settings > Variables and Secrets',
    checkedOn: '2026-09-19',
  },
};
