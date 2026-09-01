# SabaePe

Aplicação web desenvolvida para apoiar a gestão escolar e o controle de presença em escolas estaduais de Pernambuco. A ideia do projeto é criar uma ferramenta prática, moderna e escalável para facilitar processos administrativos e melhorar a organização da rotina escolar.

## Visão do produto

O sistema foi pensado para ser uma solução digital útil para o ambiente escolar público, com foco em:

- autenticação e acesso seguro
- organização de dados de alunos e turmas
- controle de presença
- gestão de informações escolares em uma interface simples e amigável
- estrutura pronta para evoluir em etapas futuras

## Stack atual

- Angular 21
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

