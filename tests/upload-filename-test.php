<?php

require '/var/www/html/config/config.inc.php';
require_once $argv[1];

$content = 'image bytes';
$other = 'different image bytes';
$name = 'My image 1200.PNG';
$expected = 'my-image-1200-' . md5($content) . '.png';

if (HelperBuilder::buildUploadFilename($name, 'png', $content) !== $expected
    || HelperBuilder::buildUploadFilename($name, 'png', $other) !== 'my-image-1200-' . md5($other) . '.png') {
    throw new RuntimeException('The slug and complete content hash must be separated by a hyphen.');
}

$longName = str_repeat('a', 245) . '.png';
$longExpected = str_repeat('a', 218) . '-' . md5($content) . '.png';
if (HelperBuilder::buildUploadFilename($longName, 'png', $content) !== $longExpected
    || strlen($longExpected) !== 255) {
    throw new RuntimeException('Long filenames must retain the full hash and fit in 255 bytes.');
}

if (HelperBuilder::buildUploadFilename('___-_.png', 'png', $content) !== md5($content) . '.png'
    || HelperBuilder::buildUploadFilename($name, 'png', false) !== 'my-image-1200.png') {
    throw new RuntimeException('Unexpected filename when the slug or hash is missing.');
}

echo "PrettyBlocks upload filename tests passed.\n";
