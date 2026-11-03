import { readFileSync } from 'node:fs';
import { ANALYTICS_ON } from '../src/lib/analytics-site';
import { CONTACT_FORM_ON, SECURITY_CONTACT } from '../src/lib/contact';
import { SAMPLE_PERSONA } from '../src/lib/persona';
import { CV_PATH } from '../src/lib/profiles';
import { JOURNEY_POST } from '../src/lib/site';
import { SITE_CONFIG } from '../src/site.config';
import { templateStatementRows } from '../src/lib/statement-guard';

/*
 * Tests for a configurable feature carry `@with-<feature>` or
 * `@without-<feature>`. playwright.config.ts leaves out the tag that does not
 * match src/site.config.ts, so `--list` shows what runs and nothing skips.
 */
const feature = (name: string, on: boolean) => ({
  WITH: { tag: `@with-${name}` },
  WITHOUT: { tag: `@without-${name}` },
  inactive: on ? `@without-${name}` : `@with-${name}`,
});

const ANALYTICS = feature('analytics', ANALYTICS_ON);
const CONTACT_FORM = feature('contact-form', CONTACT_FORM_ON);
const CV = feature('cv', CV_PATH !== null);
const JOURNEY = feature('journey-post', JOURNEY_POST !== null);
const PERSONA = feature('persona', SAMPLE_PERSONA !== null);
const SECURITY = feature('security-contact', SECURITY_CONTACT !== null);
const MOTTO_MEANING = feature(
  'motto-meaning',
  SITE_CONFIG.site.motto.meaning !== null,
);
const TEMPLATE_STATEMENT = feature(
  'template-statement',
  templateStatementRows(readFileSync('ACCESSIBILITY.md', 'utf8')).length > 0,
);

export const WITH_ANALYTICS = ANALYTICS.WITH;
export const WITHOUT_ANALYTICS = ANALYTICS.WITHOUT;
export const WITH_CONTACT_FORM = CONTACT_FORM.WITH;
export const WITHOUT_CONTACT_FORM = CONTACT_FORM.WITHOUT;
export const WITH_CV = CV.WITH;
export const WITHOUT_CV = CV.WITHOUT;
export const WITH_JOURNEY_POST = JOURNEY.WITH;
export const WITHOUT_JOURNEY_POST = JOURNEY.WITHOUT;
export const WITH_PERSONA = PERSONA.WITH;
export const WITHOUT_SECURITY_CONTACT = SECURITY.WITHOUT;
export const WITH_MOTTO_MEANING = MOTTO_MEANING.WITH;
export const WITHOUT_MOTTO_MEANING = MOTTO_MEANING.WITHOUT;
export const WITH_TEMPLATE_STATEMENT = TEMPLATE_STATEMENT.WITH;

/** Tags of the feature states src/site.config.ts does not have. */
export const INACTIVE_FEATURE_TAGS = [
  ANALYTICS,
  CONTACT_FORM,
  CV,
  JOURNEY,
  PERSONA,
  SECURITY,
  MOTTO_MEANING,
  TEMPLATE_STATEMENT,
].map(({ inactive }) => inactive);
