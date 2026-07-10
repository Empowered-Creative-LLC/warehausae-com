<?php

namespace Tests\Unit;

use App\Support\ProjectListing;
use Tests\TestCase;

class ProjectListingTest extends TestCase
{
    public function test_project_provides_service_matches_interior_aliases(): void
    {
        $rows = [['label' => 'Interiors', 'url' => '/services/interiors/']];

        $this->assertTrue(ProjectListing::projectProvidesService($rows, 'interior_design', '/services/interior_design/'));
        $this->assertFalse(ProjectListing::projectProvidesService($rows, 'structural', '/services/structural/'));
    }

    public function test_project_provides_service_matches_historic_preservation_slug(): void
    {
        $rows = [['label' => 'Historic', 'url' => '/services/historic-preservation/']];

        $this->assertTrue(ProjectListing::projectProvidesService($rows, 'historic-preservation', '/services/historic-preservation/'));
    }

    public function test_project_belongs_to_category_matches_corporate_office_to_office_industry(): void
    {
        $rows = [['label' => 'Office', 'url' => '/office/']];

        $this->assertTrue(ProjectListing::projectBelongsToCategory($rows, '/corporate-office/', 'corporate office'));
        $this->assertFalse(ProjectListing::projectBelongsToCategory($rows, '/healthcare/', 'healthcare'));
    }

    public function test_project_belongs_to_category_matches_distribution_manufacturing_aliases(): void
    {
        $rows = [['label' => 'Distribution and Manufacturing', 'url' => '/distribution-and-manufacturing/']];

        $this->assertTrue(ProjectListing::projectBelongsToCategory($rows, '/distribution_manufacturing/', 'distribution manufacturing'));
    }

    public function test_project_belongs_to_category_matches_healthcare_medical_alias(): void
    {
        $rows = [['label' => 'Medical', 'url' => '/medical/']];

        $this->assertTrue(ProjectListing::projectBelongsToCategory($rows, '/healthcare/', 'healthcare'));
    }

    public function test_project_belongs_to_category_matches_retail_hospitality_aliases(): void
    {
        $rows = [['label' => 'Retail', 'url' => '/retail/']];

        $this->assertTrue(ProjectListing::projectBelongsToCategory($rows, '/retail_hospitality/', 'retail hospitality'));
    }

    public function test_sort_portfolio_category_carousel_prepends_new_projects_before_baseline_order(): void
    {
        $baseline = ['/project/older/', '/project/middle/', '/project/newest-baseline/'];

        $older = $this->carouselEntry('older', 100);
        $middle = $this->carouselEntry('middle', 200);
        $newestBaseline = $this->carouselEntry('newest-baseline', 300);
        $brandNew = $this->carouselEntry('brand-new', 400);

        $sorted = ProjectListing::sortPortfolioCategoryCarousel(
            collect([$older, $middle, $newestBaseline, $brandNew]),
            $baseline,
            10
        );

        $this->assertSame(
            ['brand-new', 'older', 'middle', 'newest-baseline'],
            $sorted->map(fn ($entry) => $entry->slug())->all()
        );
    }

    private function carouselEntry(string $slug, int $lastModified): object
    {
        return new class($slug, $lastModified) implements \Statamic\Contracts\Entries\Entry
        {
            public function __construct(private string $slug, private int $lastModified) {}

            public function slug()
            {
                return $this->slug;
            }

            public function url()
            {
                return '/project/'.$this->slug.'/';
            }

            public function lastModified()
            {
                return $this->lastModified;
            }

            public function get($key, $fallback = null)
            {
                return $fallback;
            }

            public function __call($method, $parameters)
            {
                throw new \BadMethodCallException("Method {$method} is not implemented.");
            }
        };
    }

    public function test_project_belongs_to_category_matches_url_variants(): void
    {
        $rows = [['label' => 'Retail and Hospitality', 'url' => '/retail-and-hospitality/']];

        $this->assertTrue(ProjectListing::projectBelongsToCategory($rows, '/retail_hospitality/'));
        $this->assertTrue(ProjectListing::projectBelongsToCategory($rows, '/healthcare/') === false);
    }

    public function test_project_belongs_to_category_matches_by_label_when_url_differs(): void
    {
        $rows = [['label' => 'Municipal', 'url' => '/industry/municipal/']];

        // After the route change the category serves at /industry-municipal/, which
        // no longer matches the imported /industry/municipal/ path — the label keeps it linked.
        $this->assertTrue(ProjectListing::projectBelongsToCategory($rows, '/industry-municipal/', 'municipal'));
        $this->assertFalse(ProjectListing::projectBelongsToCategory($rows, '/industry-municipal/', 'healthcare'));
    }

    public function test_is_editor_template_entry_matches_flag_and_slug(): void
    {
        $flagged = new class implements \Statamic\Contracts\Entries\Entry
        {
            public function get($key, $fallback = null)
            {
                return $key === 'is_editor_template' ? true : $fallback;
            }

            public function slug()
            {
                return 'some-slug';
            }

            public function __call($method, $parameters)
            {
                throw new \BadMethodCallException("Method {$method} is not implemented.");
            }
        };

        $slugOnly = new class implements \Statamic\Contracts\Entries\Entry
        {
            public function get($key, $fallback = null)
            {
                return $fallback;
            }

            public function slug()
            {
                return '_template';
            }

            public function __call($method, $parameters)
            {
                throw new \BadMethodCallException("Method {$method} is not implemented.");
            }
        };

        $this->assertTrue(ProjectListing::isEditorTemplateEntry($flagged));
        $this->assertTrue(ProjectListing::isEditorTemplateEntry($slugOnly));
    }

    public function test_to_carousel_item_prefers_service_labels(): void
    {
        $entry = new class implements \Statamic\Contracts\Entries\Entry
        {
            public function get($key, $fallback = null)
            {
                return match ($key) {
                    'title' => 'Sample Project',
                    'hero_image' => null,
                    'hero_image_url' => '/assets/sample.png',
                    'services_provided' => [
                        ['label' => 'Architecture', 'url' => '/services/architecture/'],
                    ],
                    'industries' => [
                        ['label' => 'Healthcare', 'url' => '/healthcare/'],
                    ],
                    default => $fallback,
                };
            }

            public function url()
            {
                return '/project/sample/';
            }

            public function __call($method, $parameters)
            {
                throw new \BadMethodCallException("Method {$method} is not implemented.");
            }
        };

        $item = ProjectListing::toCarouselItem($entry);

        $this->assertSame('Sample Project', $item['title']);
        $this->assertSame('/project/sample/', $item['url']);
        $this->assertSame('/assets/sample.png', $item['image_url']);
        $this->assertSame(['Architecture'], $item['categories']);
        $this->assertSame('Architecture', $item['categories_label']);
    }
}
