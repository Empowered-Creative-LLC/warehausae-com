#!/usr/bin/env node
/**
 * Sync portfolio category content from scraped live-site audit data.
 * Run from migration-tool/: node scripts/update-portfolio-content.js
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.resolve(__dirname, '../../warehaus-statamic/content/collections/portfolio_categories');
const auditPath = path.resolve(__dirname, '../scraped/portfolio-live-audit.json');

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

// Retail uses an Elementor image carousel instead of background slideshow.
audit.retail_hospitality.gallery = [
  'http://warehausae.com/wp-content/uploads/2023/04/CY_BWICS_Bistro_Evening.jpg',
  'http://warehausae.com/wp-content/uploads/2023/04/The-Inn-at-Wyndridge-Farm_Professional-102314_00027.jpg',
  'http://warehausae.com/wp-content/uploads/2023/04/McHenry-Row-Courtyard-Marriott_int-e.jpg',
  'http://warehausae.com/wp-content/uploads/2023/04/Innmaster_3.jpg',
  'http://warehausae.com/wp-content/uploads/2023/04/The-Inn-at-Wyndridge-12_1979-0030.jpg',
  'http://warehausae.com/wp-content/uploads/2023/04/The-Inn-at-Wyndridge-Farm_Professional-102714_00082.jpg',
  'http://warehausae.com/wp-content/uploads/2023/04/CY_BWICS_Lobby_MediaPods2.jpg',
  'http://warehausae.com/wp-content/uploads/2023/04/Blackworth-Live-Fire-Grill-20191015_0108.jpg',
  'http://warehausae.com/wp-content/uploads/2023/04/Blackworth-Live-Fire-Grill-21060207_0110.jpg',
  'http://warehausae.com/wp-content/uploads/2023/04/Blackworth-Live-Fire-Grill-21060207_0106.jpg',
];

const slugToFile = {
  'adaptive-reuse': 'adaptive-reuse.md',
  arts_culture: 'arts_culture.md',
  'building-sciences': 'building-sciences.md',
  'corporate-office': 'corporate-office.md',
  distribution_manufacturing: 'distribution_manufacturing.md',
  education: 'education.md',
  healthcare: 'healthcare.md',
  historic: 'historic.md',
  'multi-family': 'multi-family.md',
  'residential-development': 'residential-development.md',
  retail_hospitality: 'retail_hospitality.md',
};

const importedRoot = path.resolve(__dirname, '../../warehaus-statamic/public/assets/imported');

function wpToImported(url) {
  if (!url) return null;
  const m = url.match(/wp-content\/uploads\/(.+)$/);
  return m ? `/assets/imported/${m[1]}` : null;
}

/** Resolve to a path that exists in public/assets/imported (handles .webp variants, -700x700 suffixes). */
function resolveImportedPath(importedPath) {
  if (!importedPath) return null;
  const rel = importedPath.replace(/^\/assets\/imported\//, '');
  const full = path.join(importedRoot, rel);
  if (fs.existsSync(full)) return importedPath;

  const dir = path.dirname(full);
  const base = path.basename(rel);
  const stem = base.replace(/\.[^.]+$/, '');
  const ext = path.extname(base);

  const candidates = [
    base.replace(/\.jpg$/i, '.webp'),
    base.replace(/\.jpeg$/i, '.webp'),
    stem + '-700x700' + ext,
    stem + '-700x700.webp',
  ];

  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const c of candidates) {
      if (files.includes(c)) return `/assets/imported/${path.join(path.dirname(rel), c).replace(/\\/g, '/')}`;
    }
    // Fuzzy: same stem, any extension
    const match = files.find((f) => f.startsWith(stem));
    if (match) return `/assets/imported/${path.join(path.dirname(rel), match).replace(/\\/g, '/')}`;
  }

  return importedPath;
}

function normalizeProjectUrl(href) {
  if (!href || href.includes('work__trashed')) return null;
  try {
    const u = new URL(href);
    return u.pathname.replace(/\/$/, '') + '/';
  } catch {
    return null;
  }
}

function toItems(list) {
  return list.map(({ text, href }) => ({
    label: text,
    ...(normalizeProjectUrl(href) ? { url: normalizeProjectUrl(href) } : {}),
  }));
}

function stripIntroBullets(prose) {
  if (!prose) return prose;
  const parts = prose.split(/\n\s*-\s+/);
  if (parts.length === 1) return prose.trim();
  return parts[0].trim();
}

function parseMd(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`No frontmatter: ${filePath}`);
  return { frontmatter: yaml.load(match[1]), body: match[2], raw };
}

function stringifyMd(frontmatter, body = '') {
  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true, quotingType: '"' });
  return `---\n${yamlStr}---\n${body}`;
}

// Custom group headings: [first column heading, second column heading]
const groupHeadings = {
  arts_culture: ['', ''],
  historic: [''],
  'adaptive-reuse': ['', ''],
  distribution_manufacturing: ['Design Capabilities', ''],
  'corporate-office': ['Capabilities', ''],
  'residential-development': ['Services', ''],
  'multi-family': ['Design Capabilities', ''],
};

for (const [slug, filename] of Object.entries(slugToFile)) {
  const filePath = path.join(contentDir, filename);
  const { frontmatter } = parseMd(filePath);
  const data = audit[slug];
  if (!data) continue;

  frontmatter.intro_prose = stripIntroBullets(frontmatter.intro_prose);

  if (data.capLists?.length) {
    const headings = groupHeadings[slug];
    frontmatter.capability_groups = data.capLists.map((list, i) => {
      const entry = { items: toItems(list) };
      const heading = headings?.[i] ?? frontmatter.capability_groups?.[i]?.heading;
      if (heading) entry.heading = heading;
      return entry;
    });
  } else if (frontmatter.capability_groups) {
    frontmatter.capability_groups = frontmatter.capability_groups.map((group) => ({
      ...group,
      items: (group.items || []).map((item) =>
        typeof item === 'string' ? { label: item } : item
      ),
    }));
  }

  // Historic: link Building Science to building-sciences page
  if (slug === 'historic') {
    const first = frontmatter.capability_groups?.[0]?.items?.[0];
    if (first?.label?.includes('Building Science')) {
      first.url = '/building-sciences/';
    }
  }

  if (data.video) {
    frontmatter.lead_video_id = data.video;
  } else {
    delete frontmatter.lead_video_id;
  }

  if (data.gallery?.length) {
    frontmatter.photo_gallery = data.gallery
      .map((url) => resolveImportedPath(wpToImported(url)))
      .filter(Boolean)
      .map((image_url) => ({ image_url }));
  } else {
    delete frontmatter.photo_gallery;
  }

  fs.writeFileSync(filePath, stringifyMd(frontmatter));
  console.log(`Updated ${filename}`);
}
