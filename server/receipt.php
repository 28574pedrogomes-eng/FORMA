<?php
declare(strict_types=1);
function renderReceipt(array $order): never {
    $money = static fn($v) => number_format((int)$v/100,2,',',' ') . ' EUR';
    $payments = ['paid'=>'Aprovado (teste)','failed'=>'Recusado (teste)','pending'=>'Pendente (teste)','unpaid'=>'Por pagar (teste)','refunded'=>'Reembolso simulado'];
    $lines = ['FORMA / Objetos com intenção', '', 'COMPROVATIVO DE ENCOMENDA #' . str_pad((string)$order['id'],5,'0',STR_PAD_LEFT), 'Data: '.$order['created_at'].' UTC', 'Loja de demonstração - sem cobrança ou entrega real.', '', 'CLIENTE E ENTREGA', $order['shipping_name'], $order['address'], $order['postal_code'].' '.$order['city'], 'Telefone: '.$order['phone'], 'Entrega: '.($order['shipping_method']==='express'?'Expresso':'Standard'), '', 'ARTIGOS'];
    foreach ($order['items'] as $item) { $lines[]=$item['quantity'].' x '.$item['product_name'].' / '.$item['variant_label']; $lines[]='  Unitário: '.$money($item['unit_price_cents']).' | Linha: '.$money($item['unit_price_cents']*$item['quantity']); }
    array_push($lines,'','Subtotal: '.$money($order['subtotal_cents']),'Desconto'.($order['coupon_code']?' ('.$order['coupon_code'].')':'').': -'.$money($order['discount_cents']),'Portes: '.$money($order['shipping_cents']),'TOTAL: '.$money($order['total_cents']),'','Pagamento: '.($payments[$order['payment_status']]??$order['payment_status']),'Estado da encomenda: '.$order['status'],'','Obrigado por escolheres a FORMA.');
    $encoded=[];
    foreach ($lines as $line) { $clean=str_replace(["\r","\n","\0"],' ', $line); $bytes=iconv('UTF-8','Windows-1252//TRANSLIT',$clean); foreach (explode("\n",wordwrap($bytes ?: '',88,"\n",true)) as $wrapped) { $encoded[]=$wrapped; } }
    $pages=array_chunk($encoded,43); $objects=[1=>'<< /Type /Catalog /Pages 2 0 R >>',3=>'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']; $kids=[];
    foreach ($pages as $index=>$page) {
        $pageId=4+$index*2; $contentId=$pageId+1; $kids[]="$pageId 0 R";
        $content="BT /F1 11 Tf 15 TL 48 790 Td\n";
        foreach ($page as $line) { $escaped=str_replace(['\\','(',')'],['\\\\','\\(','\\)'],$line); $content.="($escaped) Tj T*\n"; }
        $content.="ET\nBT /F1 9 Tf 48 32 Td (FORMA - Demonstracao / ".($index+1).'/'.count($pages).") Tj ET";
        $objects[$pageId]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents $contentId 0 R >>";
        $objects[$contentId]='<< /Length '.strlen($content)." >>\nstream\n$content\nendstream";
    }
    $objects[2]='<< /Type /Pages /Kids ['.implode(' ',$kids).'] /Count '.count($pages).' >>'; ksort($objects);
    $pdf="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; $offsets=[0];
    foreach ($objects as $id=>$object) { $offsets[$id]=strlen($pdf); $pdf.="$id 0 obj\n$object\nendobj\n"; }
    $xref=strlen($pdf); $count=count($objects)+1; $pdf.="xref\n0 $count\n0000000000 65535 f \n";
    for ($i=1;$i<$count;$i++) { $pdf.=sprintf('%010d 00000 n ',$offsets[$i])."\n"; }
    $pdf.="trailer\n<< /Size $count /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n";
    header('Content-Type: application/pdf'); header('Content-Disposition: attachment; filename="forma-encomenda-'.$order['id'].'.pdf"'); header('Content-Length: '.strlen($pdf)); echo $pdf; exit;
}
