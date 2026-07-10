<?php

namespace App\Tags;

use App\Support\CapabilityGroups;
use Illuminate\Support\Collection;
use Statamic\Fields\Value;
use Statamic\Tags\Tags;

class CapabilityGroupsLayout extends Tags
{
    /**
     * {{ capability_groups_layout }} ... {{ /capability_groups_layout }}
     *
     * @return array{sections: list<array<string, mixed>>}
     */
    public function index(): array
    {
        $groups = $this->params->get('groups') ?? $this->context->value('capability_groups');

        return [
            'sections' => CapabilityGroups::normalize($this->groupsToArray($groups)),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function groupsToArray(mixed $groups): array
    {
        if ($groups instanceof Value) {
            $groups = $groups->value();
        }

        if ($groups instanceof Collection) {
            $groups = $groups->all();
        }

        if (is_object($groups) && method_exists($groups, 'toArray')) {
            $groups = $groups->toArray();
        }

        return is_array($groups) ? $groups : [];
    }
}
