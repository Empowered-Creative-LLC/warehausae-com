<?php

namespace App\Modifiers;

use App\Support\ImportedAssetUrl as ImportedAssetUrlResolver;
use Statamic\Modifiers\Modifier;

class ImportedAssetUrlsInHtml extends Modifier
{
    public function index($value, $params, $context)
    {
        return ImportedAssetUrlResolver::rewriteInHtml($value);
    }
}
