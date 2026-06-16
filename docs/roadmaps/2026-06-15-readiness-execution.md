# AtendeAI Readiness Execution

## Objetivo

Transformar o AtendeAI de fundacao tecnica em MVP comercializavel, preservando:

- isolamento multi-tenant real
- enforcement de plano e assinatura no backend
- painel admin utilizavel
- base operacional para WhatsApp e billing

## Status atual

### Concluido nesta etapa

- fundacao Postgres/Neon com migrations versionadas
- autenticacao owner + tenant scoping
- `business-profile` persistido em Postgres
- onboarding operacional inicial no painel `apps/admin`
- endpoints tenant-scoped para:
  - `business-hours`
  - `faq-items`
  - `catalog-items`
  - `onboarding/status`
- endpoint `GET /v1/subscription`
- webhook `POST /v1/webhooks/asaas` com validacao de `asaas-access-token`
- sincronizacao de `subscriptions` com `tenants.subscription_status` e `tenants.plan_code`
- dashboard exibindo status de onboarding e assinatura

### Em aberto para MVP vendavel

- wizard completo de onboarding por etapas
- CRUD completo de FAQ e catalogo
- inbox de leads e pre-agendamentos
- adaptador real do WhatsApp Cloud API
- persistencia de conversas, mensagens e idempotencia de eventos
- integracao real do provider de LLM
- uso mensal real por tenant ligado ao fluxo de conversa
- sincronizacao comercial completa com Asaas para criacao de assinatura

## Decisoes arquiteturais travadas

### Backend

- o backend Node atual continua como API principal do produto
- o runtime comercial usa `tenants.plan_code` e `tenants.subscription_status` como fonte de enforcement
- a tabela `subscriptions` registra o estado sincronizado do billing externo

### Frontend

- o painel admin fica em `apps/admin`
- sessao do admin usa cookies HTTP-only
- o frontend consome a API existente, sem duplicar regra de negocio

### Billing

- o webhook do Asaas e autenticado por `ASAAS_WEBHOOK_SECRET`
- o tenant deve ser resolvido por `externalReference`
- o payload externo pode atualizar plano e status operacional

## Proximas fatias recomendadas

### 1. WhatsApp operacional

- `GET/POST /v1/webhooks/whatsapp`
- resolucao de tenant pelo numero conectado
- persistencia de eventos e mensagens com idempotencia
- envio de resposta ao cliente final

### 2. Motor conversacional real

- provider concreto de LLM atras de interface
- validacao de schema da saida
- fallback seguro para baixa confianca e dado ausente
- persistencia de leads e pre-agendamentos conforme o plano

### 3. Monetizacao completa

- criacao de assinatura Asaas no onboarding/painel
- tela de plano, uso e cobranca
- bloqueio automatico em `overdue` e `blocked`

## Checklist de go-live

- `DATABASE_URL` com `sslmode=verify-full`
- `AUTH_SECRET` forte por ambiente
- `ASAAS_WEBHOOK_URL` publico e HTTPS
- `ASAAS_WEBHOOK_SECRET` forte e diferente da API key
- staging separado de production
- logs estruturados por `tenantId`
- testes verdes antes de cada deploy
