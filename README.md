# warehausae.com migration

Migration of warehausae.com from WordPress/Elementor to Laravel + Statamic 5.

## Layout

- `warehaus-statamic/` — the Laravel + Statamic 5 app (production target)
- `migration-tool/` — Node-based scrapers and importers used to pull content off the existing WordPress site and load it into Statamic

## Running the app

    cd warehaus-statamic
    php artisan serve         # http://localhost:8000
    npm run dev               # in another terminal, for Vite/Tailwind

Admin control panel lives at `/cp`.

## Running the migration tooling

    cd migration-tool
    cp .env.example .env      # then fill in FIRECRAWL_API_KEY
    node scripts/firecrawl-crawl.js

See the full project brief in the original migration plan for the 13-phase roadmap.
