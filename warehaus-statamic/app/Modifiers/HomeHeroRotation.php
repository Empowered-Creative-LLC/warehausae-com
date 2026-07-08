<?php

namespace App\Modifiers;

use App\Support\HomeHeroImages;
use Statamic\Modifiers\Modifier;

class HomeHeroRotation extends Modifier
{
    public function index($value, $params, $context)
    {
        return json_encode(HomeHeroImages::rotationUrls($value));
    }
}
