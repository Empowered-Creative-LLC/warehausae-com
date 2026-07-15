<?php

namespace App\Support;

use Illuminate\Support\Collection;
use Statamic\Contracts\Entries\Entry;
use Statamic\Facades\Entry as EntryFacade;

class ProjectListing
{
    /** @var array<string, list<string>> */
    private const PORTFOLIO_CATEGORY_INDUSTRY_KEYS = [
        'adaptive-reuse' => ['adaptive-reuse', 'adaptivereuse'],
        'arts_culture' => ['arts-and-culture', 'artsculture'],
        'building-sciences' => ['building-sciences', 'buildingsciences'],
        'corporate-office' => ['office'],
        'distribution_manufacturing' => ['distribution-and-manufacturing', 'distributionmanufacturing', 'data-centers', 'datacenters'],
        'education' => ['education'],
        'healthcare' => ['medical'],
        'historic' => ['historic'],
        'multi-family' => ['multi-family', 'multifamily'],
        'residential-development' => ['residential-development', 'residentialdevelopment'],
        'retail_hospitality' => ['retail', 'hospitality', 'commercial', 'retail-and-hospitality'],
    ];

    /** @var array<string, list<string>> */
    private const SERVICE_MATCH_KEYS = [
        'architecture' => ['architecture'],
        'civil_engineering' => ['civil', 'civil_engineering'],
        'historic-preservation' => ['historic', 'historic_preservation', 'historic-preservation'],
        'interior_design' => ['interior', 'interiors', 'interior_design'],
        'structural' => ['structural'],
    ];

    /**
     * @return Collection<int, Entry>
     */
    public static function all(int $limit = 96): Collection
    {
        return self::baseQuery()
            ->take($limit)
            ->values();
    }

    /**
     * @return Collection<int, Entry>
     */
    public static function featured(int $limit = 6): Collection
    {
        return self::baseQuery()
            ->sortByDesc(fn (Entry $entry) => $entry->lastModified())
            ->take($limit)
            ->values();
    }

    /**
     * @param  list<string>  $baselineUrls
     * @return Collection<int, Entry>
     */
    public static function forService(
        string $serviceSlug,
        ?string $serviceUrl = null,
        int $limit = 96,
        array $baselineUrls = [],
    ): Collection {
        $serviceUrl ??= '/services/'.$serviceSlug.'/';
        $baselineKeys = self::normalizedUrlKeys($baselineUrls);

        $matched = self::baseQuery()
            ->filter(function (Entry $entry) use ($serviceSlug, $serviceUrl, $baselineKeys) {
                if (isset($baselineKeys[self::normalizePath((string) $entry->url())])) {
                    return true;
                }

                return self::entryMatchesService($entry, $serviceSlug, $serviceUrl);
            });

        if ($baselineKeys !== []) {
            $matchedIds = $matched->mapWithKeys(fn (Entry $entry) => [$entry->id() => true]);

            $baselineOnly = EntryFacade::query()
                ->where('collection', 'projects')
                ->where('published', true)
                ->get()
                ->reject(fn (Entry $entry) => self::isEditorTemplateEntry($entry))
                ->filter(function (Entry $entry) use ($baselineKeys, $matchedIds) {
                    if (isset($matchedIds[$entry->id()])) {
                        return false;
                    }

                    return isset($baselineKeys[self::normalizePath((string) $entry->url())]);
                });

            $matched = $matched->concat($baselineOnly);

            return $matched->pipe(
                fn (Collection $entries) => self::sortPortfolioCategoryCarousel($entries, $baselineUrls, $limit)
            );
        }

        return $matched->take($limit)->values();
    }

    /**
     * @return Collection<int, Entry>
     */
    /**
     * @param  list<string>  $baselineUrls
     * @return Collection<int, Entry>
     */
    public static function forPortfolioCategory(
        string $categoryUrl,
        ?string $categoryName = null,
        int $limit = 96,
        array $baselineUrls = [],
    ): Collection {
        $baselineKeys = self::normalizedUrlKeys($baselineUrls);

        $matched = self::baseQuery()
            ->filter(function (Entry $entry) use ($categoryUrl, $categoryName, $baselineKeys) {
                if (isset($baselineKeys[self::normalizePath((string) $entry->url())])) {
                    return true;
                }

                return self::entryMatchesPortfolioCategory($entry, $categoryUrl, $categoryName);
            });

        if ($baselineKeys !== []) {
            $matchedIds = $matched->mapWithKeys(fn (Entry $entry) => [$entry->id() => true]);

            $baselineOnly = EntryFacade::query()
                ->where('collection', 'projects')
                ->where('published', true)
                ->get()
                ->reject(fn (Entry $entry) => self::isEditorTemplateEntry($entry))
                ->filter(function (Entry $entry) use ($baselineKeys, $matchedIds) {
                    if (isset($matchedIds[$entry->id()])) {
                        return false;
                    }

                    return isset($baselineKeys[self::normalizePath((string) $entry->url())]);
                });

            $matched = $matched->concat($baselineOnly);
        }

        return $matched->pipe(fn (Collection $entries) => self::sortPortfolioCategoryCarousel($entries, $baselineUrls, $limit));
    }

    /**
     * New projects (not in the baseline list) appear first by last modified; known
     * projects keep the baseline order scraped from the live site.
     *
     * @param  Collection<int, Entry>  $entries
     * @param  list<string>  $baselineUrls
     * @return Collection<int, Entry>
     */
    public static function sortPortfolioCategoryCarousel(Collection $entries, array $baselineUrls, int $limit = 96): Collection
    {
        if ($baselineUrls === []) {
            return $entries->take($limit)->values();
        }

        $baselineIndex = self::normalizedUrlKeys($baselineUrls);

        [$known, $new] = $entries->partition(
            fn (Entry $entry) => isset($baselineIndex[self::normalizePath((string) $entry->url())])
        );

        return $new
            ->sortByDesc(fn (Entry $entry) => $entry->lastModified())
            ->concat(
                $known->sortBy(
                    fn (Entry $entry) => $baselineIndex[self::normalizePath((string) $entry->url())]
                )
            )
            ->take($limit)
            ->values();
    }

    /**
     * @return Collection<int, Entry>
     */
    public static function relatedTo(Entry $project, int $limit = 96): Collection
    {
        $industryUrls = collect($project->get('industries', []))
            ->pluck('url')
            ->filter()
            ->map(fn (string $url) => self::normalizePath($url))
            ->all();

        return self::baseQuery()
            ->reject(fn (Entry $entry) => $entry->id() === $project->id())
            ->sortByDesc(function (Entry $entry) use ($industryUrls) {
                $entryUrls = collect($entry->get('industries', []))
                    ->pluck('url')
                    ->filter()
                    ->map(fn (string $url) => self::normalizePath($url));

                return $entryUrls->intersect($industryUrls)->count();
            })
            ->take($limit)
            ->values();
    }

    /**
     * @return array{title: string, url: string, image: mixed, image_url: ?string, categories: list<string>}
     */
    public static function toCarouselItem(Entry $entry): array
    {
        $serviceLabels = collect($entry->get('services_provided', []))
            ->pluck('label')
            ->filter()
            ->values()
            ->all();

        $industryLabels = collect($entry->get('industries', []))
            ->pluck('label')
            ->filter()
            ->values()
            ->all();

        $labels = $serviceLabels !== [] ? $serviceLabels : $industryLabels;

        return [
            'title' => (string) $entry->get('title'),
            'url' => $entry->url(),
            'image' => $entry->get('hero_image'),
            'image_url' => $entry->get('hero_image_url'),
            'categories' => $labels,
            'categories_label' => implode(', ', $labels),
        ];
    }

    public static function isEditorTemplateEntry(Entry $entry): bool
    {
        if ((bool) $entry->get('is_editor_template')) {
            return true;
        }

        return $entry->slug() === '_template';
    }

    /**
     * @return Collection<int, Entry>
     */
    private static function baseQuery(): Collection
    {
        return EntryFacade::query()
            ->where('collection', 'projects')
            ->where('published', true)
            ->get()
            ->reject(fn (Entry $entry) => self::isEditorTemplateEntry($entry) || (bool) $entry->get('is_test_fits_subpage'))
            ->sortByDesc(fn (Entry $entry) => $entry->lastModified());
    }

  /**
     * @param  list<array<string, mixed>>  $servicesProvided
     */
    public static function projectProvidesService(array $servicesProvided, string $serviceSlug, string $serviceUrl): bool
    {
        if ($servicesProvided === []) {
            return false;
        }

        foreach ($servicesProvided as $row) {
            if (! is_array($row)) {
                continue;
            }

            $rowUrl = (string) ($row['url'] ?? '');

            if ($rowUrl !== '' && self::pathsMatch($rowUrl, $serviceUrl)) {
                return true;
            }

            $rowKey = self::slugKey(basename(rtrim($rowUrl, '/')));

            if ($rowKey !== '' && self::serviceSlugMatches($serviceSlug, $rowKey)) {
                return true;
            }
        }

        return false;
    }

    /**
     * A project belongs to a category when any of its industry rows match the
     * category by URL (legacy imported paths) or by label (resilient to the
     * URL restructuring, since imported category URLs and slugs disagree).
     *
     * @param  list<array<string, mixed>>  $industries
     */
    public static function projectBelongsToCategory(array $industries, string $categoryUrl, ?string $categoryName = null): bool
    {
        if ($industries === []) {
            return false;
        }

        $categoryNameKey = $categoryName !== null ? self::slugKey($categoryName) : '';
        $categorySlug = basename(rtrim($categoryUrl, '/'));
        $industryKeys = self::PORTFOLIO_CATEGORY_INDUSTRY_KEYS[$categorySlug] ?? [];

        foreach ($industries as $row) {
            if (! is_array($row)) {
                continue;
            }

            $rowUrl = (string) ($row['url'] ?? '');

            if ($rowUrl !== '' && self::pathsMatch($rowUrl, $categoryUrl)) {
                return true;
            }

            $rowLabel = (string) ($row['label'] ?? '');
            $rowLabelKey = self::slugKey($rowLabel);
            $rowUrlKey = self::slugKey(basename(rtrim($rowUrl, '/')));

            if ($categoryNameKey !== '' && $rowLabel !== '' && $rowLabelKey === $categoryNameKey) {
                return true;
            }

            foreach ($industryKeys as $industryKey) {
                $key = self::slugKey($industryKey);

                if ($key !== '' && ($key === $rowLabelKey || $key === $rowUrlKey)) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function entryMatchesService(Entry $entry, string $serviceSlug, string $serviceUrl): bool
    {
        $rows = $entry->get('services_provided', []);

        return is_array($rows)
            && self::projectProvidesService($rows, $serviceSlug, $serviceUrl);
    }

    private static function entryMatchesPortfolioCategory(Entry $entry, string $categoryUrl, ?string $categoryName = null): bool
    {
        $rows = $entry->get('industries', []);

        return is_array($rows)
            && self::projectBelongsToCategory($rows, $categoryUrl, $categoryName);
    }

    private static function serviceSlugMatches(string $serviceSlug, string $projectServiceKey): bool
    {
        $allowed = self::SERVICE_MATCH_KEYS[$serviceSlug] ?? [str_replace('-', '_', $serviceSlug)];

        foreach ($allowed as $candidate) {
            $candidateKey = self::slugKey($candidate);

            if ($candidateKey === $projectServiceKey) {
                return true;
            }

            if (
                $candidateKey !== ''
                && $projectServiceKey !== ''
                && (str_starts_with($projectServiceKey, $candidateKey) || str_starts_with($candidateKey, $projectServiceKey))
            ) {
                return true;
            }
        }

        return self::slugKey($serviceSlug) === $projectServiceKey;
    }

    private static function pathsMatch(string $a, string $b): bool
    {
        $a = self::normalizePath($a);
        $b = self::normalizePath($b);

        if ($a === $b) {
            return true;
        }

        return self::slugKey(basename($a)) === self::slugKey(basename($b));
    }

    private static function normalizePath(string $path): string
    {
        return strtolower(trim($path, '/'));
    }

    private static function slugKey(string $value): string
    {
        $normalized = preg_replace('/[^a-z0-9]/', '', strtolower($value)) ?? '';

        return str_replace('and', '', $normalized);
    }

    /**
     * @param  list<string>  $urls
     * @return array<string, int>
     */
    private static function normalizedUrlKeys(array $urls): array
    {
        $keys = [];

        foreach ($urls as $index => $url) {
            $key = self::normalizePath($url);

            if ($key !== '') {
                $keys[$key] = $index;
            }
        }

        return $keys;
    }
}
