# AtendeAI MVP

Base inicial do MVP do AtendeAI, um SaaS multi-tenant para assistente de WhatsApp de pequenos negocios.

## O que ja existe neste repositorio

- especificacao canônica do MVP em `docs/specs/2026-06-15-atendeai-mvp.md`
- memoria operacional do projeto em `AGENTS.md`
- nucleo de dominio para:
  - planos e capacidades
  - quotas mensais por conversa
  - bloqueio por assinatura
  - validacao de acoes do LLM
  - templates por nicho
- backend HTTP inicial com:
  - `GET /health`
  - `POST /v1/auth/register`
  - `POST /v1/auth/login`
  - `GET /v1/subscription`
  - `POST /v1/webhooks/asaas`
  - `GET /v1/webhooks/whatsapp`
  - `POST /v1/webhooks/whatsapp`
  - `GET /v1/business-profile`
  - `PUT /v1/business-profile`
  - `GET /v1/onboarding/status`
  - `GET/PUT /v1/business-hours`
  - `GET/POST /v1/faq-items`
  - `GET/POST /v1/catalog-items`
- painel administrativo inicial em `apps/admin` com:
  - login
  - registro
  - dashboard do tenant
  - onboarding operacional
- contrato inicial de contexto e policy para integracao com LLM
- base operacional do WhatsApp com:
  - verificacao de webhook
  - resolucao de tenant por `business_whatsapp`
  - persistencia de `conversations`, `messages` e `whatsapp_events`
  - pipeline de resposta tenant-scoped com provider Gemini
  - persistencia sincronizada de `leads` e `pre_appointments` aceitos
  - atualizacao do registro comercial existente por `conversationId`
  - fallback seguro para handoff humano quando a saida do modelo for invalida
- migrations SQL versionadas para Postgres
- testes automatizados do dominio com `node --test`

## Banco de dados

Defina `DATABASE_URL` com a connection string do seu banco Neon antes de subir a API ou rodar testes.

Defina `NEXT_PUBLIC_API_BASE_URL` com a URL da API backend usada pelo painel admin.
Defina `ASAAS_WEBHOOK_SECRET` com o mesmo token configurado no painel do Asaas.
Defina `WHATSAPP_CLOUD_API_VERIFY_TOKEN` com o token de verificacao configurado no webhook da Meta.
Defina `GEMINI_API_KEY` com a chave da Gemini Developer API.
Defina `GEMINI_MODEL` com o modelo Gemini de menor custo escolhido para o runtime.

Para aplicar migrations:

```bash
npm run db:migrate
```

## Rodando a API

```bash
npm start
```

Por padrao a API sobe na porta `3000`.

## Rodando o painel admin

```bash
npm run admin:dev
```

O painel usa `NEXT_PUBLIC_API_BASE_URL` para falar com a API.

## Rodando testes

```bash
npm test
```

Os testes de integracao da API exigem `DATABASE_URL` explicito no ambiente.

## Estrutura inicial

```text
docs/specs/                  documentacao do produto
db/schema.sql                modelagem relacional inicial
db/migrations/               migrations SQL versionadas
src/api/                     camada HTTP inicial
src/app/                     bootstrap e configuracao da aplicacao
src/auth/                    auth, hash e token
src/db/                      pool, migrator e repositorios SQL
src/domain/                  regras centrais de plano e tenant
src/llm/                     contrato e policy do LLM
src/observability/           logging
src/tenants/                 servicos tenant-scoped
src/whatsapp/                webhook inbound e runtime conversacional do canal
apps/admin/                  painel comercial em Next.js
test/api/                    testes de integracao HTTP
test/domain/                 regressao do dominio central
```

## Proximas etapas recomendadas

1. integrar envio outbound real com a WhatsApp Cloud API
2. adicionar inbox de leads e pre-agendamentos no painel
3. integrar Asaas com webhook e sincronizacao real de assinatura
4. transformar o onboarding atual em wizard completo por etapas
5. adicionar medicao de uso por tenant no runtime
