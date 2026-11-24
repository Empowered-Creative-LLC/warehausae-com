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

    // Public Laravel Cloud / R2 bucket URL used when AWS_URL is unset (PR
    // preview environments typically do not inherit this env var). The
    // hostname is already public on the live site; it is not a credential.
    // A local override that sets this to null/empty is required if you want
    // to serve the gitignored public/assets/imported/ tree from disk —
    // an empty AWS_URL alone now falls back to this URL.
    'imported_assets_base_url' => env('AWS_URL') ?: 'https://fls-a22bed4f-c9d7-467d-8de1-0126a14e582f.laravel.cloud',

    /*
    |--------------------------------------------------------------------------
    | Google Analytics 4
    |--------------------------------------------------------------------------
    |
    | Measurement ID for the "Warehaus - GA4" data stream. Leave empty locally
    | so localhost traffic does not pollute reports; set in Laravel Cloud.
    |
    */

    'ga4_measurement_id' => env('GA4_MEASUREMENT_ID'),

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
