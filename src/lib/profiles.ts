import { SITE_CONFIG } from '../site.config';

/* Profile URLs only, as JSON-LD `sameAs` needs; the email is separate. */
export const SOCIAL_PROFILES = SITE_CONFIG.profiles;

export const PERSON_GIVEN_NAME = SITE_CONFIG.person.givenName;

export const PERSON_FAMILY_NAME = SITE_CONFIG.person.familyName;

/** The homepage <h1> spells it in two spans: tests/structured-data.spec.ts. */
export const PERSON_NAME = `${PERSON_GIVEN_NAME} ${PERSON_FAMILY_NAME}`;

export const JOB_TITLE = SITE_CONFIG.person.jobTitle;

/** Root-relative, or null when no CV is published. */
export const CV_PATH = SITE_CONFIG.person.cv;
