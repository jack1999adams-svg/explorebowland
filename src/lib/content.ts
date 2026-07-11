import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** All published posts, newest first. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', (e) => !e.data.draft);
  return posts.sort((a, b) => {
    const da = a.data.pubDate ? +new Date(a.data.pubDate) : 0;
    const db = b.data.pubDate ? +new Date(b.data.pubDate) : 0;
    return db - da;
  });
}

/** Card-friendly view model for a post. */
export function toCard(p: Post) {
  return {
    href: p.data.path,
    title: p.data.title,
    description: p.data.description,
    hero: p.data.hero,
    heroAlt: p.data.heroAlt,
    categories: p.data.categories,
    pubDate: p.data.pubDate,
  };
}
