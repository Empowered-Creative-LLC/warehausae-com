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
        $entry = $this->context->value();

        $projects = match ($context) {
            'featured' => ProjectListing::featured($limit),
            'service' => ProjectListing::forService(
                (string) ($entry?->slug() ?? $this->params->get('slug', '')),
                $entry?->url(),
                $limit,
            ),
            'portfolio_category' => ProjectListing::forPortfolioCategory(
                (string) ($entry?->get('url') ?? $this->params->get('url', '')),
                $limit,
            ),
            'related' => $entry
                ? ProjectListing::relatedTo($entry, $limit)
                : collect(),
            default => ProjectListing::all($limit),
        };

        if ($context === 'related' && $entry === null && $this->params->has('id')) {
            $relatedEntry = Entry::find($this->params->get('id'));

            if ($relatedEntry) {
                $projects = ProjectListing::relatedTo($relatedEntry, $limit);
            }
        }

        return [
            'projects' => $projects
                ->map(fn ($project) => ProjectListing::toCarouselItem($project))
                ->all(),
        ];
    }
}
