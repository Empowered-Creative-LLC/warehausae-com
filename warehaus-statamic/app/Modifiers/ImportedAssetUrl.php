<?php

namespace App\Modifiers;

use App\Support\ImportedAssetUrl as ImportedAssetUrlResolver;
use Statamic\Modifiers\Modifier;

class ImportedAssetUrl extends Modifier
{
    public function index($value, $params, $context)
    {
        return ImportedAssetUrlResolver::resolve($value);
    }
}
