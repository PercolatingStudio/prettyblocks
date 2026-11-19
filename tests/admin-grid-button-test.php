<?php

use PrestaSafe\PrettyBlocks\Core\Grid\Column\Type\PrettyBlocksButtonColumn;
use PrestaShop\PrestaShop\Core\Grid\Column\Type\DataColumn;

require '/var/www/html/vendor/autoload.php';
require $argv[1];

foreach (['cms' => 'id_cms', 'category' => 'id_category', 'product' => 'id_product'] as $endpoint => $field) {
    $column = (new PrettyBlocksButtonColumn('edit2'))->setOptions([
        'field' => $field,
        'route' => 'admin_prettyblocks',
        'route_param_name' => 'id',
        'route_param_field' => $field,
        'endpoint' => $endpoint,
    ]);
    $options = $column->getOptions();
    if ($options['sortable'] !== false) {
        throw new RuntimeException(sprintf('The %s action column is not a sortable database field.', $endpoint));
    }
    if ($options['route'] !== 'admin_prettyblocks' || $options['route_param_field'] !== $field) {
        throw new RuntimeException(sprintf('The %s action must still link to PrettyBlocks.', $endpoint));
    }
}

$title = (new DataColumn('meta_title'))->setOptions(['field' => 'meta_title']);
if ($title->getOptions()['sortable'] !== true) {
    throw new RuntimeException('Ordinary data columns must remain sortable.');
}

echo "PrettyBlocks grid button options passed.\n";
