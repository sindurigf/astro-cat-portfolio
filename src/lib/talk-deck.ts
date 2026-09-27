import { getCollection, type CollectionEntry } from 'astro:content';

interface DeckSlide {
  slide: CollectionEntry<'talks'>;
  /** Empty for the cover. */
  part: string;
}

/** The loader guarantees slide 2 opens a part. */
export const talkDecks = async (): Promise<Map<string, DeckSlide[]>> => {
  const slides = await getCollection('talks');
  const decks = Map.groupBy(slides, (slide) => slide.data.deck);
  return new Map(
    [...decks].map(([deck, entries]) => {
      const ordered = entries.toSorted((a, b) => a.data.number - b.data.number);
      const parts = ordered.reduce<string[]>(
        (found, slide, i) => [
          ...found,
          slide.data.part ?? (i === 0 ? '' : found.at(-1)!),
        ],
        [],
      );
      return [deck, ordered.map((slide, i) => ({ slide, part: parts[i] }))];
    }),
  );
};
