<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Imported assets base URL
    |--------------------------------------------------------------------------
    |
    | Public base URL for migrated WordPress images stored in Laravel Cloud
    | object storage (R2). When set, /assets/imported/... paths in content and
    | templates resolve to {base}/imported/... Leave empty for local files.
    |
    */

    'imported_assets_base_url' => env('AWS_URL'),

    /*
    |--------------------------------------------------------------------------
    | Homepage hero rotation
    |--------------------------------------------------------------------------
    |
    | Background images cycled once per new browser session (see home.antlers).
    |
    */

    'home_hero_images' => [
        '/assets/images/hero-rotation/'.rawurlencode('Warehaus-Headquarters-05_2014-0437.jpg'),
        '/assets/images/hero-rotation/'.rawurlencode('Catalyst Muddy Creek-11-COMPRESSED.png'),
        '/assets/images/hero-rotation/'.rawurlencode('Project_York County History Center20240625_Tom_Holdsworth0001-COMPRESSED.png'),
        '/assets/images/hero-rotation/'.rawurlencode('Steel Works Apartments-5-COMPRESSED.png'),
        '/assets/images/hero-rotation/'.rawurlencode('Volvo Construction Equipment-497-HDR-COMPRESSED.png'),
        '/assets/images/hero-rotation/'.rawurlencode('YARCS Upper Schoo...l 11142018 04 of 09-COMPRESSED.png'),
        '/assets/images/hero-rotation/'.rawurlencode('York Country Day School_10192016_0011-COMPRESSED.png'),
    ],

];
