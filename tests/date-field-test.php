<?php

require isset($argv[1]) ? $argv[1] : dirname(__DIR__) . '/classes/prettyblocks/core/FieldCore.php';

set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

try {
    $cases = [
        [['value' => '2026-11-06'], '2026-11-06'],
        [['default' => '2026-11-06'], '2026-11-06'],
        [['new_value' => '2026-11-07'], '2026-11-07'],
        [['new_value' => '2026-11-07T00:00:00.000Z'], '2026-11-07'],
        [['new_value' => '2026-11-07T00:00:00+01:00'], '2026-11-07'],
        [['value' => '2026-11-06', 'new_value' => ''], ''],
        [['value' => '', 'default' => '2026-11-06'], ''],
        [['force_default_value' => false], ''],
        [[], ''],
        [['new_value' => '2026-02-31'], ''],
        [['new_value' => 'not a date'], ''],
        [['new_value' => []], ''],
    ];
    foreach ($cases as $index => $case) {
        $field = new PrestaSafe\PrettyBlocks\Core\FieldCore(array_merge([
            'id_lang' => 1,
            'id_shop' => 1,
        ], $case[0]));
        $actual = $field->formatFieldDatepicker();
        if ($actual !== $case[1]) {
            throw new RuntimeException('Date case ' . $index . ': ' . var_export($actual, true));
        }
    }
} finally {
    restore_error_handler();
}

echo "Date field serialization tests passed.\n";
