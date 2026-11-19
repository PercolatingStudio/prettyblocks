<?php
// Exercise the real BO presenter without bootstrapping a shop or writing data.
class ObjectModel
{
    const TYPE_STRING = 1;
    const TYPE_INT = 2;
    const TYPE_SQL = 3;
    const TYPE_DATE = 4;
}
class Tools
{
    public static function passwdGen($length, $flag) { return '12345678'; }
}
require isset($argv[1]) ? $argv[1] : dirname(__DIR__) . '/classes/PrettyBlocksModel.php';
$method = new ReflectionMethod('PrettyBlocksModel', 'formatBlock');
$checks = 0;
$assertSame = static function ($expected, $actual, $label) use (&$checks) {
    if ($expected !== $actual) {
        throw new RuntimeException($label . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
    ++$checks;
};
$render = static function ($field) use ($method, $assertSame) {
    $block = [
        'code' => 'qa_title', 'name' => 'Parent fallback', 'id_prettyblocks' => 10,
        'instance_id' => 'fixed-instance', 'nameFrom' => 'product', 'need_reload' => false,
        'settings_formatted' => ['product' => $field],
        'repeater' => ['name' => 'Row fallback', 'nameFrom' => 'product'],
        'repeater_db' => [9 => ['product' => $field], 3 => ['product' => $field]],
    ];
    $copy = $block;
    $formatted = $method->invoke(null, $block);
    $assertSame($copy, $block, 'presenter does not mutate field values');
    $assertSame('qa_title-10', $formatted['id'], 'parent ID unchanged');
    $assertSame('fixed-instance', $formatted['instance_id'], 'instance ID unchanged');
    $assertSame(['10-9', '10-3'], array_column($formatted['children'], 'id'), 'child IDs and order unchanged');
    $assertSame(false, $formatted['need_reload'], 'reload behavior unchanged');
    return $formatted;
};
$field = ['type' => 'selector', 'value' => ['show' => [
    'id' => 7, 'primary' => 'id_product', 'name' => 'Product', 'formatted' => '7 - Product label',
]]];
$result = $render($field);
$assertSame('7 - Product label', $result['title'], 'selector parent uses formatted label');
$assertSame(['7 - Product label', '7 - Product label'], array_column($result['children'], 'title'), 'selector rows use formatted label');

foreach (['0', 'Été & <literal>'] as $label) {
    $field['value']['show']['formatted'] = $label;
    $result = $render($field);
    $assertSame($label, $result['title'], 'selector string label preserved');
    $assertSame($label, $result['children'][0]['title'], 'row string label preserved');
}
foreach ([[], ['show' => []], ['show' => null], ['show' => 'invalid'], ['show' => ['formatted' => '']], ['show' => ['formatted' => null]], ['show' => ['formatted' => 0]], false, 'invalid'] as $value) {
    $result = $render(['type' => 'selector', 'value' => $value]);
    $assertSame('Parent fallback', $result['title'], 'invalid selector parent fallback');
    $assertSame(['Row fallback', 'Row fallback'], array_column($result['children'], 'title'), 'invalid selector row fallback');
}
foreach (['Text label', '', 0, '0', false, ['legacy' => 'array']] as $value) {
    foreach (['text', null] as $type) {
        $result = $render(['type' => $type, 'value' => $value]);
        $assertSame($value, $result['title'], 'non-selector parent contract unchanged');
        $assertSame($value, $result['children'][0]['title'], 'non-selector row contract unchanged');
    }
}
foreach ([[], ['type' => 'selector'], ['type' => 'selector', 'value' => null]] as $field) {
    $result = $render($field);
    $assertSame('Parent fallback', $result['title'], 'missing/null parent value fallback');
    $assertSame('Row fallback', $result['children'][0]['title'], 'missing/null row value fallback');
}
echo 'Block sidebar title tests passed (' . $checks . ' assertions).' . PHP_EOL;
