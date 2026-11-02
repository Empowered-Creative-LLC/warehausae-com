<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
@foreach($collections as $collectionName => $entries)
@foreach($entries as $entry)
@php
    // Skip entries without URLs or with draft status
    if (!$entry->url() || $entry->status === 'draft') {
        continue;
    }
    
    // Build absolute URL
    $url = url($entry->url());
    
    // Get last modified date
    $lastmod = $entry->lastModified() 
        ? $entry->lastModified()->toIso8601String() 
        : ($entry->date() ? $entry->date()->toIso8601String() : now()->toIso8601String());
@endphp
    <url>
        <loc>{{ $url }}</loc>
        <lastmod>{{ $lastmod }}</lastmod>
    </url>
@endforeach
@endforeach
</urlset>
