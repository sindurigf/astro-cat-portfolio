import { SITE_CONFIG } from '../site.config';
import { isExampleHost } from './example-host';

/* Public, not personal. Shared so the footer and security.txt agree. */
export const CONTACT_EMAIL = SITE_CONFIG.person.email;

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/** False while `person.email` is still on an RFC 2606 example host, where no mail arrives. */
export const CONTACT_EMAIL_RESOLVES = !isExampleHost(
  CONTACT_EMAIL.slice(CONTACT_EMAIL.lastIndexOf('@') + 1),
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
