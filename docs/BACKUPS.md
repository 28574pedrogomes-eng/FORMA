# Backups e recuperação

## Criar e guardar uma cópia

Em **Administração → Backups → Criar backup**, confirmar a palavra-passe atual. Depois descarregar o ZIP. Só administradores podem criar, listar e descarregar cópias. Cada arquivo é verificado antes de ser apresentado e novamente antes do download.

O arquivo contém dados pessoais e hashes de palavras-passe. Não é cifrado: guardar num disco ou serviço protegido, com acesso restrito. Uma cópia guardada no mesmo computador não protege contra a perda desse computador.

Também é possível criar pela linha de comandos, na pasta do projeto:

```powershell
C:\xampp\php\php.exe scripts/backup.php create
```

O comando apresenta o caminho de um novo arquivo em `storage/backups`. Não apaga cópias anteriores. O painel mostra até 50 cópias recentes; não há agendamento automático nesta versão.

## Conteúdo e integridade

- `database.json`: dados das tabelas do projeto, numa leitura consistente InnoDB. Não contém SQL executável.
- `public/images` e `public/uploads`: fotografias e imagens locais, incluindo a galeria.
- `private/support`: anexos já associados a mensagens de apoio.
- `manifest.json`: versão do formato, data, tamanho e SHA-256 de cada ficheiro.

Não são incluídos vídeos, código da aplicação, dependências, ficheiros de sessão, configurações ou chaves OpenAI/SMTP. Conservar também uma cópia da **mesma versão do projeto** e guardar as credenciais separadamente.

Tokens de recuperação e confirmação, limites temporários e trabalhos IA ficam vazios. Os corpos dos emails são removidos; mensagens pendentes passam a falhadas para não serem reenviadas após a recuperação. Anexos carregados mas nunca enviados são excluídos. O próprio índice de backups não é restaurado, pois aponta para arquivos da instalação anterior.

O SHA-256 deteta danos ou alterações acidentais, mas não autentica um arquivo vindo de uma origem desconhecida. Só recuperar cópias de confiança. O leitor valida caminhos e limites de tamanho e não extrai caminhos arbitrários do ZIP.

Verificar uma cópia sem alterar dados:

```powershell
C:\xampp\php\php.exe scripts/backup.php verify C:\copia\forma-backup.zip
```

## Recuperar para uma base nova

É necessária uma instalação funcional da mesma versão do projeto, com o esquema MySQL já criado. Se o computador original se perdeu, instalar primeiro o XAMPP, repor o código e executar `server/install.php`. Essa instalação fornece o esquema conhecido; não se executa SQL proveniente do arquivo.

Na pasta do projeto:

```powershell
C:\xampp\php\php.exe scripts/backup.php restore C:\copia\forma-backup.zip forma_restore_ensaio
```

Este comando:

1. Valida o ZIP e todos os ficheiros antes de começar.
2. Exige um nome novo com prefixo `forma_restore_`; recusa uma base ou pasta que já exista.
3. Cria o esquema usando as definições da instalação local e insere os dados com consultas preparadas.
4. Guarda as imagens em `storage/restores/forma_restore_ensaio/public` e os anexos em `storage/restores/forma_restore_ensaio/private/support`.
5. Invalida sessões anteriores e mantém tokens e envios pendentes desativados.

A base e os ficheiros da loja atual não são substituídos. Se houver uma falha durante a recuperação, o destino novo pode ficar incompleto e o comando informa o seu nome. Usa outro nome para voltar a testar.

## Colocar a cópia recuperada em funcionamento

Fazer primeiro o ensaio numa **cópia separada do projeto**:

1. Copiar a versão do código correspondente ao backup para outra pasta.
2. Nessa cópia, definir `db_name` como a base recuperada e `app_url` como o endereço de teste em `server/config.local.php`.
3. Copiar as pastas recuperadas `public/images` e `public/uploads` para a pasta `public` dessa cópia do projeto. Copiar os anexos de `private/support` para `storage/support`.
4. Repor os vídeos a partir da cópia do projeto. Compilar o React se necessário.
5. Iniciar o servidor dessa cópia numa porta livre, com o seu próprio worker. O `iniciar.bat` original usa a porta 8081; para o ensaio, usar comandos manuais com outra porta, por exemplo 8083.
6. Verificar início de sessão, produtos, imagens, encomendas, notícias e download de anexos. Reconfigurar OpenAI e SMTP apenas quando se pretender voltar a ativar chamadas e envios reais.

Após validar o ensaio, decidir quando mudar a instalação usada pelos clientes. Fazer uma cópia atual antes dessa mudança para preservar alterações posteriores ao backup escolhido. Os scripts de recuperação não fazem essa troca automaticamente.

## Verificação automatizada

`npm test` cria uma base isolada, gera um backup, testa uma cópia danificada, recupera para outra base temporária, compara dados e imagens e verifica que tokens e corpos de email não reaparecem. No fim, remove apenas os destinos criados pelos testes. Não usa o backup real nem substitui a loja.
