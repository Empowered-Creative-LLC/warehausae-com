<?php

namespace Tests\Unit;

use App\Support\CapabilityGroups;
use PHPUnit\Framework\TestCase;

class CapabilityGroupsTest extends TestCase
{
    public function test_shared_heading_layout_when_second_column_has_no_heading(): void
    {
        $sections = CapabilityGroups::normalize([
            ['heading' => 'Capabilities', 'items' => [['label' => 'One']]],
            ['items' => [['label' => 'Two']]],
        ]);

        $this->assertCount(1, $sections);
        $this->assertSame('shared_heading', $sections[0]['layout']);
        $this->assertSame('Capabilities', $sections[0]['heading']);
        $this->assertCount(2, $sections[0]['columns']);
    }

    public function test_headed_columns_when_each_group_has_its_own_heading(): void
    {
        $sections = CapabilityGroups::normalize([
            ['heading' => 'Suites', 'items' => [['label' => 'Cardiology']]],
            ['heading' => 'Buildings', 'items' => [['label' => 'Acute Care']]],
        ]);

        $this->assertCount(1, $sections);
        $this->assertSame('headed_columns', $sections[0]['layout']);
        $this->assertSame('Suites', $sections[0]['columns'][0]['heading']);
        $this->assertSame('Buildings', $sections[0]['columns'][1]['heading']);
    }

    public function test_unheaded_columns_when_no_headings_exist(): void
    {
        $sections = CapabilityGroups::normalize([
            ['items' => [['label' => 'Museums']]],
            ['items' => [['label' => 'Libraries']]],
        ]);

        $this->assertCount(1, $sections);
        $this->assertSame('unheaded_columns', $sections[0]['layout']);
        $this->assertCount(2, $sections[0]['columns']);
    }
}
