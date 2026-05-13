// URL classifier shared by firecrawl-crawl.js (Phase 2) and
// firecrawl-extract.js (Phase 4). Maps a warehausae.com URL to a template
// type so we can pick the matching extraction schema.

export const BUCKETS = [
    'Homepage',
    'Portfolio index (/portfolio/)',
    'Portfolio category (/industry/{slug}/)',
    'Project detail (/project/{slug}/)',
    'Project sub-page (/project/{slug}/{n}/)',
    'Service detail (/services/{slug}/) — canonical',
    'Service detail (/service/{slug}/) — legacy',
    'Services index',
    'Team member detail (/team/{slug}/)',
    'About / Culture / Careers',
    'Job posting (/job/{slug}/)',
    'Blog / News category index (/Industries/{slug}/)',
    'Blog / News post',
    'Case study (/case-study/{slug}/)',
    'Legal',
    'Legacy / redirect candidate (flat industry slug)',
    'Legacy / redirect candidate (/work/, /work__trashed/)',
    'WordPress / plugin internals (skip)',
    'One-off landing page',
    'Unknown / unclassified',
];

// Maps the crawl bucket to the Phase 3 schema name (and the Phase 4 output
// directory under scraped/{template_type}/). Keys are bucket strings,
// values are the lower-case template id.
export const BUCKET_TO_TEMPLATE = {
    'Homepage': 'homepage',
    'Portfolio index (/portfolio/)': 'page',
    'Portfolio category (/industry/{slug}/)': 'portfolio_category',
    'Project detail (/project/{slug}/)': 'project',
    'Project sub-page (/project/{slug}/{n}/)': 'project',
    'Service detail (/services/{slug}/) — canonical': 'service',
    // legacy /service/ URLs are 301s on the live site; not extracted
    'Services index': 'page',
    'Team member detail (/team/{slug}/)': 'team_member',
    'About / Culture / Careers': 'page',
    'Job posting (/job/{slug}/)': 'job_posting',
    'Blog / News category index (/Industries/{slug}/)': 'industries_category',
    'Blog / News post': 'news_post',
    'Case study (/case-study/{slug}/)': 'case_study',
    'Legal': 'page',
    'Legacy / redirect candidate (flat industry slug)': 'portfolio_category',
    'One-off landing page': 'page',
    // legacy /work/, /work__trashed/, WordPress internals, Service /service/
    // legacy, and Unknown are intentionally not mapped — we skip them in
    // Phase 4 extraction.
};

// Known canonical industry slugs (used to detect legacy flat URLs).
const INDUSTRY_SLUGS = new Set([
    'adaptive-reuse',
    'arts-and-culture',
    'arts_culture',
    'building-sciences',
    'civil-engineering',
    'corporate-office',
    'distribution-and-manufacturing',
    'distribution_manufacturing',
    'education',
    'healthcare',
    'historic',
    'multi-family',
    'municipal',
    'residential-development',
    'retail-and-hospitality',
    'retail_hospitality',
]);

const legalPatterns = [/privacy/i, /^\/terms/i, /cookie/i, /disclaimer/i];

const wpInternalPatterns = [
    /^\/wp-/, /^\/feed/, /^\/xmlrpc/, /\/cdn-cgi\//, /^\/\?p=/, /^\/page\/\d+/,
    /^\/author\//, /^\/tag\//, /^\/category\//, /^\/comments\//, /^\/wp-json\//,
    /^\/elementor-/, /^\/themencode-/, /^\/unlimited-charts-/, /^\/layout\//,
    /^\/work__trashed/,
];

function looksLikeNewsPost(path) {
    if (path.split('/').filter(Boolean).length !== 1) return false;
    if (!/^[a-z0-9_-]+$/.test(path.slice(1))) return false;
    if (/^\/warehaus-/.test(path)) return true;
    if (/^\/press_release/.test(path)) return true;
    // Note: /case-study-{slug}/ is intentionally NOT a news post — it is
    // the flat-dash variant of a case study and is classified separately.
    return false;
}

// /case-study-{slug}/ (flat-dash) is a case study, same template as the
// slash form /case-study/{slug}/ but with a different URL.
function looksLikeFlatDashCaseStudy(path) {
    return path.split('/').filter(Boolean).length === 1 && /^\/case-study-/.test(path);
}

const ONE_OFF_LANDINGS = new Set([
    '/future-architects-and-engineers',
    '/get-rewarded-for-referrals',
    '/happyholidays',
    '/harrisburg-project-map',
    '/interiors_visit',
    '/lunch-and-learns',
]);

export function classify(rawUrl) {
    let path;
    try {
        path = new URL(rawUrl).pathname.replace(/\/+$/, '') || '/';
    } catch {
        return 'Unknown / unclassified';
    }

    if (path === '/' || path === '/home' || path === '/index') return 'Homepage';
    if (wpInternalPatterns.some((re) => re.test(path))) return 'WordPress / plugin internals (skip)';

    if (path === '/portfolio') return 'Portfolio index (/portfolio/)';
    if (path === '/services') return 'Services index';

    if (/^\/industry\/[^/]+$/.test(path)) return 'Portfolio category (/industry/{slug}/)';
    if (/^\/Industries\/[^/]+$/.test(path)) return 'Blog / News category index (/Industries/{slug}/)';

    if (/^\/project\/[^/]+$/.test(path)) return 'Project detail (/project/{slug}/)';
    if (/^\/project\/[^/]+\/\d+$/.test(path)) return 'Project sub-page (/project/{slug}/{n}/)';

    if (/^\/services\/[^/]+$/.test(path)) return 'Service detail (/services/{slug}/) — canonical';
    if (/^\/service\/[^/]+$/.test(path)) return 'Service detail (/service/{slug}/) — legacy';

    if (/^\/team\/[^/]+$/.test(path)) return 'Team member detail (/team/{slug}/)';
    if (path === '/about' || path === '/culture' || path === '/careers') {
        return 'About / Culture / Careers';
    }
    if (/^\/job\/[^/]+$/.test(path)) return 'Job posting (/job/{slug}/)';
    if (/^\/case-study\/[^/]+$/.test(path)) return 'Case study (/case-study/{slug}/)';
    if (legalPatterns.some((re) => re.test(path))) return 'Legal';
    if (/^\/work\/[^/]+$/.test(path)) return 'Legacy / redirect candidate (/work/, /work__trashed/)';

    if (path.split('/').filter(Boolean).length === 1) {
        const slug = path.slice(1);
        if (looksLikeFlatDashCaseStudy(path)) return 'Case study (/case-study/{slug}/)';
        if (INDUSTRY_SLUGS.has(slug)) return 'Legacy / redirect candidate (flat industry slug)';
        if (ONE_OFF_LANDINGS.has(path)) return 'One-off landing page';
        if (looksLikeNewsPost(path)) return 'Blog / News post';
    }

    return 'Unknown / unclassified';
}

// Given a canonical URL (one that returns 200), tell us which template/
// schema applies. Distinct from classify() because canonical-url-map.md
// reveals that some legacy buckets (flat industry slugs) are actually
// canonical for portfolio categories.
export function templateForCanonicalUrl(rawUrl) {
    const bucket = classify(rawUrl);
    return BUCKET_TO_TEMPLATE[bucket] ?? null;
}

// Derive a Statamic-friendly slug from a full URL. Examples:
//   /project/bischoff-inn/        => bischoff-inn
//   /project/test-fits/3/         => test-fits-3
//   /case-study-bischoff-inn/     => case-study-bischoff-inn
//   /industry/civil-engineering/  => civil-engineering
//   /                             => home
export function slugFromUrl(rawUrl) {
    const path = new URL(rawUrl).pathname.replace(/\/+$/, '');
    if (!path || path === '') return 'home';
    const parts = path.split('/').filter(Boolean);
    // Drop the section prefix (project, services, team, job, case-study,
    // industry, Industries) — its slug is whatever follows.
    // Note: 'industry' is intentionally NOT in this set. Several portfolio
    // categories live at both /{slug}/ and /industry/{slug}/ (e.g. /historic/
    // + /industry/historic/) — stripping 'industry' would collide their
    // slugs. We preserve the prefix so they become 'industry-historic' etc.
    const SECTION_PREFIXES = new Set([
        'project', 'services', 'service', 'team', 'job', 'case-study',
        'Industries', 'portfolio',
    ]);
    let working = parts.slice();
    if (working.length > 1 && SECTION_PREFIXES.has(working[0])) {
        working = working.slice(1);
    }
    return working.join('-');
}
