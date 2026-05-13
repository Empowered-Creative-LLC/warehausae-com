// Phase 11 polish — crawl every editorial URL on localhost, collect <img src>
// references that point to /assets/imported/ but 404, and fetch them from the
// live warehausae.com WP uploads.
//
// Catches size-variant images (-1024x683.webp etc.) that were referenced in
// the markdown body but not in the extracted images list during the initial
// import.

import { readFile, mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const APP_PUBLIC = join(ROOT, '..', 'warehaus-statamic', 'public');
const STATUS_JSON = join(ROOT, 'scraped', '_discovery', 'url-status.json');
const LOCAL = 'http://localhost:8000';
const LIVE_IMG = 'https://warehausae.com/wp-content/uploads/';

const status = JSON.parse(await readFile(STATUS_JSON, 'utf8'));
const urls = [...new Set(
    status.results.filter((r) => r.finalStatus === 200).map((r) => new URL(r.finalUrl).pathname),
)];

const missing = new Set();

console.log(`Scanning ${urls.length} pages for missing /assets/imported/ references...`);

for (let i = 0; i < urls.length; i++) {
    const path = urls[i];
    if (i % 25 === 0) console.log(`  ${i}/${urls.length} scanned, ${missing.size} unique missing so far`);
    let html;
    try {
        const res = await fetch(LOCAL + path);
        if (!res.ok) continue;
        html = await res.text();
    } catch {
        continue;
    }
    const refs = new Set();
    for (const m of html.matchAll(/(?:src|href)="(\/assets\/imported\/[^"]+)"/g)) {
        refs.add(m[1]);
    }
    for (const ref of refs) {
        try {
            await stat(join(APP_PUBLIC, ref));
        } catch {
            missing.add(ref);
        }
    }
}

console.log(`\nFound ${missing.size} unique missing images. Fetching...`);

let downloaded = 0;
let failed = 0;

for (const ref of [...missing].sort()) {
    const localPath = join(APP_PUBLIC, ref);
    const tail = ref.replace(/^\/assets\/imported\//, '');
    const remote = LIVE_IMG + tail;
    try {
        const res = await fetch(remote, {
            headers: { 'User-Agent': 'Mozilla/5.0 (warehaus-migration-tool)' },
            redirect: 'follow',
        });
        if (!res.ok || !res.body) {
            failed++;
            console.log(`  FAIL ${res.status} ${remote}`);
            continue;
        }
        await mkdir(dirname(localPath), { recursive: true });
        await pipeline(res.body, createWriteStream(localPath));
        downloaded++;
    } catch (err) {
        failed++;
        console.log(`  FAIL ${err.message} ${remote}`);
    }
}

console.log(`\nSummary: downloaded=${downloaded}, failed=${failed}, total=${missing.size}`);
