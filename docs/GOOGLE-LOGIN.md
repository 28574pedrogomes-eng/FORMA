# Login com Google — FORMA

O código está instalado e integrado em PHP com a biblioteca oficial `google/apiclient` (Composer). O login só é ativado depois de introduzir as credenciais OAuth do teu projeto Google. A chave Gemini não serve para o login.

## 1. Criar o projeto

1. Abre a [Google Cloud Console](https://console.cloud.google.com/) e entra na tua conta Google.
2. No seletor de projetos, escolhe **Novo projeto**, dá-lhe o nome **FORMA** e seleciona-o.
3. Abre **Google Auth Platform**. Na configuração inicial/Branding, coloca o nome **FORMA**, o teu email de suporte e o email de contacto.
4. Em **Público-alvo / Audience**, escolhe **Externo / External** para permitir contas pessoais Google. Enquanto estiver em **Testing**, adiciona o teu email em **Test users**. Se o Google dispensar utilizadores de teste para os âmbitos básicos, segue a indicação apresentada na consola.
5. Em **Data Access**, usa apenas os âmbitos básicos `openid`, `email` e `profile`. A FORMA não pede acesso a Gmail, Drive ou contactos.

## 2. Criar o cliente OAuth

Em [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients), escolhe **Create client**:

- Tipo: **Web application / Aplicação Web**.
- Nome: **FORMA local**.
- Em **Authorized redirect URIs**, adiciona exatamente:

```text
http://localhost:8081/auth/google/callback.php
```

Este fluxo usa redirecionamento no servidor. Não é necessário configurar origens JavaScript para a implementação atual. Copia o **Client ID** e o **Client Secret** apresentados pelo Google. Não os publiques nem os coloques em ficheiros do frontend.

## 3. Ativar na loja

1. Abre [a FORMA](http://localhost:8081) e entra como administrador.
2. Abre **Administração → Integrações** e desce até **Login com Google**.
3. Introduz o **Google Client ID** e o **Google Client Secret**.
4. Marca **Ativar início de sessão com Google** e clica em **Guardar login Google**.
5. Termina a sessão. Abre **Iniciar sessão → Continuar com Google** e escolhe a tua conta.

Usa `localhost`, tal como no URI registado. `127.0.0.1` é outro endereço para os cookies do navegador. Se mudares a porta/domínio, atualiza `app_url` em `server/config.local.php` e o URI autorizado na Google Cloud Console. Para publicação, usa HTTPS e o domínio final.

## Contas já existentes

Uma conta nova autenticada pelo Google é criada como **cliente**. Uma identidade já associada entra na mesma conta, preservando favoritos e encomendas.

Se o email já existir na FORMA, entra primeiro com email/palavra-passe e abre **A minha conta → Entrar com Google → Associar Google**. Escolhe o mesmo email. A associação não atribui permissões de administrador e não liga contas apenas por coincidência de email.

As contas criadas pelo Google não têm uma palavra-passe conhecida. Para definir uma, usa a recuperação de palavra-passe. Sem SMTP, o projeto guarda o link de recuperação localmente em `storage/mail/`.

## Composer e ficheiros

Nesta instalação, o Composer está em `.tools/composer.phar`. Na pasta do projeto:

```powershell
.\composer.bat install
.\composer.bat audit
```

Noutro computador, [instala o Composer pela fonte oficial](https://getcomposer.org/download/) e executa `composer install`. `composer.lock` fixa as versões. `vendor/` fica fora de `public/` e não é servido pela loja. Depois executa `iniciar.bat` ou `php server/install.php` para criar a tabela de identidades.

As credenciais são guardadas em `storage/google-oauth.json`, fora do diretório público e excluídas do controlo de versões. O administrador só recebe a indicação de segredo configurado; o segredo nunca é devolvido. Guardar o campo vazio mantém o segredo; existe uma opção explícita para o remover.

O fluxo valida state com duração de 10 minutos e uso único, nonce, PKCE S256, assinatura RSA do ID token, emissor, audiência, validade e email verificado. O identificador da conta é o `sub` do Google. A sessão e o CSRF são renovados. Tokens Google não são guardados.

## Problemas frequentes

- **redirect_uri_mismatch**: confirma o URI completo, incluindo porta, `/auth/google/callback.php`, ausência de barra final e o `app_url`.
- **access_denied**: adiciona o email como utilizador de teste quando exigido ou confirma se cancelaste o consentimento.
- **invalid_client**: verifica o Client ID e o Client Secret do mesmo cliente OAuth, do tipo Aplicação Web.
- **Pedido expirado/inválido**: inicia novamente pelo botão da loja e mantém o mesmo navegador e endereço `localhost`.
- **Google indisponível**: confirma a ativação em Integrações e a instalação de `vendor/autoload.php`.

Referências: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [OAuth para aplicações Web](https://developers.google.com/identity/protocols/oauth2/web-server) e [biblioteca PHP oficial](https://github.com/googleapis/google-api-php-client).

Os testes locais usam respostas OAuth simuladas e tokens RSA assinados em memória. O teste real com uma conta Google depende das credenciais acima e do consentimento do utilizador.
