# Bootstrap do primeiro administrador

Este procedimento cria o primeiro `ADMIN` de um banco vazio. Ele não serve para
promover usuários nem redefinir senha.

## Garantias

- exige senha com pelo menos 14 caracteres;
- usa o mesmo hash `scrypt` do login;
- serializa execuções concorrentes;
- se já existir um `ADMIN`, termina sem alterar usuário, papel ou senha;
- se o e-mail já pertencer a um usuário comum, recusa a operação;
- registra a criação em `log_falhas`, com origem `admin-bootstrap`, sem senha ou
  hash.

## Local

1. Crie um arquivo ignorado pelo Git, por exemplo `.env.bootstrap.local`, com:

   ```dotenv
   DATABASE_URL=postgresql://...
   ADMIN_BOOTSTRAP_EMAIL=admin@exemplo.com
   ADMIN_BOOTSTRAP_PASSWORD=uma-frase-secreta-com-14-ou-mais-caracteres
   ADMIN_BOOTSTRAP_NAME=Nome opcional
   ```

2. Restrinja a leitura do arquivo e execute:

   ```bash
   chmod 600 .env.bootstrap.local
   npx dotenv -e .env.bootstrap.local -- npm run admin:bootstrap
   ```

3. Apague as três variáveis `ADMIN_BOOTSTRAP_*` do arquivo assim que o comando
   confirmar a criação. Não copie a senha para issue, chat, log ou comando em
   linha, pois o histórico do shell pode preservá-la.

## Preview e produção

Baixe as variáveis do ambiente correto para um arquivo local temporário, confira
o host do `DATABASE_URL` e só então acrescente as três variáveis de bootstrap.
Execute o mesmo comando da seção anterior. Não configure a senha como variável
permanente da aplicação na Vercel.

Antes de produção, faça o procedimento em Preview. Em produção, execute uma
única vez, guarde o registro operacional da mudança e remova o arquivo local.
Uma segunda execução deve responder `ADMIN já existe; nada alterado.`

## Verificação

1. entre em `/admin/entrar` com o e-mail criado;
2. confirme acesso a `/admin/usuarios`;
3. consulte `log_falhas` por `origem = 'admin-bootstrap'`;
4. execute novamente e confirme que nenhum usuário ou evento foi adicionado.

Se o comando recusar por `ADMIN já existe`, use o fluxo administrativo normal.
Nunca apague ou rebaixe o administrador existente para repetir o bootstrap.
