<?php
// Real model/spacing formatting, isolated from database and filesystem writes.
class ObjectModel
{
    const TYPE_STRING = 1;
    const TYPE_INT = 2;
    const TYPE_SQL = 3;
    const TYPE_DATE = 4;
    public $id = 10;
}
class Context
{
    public static function getContext() { return (object) ['language' => (object) ['id' => 1], 'shop' => (object) ['id' => 1]]; }
}
class Tools
{
    public static function strtoupper($value) { return strtoupper($value); }
    public static function toCamelCase($value) { return 'QaBackground'; }
}
class Validate
{
    public static function isJson($value) { json_decode($value); return json_last_error() === JSON_ERROR_NONE; }
}
class Hook
{
    public static function exec(...$args) { return []; }
}
$root = isset($argv[1]) ? dirname(dirname($argv[1])) : dirname(__DIR__);
require $root . '/classes/prettyblocks/core/FieldCore.php';
require $root . '/classes/prettyblocks/core/PrettyBlocksField.php';
require $root . '/classes/HelperBuilder.php';
require $root . '/classes/PrettyBlocksModel.php';
class BackgroundFixtureModel extends PrettyBlocksModel
{
    public static function loadBlock($code)
    {
        return ['name' => 'QA background', 'code' => $code, 'config' => ['fields' => []], 'templates' => ['default' => 'fixture.tpl']];
    }
}
$checks = 0;
$same = static function ($expected, $actual, $label) use (&$checks) {
    if ($expected !== $actual) throw new RuntimeException($label . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    ++$checks;
};
$spacing = ['desktop' => [], 'tablet' => [], 'mobile' => []];
foreach ($spacing as &$device) {
    $device = ['top' => null, 'right' => null, 'bottom' => null, 'left' => null, 'auto' => 0, 'use_custom_data' => false];
}
unset($device);
$render = static function ($color, $paddings = null) use ($spacing, $same) {
    $model = new BackgroundFixtureModel();
    $model->code = 'qa_background';
    $model->instance_id = 'fixed-instance';
    $model->id_lang = 1;
    $model->id_shop = 1;
    $model->config = '{}';
    $model->state = '[]';
    $original = json_encode(['bg_color' => $color, 'paddings' => $paddings ?? $spacing, 'margins' => $spacing]);
    $model->default_params = $original;
    $block = $model->mergeStateWithFields();
    $same($original, $model->default_params, 'stored defaults are never rewritten');
    return $block['styles'];
};
foreach (['#abc' => '#abc', '#abcd' => '#abcd', '#123456' => '#123456', '#12345678' => '#12345678', '#C62828' => '#C62828', 'red' => 'red', 'transparent' => 'transparent', 'currentColor' => 'currentColor', 'rgb(1, 2, 3)' => 'rgb(1,2,3)', 'rgba(1, 2, 3, .5)' => 'rgba(1,2,3,.5)', 'rgb(10% 20% 30% / 50%)' => 'rgba(10%,20%,30%,50%)', 'hsl(180deg 50% 25%)' => 'hsl(180deg,50%,25%)', 'hsla(180, 50%, 25%, .5)' => 'hsla(180,50%,25%,.5)', 'hsl(.5turn 50% 25%)' => 'hsl(.5turn,50%,25%)'] as $color => $canonical) {
    $expected = 'style=background-color:' . $canonical . '; data-prettyblocks-background-color=' . $canonical . ' ';
    $actual = $render($color);
    $same($expected, $actual, 'valid background color is rendered');
    $same($actual, htmlspecialchars($actual, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'), 'Smarty escaping cannot alter generated attributes');
}
$same($render('#abc'), $render('  #abc  '), 'outer whitespace normalized');
foreach ([null, '', '   ', false, 42, [], ['red'], '#12', '#12345', '#1234567', '#123456789', 'red;color:white', 'red" onmouseover="alert(1)', "red\ncolor:white", "red\r", "red\\3b color:white", 'url(https://example.test/x)', 'expression(alert(1))', 'var(--color)', 'calc(1)', 'linear-gradient(red,blue)', 'rgb()', str_repeat('r', 129)] as $color) {
    $same('', $render($color), 'invalid or unsafe background is not rendered');
}
foreach (['rgb(,1,2,3)', 'rgb(1,2,3,)', 'rgb(1,,2,3)', 'rgb(1 2,3,4)', 'rgb(1,2,3/.5)', 'rgb(1/2/3)', 'rgb(1 2)', 'rgb(1 2 3 /)', 'rgb(1 2 3 / .5 .6)', 'rgb(1 2 3 4 5)', 'red`onclick=alert', 'red=blue'] as $color) {
    $same('', $render($color), 'malformed functions and unquoted-attribute delimiters rejected');
}
$custom = $spacing;
foreach (['mobile' => 11, 'tablet' => 22, 'desktop' => 33] as $device => $value) {
    $custom[$device] = ['top' => $value, 'right' => '', 'bottom' => '', 'left' => '', 'use_custom_data' => true];
}
$oldSpacing = HelperBuilder::generateBlocksSpacings($custom, 'paddings')['styles'];
$same($oldSpacing, $render('', $custom), 'uncolored spacing output is byte-identical');
$same($oldSpacing, $render('red;color:white', $custom), 'unsafe color does not change spacings');
$same('style=background-color:#abc; data-prettyblocks-background-color=#abc ' . $oldSpacing, $render('#abc', $custom), 'background composes without rewriting responsive attributes');
echo 'Block background tests passed (' . $checks . ' assertions).' . PHP_EOL;
