#!/usr/bin/env node
/**
 * Reorder recent_projects in portfolio category markdown to match live site carousel.
 * Run from migration-tool/: node scripts/sync-portfolio-carousel-order.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATEGORIES_DIR = path.join(__dirname, '../../warehaus-statamic/content/collections/portfolio_categories');
const LIVE_BASE = 'https://warehausae.com';

const pages = [
  'adaptive-reuse', 'arts_culture', 'building-sciences', 'corporate-office',
  'distribution_manufacturing', 'education', 'healthcare', 'historic',
  'multi-family', 'residential-development', 'retail_hospitality',
];

function extractLiveCarousel(html) {
  const recentIdx = html.search(/>\s*Recent\s*<\/span>\s*Projects|Recent\s*Projects/i);
  if (recentIdx < 0) return [];
  const slice = html.slice(recentIdx);
  const endIdx = slice.search(/What our clients|project in mind|Let's talk|elementor-location-footer/i);
  const section = endIdx > 0 ? slice.slice(0, endIdx) : slice.slice(0, 100000);
  const urls = [];
  const re = /e-child[^>]*href="https?:\/\/warehausae\.com(\/project\/[^"#?]+)/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(section)) !== null) {
    const u = m[1].replace(/\/$/, '') + '/';
    if (!seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }
  return urls;
}

function parseFrontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  return { yaml: match[1], body: match[2] };
}

function parseRecentProjects(yaml) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((l) => l === 'recent_projects:');
  if (start < 0) return { before: yaml, items: [], after: '' };

  let i = start + 1;
  const items = [];
  let current = null;

  while (i < lines.length) {
    const line = lines[i];
    if (/^[a-z0-9_]+:/.test(line) && !line.startsWith(' ')) break;
    if (line.startsWith('  - title:')) {
      if (current) items.push(current);
      current = { lines: [line], url: null };
    } else if (current) {
      current.lines.push(line);
      const urlMatch = line.match(/^\s+url:\s+(\S+)/);
      if (urlMatch) current.url = urlMatch[1].replace(/\/$/, '') + '/';
    }
    i++;
  }

  if (current) items.push(current);

  const before = lines.slice(0, start + 1).join('\n');
  const after = lines.slice(i).join('\n');

  return { before, items, after };
}

function rebuildYaml({ before, items, after }) {
  const blocks = items.map((item) => item.lines.join('\n'));
  const middle = blocks.length ? '\n' + blocks.join('\n') : '';
  const tail = after ? '\n' + after : '';
  return before + middle + tail;
}

async function main() {
  for (const slug of pages) {
    const file = path.join(CATEGORIES_DIR, `${slug}.md`);
    const html = await (await fetch(`${LIVE_BASE}/${slug}/`)).text();
    const liveUrls = extractLiveCarousel(html);
    const text = fs.readFileSync(file, 'utf8');
    const parsed = parseFrontMatter(text);
    if (!parsed) {
      console.log(`SKIP ${slug}: no front matter`);
      continue;
    }

    const rp = parseRecentProjects(parsed.yaml);
    const byUrl = new Map(rp.items.filter((i) => i.url).map((i) => [i.url, i]));
    const ordered = [];
    const used = new Set();

    for (const url of liveUrls) {
      const item = byUrl.get(url);
      if (item) {
        ordered.push(item);
        used.add(url);
      } else {
        console.log(`  ${slug}: live URL missing from markdown: ${url}`);
      }
    }

    for (const item of rp.items) {
      if (item.url && !used.has(item.url)) {
        ordered.push(item);
      }
    }

    const newYaml = rebuildYaml({ ...rp, items: ordered });
    fs.writeFileSync(file, `---\n${newYaml}\n---\n${parsed.body}`);
    console.log(`OK ${slug}: ${ordered.length} projects (${liveUrls.length} on live)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
