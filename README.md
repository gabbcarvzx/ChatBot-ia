# AtendeAI MVP

Base inicial do MVP do AtendeAI, um SaaS multi-tenant para assistente de WhatsApp de pequenos negocios.

## O que ja existe neste repositorio

- especificacao canônica do MVP em `docs/specs/2026-06-15-atendeai-mvp.md`
- nucleo de dominio para:
  - planos e capacidades
  - quotas mensais por conversa
  - bloqueio por assinatura
  - validacao de acoes do LLM
  - templates por nicho
- contrato inicial de contexto e policy para integracao com LLM
- schema SQL inicial para Postgres
- testes automatizados do dominio com `node --test`

## Rodando testes

```bash
npm test
```

## Estrutura inicial

```text
docs/specs/                  documentacao do produto
db/schema.sql                modelagem relacional inicial
src/domain/                  regras centrais de plano e tenant
src/llm/                     contrato e policy do LLM
test/domain/                 regressao do dominio central
```

## Proximas etapas recomendadas

1. adicionar camada HTTP e autenticacao
2. implementar onboarding wizard
3. integrar WhatsApp Cloud API
4. integrar Asaas
5. persistir leads e pre-agendamentos em banco real
6. plugar um provider de LLM com schema validation
