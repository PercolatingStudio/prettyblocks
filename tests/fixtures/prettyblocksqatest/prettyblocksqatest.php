<?php

// Test-only hook provider for interactive date-field QA. Never shipped in a ZIP.
if (!defined('_PS_VERSION_')) {
    exit;
}

class Prettyblocksqatest extends Module
{
    public function __construct()
    {
        $this->name = 'prettyblocksqatest';
        $this->version = '1.0.0';
        $this->author = 'PrettyBlocks QA';
        $this->tab = 'administration';
        parent::__construct();
        $this->displayName = 'PrettyBlocks QA date field';
        $this->description = 'Local test fixture only.';
    }

    public function install()
    {
        return parent::install() && $this->registerHook('ActionRegisterBlock');
    }

    public function hookActionRegisterBlock($params)
    {
        return [[
            'name' => 'QA date field',
            'description' => 'Calendar round-trip fixture',
            'code' => 'prettyblocks_qa_date',
            'need_reload' => true,
            'templates' => ['default' => 'module:prettyblocks/views/templates/blocks/title/default.tpl'],
            'config' => ['fields' => [
                'tag' => ['type' => 'text', 'default' => 'h2', 'label' => 'Tag'],
                'classes' => ['type' => 'text', 'default' => '', 'label' => 'Classes'],
                'title' => ['type' => 'text', 'default' => 'QA calendar', 'label' => 'Title'],
                'calendar_date' => ['type' => 'datepicker', 'default' => '2026-11-06', 'label' => 'QA calendar date'],
            ]],
        ]];
    }
}
