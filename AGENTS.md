# AGENTS.md

## Projeto

**Nome:** AtendeAI  
**Tipo:** SaaS multi-tenant de assistente de IA para WhatsApp  
**Objetivo:** permitir que pequenos negocios usem um bot no WhatsApp para responder perguntas, capturar leads e registrar pre-agendamentos com controle por plano.

## Produto e proposta

O AtendeAI e um produto comercial, nao um projeto academico. Toda decisao tecnica deve considerar:

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

Cada tenant podera cadastrar:

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

- `docs/specs/2026-06-15-atendeai-mvp.md`: especificacao funcional do MVP
- `db/schema.sql`: modelagem inicial do banco
- `src/domain/policy.js`: regras de plano, quota, bloqueio e validacao
- `src/domain/orchestrator.js`: fluxo central de processamento da mensagem
- `src/domain/templates.js`: templates de nicho
- `src/llm/contract.js`: contrato de contexto e saida do LLM
- `test/domain/`: testes automatizados do dominio

Sempre ler esses arquivos antes de fazer mudancas estruturais.

## Arquitetura obrigatoria

Separacao obrigatoria de camadas:

- **Frontend:** painel administrativo do tenant
- **Backend API:** autenticacao, CRUD tenant-scoped, billing, inbox e configuracao
- **Motor conversacional:** interpretacao, politica, LLM, acao estruturada
- **Adaptador WhatsApp:** entrada e saida de mensagens
- **Billing adapter:** Asaas
- **Banco:** relacional com `tenantId` em todas as entidades de negocio

Toda entidade de negocio deve carregar `tenantId`.

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

## Estrutura desejada do projeto

Estrutura atual e esperada:

```text
AGENTS.md
README.md
docs/specs/
db/
src/domain/
src/llm/
test/domain/
```

Quando o projeto crescer, manter a organizacao abaixo:

```text
src/
  app/              bootstrap da aplicacao
  api/              rotas, controllers, middleware
  auth/             autenticacao, sessao, hashing
  billing/          Asaas, planos, webhooks
  tenants/          tenant resolution e isolamento
  conversations/    historico, mensagens, quotas
  leads/            captura e inbox
  scheduling/       pre-agendamentos
  whatsapp/         adaptador WhatsApp Cloud API
  llm/              provider, prompts, schema validation
  domain/           regras centrais e politicas
  observability/    logs, audit trail, error handling
```

## Ordem de implementacao recomendada

Seguir esta ordem para reduzir risco arquitetural:

1. fundacao de dominio e documentacao
2. autenticacao e isolamento de tenant
3. banco real e migrations
4. onboarding wizard do tenant
5. CRUD de perfil, FAQ e catalogo/servicos
6. quotas e planos
7. webhooks e adaptador do WhatsApp
8. integracao de LLM com schema validation
9. captura de leads
10. captura de pre-agendamentos
11. billing Asaas
12. observabilidade e hardening

## Padrao de desenvolvimento

Sempre que alterar o projeto:

- ler este `AGENTS.md`
- ler a spec do MVP
- preservar isolamento multi-tenant
- implementar testes para regras criticas
- validar se a mudanca afeta billing, quota ou seguranca
- evitar abstrações desnecessarias no MVP
- preferir codigo simples, testavel e evolutivo

## Checklist antes de concluir qualquer tarefa

- existe risco de vazamento entre tenants?
- a mudanca respeita o plano comercial?
- o bot continua sem inventar dados?
- a acao do modelo esta validada no backend?
- a entidade nova possui `tenantId`?
- ha teste cobrindo a regra alterada?
- a documentacao principal precisa ser atualizada?

## Comandos de verificacao

Comando atual de testes:

```bash
npm test
```

Antes de declarar qualquer tarefa concluida:

- rodar os testes
- confirmar status limpo do git se apropriado
- atualizar documentacao se a mudanca alterou comportamento

## Instrucao para futuras sessoes

Se o contexto da conversa estiver incompleto ou tiver sido limpo:

1. ler primeiro este `AGENTS.md`
2. depois ler `docs/specs/2026-06-15-atendeai-mvp.md`
3. inspecionar `README.md`
4. inspecionar os modulos de dominio e testes
5. continuar a implementacao respeitando as regras acima

Este arquivo e a memoria operacional do projeto. Em caso de conflito entre novas instrucoes do usuario e este arquivo, priorizar a instrucao mais recente do usuario, desde que nao comprometa isolamento multi-tenant, seguranca ou consistencia do produto.
