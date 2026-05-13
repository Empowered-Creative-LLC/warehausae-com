// Generate draft Statamic blueprint YAML files from migration-tool/schemas/.
//
// One schema -> one blueprint at
//   warehaus-statamic/resources/blueprints/collections/{collection}/{collection}.yaml
//
// Mapping conventions:
//   JSON Schema           -> Statamic field
//   ------------------------------------------------------------------------
//   string                -> text       (single line)
//   string w/ "prose" or
//   "joined with newlines"-> textarea
//   string w/ "markdown"  -> bard (rich text)
//   integer / number      -> integer
//   url-like field name   -> text (link is awkward outside of Bard)
//   email-like field name -> text
//   array<string>         -> list
//   array<object>         -> grid (with nested fields)
//   object                -> group
//
// Hand-tuning happens AFTER generation: section/tab layout, validation, asset
// fields swapping in for image_url text fields, relations swapping in for
// services_provided / industries / categories arrays. The generator gives us
// a 90 %% complete starting blueprint.

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const SCHEMAS_DIR = join(ROOT, 'schemas');
const APP_ROOT = join(ROOT, '..', 'warehaus-statamic');
const BLUEPRINTS_ROOT = join(APP_ROOT, 'resources', 'blueprints', 'collections');

// Collection mapping — most schema names match collection names except for a
// couple we want plural / singular adjustments.
const SCHEMA_TO_COLLECTION = {
    service: 'services',
    team_member: 'team_members',
    portfolio_category: 'portfolio_categories',
    project: 'projects',
    job_posting: 'job_postings',
    case_study: 'case_studies',
    news_post: 'news_posts',
    page: 'pages',
    homepage: 'pages', // homepage entry lives inside `pages` collection
    industries_category: 'industries_categories',
};

// Per-collection presets layered on top of generated fields.
const COLLECTION_DEFAULTS = {
    services: { title: 'Service' },
    team_members: { title: 'Team Member' },
    portfolio_categories: { title: 'Portfolio Category' },
    projects: { title: 'Project' },
    job_postings: { title: 'Job Posting' },
    case_studies: { title: 'Case Study' },
    news_posts: { title: 'News Post' },
    pages: { title: 'Page' },
    industries_categories: { title: 'Industries Category' },
};

// Field-name -> Statamic field type overrides. URLs become text for now; the
// hand-tuning pass swaps individual ones to assets (single) or replaces the
// whole gallery with an assets (multiple) field once asset containers exist.
const FIELD_OVERRIDES = {
    email: { type: 'text', input_type: 'email' },
    phone: { type: 'text' },
    linkedin_url: { type: 'text' },
    apply_email: { type: 'text', input_type: 'email' },
    apply_url: { type: 'text', input_type: 'url' },
    body_markdown: { type: 'markdown' },
    raw_body_markdown: { type: 'markdown' },
    intro_prose: { type: 'textarea' },
    overview: { type: 'textarea' },
    bio: { type: 'textarea' },
    body: { type: 'textarea' },
    quote: { type: 'textarea' },
    excerpt: { type: 'textarea' },
    blurb: { type: 'textarea' },
};

function fieldFromSchema(name, schemaProp) {
    if (FIELD_OVERRIDES[name]) return { type: 'text', ...FIELD_OVERRIDES[name] };
    const type = schemaProp.type;
    if (type === 'integer' || type === 'number') return { type: 'integer' };
    if (type === 'boolean') return { type: 'toggle' };
    if (type === 'string') {
        const desc = (schemaProp.description ?? '').toLowerCase();
        if (desc.includes('markdown')) return { type: 'markdown' };
        if (desc.includes('prose') || desc.includes('joined with') || desc.includes('paragraph') || desc.includes('body of')) return { type: 'textarea' };
        return { type: 'text' };
    }
    if (type === 'array') {
        const items = schemaProp.items ?? {};
        if (items.type === 'string') return { type: 'list' };
        if (items.type === 'object') {
            const subFields = [];
            for (const [n, p] of Object.entries(items.properties ?? {})) {
                subFields.push({ handle: n, field: enhanceField(name + '_' + n, fieldFromSchema(n, p), p) });
            }
            return { type: 'grid', mode: 'stacked', fields: subFields };
        }
        return { type: 'list' };
    }
    if (type === 'object') {
        const subFields = [];
        for (const [n, p] of Object.entries(schemaProp.properties ?? {})) {
            subFields.push({ handle: n, field: enhanceField(name + '_' + n, fieldFromSchema(n, p), p) });
        }
        return { type: 'group', fields: subFields };
    }
    return { type: 'text' };
}

function enhanceField(name, field, schemaProp) {
    const display = name
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    const out = { ...field, display };
    if (schemaProp.description) out.instructions = schemaProp.description;
    return out;
}

function yamlDump(obj) {
    return yaml.dump(obj, { lineWidth: 200, noRefs: true, quotingType: '"' });
}

// ---------------------------------------------------------------------------

async function generateBlueprintForSchema(schemaPath) {
    const schemaJson = JSON.parse(await readFile(schemaPath, 'utf8'));
    const schemaName = basename(schemaPath, '.json');
    const collection = SCHEMA_TO_COLLECTION[schemaName];
    if (!collection) {
        console.log(`  ${schemaName}: skipped (no collection — taxonomy or non-collection schema)`);
        return;
    }

    const props = schemaJson.schema?.properties ?? {};
    const required = new Set(schemaJson.schema?.required ?? []);

    // Standard fields that every blueprint should have, in order.
    const fields = [];
    fields.push({ handle: 'title', field: { type: 'text', display: 'Title', required: true } });

    // Per-collection extras for URL routing.
    const perEntryUrlCollections = new Set(['pages', 'portfolio_categories', 'case_studies', 'news_posts']);
    if (perEntryUrlCollections.has(collection)) {
        fields.push({
            handle: 'url',
            field: {
                type: 'text',
                display: 'URL override',
                instructions: 'Absolute path (starting with /) that this entry should serve at. Statamic uses this as the route override, allowing different entries in this collection to live at different URL shapes (e.g. /healthcare/ vs /industry/civil-engineering/).',
                required: true,
            },
        });
    }

    // Schema-driven content fields.
    for (const [name, prop] of Object.entries(props)) {
        if (name === 'title' || name === 'seo') continue; // handled separately
        const field = enhanceField(name, fieldFromSchema(name, prop), prop);
        if (required.has(name)) field.required = true;
        fields.push({ handle: name, field });
    }

    // Source URL + SEO fields go in a separate tab.
    const seoFields = [
        { handle: 'source_url', field: { type: 'text', display: 'Source URL', instructions: 'The original WordPress URL this entry was imported from (for traceability).' } },
        { handle: 'seo_title', field: { type: 'text', display: 'SEO title' } },
        { handle: 'seo_description', field: { type: 'textarea', display: 'SEO description' } },
        { handle: 'seo_og_image_url', field: { type: 'text', display: 'OG image URL' } },
    ];

    const blueprint = {
        title: COLLECTION_DEFAULTS[collection]?.title ?? collection,
        tabs: {
            main: {
                display: 'Main',
                sections: [{ fields }],
            },
            seo: {
                display: 'SEO & Source',
                sections: [{ fields: seoFields }],
            },
        },
    };

    const outDir = join(BLUEPRINTS_ROOT, collection);
    await mkdir(outDir, { recursive: true });
    // For homepage schema, write a separate blueprint file inside the pages
    // collection. Otherwise the default blueprint name matches the singular
    // form of the collection.
    const outName = schemaName === 'homepage' ? 'homepage.yaml' : `${schemaName}.yaml`;
    const outPath = join(outDir, outName);
    const out = yamlDump(blueprint);
    await writeFile(outPath, out);
    console.log(`  ${schemaName} -> ${outPath.replace(APP_ROOT + '/', '')}`);
}

console.log('Generating Statamic blueprints from schemas:');
const files = (await readdir(SCHEMAS_DIR)).filter((f) => f.endsWith('.json'));
for (const f of files.sort()) {
    await generateBlueprintForSchema(join(SCHEMAS_DIR, f));
}
console.log('Done.');
