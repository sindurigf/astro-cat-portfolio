interface Dated {
  data: { date: Date; updated?: Date | undefined };
}

/** RSS 2.0 `lastBuildDate`: the latest `updated`, else `date`, of any post. */
export const lastChanged = (posts: readonly Dated[]): Date | undefined =>
  posts
    .map((post) => post.data.updated ?? post.data.date)
    .reduce<Date | undefined>(
      (latest, day) => (latest && latest >= day ? latest : day),
      undefined,
    );
