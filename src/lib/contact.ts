import { SITE_CONFIG } from '../site.config';

/* Public, not personal. Shared so the footer and security.txt agree. */
export const CONTACT_EMAIL = SITE_CONFIG.person.email;

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/** False when `contact.form` is `none`: no form, no /contact/send/. */
export const CONTACT_FORM_ON = SITE_CONFIG.contact.form !== 'none';
