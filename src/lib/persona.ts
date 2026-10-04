import { PERSON_NAME } from './profiles';

export interface Persona {
  /** One sentence naming the source, shown on the homepage. */
  readonly tribute: string;
  /** Who owns the source and that this site is not affiliated with them. */
  readonly rights: string;
}

/** The shipped sample persona's notice; set to null when you replace the persona, and the notice goes with it. */
export const SAMPLE_PERSONA: Persona | null = {
  tribute: `${PERSON_NAME} is a fan tribute to Nico Robin from One Piece by Eiichiro Oda.`,
  rights:
    'One Piece and its characters belong to Eiichiro Oda, Shueisha and Toei Animation. This site is not affiliated with or endorsed by them.',
};

/** The /credits notice, or null to render none. */
export const personaNotice = (persona: Persona | null): string | null =>
  persona === null ? null : `${persona.tribute} ${persona.rights}`;

export const PERSONA_NOTICE_ID = 'sample-persona';
