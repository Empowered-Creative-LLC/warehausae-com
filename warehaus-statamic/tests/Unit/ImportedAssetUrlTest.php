<?php

namespace Tests\Unit;

use App\Support\ImportedAssetUrl;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class ImportedAssetUrlTest extends TestCase
{
    public function test_resolve_returns_unchanged_url_without_base(): void
    {
        Config::set('warehaus.imported_assets_base_url', null);

        $url = '/assets/imported/2022/03/Asset-1.png';

        $this->assertSame($url, ImportedAssetUrl::resolve($url));
    }

    public function test_resolve_rewrites_imported_paths_when_base_is_set(): void
    {
        Config::set('warehaus.imported_assets_base_url', 'https://cdn.example.test');

        $this->assertSame(
            'https://cdn.example.test/imported/2022/03/Asset-1.png',
            ImportedAssetUrl::resolve('/assets/imported/2022/03/Asset-1.png'),
        );
    }

    public function test_resolve_leaves_non_imported_paths_unchanged(): void
    {
        Config::set('warehaus.imported_assets_base_url', 'https://cdn.example.test');

        $this->assertSame(
            '/assets/icons/home/Archit1-0.png',
            ImportedAssetUrl::resolve('/assets/icons/home/Archit1-0.png'),
        );
    }

    public function test_rewrite_in_html_replaces_imported_paths(): void
    {
        Config::set('warehaus.imported_assets_base_url', 'https://cdn.example.test');

        $html = '<img src="/assets/imported/2023/04/photo.jpg" alt="">';

        $this->assertSame(
            '<img src="https://cdn.example.test/imported/2023/04/photo.jpg" alt="">',
            ImportedAssetUrl::rewriteInHtml($html),
        );
    }
}
