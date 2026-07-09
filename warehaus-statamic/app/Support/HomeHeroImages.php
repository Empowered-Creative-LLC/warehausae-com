<?php

namespace App\Support;

class HomeHeroImages
{
    /**
     * @return list<string>
     */
    public static function rotationUrls(?string $legacyHeroUrl = null): array
    {
        $urls = config('warehaus.home_hero_images', []);

        if ($legacyHeroUrl !== null && $legacyHeroUrl !== '') {
            array_unshift($urls, ImportedAssetUrl::resolve($legacyHeroUrl));
        }

        return $urls;
    }
}
