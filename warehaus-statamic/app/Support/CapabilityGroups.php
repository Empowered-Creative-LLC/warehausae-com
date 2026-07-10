<?php

namespace App\Support;

class CapabilityGroups
{
    /**
     * Normalize portfolio capability_groups into renderable sections.
     *
     * Layouts:
     * - shared_heading: one heading with multi-column lists beneath (e.g. Capabilities)
     * - headed_columns: each column has its own heading (e.g. Suites | Buildings)
     * - unheaded_columns: multi-column lists with no heading (e.g. arts & culture)
     *
     * @param  list<array{heading?: string, items?: list<array{label: string, url?: string}>}>  $groups
     * @return list<array{layout: string, heading: ?string, columns: list<array{heading?: ?string, items: list<array<string, mixed>>}>}>
     */
    public static function normalize(array $groups): array
    {
        $sections = [];
        $count = count($groups);
        $i = 0;

        while ($i < $count) {
            $group = $groups[$i];
            $heading = trim((string) ($group['heading'] ?? ''));
            $items = $group['items'] ?? [];

            if ($heading !== '' && $i + 1 < $count && trim((string) ($groups[$i + 1]['heading'] ?? '')) === '') {
                $columns = [['items' => $items]];
                $i++;

                while ($i < $count && trim((string) ($groups[$i]['heading'] ?? '')) === '') {
                    $columns[] = ['items' => $groups[$i]['items'] ?? []];
                    $i++;
                }

                $sections[] = [
                    'layout' => 'shared_heading',
                    'heading' => $heading,
                    'columns' => $columns,
                ];

                continue;
            }

            if ($heading !== '') {
                $columns = [];

                while ($i < $count && trim((string) ($groups[$i]['heading'] ?? '')) !== '') {
                    $columns[] = [
                        'heading' => trim((string) $groups[$i]['heading']),
                        'items' => $groups[$i]['items'] ?? [],
                    ];
                    $i++;
                }

                $sections[] = [
                    'layout' => 'headed_columns',
                    'heading' => null,
                    'columns' => $columns,
                ];

                continue;
            }

            $columns = [];

            while ($i < $count && trim((string) ($groups[$i]['heading'] ?? '')) === '') {
                $columns[] = ['items' => $groups[$i]['items'] ?? []];
                $i++;
            }

            $sections[] = [
                'layout' => 'unheaded_columns',
                'heading' => null,
                'columns' => $columns,
            ];
        }

        return $sections;
    }
}
