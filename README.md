# SABAE - PE

Aplicação web desenvolvida para apoiar a gestão escolar e o controle de presença em escolas estaduais de Pernambuco. A ideia do projeto é criar uma ferramenta prática, moderna e escalável para facilitar processos administrativos e melhorar a organização da rotina escolar.

## Visão do produto

O sistema foi pensado para ser uma solução digital útil para o ambiente escolar público, com foco em:

- autenticação e acesso seguro
- organização de dados de alunos e turmas
- controle de presença
- gestão de informações escolares em uma interface simples e amigável
- estrutura pronta para evoluir em etapas futuras

## Stack atual

- Angular 22
- Angular Material
- TypeScript
- Supabase
- RxJS
- HTML / SCSS
- SQL / PostgreSQL (via Supabase)

## Estrutura principal

```text
src/
  app/
    core/
    features/
      login/
      home/
      chamada/
```

## Funcionalidades iniciais

- login com autenticação
- rota protegida para acesso da aplicação
- tela inicial com visão geral
- registro de chamada/presença
- cache local para melhor performance e uso offline parcial
- integração com Supabase para dados e autenticação

## Como rodar o projeto localmente

### 1. Instale as dependências

```bash
npm install
```

### 2. Inicie o projeto em modo de desenvolvimento

```bash
npm start
```

Ou, se preferir:

```bash
ng serve
```

A aplicação ficará disponível em:

```text
http://localhost:4200/
```

### 3. Build de produção

```bash
npm run build
```

### 4. Rodar testes

```bash
npm test
```

## Publicar na Hostinger Business

1. Gere a versão de produção:

```bash
npm run build
```

2. No Gerenciador de Arquivos da Hostinger, abra a pasta `public_html` do domínio.
3. Envie **o conteúdo** de `dist/sabae-pe/browser` para `public_html` (incluindo o arquivo `.htaccess`), e não a pasta `browser` como uma subpasta.
4. Se já existirem arquivos de uma versão anterior, substitua os arquivos gerados pelo build.

O arquivo `.htaccess` mantém o roteamento do Angular funcionando quando uma rota como `/home` ou `/alunos` é acessada diretamente. A aplicação continua usando o Supabase no navegador, portanto as configurações e políticas do projeto Supabase precisam estar ativas antes do acesso em produção.

### Deploy automático pelo GitHub

O workflow `.github/workflows/deploy-hostinger.yml` compila e envia automaticamente a aplicação a cada push na branch `main`. Para ativá-lo, cadastre em **Settings > Secrets and variables > Actions** do repositório:

- `FTP_SERVER`: servidor FTP exibido em **Websites > Gerenciar > Acesso FTP** na Hostinger
- `FTP_USERNAME`: usuário FTP
- `FTP_PASSWORD`: senha FTP

O workflow publica via FTPS em `/public_html/`. Se usar o recurso de Git do hPanel diretamente, configure o deploy para uma pasta que contenha os arquivos já compilados; publicar a raiz do repositório causa erro `403` porque ela não possui o `index.html` de produção.

### Versão do Node.js na Hostinger

Selecione Node.js **22.22.3 ou superior dentro da série 22** no hPanel. Como alternativa, use Node.js **24.15.0 ou superior**. A versão `22.18.0` não é compatível com o Angular 22 e faz o build falhar, mesmo que o `npm install` termine com apenas avisos.

## Observações importantes

- O projeto usa Supabase para autenticação e persistência de dados.
- O código está estruturado em componentes e rotas com lazy loading.
- A aplicação está em fase inicial, mas com a visão de evoluir para uma solução relevante para a educação pública.

## Objetivo estratégico

A proposta do projeto é desenvolver uma solução digital com potencial para contribuir com a gestão escolar pública e, futuramente, ser apresentada como uma alternativa moderna e útil para o governo do estado.

## Contribuição

Este projeto ainda está em desenvolvimento. Futuras melhorias podem incluir:

- melhor organização do painel administrativo
- novos filtros e relatórios
- melhoria na experiência do usuário
- expansão para mais módulos escolares

