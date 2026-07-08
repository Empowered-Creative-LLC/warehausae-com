<?php

namespace Tests\Unit;

use App\Support\HomeHeroImages;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class HomeHeroImagesTest extends TestCase
{
    public function test_rotation_urls_prepends_resolved_legacy_hero(): void
    {
        Config::set('warehaus.home_hero_images', ['/assets/images/home/hero/a.png']);
        Config::set('warehaus.imported_assets_base_url', 'https://cdn.example.test');

        $urls = HomeHeroImages::rotationUrls('/assets/imported/2023/03/Warehaus-Headquarters-05_2014-0437.jpg');

        $this->assertSame([
            'https://cdn.example.test/imported/2023/03/Warehaus-Headquarters-05_2014-0437.jpg',
            '/assets/images/home/hero/a.png',
        ], $urls);
    }

    public function test_rotation_urls_omits_legacy_when_empty(): void
    {
        Config::set('warehaus.home_hero_images', ['/assets/images/home/hero/a.png']);

        $this->assertSame(['/assets/images/home/hero/a.png'], HomeHeroImages::rotationUrls(null));
        $this->assertSame(['/assets/images/home/hero/a.png'], HomeHeroImages::rotationUrls(''));
    }
}
