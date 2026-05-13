<?php

use Illuminate\Support\Facades\Route;
use Statamic\Facades\Entry;
use Statamic\View\View;

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
