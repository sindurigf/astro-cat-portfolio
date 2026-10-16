import { SITE_CONFIG } from '../site.config';
import { BUILD_ENV } from './build-env';
import { isExampleHost } from './example-host';

/* Public, not personal. Shared so the footer and security.txt agree. */
export const CONTACT_EMAIL = SITE_CONFIG.person.email;

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

const receivesMail = (email: string): boolean =>
  !isExampleHost(email.slice(email.lastIndexOf('@') + 1));

/**
 * The `Contact` of /.well-known/security.txt: the SECURITY_CONTACT build
 * variable, else `person.email` once it is off the RFC 2606 example hosts,
 * else null, and no file is built (RFC 9116 requires a contact that works).
 */
export const securityContactFor = (
  override: string | null,
  email: string,
): string | null =>
  override ?? (receivesMail(email) ? `mailto:${email}` : null);

export const SECURITY_CONTACT = securityContactFor(
  BUILD_ENV.securityContact,
  CONTACT_EMAIL,
);

/** False when `contact.form` is `none`: no form, no /contact/send/. */
export const CONTACT_FORM_ON = SITE_CONFIG.contact.form !== 'none';

const EITHER = new Intl.ListFormat('en', { type: 'disjunction' });

/** /contact's meta description; `services` are the profiles its cards link, so the two cannot disagree. */
export const contactDescription = (
  name: string,
  services: readonly string[],
  formOn: boolean,
): string =>
  `Write to ${name} by email` +
  (services.length > 0 ? ` or on ${EITHER.format(services)}` : '') +
  (formOn ? ', or with the contact form' : '') +
  '.';
