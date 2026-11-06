<?php
declare(strict_types=1);
function currentPassword(array $data, array $actor): array {
    rateLimit('sensitive-'.$actor['id'],12);
    $password=$data['current_password']??null;$row=query('SELECT * FROM users WHERE id=?',[$actor['id']])->fetch();
    if(!is_string($password)||strlen($password)>72||!password_verify($password,$row['password_hash']))fail('A palavra-passe atual está incorreta.',422);
    return $row;
}
function orderEvent(int $orderId,string $status,string $note=''):void {
    query('INSERT INTO order_events (order_id,status,note,occurred_at) VALUES (?,?,?,UTC_TIMESTAMP())',[$orderId,$status,$note]);
}
function attachmentDirectory():string {
    global $config;$path=__DIR__.'/../storage/support'.(getenv('FORMA_TEST_MODE')==='1'?'-'.$config['db_name']:'');
    if(!is_dir($path)&&!mkdir($path,0700,true))throw new RuntimeException('Private storage unavailable');return $path;
}
function attachToMessage(int $messageId,int $userId,array $data):void {
    $ids=$data['attachments']??[];
    if(!is_array($ids)||!array_is_list($ids)||count($ids)>3)fail('Podes enviar até três anexos.',422);
    foreach($ids as $id){
        if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))fail('Anexo inválido.',422);
        $row=query('SELECT id FROM support_attachments WHERE id=? AND user_id=? AND message_id IS NULL AND created_at>UTC_TIMESTAMP()-INTERVAL 1 DAY FOR UPDATE',[$id,$userId])->fetch();
        if(!$row)fail('O anexo não te pertence, expirou ou já foi enviado.',422);
        query('UPDATE support_attachments SET message_id=? WHERE id=?',[$messageId,$id]);
    }
}
