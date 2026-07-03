<?php

namespace App\Support;

class ImportedAssetUrl
{
    public static function baseUrl(): ?string
    {
        $base = rtrim((string) config('warehaus.imported_assets_base_url', ''), '/');

        return $base !== '' ? $base : null;
    }

    public static function resolve(?string $url): ?string
    {
        if ($url === null || $url === '') {
            return $url;
        }

        if (! str_starts_with($url, '/assets/imported/')) {
            return $url;
        }

        $base = self::baseUrl();

        if ($base === null) {
            return $url;
        }

        return $base.substr($url, strlen('/assets'));
    }

    public static function rewriteInHtml(?string $html): ?string
    {
        if ($html === null || $html === '') {
            return $html;
        }

        $base = self::baseUrl();

        if ($base === null) {
            return $html;
        }

        return str_replace('/assets/imported/', $base.'/imported/', $html);
    }
}
