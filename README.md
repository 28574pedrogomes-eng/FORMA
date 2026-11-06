# FORMA — Loja online de demonstração

Loja de mobiliário e decoração em **React + Tailwind CSS**, com uma **API PHP 8.2+ e base de dados MySQL/MariaDB no XAMPP**. Interface em português de Portugal, valores em euros e layout adaptado a computador, tablet e telemóvel.

A coleção inclui **60 artigos**, com uma nova categoria **Mesa e cozinha**, navegação visual por categorias e preços revistos por comparação com retalhistas portugueses. Consulta [a revisão de preços](docs/PRECOS.md) para fontes e limitações dos valores de demonstração.

O **login com Google em PHP/Composer** está integrado. Para o ativar, segue [o guia Google OAuth](docs/GOOGLE-LOGIN.md) e configura as credenciais em **Administração → Integrações → Login com Google**. As contas por email continuam disponíveis.

## Abrir a aplicação

Nesta máquina, executa **`iniciar.bat`** e abre **http://localhost:8081**. O ficheiro inicia o MySQL do XAMPP, verifica a instalação e inicia o servidor PHP. A base de dados chama-se `forma_shop`.

- Administração: `http://localhost:8081/#admin`
- Email de administrador: **admin@forma.pt**
- Palavra-passe gerada na instalação: **`storage/setup-credentials.txt`**. Não é uma palavra-passe fixa no código.
- Para testar como cliente, cria uma conta na própria loja.

A instalação é idempotente: não apaga dados nem altera a palavra-passe de contas existentes. O XAMPP inclui MariaDB, compatível com as consultas MySQL utilizadas no projeto.

## Funcionalidades

**FORMA Studio:** alertas de redução de preço nos favoritos, administração reorganizada, dashboard por período com comparação e CSV, pendentes operacionais, produtos mais vendidos e área de clientes. Consulta [o guia do Studio](docs/STUDIO.md).

**Nova fase:** assistente com Gemini ou OpenAI, resumo de gestão com IA, notícias com rascunhos/agendamento e revisões, comparação, favoritos partilhados, apoio ao cliente, devoluções, conjuntos e email SMTP. Configuração e percursos de demonstração em [docs/EXPERIENCE.md](docs/EXPERIENCE.md).

**Melhorias adicionais:** perfil editável com confirmação de email, galeria e zoom, pesquisa com sugestões, histórico de encomendas, anexos privados, backups e monitorização. Consulta [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) e o [guia de recuperação](docs/BACKUPS.md).

| Área | Funcionalidades |
| --- | --- |
| Catálogo | 60 produtos de demonstração em 5 categorias, descoberta visual, pesquisa, preço máximo, disponibilidade, ordenação e paginação |
| Compras | Variantes com fotografia/preço/stock próprios, produtos relacionados, favoritos sincronizados e carrinho persistente |
| Checkout | Moradas guardadas, retoma após login, cupões, entrega standard/expresso e total calculado no servidor |
| Encomendas | Linhas com dados históricos, acompanhamento, cancelamento e comprovativo PDF privado |
| Pagamentos | Simulador aprovado/recusado/pendente, novas tentativas, histórico e reembolso simulado ao cancelar |
| Avaliações | Classificação e comentário de compra paga e entregue, até 3 fotografias, edição/eliminação e moderação |
| Contas | Registo, início/fim de sessão, permissões de cliente e administrador |
| Recuperação | Token aleatório de uso único, validade de 30 minutos e invalidação das sessões anteriores |
| Administração | CRUD de produtos, categorias, variantes e cupões; estados de encomendas e movimentos de stock com motivo e responsável |
| Ficheiros | Upload de imagens JPG, PNG e WebP, até 5 MB, com validação do conteúdo no servidor |
| Notificações | Boas-vindas, encomendas, pagamentos e reposição de opções esgotadas; marcação como lidas |
| Exportação | CSV de produtos, encomendas, movimentos de stock e atividade; comprovativo PDF de cada encomenda |
| Dashboard | Indicadores da base de dados, gráfico dos últimos 7 dias, distribuição por categoria e stock baixo |
| Auditoria | Registo de autenticações, alterações, uploads, encomendas e exportações |
| Notícias | Listagem por data decrescente, página completa, categorias próprias, CRUD na administração e imagem opcional |
| Interface | Layout responsivo, animações React, navegação acessível e respeito por movimento reduzido |
| Abertura cinematográfica | Filmagem real de interior controlada pelo scroll nos dois sentidos, barras de cinema, etiquetas de produtos com acesso aos detalhes e transição direta para o catálogo |

O pagamento é simulado, sem cartões ou cobranças reais. Portes e prazos são ilustrativos. O PDF é um comprovativo de demonstração, não uma fatura fiscal.

A abertura usa vídeo de stock gratuito do Pexels, guardado localmente. Podes pausar o vídeo ou saltar a introdução. Em movimento reduzido, poupança de dados ou falha do vídeo, aparece uma fotografia e a introdução fica mais curta. As etiquetas usam os nomes, fotografias e preços atuais da base de dados. No servidor PHP de desenvolvimento, `server/media.php` suporta pedidos HTTP Range para permitir a navegação pelo vídeo; no Apache esse suporte é nativo.

### Experimentar as novas funcionalidades

1. Em **Administração → Produtos e stock**, usa o botão **Gerir opções** para criar variantes com cor, tamanho, material, fotografia, preço e stock. O stock do produto é a soma das opções ativas; o preço apresentado no catálogo é o menor preço.
2. Em **Cupões**, cria um código de percentagem ou valor fixo, com compra mínima, validade UTC e máximo de utilizações. Introduz esse código no checkout.
3. Na conta do cliente, guarda uma morada. Adiciona uma variante ao carrinho e escolhe um resultado de pagamento de teste. Se escolheres recusado ou pendente, usa **Resolver pagamento** na encomenda.
4. Após pagamento aprovado, o administrador pode passar a encomenda por preparação, envio e entrega. O comprador passa então a poder avaliar os produtos recebidos.
5. Numa opção esgotada, escolhe **Avisar quando voltar**. Uma entrada de stock positiva em **Movimentos de stock** gera uma notificação interna e conclui essa subscrição.

### Módulo de notícias

- **Leitura pública:** abre **Notícias** no menu ou `http://localhost:8081/#news`. A listagem apresenta 12 notícias por página, por data da mais recente para a mais antiga; em datas iguais, a notícia com ID mais elevado aparece primeiro. Podes filtrar por categoria.
- **Consultar:** cada notícia tem uma página própria em `#news/{id}`, com título, categoria, data, conteúdo completo e imagem quando disponível. A ligação funciona também ao recarregar a página.
- **Gerir:** entra como administrador e abre **Administração → Notícias**. Usa **Nova notícia**, os botões de editar/eliminar e **Categorias de notícias**. A eliminação exige confirmação. Clientes e visitantes podem ler, mas não gerir conteúdo editorial.
- **Campos obrigatórios:** título (2–160 caracteres), conteúdo (10–20 000 caracteres), data válida e categoria. O conteúdo é texto simples, com quebras de parágrafo, sem execução de HTML. A data define a ordenação; o estado permite publicar, guardar rascunho ou agendar uma hora. Só notícias publicadas ou com agendamento já atingido aparecem no site.
- **Imagem opcional:** JPG, PNG ou WebP, até 5 MB e 6000 × 6000 píxeis. Podes substituir a imagem ou remover a associação à notícia. Não é necessária imagem para guardar.
- **Categorias próprias:** criar, renomear e eliminar; uma categoria com notícias associadas não pode ser eliminada antes de essas notícias mudarem de categoria.

O instalador aplica `database/news.sql` e `server/news-migration.php` sem modificar os produtos ou encomendas. Inclui três notícias iniciais de demonstração. O registo `news-v1` impede que reinstalar duplique exemplos ou volte a criar notícias eliminadas. As operações editoriais e os uploads ficam no registo de atividade. As rotas de escrita exigem sessão de administrador, CSRF e validação no servidor.

O instalador aplica `database/commerce.sql` e migra os dados existentes sem os apagar: cria uma variante padrão por produto, associa as linhas antigas e regista o inventário inicial. Não cria avaliações fictícias nem encomendas de demonstração na base real.

A coleção adicional está em `database/catalog-additions.php`: 12 peças, cada uma com fotografia local, descrição, preço, variante padrão e movimento de stock inicial. `server/catalog-migration.php` acrescenta-as uma única vez, tanto nas instalações novas como nas existentes. Voltar a executar o instalador não duplica produtos, não repõe stock vendido e não reativa produtos arquivados.

## Instalação manual

1. Instala o XAMPP em `C:\xampp` e inicia **MySQL** no painel de controlo.
2. Instala Node.js 22.16+ para compilar o frontend. Depois da compilação, só precisas do PHP e MySQL para executar a loja.
3. Abre um terminal na pasta do projeto:

```powershell
npm ci
npm run build
C:\xampp\php\php.exe server/install.php
C:\xampp\php\php.exe -d upload_max_filesize=5M -d post_max_size=6M -S 127.0.0.1:8081 -t public server/router.php
```

4. Abre `http://localhost:8081`.

O projeto inclui uma cópia portátil de Node.js nesta máquina em `.tools/node-v22.16.0-win-x64/`, usada automaticamente pelo iniciador. Essa pasta está excluída do Git e não é necessária numa máquina com Node instalado.

Para alterar as credenciais MySQL, copia `server/config.local.example.php` para `server/config.local.php` e edita os campos. As variáveis `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `APP_URL`, `MAIL_TRANSPORT` e `MAIL_FROM` também são suportadas. A configuração local tem prioridade sobre o ambiente.

Podes definir `ADMIN_PASSWORD` antes da primeira instalação. Caso contrário, é gerada uma palavra-passe aleatória. Guarda-a num local privado.

### Usar o Apache do XAMPP

1. Copia o projeto para `C:\xampp\htdocs\forma` (sem `node_modules` nem `.tools`, se já compilado).
2. Confirma que `public/build/` e `public/images/` estão incluídos.
3. Inicia **Apache** e **MySQL** no XAMPP.
4. Executa `C:\xampp\php\php.exe server/install.php` a partir dessa pasta.
5. Abre `http://localhost/forma/public/`.
6. Define `app_url` como `http://localhost/forma/public` em `server/config.local.php` para os links de recuperação.

Os `.htaccess` impedem o acesso às pastas privadas quando o projeto está dentro de `htdocs`. A configuração recomendada de um VirtualHost usa diretamente `public/` como `DocumentRoot`, sem expor a raiz do projeto. Apache deve permitir os `.htaccess` (`AllowOverride All`), como na configuração habitual do XAMPP.

No Apache, configura `upload_max_filesize=5M` e `post_max_size=6M` no `php.ini` e reinicia o Apache, se necessário. A API também impõe o limite de 5 MB.

## Desenvolver

Mantém o servidor PHP na porta 8081 e, noutro terminal:

```powershell
npm run dev
```

Abre `http://localhost:5173`. O Vite encaminha API, imagens e uploads para o PHP, mantendo a sessão na mesma origem. Para atualizar a versão compilada, executa `npm run build` ou `powershell -File scripts/start.ps1 -Rebuild -NoBrowser`.

## Recuperação de palavra-passe

1. Na janela de autenticação, escolhe **Esqueceste-te da palavra-passe?**.
2. Introduz o email da conta.
3. Na configuração local, abre a mensagem mais recente em **`storage/mail/`** e segue o link.
4. Define uma palavra-passe com pelo menos 10 caracteres. O link deixa de funcionar após utilização e expira em 30 minutos.

O XAMPP não dispõe, por defeito, de um serviço de entrega de email. Por isso, o modo `local` guarda mensagens fora da pasta pública para demonstração. O token nunca é devolvido pela API e apenas o respetivo hash é guardado na base de dados. Para envio real, configura **Administração → Integrações → Email SMTP**, ativa a entrega e define `app_url` em `server/config.local.php` com o endereço real da aplicação. O iniciador mantém um processo PHP de envio em segundo plano. Mensagens locais e credenciais não devem ser publicadas.

## Segurança e regras de negócio

- PDO com consultas preparadas e emulação desativada; ordenações e tipos de relatório usam listas permitidas.
- Sessões com cookies HttpOnly e SameSite=Lax; Secure quando servido por HTTPS; identificador renovado no login.
- Tokens CSRF em operações de escrita e na exportação, com comparação constante.
- Verificação de permissões e propriedade no servidor: encomendas, PDFs, moradas, favoritos, notificações e fotografias de avaliações.
- Palavras-passe com `password_hash`/`password_verify`; limite de tentativas de autenticação, recuperação e upload.
- Validação de tipos, limites, email, código postal, quantidades, categorias, ficheiros e preços no PHP.
- Preços, descontos e portes calculados no servidor. Standard: 4,90 €, grátis desde 75 € **após desconto**; expresso: 9,90 €.
- Encomendas criadas numa transação com bloqueio de linhas (`FOR UPDATE`); stock nunca pode ficar negativo.
- Chaves de idempotência evitam encomendas e tentativas de pagamento duplicadas. A última utilização de um cupão é protegida por bloqueio transacional.
- Cancelar repõe stock, liberta a utilização do cupão e regista reembolso simulado se aplicável, uma única vez. Uma encomenda cancelada não pode ser reaberta.
- Estados permitidos: recebida → em preparação → enviada → entregue; cancelamento apenas antes do envio.
- Só encomendas pagas avançam para preparação. O cliente pode cancelar enquanto a encomenda está recebida; o administrador também durante a preparação.
- Encomendas com pagamento recusado ou pendente reservam stock e utilização do cupão até serem pagas ou canceladas. Não há expiração automática dessas reservas.
- Até 10 moradas e 200 favoritos por conta. Avaliações requerem compra paga e entregue; cada cliente pode avaliar cada produto uma vez e editar a sua avaliação.
- Produtos eliminados são retirados do catálogo (`active = 0`) para preservar as referências e o histórico de encomendas.
- Categorias com produtos associados não podem ser eliminadas. Não se apagam encomendas: o cancelamento mantém o histórico.
- Uploads com nome aleatório, MIME e dimensões validados; extensões restritas; execução de scripts bloqueada em uploads.
- CSV protegido contra fórmulas injetadas; cabeçalhos de segurança e política de conteúdo na aplicação compilada.

O dashboard soma valores de encomendas não canceladas e identifica separadamente os pagamentos de teste aprovados. As datas são guardadas em UTC e apresentadas na hora local. O gráfico diário usa dias UTC. O carrinho fica no navegador. Os favoritos de visitantes são locais e são unidos aos da conta no login; os favoritos da conta ficam na base de dados. A disponibilidade e os preços são reconfirmados antes do checkout.

## Verificação automatizada

```powershell
npx playwright install chromium
npm test
```

O comando cria uma base de dados MySQL temporária com prefixo `forma_test_`, instala os dados de demonstração, inicia PHP nas portas 8091 e 8092, executa testes de integração e de navegador e remove a base de dados de teste no final. Os dois servidores permitem testar concorrência real na base de dados. **Não usa a base de dados da loja.** Requer MySQL iniciado e PHP no caminho habitual do XAMPP, ou a variável `PHP_BIN`.

Os testes cobrem CRUD, permissões, CSRF, SQL injection, uploads, preços de variantes, cupões concorrentes, moradas, favoritos, stock, pagamentos, idempotência, cancelamento, avaliações verificadas, avisos de reposição, CSV/PDF, recuperação, vídeo com scroll, paginação da coleção e telemóvel. Os testes de navegador usam Chromium. As imagens de inspeção visual podem ser geradas com `node scripts/preview.mjs` quando a loja está em execução na porta 8081.

Para repetir apenas os testes de interface, também numa base temporária, usa `npm test -- --browser-only`.

Para validar apenas o módulo de notícias (API e navegador), usa `npm test -- --news-only`. As verificações incluem ordenação/paginação, permissões, CSRF, validação, upload, edição, confirmação de eliminação e apresentação de conteúdo como texto seguro. `node scripts/preview-news.mjs` gera pré-visualizações da listagem e da página de leitura, incluindo telemóvel.

`node scripts/preview-cinematic.mjs` captura a abertura, os cartões, a transição e as vistas móveis na pasta privada `storage/`, com a loja em execução na porta 8081.

## Estrutura

```text
src/                 Componentes React, estilos Tailwind e cliente da API
public/              Pasta pública: entrada PHP, API, imagens e uploads
public/build/        Frontend compilado pelo Vite
server/              Configuração, instalação, segurança e helpers PHP
database/            Esquema SQL e catálogo inicial
storage/             Logs, mensagens locais e credenciais (privado)
scripts/             Inicialização e verificação
tests/               Testes de integração e navegador
docs/                Modelo de dados, API e origem das imagens
```

Consulta [o modelo de dados](docs/DATABASE.md), [a API](docs/API.md) e [as imagens](docs/ASSETS.md). Para parar o servidor iniciado pelo `.bat`, executa `powershell -File scripts/stop.ps1`. O MySQL continua ativo para outros projetos do XAMPP.

Referências de implementação: [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite) e [documentação do Vite](https://vite.dev/guide/).
