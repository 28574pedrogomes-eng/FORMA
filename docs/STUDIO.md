# Alertas de preço e FORMA Studio

## Acompanhar um preço

1. Inicia sessão e guarda um produto nos favoritos.
2. No cartão do produto, escolhe **Avisar se o preço baixar**.
3. Quando o administrador baixar o preço mínimo das opções ativas, recebes uma notificação na conta, com o preço anterior e o novo preço.
4. Podes desativar o sino no cartão ou em **A tua conta → Alertas de preço**. Remover o favorito também cancela o alerta.

O acompanhamento usa o menor preço das opções ativas, independentemente do stock. Cada aviso estabelece uma nova referência: uma subida seguida de regresso ao mesmo preço não repete o aviso. Uma redução abaixo dessa referência gera outro aviso. Repetir a ativação não reinicia o histórico. Desativar e voltar a ativar começa um acompanhamento novo com o preço atual.

São notificações internas, sem envio de email ou notificações push. Produtos retirados do catálogo não geram avisos. Uma mudança de preço e os respetivos avisos são guardados na mesma transação. A tabela `price_alerts` está ligada aos favoritos por uma chave estrangeira e está incluída nos backups.

## Dashboard

Abre `http://localhost:8081/#admin` e escolhe **Visão geral**.

- **7, 30 ou 90 dias:** períodos com início à meia-noite UTC e fim no dia atual. A comparação usa o intervalo imediatamente anterior, com o mesmo número de dias; o dia atual ainda está incompleto.
- **Receita aprovada:** total das encomendas criadas no período que atualmente têm pagamento aprovado e não estão canceladas. Inclui portes e descontos. Pagamentos são simulados. Reembolsos deixam de contar.
- **Encomendas:** todas as encomendas criadas no período, incluindo canceladas.
- **Valor médio:** receita aprovada dividida pelo número de encomendas aprovadas.
- **Novos clientes:** contas de cliente criadas no período.
- **Gráfico e CSV:** valores diários do período selecionado, incluindo dias sem vendas. O botão de consulta abre a tabela acessível dos mesmos valores.
- **Mais vendidos:** unidades de artigos em encomendas aprovadas, com valor dos artigos antes de cupões e portes. Os nomes preservam o histórico da compra.
- **Pendentes, últimas encomendas, inventário e alertas:** estado atual da loja, sem restrição ao período do gráfico.

O painel inclui acessos à preparação, envio, pagamentos pendentes, apoio, devoluções e stock baixo; atividade recente; produtos mais acompanhados; estado do processo de tarefas; backups e integrações. O resumo de IA continua disponível numa secção recolhível e usa os últimos 30 dias.

## Gestão

A navegação está organizada em gestão, clientes, conteúdo/campanhas e sistema. As encomendas podem ser filtradas por estado, por pagamentos pendentes ou por encomendas pagas que aguardam preparação. Os produtos podem ser filtrados quando pelo menos uma opção ativa tem cinco unidades ou menos.

A nova secção **Clientes** apresenta os 200 clientes mais recentes, email, data de registo, número de encomendas, total aprovado e última encomenda. O atalho abre a pesquisa das encomendas desse cliente. Não apresenta hashes, palavras-passe ou tokens. A listagem de encomendas mantém o limite existente das 300 mais recentes.

## Instalação e verificação

`server/install.php` aplica a nova tabela de forma idempotente sem substituir os dados existentes. Nesta instalação já foi aplicado e o frontend compilado.

`npm test` inclui `tests/studio.test.mjs`, com verificações de autenticação, CSRF, propriedade, mínimos de variantes, duplicação, remoção de favoritos, períodos, receita, cancelamento e dados de clientes.

Rotas novas: `GET /price-alerts`, `PUT|DELETE /price-alerts/{product_id}`, `GET /admin/overview?days=7|30|90` e `GET /admin/customers`.
