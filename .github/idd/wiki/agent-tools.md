# Agent Tools

## Summary

As tools são a interface entre o agente LLM e os dados. O agente nunca recebe arquivos brutos — ele recebe o schema do dataset como contexto e chama tools para consultar, agregar, filtrar, plotar e gerar insights. Cada tool é uma função pura (recebe parâmetros, retorna resultados) testável independentemente, sem dependência de HTTP ou UI.

## Mental Model

Fluxo de uma interação:

```
User prompt → Agent (LLM) → tool_call → Tool Executor → SQLite/Chart Renderer → Result → Agent → Response
```

O LLM recebe:
- Schema do dataset (colunas, tipos, amostra)
- Descrições das tools disponíveis (function definitions)
- Histórico da conversa

O LLM **nunca** recebe:
- Arquivos brutos
- Dados completos do dataset
- Dados de outros tenants

Tool categories:
1. **Query tools**: `query_dataset` (SQL SELECT), `aggregate` (GROUP BY), `filter` (WHERE)
2. **Stats tools**: `describe`, `correlate`, `distribution`
3. **Viz tools**: `plot_bar`, `plot_line`, `plot_scatter`, `plot_pie` — retornam PNG/SVG
4. **Insight tools**: `generate_insights`, `detect_outliers`, `trend_analysis`

Cada tool:
- Recebe `tenantId` e `datasetId` obrigatórios
- Retorna resultado estruturado (`{ data, metadata }` ou `{ error, code }`)
- É registrada no `ToolRegistry` com schema JSON Schema para o LLM

## Anchors

- `code::lib/tools/types.ts::ToolDefinition` — interface de tool
- `code::lib/tools/types.ts::ToolResult` — resultado padronizado
- `code::lib/tools/registry.ts::ToolRegistry` — registro e lookup de tools
- `code::lib/tools/query.ts::queryDataset` — tool de query SQL
- `code::lib/tools/aggregate.ts::aggregateDataset` — tool de agregação
- `code::lib/tools/plot.ts::plotChart` — tool de gráficos
- `code::lib/tools/insights.ts::generateInsights` — tool de insights
- `code::lib/tools/index.ts` — barrel export com todas as tools
- `wiki::datasets::mental-model` — datasets que as tools consultam
- `wiki::multi-tenancy::mental-model` — tenant isolation nas tools
- `wiki::decoupled-api::mental-model` — API de tools testável

## Open Questions

- Tool de "pivot table"?
- Limite de rows retornadas por tool call (evitar estouro de contexto)?
- Sandbox de SQL — permitir qualquer SELECT ou restringir?
- Charts interativos (client-side) vs estáticos (server-side PNG)?

## Evidence

- `code::.github/idd/architecture.md::§Capabilities` — tools como interface agente-dados
- `code::.github/idd/conventions.md::§Anti-Patterns` — não enviar dados brutos ao LLM
- Entrevista com stakeholder (2026-07-22)
