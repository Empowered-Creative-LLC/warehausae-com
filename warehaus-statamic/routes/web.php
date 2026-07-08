<?php

use Illuminate\Support\Facades\Route;
use Statamic\Facades\Entry;
use Statamic\View\View;

// Internal-only styleguide. Not linked from public nav; used for design QA.
Route::get('/design/styleguide', function () {
    return (new View)
        ->template('design.styleguide')
        ->layout('layout')
        ->with([
            'title' => 'Styleguide',
            'site_info' => Statamic\Facades\GlobalSet::find('site_info')?->inDefaultSite()->data() ?? collect(),
            'social' => Statamic\Facades\GlobalSet::find('social')?->inDefaultSite()->data() ?? collect(),
            'footer' => Statamic\Facades\GlobalSet::find('footer')?->inDefaultSite()->data() ?? collect(),
        ])
        ->render();
})->name('styleguide');

// All public routes are normally handled by Statamic's catch-all dispatcher.
// The exception is the /Industries/{slug}/ path: those URLs are capitalized
// on the live WordPress site and the migration's zero-301 contract requires
// preserving that exact casing. Statamic's UrlBuilder always slugifies (i.e.
// lowercases) URLs it builds from collection routes, so we register an
// explicit Laravel route for this prefix and resolve the entry by slug.
Route::get('/Industries/{slug}', function (string $slug) {
    $entry = Entry::query()
        ->where('collection', 'industries_categories')
        ->where('slug', $slug)
        ->first();
    if (!$entry) abort(404);
    return (new View)
        ->template($entry->template())
        ->layout($entry->layout())
        ->with($entry->toAugmentedArray())
        ->render();
});
Route::get('/Industries/{slug}/', function (string $slug) {
    $entry = Entry::query()
        ->where('collection', 'industries_categories')
        ->where('slug', $slug)
        ->first();
    if (!$entry) abort(404);
    return (new View)
        ->template($entry->template())
        ->layout($entry->layout())
        ->with($entry->toAugmentedArray())
        ->render();
});

// Permanent (301) redirects preserving inbound links after collections moved
// to slug-based routes (news → /news/{slug}, case studies → /case-studies/{slug},
// and the three /industry/{x}/ portfolio categories → /industry-{x}/). Registered
// explicitly so they take precedence over Statamic's catch-all dispatcher. Both
// slashed and unslashed variants are covered.
$permanentRedirects = [
    // News posts (previously served at the site root)
    '/press_release_acquisition' => '/news/press_release_acquisition/',
    '/press_release-office_purchase' => '/news/press_release-office_purchase/',
    '/warehaus-announces-leadership-promotions' => '/news/warehaus-announces-leadership-promotions/',
    '/warehaus-leadership-promotions' => '/news/warehaus-leadership-promotions/',
    '/warehaus-named-national-finalist-for-holiday-campaign-celebrating-york-county' => '/news/warehaus-named-national-finalist-for-holiday-campaign-celebrating-york-county/',
    '/warehaus-welcomes-courtney-weaver-as-chief-financial-officer' => '/news/warehaus-welcomes-courtney-weaver-as-chief-financial-officer/',

    // Case studies (previously under /case-study/, plus a legacy duplicate slug)
    '/case-study/bischoff-inn' => '/case-studies/bischoff-inn/',
    '/case-study-bischoff-inn' => '/case-studies/bischoff-inn/',
    '/case-study/municipal-engineering' => '/case-studies/municipal-engineering/',

    // Portfolio categories previously nested under /industry/
    '/industry/historic' => '/industry-historic/',
    '/industry/municipal' => '/industry-municipal/',
    '/industry/civil-engineering' => '/industry-civil-engineering/',
];

foreach ($permanentRedirects as $from => $to) {
    Route::redirect($from, $to, 301);
    Route::redirect($from.'/', $to, 301);
}

