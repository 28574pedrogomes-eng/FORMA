# API PHP

Entrada: `public/api/index.php?route=/...`. Pedidos e respostas usam JSON, exceto upload multipart e exportação CSV/PDF. A autenticação usa cookie de sessão. Obtém o token de `GET /session` e envia-o em `X-CSRF-Token` em todas as operações de escrita. Um login ou logout devolve um novo token.

| Método | Rota | Acesso / finalidade |
| --- | --- | --- |
| GET | `/session` | Sessão atual e token CSRF |
| GET | `/news` | Notícias públicas, por `publication_date DESC, id DESC`; filtros `category` e `page`, 12 por página |
| GET | `/news/{id}` | Notícia completa; 404 quando eliminada/inexistente |
| GET | `/news/categories` | Categorias editoriais e contagem de notícias |
| GET, POST | `/admin/news` | Administrador: listar / criar notícia |
| PUT, DELETE | `/admin/news/{id}` | Administrador: editar / eliminar; DELETE exige JSON `{"confirm":true}` |
| POST | `/admin/news/upload` | Administrador: imagem opcional multipart no campo `file` |
| POST | `/admin/news/categories` | Administrador: criar categoria editorial (`name`) |
| PUT, DELETE | `/admin/news/categories/{id}` | Administrador: renomear / eliminar categoria vazia; DELETE exige confirmação |
| POST | `/auth/register` | Criar conta de cliente |
| POST | `/auth/login` | Iniciar sessão |
| POST | `/auth/logout` | Terminar sessão |
| POST | `/auth/forgot` | Pedir link de recuperação |
| POST | `/auth/reset` | Consumir token e alterar palavra-passe |
| GET | `/categories` | Categorias e contagem de produtos ativos |
| GET | `/products` | Catálogo filtrado e paginado |
| GET | `/products/{id}` | Detalhes de produto ativo |
| GET | `/orders` | Encomendas do utilizador autenticado |
| POST | `/orders` | Criar encomenda, calcular total e atualizar stock |
| GET | `/notifications` | Últimas 50 notificações do utilizador |
| POST | `/notifications/read` | Marcar as notificações próprias como lidas |
| GET, POST | `/admin/products` | Listar / inserir produtos |
| PUT, DELETE | `/admin/products/{id}` | Alterar / retirar produto do catálogo |
| POST | `/admin/categories` | Inserir categoria |
| PUT, DELETE | `/admin/categories/{id}` | Alterar / eliminar categoria vazia |
| POST | `/admin/upload` | Carregar imagem no campo multipart `file` |
| GET | `/admin/orders` | Últimas 300 encomendas e respetivas linhas |
| PATCH | `/admin/orders/{id}` | Atualizar estado permitido |
| GET | `/admin/dashboard` | Indicadores e séries calculados em SQL |
| GET | `/admin/activity` | Últimas 200 operações |
| GET | `/admin/export` | CSV completo; exige CSRF e administrador |
| GET, POST | `/addresses` | Listar / guardar morada própria |
| PUT, DELETE | `/addresses/{id}` | Alterar / eliminar morada própria |
| GET | `/favorites` | IDs favoritos da conta |
| POST | `/favorites/merge` | Unir IDs locais aos da conta (`ids`, máximo 200) |
| PUT, DELETE | `/favorites/{productId}` | Guardar / remover favorito |
| GET, POST | `/restock` | Listar avisos próprios / subscrever `variant_id` esgotada |
| DELETE | `/restock/{id}` | Cancelar aviso próprio |
| POST | `/checkout/quote` | Calcular artigos, desconto e portes; exige conta |
| POST | `/orders/{id}/payment` | Simular nova tentativa própria, ou como administrador |
| POST | `/orders/{id}/cancel` | Cancelar encomenda recebida, repor stock e libertar cupão |
| GET | `/orders/{id}/receipt` | PDF privado, apenas dono ou administrador |
| GET | `/products/{id}/related` | Até 4 produtos ativos por categoria, destaque e proximidade de preço |
| GET, POST | `/products/{id}/reviews` | Consultar avaliações / criar ou editar avaliação própria verificada |
| POST | `/reviews/upload` | Imagem de avaliação, campos `file` e `product_id`; compra verificada |
| DELETE | `/reviews/{id}` | Eliminar avaliação própria |
| GET, POST | `/admin/products/{id}/variants` | Listar opções / inserir variante |
| PUT, DELETE, PATCH | `/admin/variants/{id}` | Alterar / arquivar / reativar variante |
| GET, POST | `/admin/stock` | Últimos 300 movimentos / ajustar stock com `variant_id`, `delta` e `reason` |
| GET, POST | `/admin/coupons` | Listar / criar cupões |
| PUT, DELETE | `/admin/coupons/{id}` | Alterar / desativar cupão |
| GET | `/admin/reviews` | Últimas 100 avaliações, incluindo ocultas |
| PATCH | `/admin/reviews/{id}` | Moderar com `visible: true/false` |

O catálogo aceita `search`, `category`, `sort` (`featured`, `newest`, `price_asc`, `price_desc`), `max_price` em cêntimos, `in_stock=1` e `page`. A resposta inclui `items`, `total`, `page` e `pages`, com 12 artigos por página.

Encomenda de exemplo:

```json
{
  "checkout_key": "d61aa9fa-4ba4-4b29-8ce7-aefde17df0c4",
  "shipping_name": "Cliente de demonstração",
  "address": "Rua de Exemplo, 10",
  "city": "Lisboa",
  "postal_code": "1000-001",
  "phone": "912345678",
  "shipping_method": "standard",
  "coupon_code": "",
  "payment_outcome": "approved",
  "save_address": false,
  "items": [{ "product_id": 1, "variant_id": 1, "quantity": 2 }]
}
```

A mesma chave com o mesmo utilizador devolve a encomenda já criada. Usa IDs reais de produto e variante obtidos no catálogo; sem `variant_id`, é escolhida a primeira opção ativa. O servidor ignora preços/totais enviados pelo cliente. Standard custa 490 cêntimos, ou é grátis desde 7500 cêntimos **após desconto**; expresso custa 990 cêntimos. `/checkout/quote` aceita `items`, `coupon_code` e `shipping_method`, sem criar encomenda nem reservar stock/cupão. O POST final reconfirma todos os valores numa transação.

Os pagamentos aceitam `outcome` = `approved`, `refused` ou `pending` e um UUID em `request_key`. O estado de pagamento (`paid`, `failed`, `pending`, `unpaid`, `refunded`) é separado do estado de preparação. Apenas pagamentos aprovados permitem preparar. Não há integração financeira real.

Cupões usam `code`, `type` (`percent` ou `fixed`), `value` (percentagem inteira ou cêntimos), `minimum_cents`, `max_uses`, `starts_at`, `expires_at` (datas `YYYY-MM-DD`, UTC) e `active`. O cancelamento liberta a utilização reservada. A exportação aceita `type=products|orders|activity|stock`.

Uma morada inclui `label`, `shipping_name`, `address`, `city`, `postal_code`, `phone` e `is_default`. Avaliações aceitam `rating` de 1 a 5, `comment` entre 10 e 2000 caracteres e até 3 caminhos em `photos`, carregados pelo mesmo utilizador. Só uma compra paga e entregue permite criar ou editar uma avaliação. Editar não volta a tornar visível uma avaliação ocultada pelo administrador.

Erros devolvem `{ "error": "Mensagem em português" }`. Códigos principais: 401 sessão necessária, 403 permissão insuficiente, 404 recurso inexistente, 409 conflito/stock insuficiente, 419 CSRF inválido, 422 validação, 429 limite de tentativas, 503 serviço indisponível. Os detalhes técnicos são guardados nos logs privados.

## Experiência, apoio e integrações

| Rota | Métodos | Acesso |
| --- | --- | --- |
| `/cart/quote` | POST | Público com CSRF e limite de utilização; preços e stock calculados no servidor |
| `/favorites/share` | GET, POST, DELETE | Cliente; consultar existência, criar/rodar token e revogar |
| `/shared/{token}` | GET | Público, sem dados de identidade do proprietário |
| `/support` | GET, POST | Cliente; lista própria e novo pedido `{subject,content}` |
| `/support/{id}` | GET, POST, PATCH | Proprietário; conversa, mensagem `{content}`, estado `{status:open/closed}` |
| `/admin/support`, `/admin/support/{id}` | GET; GET, POST, PATCH | Administrador; todos os pedidos e respostas |
| `/returns` | GET, POST | Cliente; lista própria ou `{order_id,reason}` |
| `/admin/returns`, `/admin/returns/{id}` | GET; PATCH | Administrador; `{status,admin_note,confirm:true}` |
| `/bundles` | GET | Público; itens, total atual e disponibilidade |
| `/admin/bundles`, `/admin/bundles/{id}` | GET, POST; PUT, DELETE | Administrador; campos `name,description,image,active,items:[{variant_id,quantity}]`; eliminar exige `confirm:true` |
| `/admin/bundles/variants` | GET | Administrador; opções ativas para o editor |
| `/admin/news/{id}/revisions` | GET | Administrador; até 100 revisões |
| `/admin/news/{id}/restore/{revision}` | POST | Administrador; `{version,confirm:true}`, restaura como rascunho |
| `/admin/integrations` | GET, PUT | Administrador; configuração pública e gravação de credenciais sem devolução dos segredos |
| `/admin/integrations/test-email` | POST | Administrador; envia ao próprio endereço; 202 com ID da fila |
| `/ai/chat`, `/admin/ai/summary` | POST | Cliente/administrador; `{message}` no chat; responde 202 `{id,status}` |
| `/ai/jobs/{id}` | GET | Dono do pedido; resumos exigem ainda papel administrador. Estados queued/processing/done/failed |

O editor de notícias aceita `status:published|draft|scheduled`, `publish_at` em `YYYY-MM-DD HH:mm:ss` UTC e `version` para controlo de concorrência. Datas futuras de agendamento ficam invisíveis na leitura pública; a data editorial continua a definir a ordenação. O produto aceita também `dimensions` até 120 caracteres.

Consultar [EXPERIENCE.md](EXPERIENCE.md) para configuração OpenAI/SMTP, limites, tratamento de segredos e processamento em segundo plano.


## Login Google (PHP/Composer)

| Método | Rota | Acesso / função |
|---|---|---|
| GET | `/auth/google/status` | Público; disponibilidade e associação da própria conta, sem credenciais |
| POST | `/auth/google/start` | CSRF; `intent=login` ou `link` (este exige sessão); devolve URL Google |
| GET | `/auth/google/result` | Resultado de uso único guardado na sessão após callback |
| GET, PUT | `/admin/auth/google` | Administrador; configuração com segredo apenas de escrita |

O callback é `/auth/google/callback.php`, fora do router JSON. Valida o fluxo e redireciona para `/#google-result`. O corpo de configuração aceita `client_id`, `client_secret`, `enabled` e `clear_secret`. Instruções em [GOOGLE-LOGIN.md](GOOGLE-LOGIN.md).
