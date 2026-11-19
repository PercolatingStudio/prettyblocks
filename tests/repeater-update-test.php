<?php

$controllerFile = $argv[1];
$case = $argv[2] ?? null;

// The AJAX action terminates with exit(), so run each case in its own PHP process.
if ($case === null) {
    foreach (['deleted', 'invalid-state', 'existing'] as $name) {
        $command = implode(' ', array_map('escapeshellarg', [PHP_BINARY, __FILE__, $controllerFile, $name]));
        passthru($command, $status);
        if ($status !== 0) {
            exit($status);
        }
    }

    exit(0);
}

define('_PS_VERSION_', '8.2.7');

class ModuleFrontController
{
}

class Tools
{
    public static function getValue($key)
    {
        return $_POST[$key] ?? false;
    }
}

class PrettyBlocksModel
{
    public static $originalState;
    public static $savedState;
    public $state;

    public function __construct($id, $language, $shop)
    {
        $this->state = self::$originalState;
    }

    public function save()
    {
        self::$savedState = $this->state;

        return true;
    }
}

require $controllerFile;

class RepeaterUpdateFixtureController extends PrettyBlocksAjaxModuleFrontController
{
    public function __construct()
    {
        $this->translator = new class {
            public function trans($message, $parameters, $domain)
            {
                return $message;
            }
        };
    }
}

$initialItems = [1 => ['question' => ['value' => 'Keep this']], 3 => ['question' => ['value' => 'Edit this']]];
$updatedItem = ['question' => ['value' => 'Updated question']];
PrettyBlocksModel::$originalState = $case === 'invalid-state' ? 'null' : json_encode($initialItems);
$_POST = [
    'id_prettyblocks' => '12',
    'ctx_id_lang' => '1',
    'ctx_id_shop' => '1',
    'subSelected' => $case === 'existing' ? '3' : '2',
    'state' => json_encode($updatedItem),
];

ob_start();
register_shutdown_function(function () use ($case, $initialItems, $updatedItem) {
    $result = json_decode(ob_get_clean(), true);
    if ($case === 'existing') {
        $initialItems[3] = $updatedItem;
        $valid = ($result['success'] ?? null) === true
            && json_decode(PrettyBlocksModel::$savedState ?? '', true) === $initialItems;
    } else {
        $valid = ($result['success'] ?? null) === false
            && ($result['code'] ?? null) === 'repeater_item_missing'
            && PrettyBlocksModel::$savedState === null;
    }

    if (!$valid) {
        fwrite(STDERR, "Repeater update fixture failed: $case.\n");
        exit(1);
    }

    echo "Repeater update fixture passed: $case.\n";
});

(new RepeaterUpdateFixtureController())->displayAjaxUpdateState();
