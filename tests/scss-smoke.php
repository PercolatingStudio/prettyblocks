<?php

require '/var/www/html/config/config.inc.php';
Module::getInstanceByName('prettyblocks');

$relativeDirectory = 'var/prettyblocks-scss-' . uniqid();
$directory = _PS_ROOT_DIR_ . '/' . $relativeDirectory;
$formattedDirectory = '$/' . $relativeDirectory;
mkdir($directory);
try {
    file_put_contents($directory . '/_tokens.scss', '$brand: #123456; @mixin inset($value) { padding: $value; }');
    $cases = [
        'imports-mixins-nesting' => '@import "tokens"; .pb { color: $brand; @include inset(3px); .nested { margin: 2px + 1px; } }',
        'settings-substitution' => '.pb-settings { color: $SETTINGS_red; }',
        // Supported by the currently shipped scssphp 1.x. This prevents a
        // compiler major upgrade from silently rejecting existing theme SCSS.
        'legacy-color-math' => '.pb-legacy { color: #123456 + #010101; }',
    ];
    foreach ($cases as $name => $scss) {
        $entry = $directory . '/' . $name . '.scss';
        $target = $directory . '/' . $name . '.css';
        file_put_contents($entry, $scss);
        $compiler = new PrettyBlocksCompiler([$formattedDirectory . '/' . $name . '.scss'], $target);
        $compiler->setImportPaths([$formattedDirectory]);
        $compiler->setIdShop((int) Context::getContext()->shop->id);
        $compiler->compileAndWrite();
        if (!is_file($target) || trim(file_get_contents($target)) === '') {
            throw new RuntimeException('No CSS written for ' . $name);
        }
        printf("SCSS %s: OK\n", $name);
    }
} finally {
    foreach (glob($directory . '/*') as $file) {
        unlink($file);
    }
    rmdir($directory);
}
