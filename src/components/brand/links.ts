import { REPOSITORY_URL, sourceUrl, templateUseUrl } from '../../lib/site';

/* This site's own repository, so a site made from the template points at itself. */
export const SOURCE_URL = sourceUrl(REPOSITORY_URL);
export const USE_TEMPLATE_URL = SOURCE_URL && templateUseUrl(SOURCE_URL);
/* The template's live demo; the link renders once this is set. */
export const DEMO_URL: string | null = null;
export const HAS_LINKS = Boolean(SOURCE_URL ?? DEMO_URL);
export const ACCESSIBILITY_MD_URL = `${REPOSITORY_URL}/blob/main/ACCESSIBILITY.md`;
