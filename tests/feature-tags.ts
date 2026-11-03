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
 * `@without-<feature>`. Each config leaves out the tag that does not match its
 * build, so `--list` shows what runs and nothing skips.
 */
export const FEATURES_ON = {
  analytics: ANALYTICS_ON,
  'contact-form': CONTACT_FORM_ON,
  cv: CV_PATH !== null,
  'journey-post': JOURNEY_POST !== null,
  persona: SAMPLE_PERSONA !== null,
  'security-contact': SECURITY_CONTACT !== null,
  'motto-meaning': SITE_CONFIG.site.motto.meaning !== null,
  'template-statement':
    templateStatementRows(readFileSync('ACCESSIBILITY.md', 'utf8')).length > 0,
};

type Feature = keyof typeof FEATURES_ON;

const withFeature = (name: Feature) => ({ tag: `@with-${name}` });
const withoutFeature = (name: Feature) => ({ tag: `@without-${name}` });

export const WITH_ANALYTICS = withFeature('analytics');
export const WITHOUT_ANALYTICS = withoutFeature('analytics');
export const WITH_CONTACT_FORM = withFeature('contact-form');
export const WITHOUT_CONTACT_FORM = withoutFeature('contact-form');
export const WITH_CV = withFeature('cv');
export const WITHOUT_CV = withoutFeature('cv');
export const WITH_JOURNEY_POST = withFeature('journey-post');
export const WITHOUT_JOURNEY_POST = withoutFeature('journey-post');
export const WITH_PERSONA = withFeature('persona');
export const WITHOUT_SECURITY_CONTACT = withoutFeature('security-contact');
export const WITH_MOTTO_MEANING = withFeature('motto-meaning');
export const WITHOUT_MOTTO_MEANING = withoutFeature('motto-meaning');
export const WITH_TEMPLATE_STATEMENT = withFeature('template-statement');

/** Tags of the feature states a build does not have. */
export const inactiveFeatureTags = (on: Record<Feature, boolean>): string[] =>
  Object.entries(on).map(([name, active]) =>
    active ? `@without-${name}` : `@with-${name}`,
  );

export const INACTIVE_FEATURE_TAGS = inactiveFeatureTags(FEATURES_ON);
