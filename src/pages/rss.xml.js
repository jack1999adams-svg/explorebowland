import rss from '@astrojs/rss';
import { getPosts } from '../lib/content';

export async function GET(context) {
  const posts = await getPosts();
  return rss({
    title: 'Explore Bowland',
    description: 'Walk guides and posts from the Forest of Bowland visitor guide.',
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate,
      link: p.data.path,
    })),
  });
}
