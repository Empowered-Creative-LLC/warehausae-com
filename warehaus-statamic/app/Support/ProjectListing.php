<?php

namespace App\Support;

use Illuminate\Support\Collection;
use Statamic\Contracts\Entries\Entry;
use Statamic\Facades\Entry as EntryFacade;

class ProjectListing
{
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
     * @return Collection<int, Entry>
     */
    public static function forService(string $serviceSlug, ?string $serviceUrl = null, int $limit = 96): Collection
    {
        $serviceUrl ??= '/services/'.$serviceSlug.'/';

        return self::baseQuery()
            ->filter(fn (Entry $entry) => self::entryMatchesService($entry, $serviceSlug, $serviceUrl))
            ->take($limit)
            ->values();
    }

    /**
     * @return Collection<int, Entry>
     */
    public static function forPortfolioCategory(string $categoryUrl, ?string $categoryName = null, int $limit = 96): Collection
    {
        return self::baseQuery()
            ->filter(fn (Entry $entry) => self::entryMatchesPortfolioCategory($entry, $categoryUrl, $categoryName))
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

        return [
            'title' => (string) $entry->get('title'),
            'url' => $entry->url(),
            'image' => $entry->get('hero_image'),
            'image_url' => $entry->get('hero_image_url'),
            'categories' => $serviceLabels !== [] ? $serviceLabels : $industryLabels,
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
            ->sortBy(fn (Entry $entry) => strtolower((string) $entry->get('title')));
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

        foreach ($industries as $row) {
            if (! is_array($row)) {
                continue;
            }

            $rowUrl = (string) ($row['url'] ?? '');

            if ($rowUrl !== '' && self::pathsMatch($rowUrl, $categoryUrl)) {
                return true;
            }

            $rowLabel = (string) ($row['label'] ?? '');

            if ($categoryNameKey !== '' && $rowLabel !== '' && self::slugKey($rowLabel) === $categoryNameKey) {
                return true;
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
}
