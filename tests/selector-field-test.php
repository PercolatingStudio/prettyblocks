<?php

use PrestaSafe\PrettyBlocks\Core\FieldCore;

require $argv[1] ?? dirname(__DIR__) . '/classes/prettyblocks/core/FieldCore.php';

class SelectorFieldFixture extends FieldCore
{
    public $lookups = [];

    public function _getCollection($id, $collectionName, $primaryField = null)
    {
        $this->lookups[] = [$id, $collectionName, $primaryField];

        return ['id_category' => $id, 'name' => 'Category ' . $id];
    }
}

function sameSelectorValue($expected, $actual, $case)
{
    if ($expected !== $actual) {
        throw new RuntimeException($case . ': ' . var_export($actual, true));
    }
}

$base = ['type' => 'selector', 'collection' => 'Category', 'id_lang' => 1, 'id_shop' => 1, 'label' => 'Category'];
$entry = ['show' => ['id' => 3, 'primary' => 3, 'name' => 'Default', 'formatted' => '3 - Default']];
$stored = ['show' => ['id' => 5, 'primary' => 5, 'name' => 'Saved', 'formatted' => '5 - Saved']];
$cleared = ['__prettyblocks_empty_selector' => true];

set_error_handler(static function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

try {
    foreach (['Choose', null, [], ['show' => 'invalid'], ['show' => ['id' => 0]]] as $default) {
        $field = new SelectorFieldFixture($base + ['default' => $default]);
        sameSelectorValue(false, $field->compile()['value'], 'invalid/placeholder default is not a selection');
        sameSelectorValue(false, $field->getFrontValue(), 'invalid/placeholder default renders empty');
        sameSelectorValue([], $field->lookups, 'invalid/placeholder default triggers no lookup');
    }

    $field = new SelectorFieldFixture($base + ['default' => 'Choose']);
    sameSelectorValue('Choose', $field->compile()['default'], 'preserve the editor placeholder');

    $field = new SelectorFieldFixture($base + ['default' => $entry, 'options' => ['primary_key' => 'custom_id']]);
    sameSelectorValue($entry, $field->compile()['value'], 'structured default is selected');
    sameSelectorValue(['id_category' => 3, 'name' => 'Category 3'], $field->getFrontValue(), 'Smarty presenter shape is unchanged');
    sameSelectorValue([[3, 'Category', 'custom_id']], $field->lookups, 'custom primary key remains supported');

    $field = new SelectorFieldFixture($base + ['default' => $entry, 'force_default_value' => false]);
    $compiled = $field->compile();
    sameSelectorValue(false, $compiled['value'], 'optional selector does not force default');
    sameSelectorValue(false, (new SelectorFieldFixture($base + $compiled))->getFrontValue(), 'optional default stays off after formatting');

    $field = new SelectorFieldFixture($base + ['default' => $entry, 'value' => $stored, 'new_value' => $cleared]);
    $compiled = json_decode(json_encode($field->compile(), JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    sameSelectorValue($cleared, $compiled['value'], 'explicit clear round trips in editor storage');
    $reopened = new SelectorFieldFixture($base + $compiled);
    sameSelectorValue($cleared, $reopened->compile()['value'], 'reopening does not restore default');
    sameSelectorValue(false, $reopened->getFrontValue(), 'explicit clear remains false for Smarty');
    sameSelectorValue(false, $reopened->getValue(), 'theme settings do not expose the storage marker');
    sameSelectorValue([], $reopened->lookups, 'explicit clear triggers no lookup');
    $reopened->setAttribute('new_value', $stored);
    sameSelectorValue($stored, $reopened->compile()['value'], 'reselection replaces the marker');
    sameSelectorValue(['id_category' => 5, 'name' => 'Category 5'], $reopened->getFrontValue(), 'reselection restores the presenter value');
    $field = new SelectorFieldFixture($base + ['value' => $stored, 'default' => $entry]);
    sameSelectorValue($stored, $field->compile()['value'], 'existing saved object keeps precedence');
    $field = new SelectorFieldFixture($base + ['value' => false, 'default' => $entry]);
    sameSelectorValue($entry, $field->compile()['value'], 'legacy false retains its previous default behavior');
    $field = new SelectorFieldFixture($base + ['default' => $entry, 'new_value' => '']);
    sameSelectorValue($entry, $field->compile()['value'], 'empty legacy input is not an explicit clear');
    $field = new SelectorFieldFixture($base + ['value' => $stored, 'default' => 'Choose']);
    sameSelectorValue($stored, $field->compile()['value'], 'placeholder never replaces a saved selection');
} finally {
    restore_error_handler();
}

echo "Selector field default and explicit-clear tests passed.\n";
