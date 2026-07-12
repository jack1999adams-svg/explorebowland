// /llms.txt — a curated, LLM-friendly index of the site (see llmstxt.org).
// Generated at build time from the live post list so it never drifts.
import { getPosts } from '../lib/content';

const SITE = 'https://www.explorebowland.co.uk';
const absUrl = (p) => new URL(p, SITE + '/').href;

// Curated hub pages (mirrors the site's primary navigation).
const HUBS = [
  ['Things to Do', '/things-to-do/'],
  ['Towns & Villages', '/things-to-do/towns-and-villages/'],
  ['Places of Interest', '/things-to-do/places-of-interest/'],
  ['Photo Galleries', '/forest-of-bowland-photos/'],
  ['Eat · Drink · Sleep', '/eat-drink-sleep/'],
  ['Local Information', '/local-information/'],
  ['About the Forest of Bowland', '/forest-of-bowland/'],
  ['Get in Touch', '/get-in-touch/'],
];

const line = (title, href, desc) =>
  `- [${title}](${absUrl(href)})${desc ? `: ${desc.replace(/\s+/g, ' ').trim()}` : ''}`;

export async function GET() {
  const posts = await getPosts();
  const inCat = (c) => posts.filter((p) => p.data.categories.includes(c));
  const bowland = inCat('Bowland Walks');
  const other = inCat('Other area walks');
  const journal = posts.filter((p) => p.data.sectionParent === '/blog/');

  const body = [
    '# Explore Bowland',
    '',
    "> A walking and visitor guide to the Forest of Bowland — Lancashire's Area of Outstanding Natural Beauty. Detailed walk guides with routes, distances, difficulty ratings and local information, plus things to do, places to eat and stay, and photography.",
    '',
    'Explore Bowland has documented walks and days out across the Forest of Bowland and the neighbouring Yorkshire Dales and Lake District for over a decade. Every walk guide is written from first-hand experience on the ground. Walk guides carry structured route information (distance, ascent, difficulty, nearest postcode and more).',
    '',
    `## Bowland Walks (${bowland.length})`,
    ...bowland.map((p) => line(p.data.title, p.data.path, p.data.description)),
    '',
    `## Other Area Walks (${other.length})`,
    ...other.map((p) => line(p.data.title, p.data.path, p.data.description)),
    '',
    `## Journal (${journal.length})`,
    ...journal.map((p) => line(p.data.title, p.data.path, p.data.description)),
    '',
    '## Explore the Area',
    ...HUBS.map(([t, h]) => line(t, h)),
    '',
    '## Reference',
    line('Full sitemap (XML)', '/sitemap-index.xml'),
    line('RSS feed', '/rss.xml'),
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
