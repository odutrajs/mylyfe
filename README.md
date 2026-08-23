# Zelo

Aplicacao web para administrar areas da vida em modulos. O primeiro modulo ativo e o Financeiro, com planejamento pessoal e patrimonial, frontend React e backend Node separados.

## Rodando Localmente

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3333/api

App mobile (Expo, mesma conta da API de producao em `https://feedeo.com.br/api`):

```bash
npm run dev:mobile
```

Para apontar para a API local, use `EXPO_PUBLIC_API_URL=http://localhost:3333/api` em `apps/mobile/.env`.

Build iOS (EAS, conta `@vendepay/mylyfe`):

```bash
npm run build:ios
npm run submit:ios
```

Antes do envio: publique `privacidade.html` e `termos.html` em `https://feedeo.com.br` e preencha a ficha do app no App Store Connect.

Como a porta `5173` pode estar ocupada por outro projeto local, rode o frontend em `5174` quando necessario:

```bash
npm run dev -w @mylyfe/web -- --host 0.0.0.0 --port 5174 --strictPort
```

## Backend em Docker

```bash
docker compose up -d --build api
```

- API: http://localhost:3333/api
- Dados locais: `apps/api/data`, montado como volume no container.

## Secretaria no WhatsApp

A secretaria roda num container separado (`mylyfe-secretary`), com a sessao do Baileys persistida em `apps/secretary/data`. Assim, atualizar API ou web nao exige escanear o QR de novo.

```bash
docker compose up -d secretary
```

1. No app, abra **Secretaria**.
2. Cadastre o seu WhatsApp pessoal.
3. Escaneie o QR com um chip separado (o numero da secretaria).
4. Cadastre alertas de contas, impostos, assinaturas ou recebimentos.

Ela lembra o vencimento, pergunta se ja foi pago e entende respostas como `sim`, `ainda nao` e `me lembra amanha`.

O `npm run dev` sobe so API e web, de proposito: o WhatsApp fica isolado no Docker.

## Scripts

```bash
npm run test
npm run typecheck
npm run build
```

## Arquitetura

- `apps/web`: React, TypeScript, Tailwind e Recharts.
- `apps/api`: Node, Express, importacao CSV/PDF, persistencia e motor dos alertas.
- `apps/secretary`: gateway WhatsApp com Baileys, isolado em container.
- `packages/domain`: modelo do workspace Zelo, modulo financeiro, formulas, classificacao, simuladores e conversa da secretaria.
- `docs/PRODUCT_PLAN.md`: proposta, onboarding, modelo, regras e roadmap.

## Modulos E Acessos

O workspace tem dois modulos ativos: Financeiro e Secretaria. Rotina, Saude, Casa e Projetos continuam planejados.

A Secretaria e um modulo proprio, com painel, lembretes, WhatsApp e preferencias. Ela nao fica dentro do Financeiro.

O modulo Financeiro suporta convite local por link. Cada convite define papel, areas acessiveis do modulo e, quando fizer sentido, divisao de despesas compartilhadas.

O login atual separa planos por e-mail em ambiente local. Ele prepara o produto para uma autenticacao real com senha/token.

## Dados Financeiros

O plano inicial nasce vazio. Renda, patrimonio, gastos importados/categorizados e meta principal sao informados pelo usuario no onboarding ou editados depois.

Por padrao, a API usa JSON local em `apps/api/data` para rodar sem banco. O schema Prisma/PostgreSQL esta em `apps/api/prisma/schema.prisma`; para ativar, configure `DATABASE_URL` e `USE_PRISMA=true`.
