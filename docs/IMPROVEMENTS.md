# Perfil, catálogo, apoio e operação

## Perfil e email

Em **A minha conta → O teu perfil** é possível editar o nome, a palavra-passe e pedir alteração do email. Nome: 2–100 caracteres. A alteração de palavra-passe exige a atual e termina as outras sessões. O navegador atual recebe uma nova sessão e token CSRF.

Alterar email exige a palavra-passe atual. O endereço antigo continua ativo até o utilizador abrir o link enviado ao novo endereço, entrar na conta que fez o pedido e clicar em confirmar. O token tem 32 bytes aleatórios, apenas o hash fica na base, expira em 30 minutos e é de uso único. Pedir outro link substitui o anterior. Pode cancelar-se o pedido na conta. Confirmar também termina as outras sessões e avisa o email antigo.

Sem SMTP, as mensagens ficam em `storage/mail`, como na recuperação de palavra-passe. A interface indica que não houve entrega externa. A configuração de email encontra-se em Administração → Integrações. Depois de confirmar um endereço real na conta administrativa, o botão de teste SMTP pode enviar para esse endereço.

O instalador verifica se já existe algum administrador: mudar o email da conta administrativa não recria a conta inicial nem repõe credenciais antigas. `storage/setup-credentials.txt` é apenas o registo da instalação inicial.

## Galeria e pesquisa

**Administração → Produtos e stock → Gerir galeria** permite carregar até 12 fotografias adicionais, escrever descrições acessíveis, associar cada fotografia a uma opção e alterar a ordem. Aceita JPG/PNG/WebP até 5 MB e 6000 × 6000 píxeis. Guardar persiste a seleção; retirar uma imagem da galeria não apaga o ficheiro nem altera encomendas antigas.

No produto, a fotografia principal da opção selecionada aparece primeiro, seguida das fotografias gerais e das associadas a essa opção. Miniaturas permitem selecionar imagens; o botão de zoom amplia a fotografia, com deslocamento dentro da área. Mudar a opção volta à primeira fotografia.

A pesquisa apresenta até seis sugestões de produtos ativos depois de dois caracteres, por nome ou categoria. Permite clicar ou usar setas, Enter e Escape. A pesquisa completa e os filtros do catálogo continuam a funcionar. Pedidos anteriores são cancelados ao escrever novamente.

## Encomendas e apoio

**Ver detalhes da encomenda** apresenta uma linha temporal com as datas de receção, preparação, envio, entrega, cancelamento ou devolução concluída. Cada evento é guardado na mesma transação que a operação. Repetir o checkout não duplica o evento inicial. Para encomendas anteriores à migração, conserva-se a data conhecida de criação; o estado final anterior fica identificado como sem data disponível.

Nos pedidos de apoio e respostas, é possível anexar até três imagens ou PDFs de 5 MB. Os ficheiros ficam fora da pasta pública. Só o proprietário do pedido e os administradores podem descarregar anexos enviados. Antes de enviar a mensagem, apenas quem carregou o ficheiro pode consultá-lo. Os anexos não podem ser apropriados por outra conta ou reutilizados noutra mensagem. PDFs são descarregados, sem execução ou apresentação embutida.

O worker elimina anexos abandonados há mais de 24 horas. Os anexos enviados são preservados e incluídos nos backups.

## Monitorização e backups

**Administração → Integrações → Histórico das integrações** mostra até 50 operações de IA e 50 de email, filtro por estado, datas e mensagens de erro controladas. Não revela perguntas, respostas, corpos de email nem credenciais; os destinatários aparecem parcialmente ocultos. Não repete envios automaticamente. “Enviado” significa aceite pelo servidor SMTP, não confirmação de leitura nem garantia de chegada à caixa de entrada.

Os trabalhos IA são conservados por até 24 horas. O worker deve estar ativo para processar e limpar a fila. Reiniciar através dos scripts da loja depois de atualizar o código do worker.

**Administração → Backups** permite criar e descarregar cópias verificadas. A recuperação para uma base nova está documentada em [BACKUPS.md](BACKUPS.md).

## Rotas acrescentadas

| Rota | Método | Acesso |
| --- | --- | --- |
| `/profile` | GET, PUT | Própria conta; estado do perfil e alteração do nome |
| `/profile/password` | POST | Própria conta e palavra-passe atual |
| `/profile/email` | POST, DELETE | Pedir/cancelar alteração; POST exige palavra-passe atual |
| `/profile/email/confirm` | POST | Própria conta e token válido |
| `/products/suggestions?q=...` | GET | Público |
| `/admin/products/{id}/gallery` | GET, PUT | Administrador |
| `/support/attachments` | POST multipart | Utilizador autenticado |
| `/support/attachments/{id}` | GET | Dono do anexo pendente ou participantes autorizados do pedido |
| `/admin/integrations/logs?status=...` | GET | Administrador |
| `/admin/backups` | GET, POST | Administrador; criar exige palavra-passe atual |
| `/admin/backups/{id}/download` | GET | Administrador |

As respostas de produtos completos incluem `gallery`, as encomendas incluem `timeline` e as mensagens de apoio incluem `attachments`. A escrita em pedidos de apoio aceita `attachments: [id, ...]`. Todas as rotas de escrita exigem CSRF e validam os dados no servidor.
