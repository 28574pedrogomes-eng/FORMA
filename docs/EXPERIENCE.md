# Novas funcionalidades — FORMA

As dez funcionalidades desta fase usam a instalação existente. Executar `iniciar.bat` aplica `experience-v1`, preserva os dados e inicia o processamento de IA/email. Não é instalado nenhum modelo local.

| Funcionalidade | Onde experimentar |
| --- | --- |
| Assistente de compras com IA | Botão “Ajuda a escolher”, após iniciar sessão. Indicar orçamento, estilo ou divisão. As sugestões usam o catálogo da base de dados. |
| Resumo de gestão com IA | Administração → Visão geral → Gerar resumo. Usa vendas pagas dos últimos 30 dias, produtos mais vendidos e stock atual. |
| Rascunhos e agendamento | Administração → Notícias → Estado de publicação. A hora é introduzida no fuso do navegador e guardada em UTC. |
| Histórico editorial | Botão Histórico em cada notícia. Consultar versões e restaurar mediante confirmação; a versão restaurada fica como rascunho. |
| Comparação de produtos | “Comparar” no cartão ou detalhe; até quatro peças, com preço, material, dimensões e stock. Dimensões editáveis no produto. |
| Favoritos partilhados | Favoritos → Criar novo link. A lista é pública para quem tem o link; pode ser revogada. Criar outro link invalida o anterior. |
| Apoio ao cliente | A minha conta → Apoio ao cliente. Conversas privadas, respostas da administração e notificações internas. |
| Devoluções | A minha conta → Devoluções, para encomendas entregues e pagas. Administração aprova/recusa e conclui após receção dos artigos. |
| Conjuntos para a casa | Menu Conjuntos; três exemplos iniciais. Administração → Conjuntos para criar/editar/eliminar. Adição integral ao carrinho após validação de stock. |
| Email SMTP | Administração → Integrações. Recuperação de acesso e confirmação de encomenda; botão de teste para o email da conta administrativa. |

## Configurar Gemini ou OpenAI

1. Entrar como administrador e abrir **Integrações**.
2. Selecionar **Google Gemini**, criar uma chave em https://aistudio.google.com/apikey e introduzi-la no campo **Chave API Gemini**. Guardar as integrações. Não colocar a chave no React, em variáveis `VITE_`, no Git ou no chat.
3. O modelo Gemini sugerido é `gemini-3.1-flash-lite`; pode ser alterado para outro modelo Gemini com saída JSON estruturada disponível no projeto. OpenAI continua disponível como opção separada, com a sua própria chave e modelo `gpt-4.1-mini`. Não há mudança automática de fornecedor quando ocorre um erro.
4. Confirmar **Processamento: ativo** e experimentar o assistente ou o resumo. A disponibilidade, quotas e eventuais custos dependem do projeto e do fornecedor escolhido.

As credenciais ficam em `storage/integrations.json`, fora da pasta pública e excluídas do Git. A API devolve apenas indicadores de configuração, nunca a chave ou palavra-passe SMTP. Campos secretos vazios mantêm o valor existente; as caixas de remoção permitem apagá-lo explicitamente.

O backend chama o endpoint oficial do fornecedor selecionado: Gemini `https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent` (chave no cabeçalho `x-goog-api-key`, saída JSON e até 2048 tokens) ou OpenAI `https://api.openai.com/v1/responses` (`store: false`, até 800 tokens). Os certificados TLS são verificados e a resposta é validada no servidor. IDs sugeridos são filtrados contra os produtos fornecidos e os cartões são consultados novamente na base de dados. A IA não executa compras, SQL ou alterações. Os preços apresentados nos cartões vêm do catálogo; o texto gerado pode conter erros e deve ser confirmado.

O assistente exige autenticação: 15 pedidos por utilizador/IP em 15 minutos e 40 por IP por hora, partilhados com o resumo. Não se transmite o histórico de conversas, moradas, emails ou encomendas individuais. Uma pergunta pode conter dados que o próprio utilizador escreveu; a interface informa que será enviada ao fornecedor de IA configurado. O resumo usa agregados sem identificação dos clientes. Os trabalhos ficam na base durante até 24 horas, com limpeza pelo worker; o conteúdo do pedido é apagado ao terminar.

Referências oficiais: [Chaves Gemini](https://ai.google.dev/gemini-api/docs/api-key), [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

## Configurar email

Preencher servidor, porta, TLS/SSL, utilizador, palavra-passe e remetente fornecidos pelo serviço SMTP, ativar entrega real e guardar. A ligação verifica certificados TLS; não existe opção para desativar essa verificação. Usa [PHPMailer 7.1.1](https://github.com/PHPMailer/PHPMailer/releases/tag/v7.1.1), com código e licença em `server/vendor/PHPMailer`.

O botão de teste envia apenas para o email do administrador autenticado. Para receber esse teste é necessário que a conta tenha um endereço de email real e acessível. O endereço inicial `admin@forma.pt` é um exemplo; pode criar-se uma conta com email real e atribuir-lhe o papel de administrador na base de dados da instalação. Não basta colocar um endereço arbitrário no remetente: o fornecedor SMTP pode exigir que seja verificado.

Sem SMTP ativo, os emails são guardados em `storage/mail`, sem entrega externa. O painel mostra contagens de mensagens locais, em fila, em processamento, enviadas ou falhadas. A confirmação é criada apenas uma vez por encomenda, incluindo quando o checkout é repetido com a mesma chave. O email informa que a encomenda é de demonstração. A recuperação mantém tokens de uso único, validade de 30 minutos e resposta genérica para emails desconhecidos.

Os emails SMTP são processados em segundo plano. Não há repetição automática de um envio incerto, para evitar duplicação. Corrigir as definições e pedir uma nova mensagem; links de recuperação em fila há mais de 25 minutos não são enviados. Corpos enviados são eliminados da fila, e corpos de falhas são limpos depois de um dia pelo worker. O modo local conserva os ficheiros para a demonstração.

## Processo em segundo plano

`scripts/start.ps1` / `iniciar.bat` iniciam o PHP web e `server/worker.php`. `scripts/stop.ps1` termina os processos registados da aplicação, mantendo o MySQL disponível. Há um bloqueio por base de dados que impede dois workers simultâneos.

Numa instalação Apache, manter um terminal/processo supervisionado com:

```powershell
C:\xampp\php\php.exe server/worker.php
```

O worker processa IA e email, regista heartbeat e não mantém bloqueios da base de dados durante chamadas externas. O site permanece disponível enquanto aguarda a OpenAI. Se parar, o pedido de IA é recusado com uma mensagem clara. Chamadas interrompidas ficam como falhadas e não são repetidas automaticamente.

## Regras e verificação

- Notícias: publicação automática no instante agendado através do filtro de leitura, sem depender de cron. Rascunhos e agendamentos futuros não aparecem no site. Conflitos de versão devolvem 409. Até 100 revisões recentes são apresentadas; eliminar a notícia elimina as revisões associadas.
- Partilha: token aleatório de 24 bytes, apenas SHA-256 guardado. Não expõe nome/email do dono. O link revela todos os favoritos ativos atuais e futuros enquanto continuar válido.
- Devoluções: pedido integral, único por encomenda; `requested → approved/rejected → completed`. Concluir repõe stock, regista movimentos e simula reembolso numa transação. Repetir a conclusão não duplica o stock ou reembolso. Não existe devolução parcial nem processamento financeiro real.
- Conjuntos: 2–12 opções distintas, 1–10 unidades por opção. Preço é a soma dos preços atuais, sem desconto implícito. A cotação e o checkout verificam stock e calculam preços no servidor. Não há reserva até ao checkout.
- Apoio: conversas visíveis apenas ao proprietário e administradores; texto simples, notificações e histórico de atividade. Pedidos fechados precisam de ser reabertos para receber respostas.

`npm test` cria uma base temporária, verifica a API, o contrato de pedidos/respostas OpenAI, permissões, CSRF, idempotência, privacidade e os percursos no navegador. `node scripts/verify.mjs --experience-only` testa esta fase. Nenhum teste automático envia email externo ou faz uma chamada paga à OpenAI. A validação de respostas reais e de entrega SMTP depende das credenciais da instalação.
