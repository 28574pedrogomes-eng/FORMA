<?php
// Selects the provider only; never reads a key from the command line or prints secrets.
if (PHP_SAPI !== 'cli') { exit; }
require __DIR__ . '/../server/bootstrap.php';
require __DIR__ . '/../server/integrations.php';
session_write_close();
if (($argv[1] ?? '') !== '--apply') { fwrite(STDERR, "Usa --apply para selecionar Gemini sem alterar as chaves guardadas.\n"); exit(1); }
$settings = publicIntegrations();
$settings['ai_provider'] = 'gemini';
saveIntegrations($settings);
echo "Gemini selecionado. Introduz a chave em Administração > Integrações > Chave API Gemini.\n";
