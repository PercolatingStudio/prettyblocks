<?php

// Exercise the flat storefront settings from the packaged model, without a database.
$modelPath = $argv[1] ?? dirname(__DIR__) . '/classes/PrettyBlocksModel.php';
$root = sys_get_temp_dir() . '/prettyblocks-theme-image-' . bin2hex(random_bytes(8));
mkdir($root, 0700);
$image = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
file_put_contents($root . '/default.png', $image);
file_put_contents($root . '/saved.png', $image);
register_shutdown_function(function () use ($root) {
    unlink($root . '/default.png');
    unlink($root . '/saved.png');
    rmdir($root);
});
define('_PS_ROOT_DIR_', $root);

class ObjectModel
{
    const TYPE_STRING = 1;
    const TYPE_INT = 2;
    const TYPE_SQL = 3;
    const TYPE_DATE = 4;
}

class Context
{
    public static function getContext()
    {
        return (object) [
            'shop' => (object) ['id' => 1, 'theme_name' => 'test', 'physical_uri' => '/'],
            'language' => (object) ['id' => 1],
        ];
    }
}

class HelperBuilder
{
    public static function hookToArray($hook)
    {
        return [
            'hero' => ['type' => 'fileupload', 'default' => ['url' => '/default.png']],
            'logo' => ['type' => 'fileupload', 'default' => ['url' => '/default.png']],
            'removed' => ['type' => 'fileupload', 'default' => ['url' => '/default.png']],
            'unset_image' => ['type' => 'fileupload'],
            'optional_image' => ['type' => 'fileupload', 'force_default_value' => false, 'default' => ['url' => '/default.png']],
            'caption' => ['type' => 'text', 'default' => 'Legacy contract'],
            'private_image' => ['type' => 'fileupload', 'private' => true, 'default' => ['url' => '/default.png']],
        ];
    }

    public static function getMediaTypeForExtension($extension)
    {
        return $extension === 'png' ? 'image' : '';
    }
}

class Tools
{
    public static function purifyHTML($value)
    {
        return $value;
    }
}

class PrettyBlocksSettingsModel
{
    public static function getSettings($theme, $idShop)
    {
        return [
            'logo' => ['value' => ['url' => '/saved.png']],
            'removed' => ['value' => ['url' => '']],
        ];
    }
}

require dirname($modelPath) . '/prettyblocks/core/FieldCore.php';
require $modelPath;

$assertSame = static function ($expected, $actual, $label) {
    if ($actual !== $expected) {
        throw new RuntimeException($label . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
};
$settings = PrettyBlocksModel::getThemeSettings(false);
foreach (['hero' => '/default.png', 'logo' => '/saved.png'] as $key => $url) {
    $value = $settings[$key];
    $assertSame($url, $value['url'] ?? null, $key . ' URL');
    $assertSame(1, $value['width'] ?? null, $key . ' width');
    $assertSame(1, $value['height'] ?? null, $key . ' height');
    $assertSame(strlen($image), $value['size'] ?? null, $key . ' size');
}
$assertSame(['url' => ''], $settings['removed'], 'A cleared image keeps its historical value');
$assertSame(false, $settings['unset_image'], 'A setting with no image remains falsy for Smarty');
$assertSame(false, $settings['optional_image'], 'An inactive default does not create an image');
$assertSame(false, $settings['caption'], 'Other field types keep their existing flat value');
$assertSame(false, array_key_exists('private_image', $settings), 'Private settings stay out of the storefront');

$back = PrettyBlocksModel::getThemeSettings(true, 'back')['general'];
$assertSame('/default.png', $back['hero']['value']['url'], 'Back-office field uses its declared default');
$assertSame(false, array_key_exists('width', $back['hero']['value']), 'No back-office metadata change');
$assertSame(true, isset($back['private_image']), 'Private settings remain available to the back office');
echo "Theme image dimensions tests passed.\n";
