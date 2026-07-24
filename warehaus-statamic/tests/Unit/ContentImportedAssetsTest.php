<?php

namespace Tests\Unit;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

class ContentImportedAssetsTest extends TestCase
{
    public function test_content_imported_asset_paths_exist_locally_when_tree_is_present(): void
    {
        $importedDir = public_path('assets/imported');

        $hasImportedFiles = is_dir($importedDir)
            && (count(File::directories($importedDir)) > 0 || count(File::files($importedDir)) > 0);

        if (! $hasImportedFiles) {
            $this->markTestSkipped('Local imported/ tree is empty (gitignored). Run ensure + upload on a machine with assets.');
        }

        $contentDir = base_path('content');
        $this->assertDirectoryExists($contentDir);

        $missing = [];
        $pattern = '/\/assets\/imported\/[^\s\'"\)>#]+/';

        foreach (File::allFiles($contentDir) as $file) {
            $ext = strtolower($file->getExtension());
            if (! in_array($ext, ['md', 'yaml', 'yml', 'html'], true)) {
                continue;
            }

            $text = $file->getContents();
            if (! preg_match_all($pattern, $text, $matches)) {
                continue;
            }

            foreach ($matches[0] as $raw) {
                $ref = rtrim($raw, '.,;');
                $absolute = public_path(ltrim($ref, '/'));

                if (! is_file($absolute)) {
                    $missing[$ref] = true;
                }
            }
        }

        $list = array_keys($missing);
        sort($list);

        $this->assertSame(
            [],
            $list,
            "Content references missing imported assets. Run:\n".
            "  node scripts/ensure-imported-assets.mjs\n".
            "  bash scripts/upload-imported-to-r2.sh\n".
            'Missing: '.implode(', ', array_slice($list, 0, 20)).
            (count($list) > 20 ? ' …' : '')
        );
    }
}
