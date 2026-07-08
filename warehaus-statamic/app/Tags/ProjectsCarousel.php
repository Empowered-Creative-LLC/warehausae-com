<?php

namespace App\Tags;

use App\Support\ProjectListing;
use Statamic\Facades\Entry;
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

        $projects = match ($context) {
            'featured' => ProjectListing::featured($limit),
            'service' => ProjectListing::forService($currentSlug, $currentUrl ?: null, $limit),
            'portfolio_category' => ProjectListing::forPortfolioCategory($currentUrl, $limit),
            'related' => $this->related($currentId, $limit),
            default => ProjectListing::all($limit),
        };

        return [
            'projects' => $projects
                ->map(fn ($project) => ProjectListing::toCarouselItem($project))
                ->all(),
        ];
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
