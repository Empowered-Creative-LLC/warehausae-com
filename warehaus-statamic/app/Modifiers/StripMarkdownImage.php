<?php

namespace App\Modifiers;

use Statamic\Fields\Value;
use Statamic\Modifiers\Modifier;

class StripMarkdownImage extends Modifier
{
    /**
     * Remove images pointing at a given URL from a (markdown-derived) body.
     *
     * The URL comes from the first parameter, falling back to the entry's
     * `featured_image_url` in the current context. Imported news posts repeat
     * the featured image inside the body, which the template already renders at
     * the top — this strips that duplicate so the image only appears once.
     *
     * The `body_markdown` markdown field is augmented to HTML before it reaches
     * this modifier, so we strip matching <img> tags (and any wrapping empty
     * paragraph). Raw markdown image syntax is also handled as a fallback. The
     * featured image path may be stored raw (/assets/imported/...) or augmented
     * to an absolute CDN URL, so we try every available form.
     */
    public function index($value, $params, $context)
    {
        if (! is_string($value) || $value === '') {
            return $value;
        }

        $source = $params[0] ?? ($context['featured_image_url'] ?? null);

        $urls = [];
        if ($source instanceof Value) {
            $urls[] = $source->raw();
            $urls[] = $source->value();
        } else {
            $urls[] = $source;
        }

        $cleaned = $value;
        foreach (array_unique(array_filter($urls, 'is_string')) as $url) {
            if ($url === '') {
                continue;
            }

            $quoted = preg_quote($url, '/');

            $patterns = [
                // <img> wrapped in its own paragraph → drop the whole paragraph.
                '/<p>\s*<img[^>]*\bsrc=("|\')'.$quoted.'\1[^>]*>\s*<\/p>/i',
                // Bare <img> tag.
                '/<img[^>]*\bsrc=("|\')'.$quoted.'\1[^>]*>/i',
                // Raw markdown image syntax, with surrounding blank lines.
                '/\n*[ \t]*!\[[^\]]*\]\(\s*'.$quoted.'\s*(?:"[^"]*")?\)[ \t]*\n*/',
            ];

            foreach ($patterns as $pattern) {
                $result = preg_replace($pattern, '', $cleaned);
                if (is_string($result)) {
                    $cleaned = $result;
                }
            }
        }

        return trim($cleaned);
    }
}
