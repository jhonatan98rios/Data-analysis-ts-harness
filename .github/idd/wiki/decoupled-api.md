# Decoupled API

## Summary

Toda a lógica de análise de dados (tools, dataset management, chat orchestration) é desacoplada da UI e exposta como módulos TypeScript puros em `lib/`. As API routes (`app/api/`) são uma casca fina que traduz HTTP → chamadas de `lib/`. Isso permite testar as tools e a lógica de negócio diretamente, sem levantar o servidor Next.js, renderizar React, ou simular um browser.

## Mental Model

Camadas:

```
┌─────────────────────────────────────────┐
│  UI Layer (app/, components/)           │  ← React, RSC, Tailwind
├─────────────────────────────────────────┤
│  API Layer (app/api/)                   │  ← Request parsing, auth, streaming
├─────────────────────────────────────────┤
│  Service Layer (lib/)                   │  ← Business logic, agent orchestration
├─────────────────────────────────────────┤
│  Tool Layer (lib/tools/)                │  ← Pure functions, testable in isolation
├─────────────────────────────────────────┤
│  Data Layer (lib/datasets/, lib/tenants/)│  ← Data access, file I/O, SQLite
└─────────────────────────────────────────┘
```

Invariantes:
- Nenhum módulo em `lib/` importa de `app/`, `components/`, ou `next/*`
- Tools em `lib/tools/` são funções puras: `(params) => Promise<ToolResult>`
- API routes só fazem: validate → delegate to lib → serialize response
- Testes de tools não precisam de Next.js, React, ou rede
- O agente (LLM orchestration) está em `lib/agent/`, não em `app/api/`

## Anchors

- `code::lib/tools/` — todas as tools como funções puras
- `code::lib/agent/` — orquestração do agente (tool calling loop)
- `code::lib/chat/` — gerenciamento de histórico e streaming
- `code::lib/datasets/` — ingestão, schema, profiling
- `code::app/api/chat/route.ts` — casca HTTP sobre `lib/chat/`
- `code::app/api/datasets/route.ts` — casca HTTP sobre `lib/datasets/`
- `wiki::agent-tools::mental-model` — tools como funções puras
- `code::.github/idd/conventions.md::§Imports And Boundaries` — regras de dependência

## Open Questions

- Versionamento da API (v1, v2) ou API estável desde o início?
- SDK client-side para consumir a API programaticamente?

## Evidence

- `code::.github/idd/conventions.md::§Imports And Boundaries` — regra de dependência unidirecional
- `code::.github/idd/conventions.md::§Testing` — tools testáveis sem Next.js
- Entrevista com stakeholder (2026-07-22)
