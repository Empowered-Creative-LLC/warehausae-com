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

];
