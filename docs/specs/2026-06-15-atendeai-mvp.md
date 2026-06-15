# AtendeAI MVP

## Resumo

AtendeAI e um SaaS multi-tenant para pequenos negocios que usam WhatsApp como canal principal de atendimento. O MVP deve responder perguntas recorrentes, capturar leads e registrar pre-agendamentos, sempre com isolamento por tenant, trilha de auditoria e monetizacao por assinatura.

Nichos iniciais:
- moda feminina
- perfumarias
- material de construcao
- saloes
- clinicas
- restaurantes

## Objetivo do MVP

Entregar uma primeira versao comercializavel em que o dono da empresa:
- cria sua conta
- cadastra empresa, horario, catalogo/servicos, FAQ e numero de WhatsApp
- conecta o bot ao atendimento do negocio
- acompanha leads e pre-agendamentos num painel interno

O cliente final da empresa deve conseguir:
- perguntar preco, horario, localizacao, formas de pagamento e disponibilidade
- demonstrar interesse em compra ou servico
- pedir contato
- solicitar pre-agendamento

## Arquitetura sugerida

### Frontend
- painel web de onboarding em wizard
- telas de perfil do negocio
- cadastro de FAQ
- cadastro de catalogo/servicos
- inbox de leads e pre-agendamentos
- tela de plano, uso e cobranca

### Backend
- API tenant-scoped
- autenticacao segura com senha hasheada
- servico de orquestracao conversacional
- webhooks do WhatsApp Cloud API
- webhooks do Asaas
- camada de politicas para plano, trial, inadimplencia e bloqueio

### Banco
- banco relacional com `tenantId` em todas as entidades de negocio
- indices compostos por tenant nas tabelas consultadas por alto volume
- estrutura para idempotencia de webhooks e trilha de auditoria

### IA
- LLM com contexto estruturado
- respostas limitadas a dados aprovados pelo tenant
- saida estruturada para intencao e acao
- validacao server-side antes de persistir lead ou pre-agendamento

## Modelo de planos

### Basic
- responde perguntas institucionais e de catalogo/servicos
- limite mensal de 100 conversas

### Pro
- tudo do Basic
- captura leads
- limite mensal de 250 conversas

### Premium
- tudo do Pro
- captura pre-agendamentos
- limite mensal de 600 conversas

## Fluxo da mensagem

1. WhatsApp envia webhook.
2. Sistema resolve o tenant pelo numero conectado.
3. Evento bruto e persistido com idempotencia.
4. Sistema valida assinatura, plano e consumo.
5. Contexto aprovado do tenant e carregado.
6. LLM detecta intencao e responde dentro do schema.
7. Backend valida acao permitida pelo plano.
8. Se a acao for aceita, cria lead ou pre-agendamento.
9. Mensagem e enviada ao cliente final.
10. Conversa, auditoria e uso mensal sao atualizados.

## LLM e guardrails

O LLM deve:
- classificar intencao
- redigir a resposta
- preencher payload estruturado de lead ou pre-agendamento

O LLM nao deve:
- inventar preco
- inventar disponibilidade
- inventar horario
- inventar politica
- inventar forma de pagamento
- executar acao fora do plano

Schema minimo de saida:
- `intent`
- `reply`
- `requestedAction`
- `entities`
- `confidence`
- `fallbackReason`

Regra operacional:
- baixa confianca gera handoff para humano
- dado ausente gera fallback controlado
- acao invalida para o plano e bloqueada pelo backend

## Modelo de dados

Entidades minimas:
- Tenant
- User
- Subscription
- BusinessProfile
- BusinessHour
- CatalogItem
- FaqItem
- Conversation
- Message
- Lead
- PreAppointment
- UsageCounter
- AuditLog

## Seguranca e isolamento

- `tenantId` em todas as entidades de negocio
- filtros obrigatorios por tenant na camada de servico
- indices compostos por tenant
- webhooks resolvem tenant antes da regra de negocio
- trilha de auditoria para acao automatica e manual
- bloqueio automatico de tenant inadimplente

## Fora de escopo no MVP

- pedidos completos
- estoque
- entrega
- integracao com CRM
- agenda com confirmacao automatica
- multiusuario interno
- analytics avancado

## Checklist de producao

- autenticacao segura
- hash forte de senha
- logs estruturados
- tratamento global de erro
- retry e idempotencia em webhook
- observabilidade basica
- testes automatizados
- backup e restore planejados
- configuracao de ambiente separada por estagio
