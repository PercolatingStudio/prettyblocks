<?php

namespace PrestaShop\PrestaShop\Core\Module {
    interface WidgetInterface
    {
    }
}

namespace {
    if (!defined('_PS_VERSION_')) {
        define('_PS_VERSION_', '8.2.7');
    }

    class Module
    {
        public $context;
        public $name;
    }

    class Tools
    {
        public static function getValue($key)
        {
            return isset($_GET[$key]) ? $_GET[$key] : null;
        }
    }

    class Hook
    {
        public static $calls = array();
        public static $litespeedAvailable = true;

        public static function reset($litespeedAvailable)
        {
            self::$calls = array();
            self::$litespeedAvailable = $litespeedAvailable;
        }

        public static function exec($name, $params = array())
        {
            if ($name === 'litespeedNotCacheable' && !self::$litespeedAvailable) {
                return null;
            }

            self::$calls[] = array('name' => $name, 'params' => $params);

            return null;
        }
    }

    class TplSettings
    {
        public static function getSettings($name, $default = false)
        {
            return $name === 'remove_default_blocks' ? true : $default;
        }
    }

    class EditorCacheControllerStub
    {
        public $php_self = 'index';
        public $javascripts = array();
        public $stylesheets = array();

        public function registerJavascript($id, $path, $options = array())
        {
            $this->javascripts[] = array('id' => $id, 'path' => $path, 'options' => $options);
        }

        public function registerStylesheet($id, $path, $options = array())
        {
            $this->stylesheets[] = array('id' => $id, 'path' => $path, 'options' => $options);
        }
    }

    class EditorCacheSmartyStub
    {
        public $assigned = array();

        public function getTemplateVars()
        {
            return array();
        }

        public function assign($values)
        {
            foreach ($values as $key => $value) {
                $this->assigned[$key] = $value;
            }
        }
    }

    $moduleFile = isset($argv[1]) ? $argv[1] : dirname(__DIR__) . '/prettyblocks.php';
    if (!is_file($moduleFile)) {
        throw new RuntimeException('PrettyBlocks module file not found: ' . $moduleFile);
    }
    require $moduleFile;

    class PrettyBlocksEditorCacheFixture extends PrettyBlocks
    {
        public function loadDotEnv()
        {
        }
    }

    function fixtureSame($expected, $actual, $message)
    {
        if ($expected !== $actual) {
            throw new RuntimeException(
                $message . PHP_EOL . 'Expected: ' . var_export($expected, true)
                . PHP_EOL . 'Actual: ' . var_export($actual, true)
            );
        }
    }

    function newPrettyBlocksFixture()
    {
        $reflection = new ReflectionClass('PrettyBlocksEditorCacheFixture');
        $module = $reflection->newInstanceWithoutConstructor();
        $module->name = 'prettyblocks';
        $module->context = new stdClass();
        $module->context->controller = new EditorCacheControllerStub();
        $module->context->smarty = new EditorCacheSmartyStub();

        return $module;
    }

    function runEditorCacheCase($case)
    {
        $_GET = array();
        unset($_SERVER['HTTP_SEC_FETCH_DEST']);
        if ($case['querySet']) {
            $_GET['prettyblocks'] = $case['query'];
        }
        if ($case['fetchDestSet']) {
            $_SERVER['HTTP_SEC_FETCH_DEST'] = $case['fetchDest'];
        }

        Hook::reset($case['litespeedAvailable']);
        $module = newPrettyBlocksFixture();
        $module->hookdisplayHeader(array());

        $controller = $module->context->controller;
        $smarty = $module->context->smarty;
        if (!$case['editor']) {
            fixtureSame(array(), Hook::$calls, $case['name'] . ': no cache reason expected');
            fixtureSame(array(), $controller->javascripts, $case['name'] . ': no editor JavaScript expected');
            fixtureSame(array(), $controller->stylesheets, $case['name'] . ': no editor stylesheet expected');
            fixtureSame(array(), $smarty->assigned, $case['name'] . ': no editor Smarty variable expected');

            return;
        }

        fixtureSame(
            array(
                array(
                    'id' => 'prettyblocks',
                    'path' => 'modules/prettyblocks/views/js/build/build.js',
                    'options' => array('position' => 'bottom', 'priority' => 150),
                ),
            ),
            $controller->javascripts,
            $case['name'] . ': editor JavaScript mismatch'
        );
        fixtureSame(
            array(
                array(
                    'id' => 'prettyblocks',
                    'path' => 'modules/prettyblocks/views/css/iframe.css',
                    'options' => array('media' => 'all', 'priority' => 200),
                ),
            ),
            $controller->stylesheets,
            $case['name'] . ': editor stylesheet mismatch'
        );
        fixtureSame(array('prettyblocks' => true), $smarty->assigned, $case['name'] . ': editor Smarty variable mismatch');

        $expectedHooks = $case['hook']
            ? array(
                array(
                    'name' => 'litespeedNotCacheable',
                    'params' => array('reason' => 'PrettyBlocks edit mode', 'from' => 'prettyblocks'),
                ),
            )
            : array();
        fixtureSame($expectedHooks, Hook::$calls, $case['name'] . ': LiteSpeed hook mismatch');
    }

    $cases = array(
        array(
            'name' => 'ordinary storefront',
            'querySet' => false,
            'query' => null,
            'fetchDestSet' => false,
            'fetchDest' => null,
            'litespeedAvailable' => true,
            'editor' => false,
            'hook' => false,
        ),
        array(
            'name' => 'prettyblocks string query',
            'querySet' => true,
            'query' => '1',
            'fetchDestSet' => false,
            'fetchDest' => null,
            'litespeedAvailable' => true,
            'editor' => true,
            'hook' => true,
        ),
        array(
            'name' => 'iframe fetch destination',
            'querySet' => false,
            'query' => null,
            'fetchDestSet' => true,
            'fetchDest' => 'iframe',
            'litespeedAvailable' => true,
            'editor' => true,
            'hook' => true,
        ),
        array(
            'name' => 'integer query and document destination',
            'querySet' => true,
            'query' => 1,
            'fetchDestSet' => true,
            'fetchDest' => 'document',
            'litespeedAvailable' => true,
            'editor' => false,
            'hook' => false,
        ),
        array(
            'name' => 'editor without LiteSpeed module',
            'querySet' => true,
            'query' => '1',
            'fetchDestSet' => false,
            'fetchDest' => null,
            'litespeedAvailable' => false,
            'editor' => true,
            'hook' => false,
        ),
    );

    foreach ($cases as $case) {
        runEditorCacheCase($case);
        echo 'Editor cache ' . $case['name'] . ": OK\n";
    }
}
