/*
 * Bidi embeddings, overrides and isolates (U+202A to U+202E, U+2066 to U+2069)
 * and the zero-width space (U+200B), as a regex character-class body. Not the
 * zero-width joiners U+200C and U+200D, which names in several scripts need.
 */
export const HIDDEN_CHARACTERS = String.raw`‪-‮⁦-⁩​`;
