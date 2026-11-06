<?php
declare(strict_types=1);

function migrateNews(PDO $db): void {
    $db->exec(file_get_contents(__DIR__ . '/../database/news.sql'));
    if ($db->query("SELECT version FROM schema_migrations WHERE version='news-v1'")->fetchColumn()) { return; }
    $db->beginTransaction();
    try {
        $category = $db->prepare('INSERT IGNORE INTO news_categories (name) VALUES (?)');
        foreach (['Coleção', 'Inspiração', 'Guias'] as $name) { $category->execute([$name]); }
        $findCategory = $db->prepare('SELECT id FROM news_categories WHERE name=?');
        $insert = $db->prepare('INSERT INTO news_articles (category_id,title,content,publication_date,image) VALUES (?,?,?,?,?)');
        if (!(int)$db->query('SELECT COUNT(*) FROM news_articles')->fetchColumn()) {
            $articles = [
                ['Coleção', 'A coleção FORMA tem agora 20 peças', "Há novas formas de dar vida à tua casa. A coleção de demonstração cresceu com 12 peças, entre mobiliário, iluminação, decoração e têxteis.\n\nUm sofá para ficar mais um pouco, uma luz para o canto de leitura ou uma textura que muda o ambiente: a seleção foi pensada para combinar com os essenciais que já conheces.\n\nNo catálogo podes consultar fotografias, preços e disponibilidade, guardar favoritos e experimentar o carrinho de compras. As encomendas e os pagamentos continuam a ser uma simulação deste projeto académico.", '2026-11-03', 'images/mesa-baixa-elo.jpg'],
                ['Inspiração', 'Um novo olhar sobre a casa', "A entrada da FORMA convida-te a explorar uma sala ao teu ritmo. Ao fazer scroll, o vídeo avança e revela sugestões da nossa coleção.\n\nOs cartões dão acesso aos detalhes de cada peça, para passares da inspiração à descoberta. Podes pausar o vídeo ou saltar diretamente para o catálogo em qualquer momento.\n\nA experiência adapta-se ao telemóvel. Quando o dispositivo pede menos movimento, a filmagem dá lugar a uma fotografia. A casa continua à tua espera, com a mesma calma.", '2026-11-02', 'images/room-tour-poster.jpg'],
                ['Guias', 'Escolher peças com espaço para ficar', "Antes de acrescentar uma peça à sala, começa pelo espaço que tens. Mede a área disponível e imagina os percursos entre o sofá, a mesa e a janela.\n\nUma luz de apoio pode criar um canto de leitura. Uma manta ou almofada pode acrescentar textura sem ocupar mais chão. Escolhe os detalhes de acordo com a forma como usas a casa todos os dias.\n\nConsulta as dimensões e materiais na descrição dos produtos. No catálogo FORMA, as categorias e os filtros ajudam-te a comparar opções e a encontrar peças dentro do teu orçamento.", '2026-11-01', 'images/story.jpg'],
            ];
            foreach ($articles as $article) {
                $findCategory->execute([$article[0]]);
                $article[0] = (int)$findCategory->fetchColumn();
                $insert->execute($article);
            }
        }
        $db->exec("INSERT INTO schema_migrations (version) VALUES ('news-v1')");
        $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
}
