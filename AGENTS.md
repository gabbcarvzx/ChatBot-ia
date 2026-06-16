# AGENTS.md

## Projeto

**Nome:** AtendeAI  
**Tipo:** SaaS multi-tenant de assistente de IA para WhatsApp  
**Objetivo:** permitir que pequenos negocios usem um bot no WhatsApp para responder perguntas, capturar leads e registrar pre-agendamentos com controle por plano e cobranca recorrente.

## Estado atual do produto

O AtendeAI nao e mais apenas fundacao de dominio. O repositorio agora possui:

- backend API Node tenant-scoped
- Postgres real com Neon e migrations versionadas
- autenticacao de owner por tenant
- onboarding operacional inicial
- painel administrativo Next.js em `apps/admin`
- sincronizacao inbound de billing com Asaas
- integracao real de webhook e envio outbound com WhatsApp Cloud API
- pipeline fim a fim de conversas com Gemini
- persistencia tenant-scoped de `conversations`, `messages`, `leads` e `pre_appointments`

Ainda nao possui:

- inbox de leads e pre-agendamentos
- criacao de assinatura no Asaas a partir do painel

O objetivo do proximo ciclo continua sendo sair de fundacao tecnica para MVP comercializavel.

## Produto e proposta

Toda decisao tecnica deve considerar:

- escalabilidade para centenas e milhares de tenants
- isolamento real entre tenants
- seguranca de dados
- monetizacao recorrente
- operacao confiavel em producao
- simplicidade suficiente para MVP vendavel

Nichos iniciais:

- moda feminina
- perfumarias
- material de construcao
- saloes
- clinicas
- restaurantes

## Escopo do MVP

Cada tenant deve poder cadastrar:

- nome da empresa
- numero de WhatsApp
- horario de funcionamento
- localizacao
- formas de pagamento
- catalogo de produtos ou servicos
- perguntas frequentes

O bot deve responder no WhatsApp sobre:

- precos
- horarios
- localizacao
- formas de pagamento
- produtos disponiveis
- servicos disponiveis

Capacidades por plano:

- **Basic:** responder perguntas
- **Pro:** responder perguntas + capturar leads
- **Premium:** responder perguntas + capturar leads + registrar pre-agendamentos

Fora de escopo no MVP:

- pedidos completos
- estoque
- agenda com confirmacao automatica
- CRM externo
- multiusuario interno por tenant
- analytics avancado

## Fonte de verdade do repositorio

Arquivos principais do projeto:

- `AGENTS.md`: memoria operacional do projeto
- `README.md`: visao de uso rapido e superficie atual
- `docs/specs/2026-06-15-atendeai-mvp.md`: especificacao funcional do MVP
- `docs/architecture/2026-06-15-project-state.md`: fotografia da arquitetura atual
- `docs/operations/2026-06-15-end-of-day-handoff.md`: handoff de retomada
- `docs/roadmaps/2026-06-15-readiness-execution.md`: progresso do plano de readiness
- `db/schema.sql`: modelagem base do banco
- `src/domain/policy.js`: regras de plano, quota e bloqueio
- `src/domain/orchestrator.js`: fluxo central de processamento de mensagem
- `src/domain/templates.js`: templates por nicho
- `src/llm/contract.js`: contrato de contexto e saida do LLM
- `test/domain/`: regressao do dominio central

Antes de mudancas estruturais, ler ao menos:

1. `AGENTS.md`
2. `docs/specs/2026-06-15-atendeai-mvp.md`
3. `docs/architecture/2026-06-15-project-state.md`
4. `README.md`

## Arquitetura obrigatoria

Separacao obrigatoria de camadas:

- **Frontend:** painel administrativo do tenant em `apps/admin`
- **Backend API:** autenticacao, CRUD tenant-scoped, billing, inbox e configuracao
- **Motor conversacional:** interpretacao, policy, LLM, acao estruturada
- **Adaptador WhatsApp:** entrada e saida de mensagens
- **Billing adapter:** Asaas
- **Banco:** relacional com `tenantId` em todas as entidades de negocio

Toda entidade de negocio deve carregar `tenantId`.

## Estrutura atual esperada

```text
apps/
  admin/
db/
  migrations/
docs/
  architecture/
  operations/
  roadmaps/
  specs/
src/
  api/
  app/
  auth/
  billing/
  db/
  domain/
  llm/
  observability/
  tenants/
test/
  api/
  db/
  domain/
```

## Regras de multi-tenant

Estas regras sao obrigatorias:

- toda leitura deve filtrar por tenant
- toda escrita deve associar tenant explicitamente
- webhooks devem resolver o tenant antes de executar regra de negocio
- indices compostos devem considerar tenant nas tabelas de acesso frequente
- nenhuma resposta do bot pode usar dados de outro tenant
- nenhum lead, conversa, FAQ, catalogo ou pre-agendamento pode existir sem tenant

Se houver risco de vazamento entre tenants, interromper a implementacao e corrigir antes de seguir.

## Fluxo principal do bot

Fluxo esperado do processamento de mensagem:

1. receber webhook do WhatsApp
2. identificar tenant pelo numero conectado
3. persistir evento com idempotencia
4. validar status da assinatura
5. validar plano e limite mensal
6. carregar contexto autorizado do tenant
7. montar input estruturado para o LLM
8. obter resposta estruturada do modelo
9. validar a acao no backend
10. persistir lead ou pre-agendamento se permitido
11. responder no WhatsApp
12. registrar auditoria e atualizar metricas

Fallback obrigatorio:

- tenant bloqueado: nao executar automacao paga
- baixa confianca: encaminhar para humano
- dado ausente: nao inventar resposta
- acao fora do plano: negar acao e cair para fallback seguro

## LLM e guardrails

O LLM serve para:

- classificar intencao
- redigir resposta natural
- preencher payload estruturado

O LLM nao serve para:

- inventar preco
- inventar horario
- inventar localizacao
- inventar disponibilidade
- inventar politica comercial
- autorizar acao por conta propria

Contrato minimo da saida do modelo:

- `intent`
- `reply`
- `requestedAction`
- `entities`
- `confidence`
- `fallbackReason`

Regras obrigatorias de integracao:

- passar ao modelo apenas contexto aprovado do tenant
- validar schema no backend
- validar permissao por plano no backend
- registrar fallback quando a confianca estiver baixa
- manter provider de LLM abstrato desde o inicio
- medir custo e uso por tenant quando a integracao real entrar

## Billing e monetizacao

Gateway principal do MVP:

- **Asaas**

Estados minimos de assinatura:

- `trial`
- `active`
- `overdue`
- `blocked`

Regras:

- trial comporta-se como ativo ate expirar
- overdue e blocked interrompem automacao paga
- limites por plano usam conversas mensais como unidade principal
- estado efetivo do tenant ainda e aplicado em `tenants.plan_code` e `tenants.subscription_status`
- `subscriptions` registra o estado sincronizado do provedor externo

Endpoint atual de webhook:

- `POST /v1/webhooks/asaas`

Header obrigatorio:

- `asaas-access-token`

Variaveis de ambiente relacionadas:

- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_URL`
- `ASAAS_WEBHOOK_SECRET`

## Superficie HTTP atual

Backend HTTP atual:

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

## Painel admin atual

App:

- `apps/admin`

Telas implementadas:

- `/register`
- `/login`
- `/dashboard`
- `/onboarding`

O painel deve continuar consumindo a API existente, sem duplicar regra de negocio no frontend.

## Ordem de implementacao recomendada daqui para frente

Seguir esta ordem:

1. webhook e adaptador do WhatsApp
2. persistencia de `conversations` e `messages`
3. provider real de LLM com schema validation
4. captura real de leads
5. captura real de pre-agendamentos
6. criacao de assinatura Asaas a partir do painel
7. inbox operacional
8. observabilidade e hardening

## Padrao de desenvolvimento

Sempre que alterar o projeto:

- ler este `AGENTS.md`
- ler a spec do MVP
- preservar isolamento multi-tenant
- implementar testes para regras criticas
- validar se a mudanca afeta billing, quota ou seguranca
- evitar abstracoes desnecessarias no MVP
- preferir codigo simples, testavel e evolutivo
- atualizar a documentacao quando a superficie do produto mudar

## Checklist antes de concluir qualquer tarefa

- existe risco de vazamento entre tenants?
- a mudanca respeita o plano comercial?
- o bot continua sem inventar dados?
- a acao do modelo esta validada no backend?
- a entidade nova possui `tenantId`?
- ha teste cobrindo a regra alterada?
- a documentacao principal precisa ser atualizada?

## Comandos de verificacao

Backend:

```bash
npm start
```

Painel admin:

```bash
npm run admin:dev
```

Testes:

```bash
npm test
```

Build do admin:

```bash
npm run admin:build
```

Migrations:

```bash
npm run db:migrate
```

Antes de declarar qualquer tarefa concluida:

- rodar os testes
- rodar o build do painel se houve mudanca no frontend
- atualizar documentacao relevante
- confirmar o estado do git

## Variaveis de ambiente criticas

- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_API_BASE_URL`
- `ASAAS_WEBHOOK_SECRET`
- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_URL`
- `WHATSAPP_CLOUD_API_TOKEN`
- `WHATSAPP_CLOUD_API_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_API_VERIFY_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`

## Instrucao para futuras sessoes

Se o contexto da conversa estiver incompleto ou tiver sido limpo:

1. ler primeiro este `AGENTS.md`
2. depois ler `docs/architecture/2026-06-15-project-state.md`
3. depois ler `docs/specs/2026-06-15-atendeai-mvp.md`
4. inspecionar `README.md`
5. rodar `npm test`
6. continuar a implementacao respeitando as regras acima

Este arquivo e a memoria operacional do projeto. Em caso de conflito entre novas instrucoes do usuario e este arquivo, priorizar a instrucao mais recente do usuario, desde que nao comprometa isolamento multi-tenant, seguranca ou consistencia do produto.
