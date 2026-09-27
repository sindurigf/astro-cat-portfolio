import { errorMessage } from './lib/errors';
import { CONTACT_FORM_ON } from './lib/contact';
import { handle } from '@astrojs/cloudflare/handler';
import type { ContactEnv } from './lib/contact-env';
import { resendUnsentNotifications } from './lib/contact-resend';
import { applyGlobalHeaders } from './lib/response-headers';
import { deleteExpiredMessages } from './lib/contact-retention';
import {
  isVideoRequest,
  serveVideo,
  type AssetsBinding,
} from './lib/video-range';

type WorkerEnv = ContactEnv & { ASSETS?: AssetsBinding };

/* public/_headers skips Worker responses, including Astro's redirects and 403s. */
const withSiteHeaders = (response: Response): Response => {
  const headed = new Response(response.body, response);
  applyGlobalHeaders(headed.headers);
  return headed;
};

/*
 * Named by `main` in wrangler.jsonc. /videos/* is sliced for byte ranges; the
 * cron trigger runs the retention sweep /privacy promises, then the resend of
 * failed notifications.
 */
export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: Parameters<typeof handle>[2],
  ): Promise<Response> {
    if (!isVideoRequest(request)) {
      return withSiteHeaders(await handle(request, env, ctx));
    }

    if (!env.ASSETS) {
      throw new Error('video range: ASSETS binding missing');
    }
    return serveVideo(request, env.ASSETS);
  },

  async scheduled(
    _controller: unknown,
    env: ContactEnv,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<void> {
    /* With `contact.form: 'none'` there is no database to sweep. */
    if (!CONTACT_FORM_ON) return;
    if (!env.MESSAGES_DB) {
      throw new Error('retention sweep: MESSAGES_DB binding missing');
    }

    const database = env.MESSAGES_DB;
    const now = Date.now();
    const reportFailure = (job: string) => (error: unknown) => {
      console.error(`${job} failed:`, errorMessage(error));
      throw error;
    };

    /*
     * In sequence, so a message past retention is deleted rather than
     * emailed, and a failed sweep does not stop the resend.
     */
    ctx.waitUntil(
      deleteExpiredMessages(database, now)
        .catch(reportFailure('retention sweep'))
        .finally(() =>
          resendUnsentNotifications(database, env, now).catch(
            reportFailure('notification resend'),
          ),
        ),
    );
  },
};
