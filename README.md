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
  - `GET /v1/business-profile`
  - `PUT /v1/business-profile`
- contrato inicial de contexto e policy para integracao com LLM
- schema SQL inicial para Postgres
- testes automatizados do dominio com `node --test`

## Rodando a API

```bash
npm start
```

Por padrao a API sobe na porta `3000`.

## Rodando testes

```bash
npm test
```

## Estrutura inicial

```text
docs/specs/                  documentacao do produto
db/schema.sql                modelagem relacional inicial
src/api/                     camada HTTP inicial
src/app/                     bootstrap e configuracao da aplicacao
src/auth/                    auth, hash e token
src/domain/                  regras centrais de plano e tenant
src/llm/                     contrato e policy do LLM
src/observability/           logging
src/tenants/                 servicos tenant-scoped
test/api/                    testes de integracao HTTP
test/domain/                 regressao do dominio central
```

## Proximas etapas recomendadas

1. trocar storage em memoria por Postgres real + migrations
2. implementar onboarding wizard completo
3. expandir CRUD tenant-scoped para FAQ e catalogo/servicos
4. integrar WhatsApp Cloud API
5. integrar Asaas
6. plugar um provider de LLM com schema validation
