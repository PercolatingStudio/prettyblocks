<?php

/**
 * Standalone PrettyBlocks regression tests for local file metadata resolution.
 *
 * An optional first argument points to the FieldCore.php file to test. This
 * lets the release smoke test execute the same fixture against the packaged
 * module without loading PrestaShop.
 */
$fieldCorePath = isset($argv[1])
    ? $argv[1]
    : dirname(__DIR__) . '/classes/prettyblocks/core/FieldCore.php';

if (!is_file($fieldCorePath)) {
    fwrite(STDERR, 'FieldCore.php not found: ' . $fieldCorePath . PHP_EOL);
    exit(1);
}

$fixtureRoot = sys_get_temp_dir() . '/prettyblocks-field-core-' . uniqid('', true);
$outsideFile = dirname($fixtureRoot) . '/prettyblocks-outside-' . uniqid('', true) . '.png';
$siblingRoot = $fixtureRoot . '-evil';

mkdir($fixtureRoot . '/uploads', 0777, true);
mkdir($fixtureRoot . '/documents', 0777, true);
mkdir($siblingRoot, 0777, true);

$png = base64_decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
);
$imagePath = $fixtureRoot . '/uploads/pixel.png';
$corruptPath = $fixtureRoot . '/uploads/corrupt.png';
$emptyImagePath = $fixtureRoot . '/uploads/empty.png';
$documentPath = $fixtureRoot . '/documents/readme.txt';
file_put_contents($imagePath, $png);
file_put_contents($corruptPath, 'not an image');
file_put_contents($emptyImagePath, '');
file_put_contents($documentPath, 'local document');
file_put_contents($fixtureRoot . '/documents/image.txt', $png);
file_put_contents($outsideFile, $png);
file_put_contents($siblingRoot . '/pixel.png', $png);
$outsideLink = $fixtureRoot . '/uploads/outside-link.png';
if (!symlink($outsideFile, $outsideLink)) {
    throw new RuntimeException('Unable to create the symlink security fixture.');
}

define('_PS_ROOT_DIR_', $fixtureRoot);

class Tools
{
    public static $httpDomain = 'http://shop.example.test';
    public static $sslDomain = 'https://secure.example.test';

    public static function getShopDomain($includeProtocol = false)
    {
        return $includeProtocol ? self::$httpDomain : parse_url(self::$httpDomain, PHP_URL_HOST);
    }

    public static function getShopDomainSsl($includeProtocol = false)
    {
        return $includeProtocol ? self::$sslDomain : parse_url(self::$sslDomain, PHP_URL_HOST);
    }

    public static function purifyHTML($value)
    {
        return $value;
    }
}

class Context
{
    private static $instance;

    public $language;
    public $shop;

    private function __construct()
    {
        $this->language = (object) ['id' => 1];
        $this->shop = (object) [
            'id' => 1,
            'physical_uri' => '/shop/',
        ];
    }

    public static function getContext()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }

        return self::$instance;
    }
}

class HelperBuilder
{
    public static function getMediaTypeForExtension($extension)
    {
        return in_array(strtolower($extension), ['gif', 'jpeg', 'jpg', 'png', 'webp'], true)
            ? 'image'
            : 'document';
    }
}

class RejectingNetworkStream
{
    public static $openCount = 0;

    public function stream_open($path, $mode, $options, &$openedPath)
    {
        ++self::$openCount;
        throw new RuntimeException('Unexpected stream access: ' . $path);
    }
}

function removeFixtureTree($path)
{
    if (is_link($path) || is_file($path)) {
        unlink($path);

        return;
    }
    if (!is_dir($path)) {
        return;
    }

    foreach (scandir($path) as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        removeFixtureTree($path . DIRECTORY_SEPARATOR . $entry);
    }
    rmdir($path);
}

$replacedWrappers = [];
foreach (['http', 'https'] as $scheme) {
    if (in_array($scheme, stream_get_wrappers(), true)) {
        stream_wrapper_unregister($scheme);
        $replacedWrappers[] = $scheme;
    }
    stream_wrapper_register($scheme, 'RejectingNetworkStream');
}
stream_wrapper_register('probe', 'RejectingNetworkStream');

register_shutdown_function(function () use ($fixtureRoot, $outsideFile, $siblingRoot, $replacedWrappers) {
    foreach (['http', 'https', 'probe'] as $scheme) {
        if (in_array($scheme, stream_get_wrappers(), true)) {
            stream_wrapper_unregister($scheme);
        }
        if (in_array($scheme, $replacedWrappers, true)) {
            stream_wrapper_restore($scheme);
        }
    }

    removeFixtureTree($fixtureRoot);
    removeFixtureTree($siblingRoot);
    removeFixtureTree($outsideFile);
});

require $fieldCorePath;

function failTest($message)
{
    throw new RuntimeException($message);
}

function assertSameValue($expected, $actual, $message)
{
    if ($expected !== $actual) {
        failTest($message . '; expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

function formatFileUploadForFront($url, $setValue = true)
{
    $field = new PrestaSafe\PrettyBlocks\Core\FieldCore([
        'id_lang' => 1,
        'id_shop' => 1,
        'type' => 'fileupload',
        'force_default_value' => false,
    ]);

    if ($setValue) {
        $field->value = ['url' => $url];
    }

    return $field->formatFieldFileuploadForFront();
}

function assertStableMetadata(array $result, $message)
{
    foreach (['size', 'width', 'height'] as $key) {
        if (!array_key_exists($key, $result)) {
            failTest($message . '; missing key ' . $key);
        }
        if (!is_int($result[$key])) {
            failTest($message . '; ' . $key . ' must be an integer');
        }
    }
}

function assertZeroMetadata($url, $message, $setValue = true)
{
    $result = formatFileUploadForFront($url, $setValue);
    assertStableMetadata($result, $message);
    assertSameValue(0, $result['size'], $message . ' size');
    assertSameValue(0, $result['width'], $message . ' width');
    assertSameValue(0, $result['height'], $message . ' height');
}

function assertLocalImage($url, $expectedSize, $message)
{
    $result = formatFileUploadForFront($url);
    assertStableMetadata($result, $message);
    assertSameValue($expectedSize, $result['size'], $message . ' size');
    assertSameValue(1, $result['width'], $message . ' width');
    assertSameValue(1, $result['height'], $message . ' height');

    return $result;
}

set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

try {
    $imageSize = strlen($png);

    $optional = new PrestaSafe\PrettyBlocks\Core\FieldCore([
        'type' => 'fileupload',
        'force_default_value' => true,
        'default' => ['url' => '/placeholder.png'],
    ]);
    assertSameValue('/placeholder.png', $optional->formatFieldFileupload()['url'], 'new field still uses its default');
    assertSameValue('/placeholder.png', $optional->secureFileUploadEntry([])['url'], 'absent URL still uses its default');
    assertSameValue('/placeholder.png', $optional->secureFileUploadEntry(['url' => null])['url'], 'null URL retains the legacy default');
    $optional->new_value = ['url' => ''];
    $cleared = $optional->formatFieldFileupload();
    assertSameValue('', $cleared['url'], 'explicit empty new value must not restore the default');
    foreach (['filename', 'extension', 'mediatype'] as $key) {
        assertSameValue('', $cleared[$key], 'cleared field has no ' . $key);
    }
    $optional->new_value = null;
    $optional->value = json_decode(json_encode($cleared), true);
    assertSameValue('', $optional->formatFieldFileupload()['url'], 'saved empty value stays empty after reload');
    assertSameValue('', $optional->formatFieldFileuploadForFront()['url'], 'front end must not restore the default');
    $optional->new_value = ['url' => 'uploads/pixel.png'];
    assertSameValue('uploads/pixel.png', $optional->formatFieldFileupload()['url'], 'upload after clearing still works');
    $optional->force_default_value = false;
    assertSameValue('', $optional->secureFileUploadEntry([])['url'], 'missing URL without forced default stays empty');

    assertZeroMetadata('', 'empty URL');
    assertZeroMetadata('', 'missing value', false);
    assertZeroMetadata(42, 'non-string URL');

    assertLocalImage('uploads/pixel.png', $imageSize, 'relative URL');
    assertLocalImage('shop/uploads/pixel.png', $imageSize, 'relative URL with physical URI');
    assertZeroMetadata('/uploads/pixel.png', 'root-relative URL outside shop subdirectory');
    Context::getContext()->shop->physical_uri = '/';
    assertLocalImage('/uploads/pixel.png', $imageSize, 'root-relative URL for root shop');
    Context::getContext()->shop->physical_uri = '/shop/';
    assertLocalImage('/shop/uploads/pixel.png', $imageSize, 'root-relative URL with physical URI');
    assertLocalImage('/shop/uploads/pixel.png?cache=1#preview', $imageSize, 'root-relative query URL');
    assertLocalImage(
        'http://shop.example.test/shop/uploads/pixel.png',
        $imageSize,
        'configured HTTP URL'
    );
    $queryResult = assertLocalImage(
        'https://secure.example.test/shop/uploads/pixel.png?cache=1#preview',
        $imageSize,
        'configured HTTPS URL with query and fragment'
    );
    assertSameValue('png', $queryResult['extension'], 'query URL extension');
    assertSameValue('image', $queryResult['mediatype'], 'query URL media type');
    assertSameValue('pixel.png', $queryResult['filename'], 'query URL filename');
    assertLocalImage(
        'https://secure.example.test:443/shop/uploads/pixel.png',
        $imageSize,
        'configured HTTPS URL with explicit default port'
    );

    $_SERVER['HTTP_HOST'] = 'attacker.example.test';
    assertLocalImage(
        'https://secure.example.test/shop/uploads/pixel.png',
        $imageSize,
        'request host does not affect configured shop URL'
    );
    assertZeroMetadata(
        'https://attacker.example.test/shop/uploads/pixel.png',
        'request host is not trusted'
    );

    assertZeroMetadata('https://remote.example.test/image.png', 'remote host');
    assertZeroMetadata('https://secure.example.test.evil/image.png', 'host suffix attack');
    assertZeroMetadata('https://evilsecure.example.test/image.png', 'host prefix attack');
    assertZeroMetadata('https://user@secure.example.test/shop/uploads/pixel.png', 'URL userinfo');
    assertZeroMetadata('https://secure.example.test:444/shop/uploads/pixel.png', 'wrong port');
    assertZeroMetadata('http://secure.example.test/shop/uploads/pixel.png', 'wrong configured scheme');
    assertZeroMetadata('//secure.example.test/shop/uploads/pixel.png', 'protocol-relative URL');
    assertZeroMetadata(
        'https://secure.example.test/uploads/pixel.png',
        'absolute URL outside configured physical URI'
    );

    Tools::$sslDomain = 'https://secure.example.test:8443';
    assertLocalImage(
        'https://secure.example.test:8443/shop/uploads/pixel.png',
        $imageSize,
        'configured non-default port'
    );
    assertZeroMetadata(
        'https://secure.example.test/shop/uploads/pixel.png',
        'missing configured non-default port'
    );
    Tools::$sslDomain = 'https://secure.example.test';

    assertZeroMetadata('uploads/missing.png', 'missing local file');
    assertZeroMetadata('uploads', 'local directory');
    assertZeroMetadata('uploads/empty.png', 'empty local image');

    $corrupt = formatFileUploadForFront('uploads/corrupt.png');
    assertStableMetadata($corrupt, 'corrupt local image');
    assertSameValue(strlen('not an image'), $corrupt['size'], 'corrupt local image size');
    assertSameValue(0, $corrupt['width'], 'corrupt local image width');
    assertSameValue(0, $corrupt['height'], 'corrupt local image height');

    $document = formatFileUploadForFront('documents/readme.txt');
    assertStableMetadata($document, 'local non-image');
    assertSameValue(strlen('local document'), $document['size'], 'local non-image size');
    assertSameValue(0, $document['width'], 'local non-image width');
    assertSameValue(0, $document['height'], 'local non-image height');

    $imageDocument = formatFileUploadForFront('documents/image.txt');
    assertSameValue($imageSize, $imageDocument['size'], 'image bytes in a document retain file size');
    assertSameValue(0, $imageDocument['width'], 'document media does not acquire image dimensions');
    assertSameValue(0, $imageDocument['height'], 'document media height remains zero');

    assertZeroMetadata('../' . basename($outsideFile), 'plain traversal');
    assertZeroMetadata('%2e%2e/' . basename($outsideFile), 'encoded traversal');
    assertZeroMetadata('../' . basename($siblingRoot) . '/pixel.png', 'sibling prefix collision');
    assertZeroMetadata('uploads/outside-link.png', 'symlink outside shop root');

    assertZeroMetadata('file://' . $imagePath, 'file wrapper');
    assertZeroMetadata('phar://' . $imagePath . '/file.png', 'phar wrapper');
    assertZeroMetadata('php://filter/resource=' . $imagePath, 'PHP stream wrapper');
    assertZeroMetadata('data:image/png;base64,' . base64_encode($png), 'data wrapper');
    assertZeroMetadata('probe://secure.example.test/shop/uploads/pixel.png', 'custom stream wrapper');
    assertZeroMetadata('uploads/%5cpixel.png', 'encoded backslash');
    assertZeroMetadata('uploads/pixel.png%00.txt', 'encoded NUL byte');

    assertSameValue(0, RejectingNetworkStream::$openCount, 'no stream wrapper must be opened');
} finally {
    restore_error_handler();
}

echo 'FieldCore file upload metadata tests passed.' . PHP_EOL;
