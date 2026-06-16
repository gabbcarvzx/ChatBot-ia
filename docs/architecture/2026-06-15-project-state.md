# AtendeAI Project State

## Resumo executivo

O AtendeAI esta em transicao de fundacao tecnica para MVP comercializavel.

O projeto ja possui:

- backend Node com API HTTP tenant-scoped
- persistencia real em Postgres com Neon
- autenticacao de owner por tenant
- fundacao de onboarding operacional
- painel administrativo inicial em Next.js
- sincronizacao basica de billing com Asaas via webhook
- base operacional do webhook do WhatsApp com persistencia tenant-scoped
- provider Gemini ligado ao runtime conversacional com validacao estrutural
- persistencia sincronizada de leads e pre-agendamentos aceitos por conversa
- dominio central de plano, quota e guardrails

O projeto ainda nao possui:

- resposta outbound real pela WhatsApp Cloud API
- inbox de leads e pre-agendamentos
- criacao de assinatura no Asaas a partir do painel

## Estrutura atual

```text
AGENTS.md
README.md
apps/
  admin/                  painel administrativo Next.js
db/
  migrations/             migrations SQL versionadas
  schema.sql              snapshot do modelo relacional
docs/
  architecture/           estado da arquitetura e produto
  roadmaps/               execucao e proximos passos
  specs/                  especificacao funcional do MVP
src/
  api/                    rotas HTTP
  app/                    bootstrap e config
  auth/                   senha, token, auth service
  billing/                integracao Asaas e leitura de assinatura
  db/                     pool, migrator, repositories SQL
  domain/                 policy, orchestrator, templates
  llm/                    contrato de integracao
  observability/          logger
  tenants/                servicos tenant-scoped de onboarding
  whatsapp/               webhook inbound, persistencia e runtime conversacional
test/
  api/                    testes de integracao HTTP
  db/                     testes de migrations
  domain/                 testes do motor de dominio
```

## Modulos principais

### Backend API

Arquivo de entrada:

- [src/app/server.js](/C:/Users/ender/Desktop/ChatBot%20IA/src/app/server.js)

Composicao HTTP:

- [src/api/http.js](/C:/Users/ender/Desktop/ChatBot%20IA/src/api/http.js)

Endpoints ativos:

- `GET /health`
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `GET /v1/business-profile`
- `PUT /v1/business-profile`
- `GET /v1/business-hours`
- `PUT /v1/business-hours`
- `GET /v1/faq-items`
- `POST /v1/faq-items`
- `GET /v1/catalog-items`
- `POST /v1/catalog-items`
- `GET /v1/onboarding/status`
- `GET /v1/subscription`
- `POST /v1/webhooks/asaas`
- `GET /v1/webhooks/whatsapp`
- `POST /v1/webhooks/whatsapp`

### Painel administrativo

Aplicacao:

- [apps/admin](/C:/Users/ender/Desktop/ChatBot%20IA/apps/admin)

Telas atuais:

- `/register`
- `/login`
- `/dashboard`
- `/onboarding`

Responsabilidades:

- cadastro e login do owner
- persistencia da sessao em cookie HTTP-only
- exibicao de status comercial do tenant
- onboarding operacional inicial

### Dominio central

Arquivos chave:

- [src/domain/policy.js](/C:/Users/ender/Desktop/ChatBot%20IA/src/domain/policy.js)
- [src/domain/orchestrator.js](/C:/Users/ender/Desktop/ChatBot%20IA/src/domain/orchestrator.js)
- [src/domain/templates.js](/C:/Users/ender/Desktop/ChatBot%20IA/src/domain/templates.js)
- [src/llm/contract.js](/C:/Users/ender/Desktop/ChatBot%20IA/src/llm/contract.js)

Responsabilidades:

- definicao de planos e capacidades
- bloqueio por assinatura
- quota mensal por conversa
- validacao de acoes estruturadas do LLM
- templates de nicho

### Banco de dados

Arquivos chave:

- [db/schema.sql](/C:/Users/ender/Desktop/ChatBot%20IA/db/schema.sql)
- [db/migrations](/C:/Users/ender/Desktop/ChatBot%20IA/db/migrations)
- [src/db/migrator.js](/C:/Users/ender/Desktop/ChatBot%20IA/src/db/migrator.js)

Entidades principais ja persistidas e/ou modeladas:

- `tenants`
- `users`
- `business_profiles`
- `business_hours`
- `catalog_items`
- `faq_items`
- `subscriptions`
- `conversations`
- `messages`
- `leads`
- `pre_appointments`
- `usage_counters`
- `audit_logs`

## Fluxos implementados

### 1. Registro e autenticacao

- owner cria tenant com `trial`
- user e `business_profile` sao criados na mesma transacao
- login retorna token tenant-bound

### 2. Onboarding operacional

- owner completa perfil do negocio
- define horario
- cadastra FAQ
- cadastra catalogo ou servicos
- backend calcula `incomplete` ou `ready_for_activation`

### 3. Billing inbound

- Asaas chama `POST /v1/webhooks/asaas`
- backend valida `asaas-access-token`
- webhook sincroniza `subscriptions`
- estado efetivo do tenant e atualizado em `tenants`

### 4. WhatsApp inbound base

- Meta pode validar o webhook em `GET /v1/webhooks/whatsapp`
- eventos inbound chegam em `POST /v1/webhooks/whatsapp`
- tenant e resolvido por `tenants.business_whatsapp`
- webhook persiste `whatsapp_events`, `conversations` e `messages`
- runtime carrega contexto tenant-scoped e chama o provider Gemini
- acoes aceitas persistem `leads` e `pre_appointments` com unicidade por conversa
- saidas invalidas ou de baixa confianca caem em handoff humano seguro
- respostas ainda saem por stub outbound, sem chamada real para a Meta API

## Regras de seguranca e isolamento

- toda rota autenticada exige `x-tenant-id`
- `x-tenant-id` deve bater com o tenant do token
- CRUD novo opera sempre por `tenant_id`
- webhooks nao usam `x-tenant-id`; resolvem tenant por referencia do provedor
- contratos do dominio continuam impedindo acoes fora do plano

## Lacunas de produto

### Criticas para venda real

- WhatsApp ainda nao conversa com o sistema
- billing ainda nao cria assinatura nem fecha o ciclo comercial
- nao existe inbox operacional para o cliente ver leads
- o onboarding ainda nao e wizard por etapas

### Importantes para operacao

- falta trilha de auditoria de webhooks e acoes comerciais
- falta medicao real de uso por tenant no runtime de conversas
- falta observabilidade mais rica por `tenantId` e por `requestId`

## Como subir localmente

### Backend

```bash
npm start
```

### Painel admin

```bash
npm run admin:dev
```

### Testes

```bash
npm test
```

### Build do painel

```bash
npm run admin:build
```

## Proximos blocos recomendados

1. outbound real da WhatsApp Cloud API
2. inbox minima de leads e pre-agendamentos no painel
3. criacao de assinatura Asaas a partir do painel
4. observabilidade operacional e trilha de auditoria comercial
5. medicao de uso por tenant no runtime conversacional
