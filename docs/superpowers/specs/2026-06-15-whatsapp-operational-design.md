# WhatsApp Operational Design

**Date:** 2026-06-15  
**Scope:** Etapa 1 do MVP comercializavel do AtendeAI

## Goal

Implementar a base operacional do WhatsApp Cloud API com webhook inbound real, resolucao de tenant por numero conectado, persistencia tenant-scoped de conversas e mensagens, idempotencia por evento e um adaptador outbound stub pronto para a proxima fatia conversacional.

## Business outcome

Sem o bloco de WhatsApp, o AtendeAI ainda nao entrega valor ao cliente final. Esta fatia cria a primeira ponte real entre o tenant pagante e o usuario final atendido no WhatsApp, preservando isolamento multi-tenant e preparando o caminho para monetizacao por conversa, leads e pre-agendamentos.

## Architecture

### Recommended approach

Criar um modulo dedicado em `src/whatsapp/` com servico de aplicacao separado da camada HTTP.

### Responsibilities

- `src/api/http.js`
  - expor `GET /v1/webhooks/whatsapp`
  - expor `POST /v1/webhooks/whatsapp`
  - manter apenas parsing HTTP, auth de verificacao e serializacao de resposta
- `src/whatsapp/whatsapp-service.js`
  - validar e normalizar o payload recebido
  - resolver tenant pelo numero conectado
  - aplicar idempotencia por evento/mensagem
  - criar ou reutilizar `conversation`
  - persistir `message` inbound
  - acionar um adaptador outbound stub
- `src/whatsapp/whatsapp-outbound-client.js`
  - expor `sendTextMessage({ tenantId, customerPhone, text, conversationId })`
  - nesta etapa nao chama a Meta API
  - registra que a resposta foi preparada, preservando contrato para a proxima fatia
- `src/db/repositories/*`
  - repositrios especificos para tenant lookup, conversations, messages e whatsapp events

## Data model

### Existing tables reused

- `tenants`
  - usar `business_whatsapp` para resolver tenant a partir do numero conectado
- `conversations`
  - agrupar conversa por `tenant_id + customer_phone`
- `messages`
  - persistir cada mensagem inbound com `tenant_id`, `conversation_id`, `direction = inbound` e `provider_message_id`

### New table

Adicionar `whatsapp_events`:

- `id UUID PRIMARY KEY`
- `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `provider_event_id TEXT NOT NULL`
- `provider_message_id TEXT`
- `payload JSONB NOT NULL`
- `status TEXT NOT NULL`
- `received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `processed_at TIMESTAMPTZ`
- `UNIQUE (tenant_id, provider_event_id)`

### Why a dedicated events table is required

- `messages` sozinha nao cobre idempotencia operacional de webhook
- o provider pode reenviar eventos sem que a mensagem precise ser processada novamente
- a tabela permite auditoria minima e debugging sem acoplar a logica ao runtime conversacional

## Multi-tenant isolation rules

- nenhuma escrita em `whatsapp_events`, `conversations` ou `messages` ocorre sem `tenantId`
- a resolucao do tenant acontece antes de qualquer regra de negocio
- toda leitura de conversa e mensagem deve filtrar por tenant
- idempotencia e avaliada por tenant, nao globalmente
- o stub outbound sempre recebe `tenantId`, `conversationId` e `customerPhone`
- se nao houver tenant valido, nenhum dado de negocio e persistido

## HTTP contract

### `GET /v1/webhooks/whatsapp`

Uso: verificacao inicial do webhook do WhatsApp Cloud API.

Comportamento:

- validar `hub.mode`
- validar `hub.verify_token`
- comparar com `WHATSAPP_CLOUD_API_VERIFY_TOKEN`
- retornar `200` com `hub.challenge` quando valido
- retornar `403` quando invalido

### `POST /v1/webhooks/whatsapp`

Uso: receber evento inbound do provedor.

Comportamento:

1. receber payload bruto
2. extrair numero conectado e mensagem inbound utilizavel
3. resolver tenant por `business_whatsapp`
4. gerar ou extrair `providerEventId`
5. verificar idempotencia
6. criar ou reutilizar `conversation`
7. persistir `message` inbound
8. registrar `whatsapp_events` como processado
9. acionar `whatsappOutboundClient.sendTextMessage(...)` em modo stub
10. retornar `202`

## Error handling

- token de verificacao invalido: `403`
- JSON invalido: `400`
- payload sem estrutura reconhecida: `202`
- tenant nao encontrado: `202` com log estruturado
- evento duplicado: `202` com status idempotente
- falha interna de banco: `500`

O endpoint de webhook nao deve quebrar desnecessariamente o retry do provider quando o problema for payload sem uso comercial ou tenant nao mapeado.

## Testing strategy

Cobertura minima:

- webhook verification com token valido
- webhook verification com token invalido
- ingestao criando `conversation` e `message` para tenant resolvido
- idempotencia ignorando evento duplicado
- tenant ausente sem persistir dados de negocio
- isolamento garantindo busca tenant-scoped
- outbound stub chamado com o contrato esperado

## Out of scope for this slice

- chamada real para a Meta Cloud API
- resposta natural gerada por LLM
- persistencia de leads
- persistencia de pre-agendamentos
- contagem real de quota mensal por conversa
- inbox operacional

## Implementation order

1. escrever testes de API e servico
2. adicionar migration de `whatsapp_events`
3. implementar repositrios de whatsapp
4. implementar `whatsapp-service`
5. conectar rotas HTTP
6. atualizar documentacao operacional

## Risks and mitigations

- risco: formatos variados de payload do WhatsApp
  - mitigacao: normalizador pequeno e defensivo, focado no caso de mensagem de texto do MVP
- risco: colisao de idempotencia
  - mitigacao: chave unica por `tenant_id + provider_event_id`
- risco: vazamento entre tenants
  - mitigacao: resolucao previa por numero conectado e uso obrigatorio de `tenantId` em toda consulta
- risco: acoplamento prematuro ao provider real
  - mitigacao: outbound separado por interface desde o inicio
