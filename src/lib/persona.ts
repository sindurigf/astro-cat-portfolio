import { PERSON_NAME } from './profiles';

/** One story told about the persona, with the manga chapters it comes from and the wiki page it was checked against. */
export interface PersonaSource {
  readonly story: string;
  /** As cited after "One Piece, ", for example "chapters 391–398". */
  readonly chapters: string;
  /** The name is unique on every page that lists it (SC 2.4.9). */
  readonly wiki: { readonly name: string; readonly href: string };
}

export interface Persona {
  /** One sentence naming the source, shown on the homepage. */
  readonly tribute: string;
  /** Who owns the source and that this site is not affiliated with them. */
  readonly rights: string;
  readonly sources: readonly PersonaSource[];
}

/** The shipped sample persona's notice; set to null when you replace the persona, and the notice goes with it. */
export const SAMPLE_PERSONA: Persona | null = {
  tribute: `${PERSON_NAME} is a fan tribute to Nico Robin from One Piece by Eiichiro Oda.`,
  rights:
    'One Piece and its characters belong to Eiichiro Oda, Shueisha and Toei Animation. This site is not affiliated with or endorsed by them.',
  /* Chapters checked against each wiki page's chapter citations. The stories end where she joins the crew, in chapter 218. */
  sources: [
    {
      story:
        'Growing up on Ohara, and the Library of Ohara in the 5,000-year-old Tree of Knowledge',
      chapters: 'chapters 391–392',
      wiki: {
        name: 'Ohara on the One Piece Wiki',
        href: 'https://onepiece.fandom.com/wiki/Ohara',
      },
    },
    {
      story: "Professor Clover, the library's director, who let me read there",
      chapters: 'chapters 391–392',
      wiki: {
        name: 'Professor Clover on the One Piece Wiki',
        href: 'https://onepiece.fandom.com/wiki/Clover',
      },
    },
    {
      story: 'Passing the archaeology exam at eight',
      chapters: 'chapters 391–392',
      wiki: {
        name: 'Chapter 391 on the One Piece Wiki',
        href: 'https://onepiece.fandom.com/wiki/Chapter_391',
      },
    },
    {
      story: 'The Poneglyphs and the forbidden Void Century',
      chapters: 'chapters 392 and 395',
      wiki: {
        name: 'Poneglyphs on the One Piece Wiki',
        href: 'https://onepiece.fandom.com/wiki/Poneglyph',
      },
    },
    {
      story:
        'My mother, Nico Olvia, the Buster Call, and being the only survivor',
      chapters: 'chapters 393–398',
      wiki: {
        name: "Nico Robin's history on the One Piece Wiki",
        href: 'https://onepiece.fandom.com/wiki/Nico_Robin/History',
      },
    },
    {
      story: 'Jaguar D. Saul, who protected me',
      chapters: 'chapters 392 and 396–397',
      wiki: {
        name: 'Jaguar D. Saul on the One Piece Wiki',
        href: 'https://onepiece.fandom.com/wiki/Jaguar_D._Saul',
      },
    },
    {
      story:
        'My bounty of 79,000,000 berries at eight, and about twenty years on the run',
      chapters: 'chapters 391 and 398',
      wiki: {
        name: 'Chapter 398 on the One Piece Wiki',
        href: 'https://onepiece.fandom.com/wiki/Chapter_398',
      },
    },
    {
      story: 'Miss All Sunday, vice president of Baroque Works',
      chapters: 'chapters 114 and 398',
      wiki: {
        name: 'Baroque Works on the One Piece Wiki',
        href: 'https://onepiece.fandom.com/wiki/Baroque_Works',
      },
    },
    {
      story: 'The Hana Hana no Mi',
      chapters: 'chapter 170',
      wiki: {
        name: 'Hana Hana no Mi on the One Piece Wiki',
        href: 'https://onepiece.fandom.com/wiki/Hana_Hana_no_Mi',
      },
    },
    {
      story: 'Asking to join the Straw Hat Pirates after Arabasta',
      chapters: 'chapter 218',
      wiki: {
        name: 'Chapter 218 on the One Piece Wiki',
        href: 'https://onepiece.fandom.com/wiki/Chapter_218',
      },
    },
  ],
};

export const primaryCitation = (source: PersonaSource): string =>
  `One Piece, ${source.chapters} (Eiichiro Oda, Shueisha)`;

/** Where the sources are listed; /credits and the talk link here. */
export const PERSONA_SOURCES_ID = 'sources';

export const PERSONA_SOURCES_PATH = `/about/#${PERSONA_SOURCES_ID}`;

/** The /credits notice, or null to render none. */
export const personaNotice = (persona: Persona | null): string | null =>
  persona === null ? null : `${persona.tribute} ${persona.rights}`;

export const PERSONA_NOTICE_ID = 'sample-persona';
