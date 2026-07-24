<?php

namespace App\Tags;

use App\Support\ProjectListing;
use Illuminate\Support\Collection;
use Statamic\Facades\Entry;
use Statamic\Fields\Value;
use Statamic\Fields\Values;
use Statamic\Tags\Tags;

class ProjectsCarousel extends Tags
{
    /**
     * {{ projects_carousel context="service" limit="96" }} ... {{ /projects_carousel }}
     *
     * @return array{projects: list<array<string, mixed>>}
     */
    public function index(): array
    {
        $context = (string) $this->params->get('context', 'all');
        $limit = max(1, (int) $this->params->get('limit', 96));
        $currentSlug = (string) ($this->params->get('slug') ?? $this->context->value('slug') ?? '');
        $currentUrl = (string) ($this->params->get('url') ?? $this->context->value('url') ?? '');
        $currentId = $this->params->get('id') ?? $this->context->value('id');
        $categoryName = (string) ($this->context->value('category_name') ?? $this->context->value('title') ?? '');

        if ($context === 'portfolio_category') {
            $baselineUrls = $this->baselineProjectUrls();
            $projects = ProjectListing::forPortfolioCategory(
                $currentUrl,
                $categoryName ?: null,
                $limit,
                $baselineUrls
            );
        } else {
            $projects = match ($context) {
                'featured' => ProjectListing::featured($limit),
                'service' => ProjectListing::forService(
                    $currentSlug,
                    $currentUrl ?: null,
                    $limit,
                    $this->baselineProjectUrls()
                ),
                'related' => $this->related($currentId, $limit),
                default => ProjectListing::all($limit),
            };
        }

        return [
            'projects' => $projects
                ->map(fn ($project) => ProjectListing::toCarouselItem($project))
                ->all(),
        ];
    }

    /**
     * Portfolio category pages store a baseline recent_projects order scraped
     * from the live site. URLs define display order; project data comes from
     * Statamic entries matched by industry or baseline membership.
     *
     * @return list<string>
     */
    private function baselineProjectUrls(): array
    {
        $rows = $this->rowsToArray(
            $this->params->get('projects') ?? $this->context->value('recent_projects')
        );

        if ($rows === []) {
            return [];
        }

        return array_values(array_filter(array_map(
            fn (array $row) => (string) ($row['url'] ?? ''),
            $rows
        )));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function rowsToArray(mixed $rows): array
    {
        if ($rows instanceof Value) {
            $rows = $rows->value();
        }

        if ($rows instanceof Collection) {
            $rows = $rows->all();
        }

        if (is_object($rows) && method_exists($rows, 'toArray')) {
            $rows = $rows->toArray();
        }

        if (! is_array($rows)) {
            return [];
        }

        return array_values(array_map(function (mixed $row): array {
            if ($row instanceof Value) {
                $row = $row->value();
            }

            if ($row instanceof Values) {
                $row = $row->all();
            }

            if ($row instanceof Collection) {
                $row = $row->all();
            }

            return is_array($row) ? $row : [];
        }, $rows));
    }

    /**
     * @return \Illuminate\Support\Collection<int, \Statamic\Contracts\Entries\Entry>
     */
    private function related(mixed $id, int $limit): \Illuminate\Support\Collection
    {
        $entry = $id ? Entry::find($id) : null;

        return $entry
            ? ProjectListing::relatedTo($entry, $limit)
            : collect();
    }
}
