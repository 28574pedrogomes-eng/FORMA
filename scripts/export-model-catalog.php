<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$seed = require $root . '/database/seed.php';
$categories = [];
foreach ($seed as $key => $value) if ($key !== 'products') $categories[(int)$key + 1] = $value['name'];
$products = [];
$add = static function (string $category, string $name, string $description, string $image, string $material = '', string $dimensions = '') use (&$products, $root): void {
    $ascii = strtr($name, [
        'À'=>'A','Á'=>'A','Â'=>'A','Ã'=>'A','Ä'=>'A','È'=>'E','É'=>'E','Ê'=>'E','Ë'=>'E','Ì'=>'I','Í'=>'I','Î'=>'I','Ï'=>'I',
        'Ò'=>'O','Ó'=>'O','Ô'=>'O','Õ'=>'O','Ö'=>'O','Ù'=>'U','Ú'=>'U','Û'=>'U','Ü'=>'U','Ç'=>'C','Ñ'=>'N',
        'à'=>'a','á'=>'a','â'=>'a','ã'=>'a','ä'=>'a','è'=>'e','é'=>'e','ê'=>'e','ë'=>'e','ì'=>'i','í'=>'i','î'=>'i','ï'=>'i',
        'ò'=>'o','ó'=>'o','ô'=>'o','õ'=>'o','ö'=>'o','ù'=>'u','ú'=>'u','û'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n','—'=>'-','–'=>'-'
    ]);
    $slug = strtolower(trim((string)preg_replace('/[^a-zA-Z0-9]+/', '-', $ascii), '-'));
    if (isset($products[$slug])) return;
    $image = ltrim($image, '/');
    if (!is_file($root . '/public/' . $image)) return;
    $products[$slug] = ['slug'=>$slug,'name'=>$name,'category'=>$category,'description'=>$description,'material'=>$material,'image'=>$image,'dimensions'=>$dimensions];
};
foreach ($seed['products'] as $product) $add($categories[(int)$product[0]] ?? 'Mobiliário', $product[1], $product[2], $product[5], $product[7] ?? '');
foreach (require $root . '/database/catalog-additions.php' as $product) $add($product[0], $product[1], $product[2], $product[5], $product[7] ?? '');
foreach (json_decode(file_get_contents($root . '/database/catalog-2026.json'), true, 512, JSON_THROW_ON_ERROR) as $product) $add($product['category'], $product['name'], $product['description'], $product['image'], $product['material'] ?? '', $product['dimensions'] ?? '');
$target = $root . '/output';
if (!is_dir($target)) mkdir($target, 0755, true);
file_put_contents($target . '/blender-model-catalog.json', json_encode(array_values($products), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
echo 'Exportados ' . count($products) . " produtos de referência para Blender.\n";
