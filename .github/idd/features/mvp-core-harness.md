# Feature: mvp-core-harness

> **Status**: `draft`

This file is the primary execution and maintenance contract for the feature.

## What

MVP do Data Analysis Harness: upload de CSV/Excel com criação de dataset + metadados, chat com agente LLM que consulta dados via tools e gera gráficos, multi-tenant de fábrica, lógica desacoplada da UI.

## Acceptance Criteria

Each criterion must reference a verification command that fails before the change (Red) and passes after (Green).

- [ ] AC-1: Upload de CSV cria dataset com schema detectado e dados ingeridos em SQLite
      Verify: `npx tsx lib/datasets/__tests__/ingest.test.ts`
- [ ] AC-2: Upload de Excel (.xlsx) cria dataset com schema detectado
      Verify: `npx tsx lib/datasets/__tests__/ingest.test.ts`
- [ ] AC-3: Agente responde pergunta simples sobre o dataset via chat (tool `query_dataset`)
      Verify: `npx tsx lib/agent/__tests__/agent.test.ts`
- [ ] AC-4: Agente gera gráfico de barras quando solicitado (tool `plot_bar`)
      Verify: `npx tsx lib/tools/__tests__/plot.test.ts`
- [ ] AC-5: Agente gera insights automáticos sobre o dataset (tool `generate_insights`)
      Verify: `npx tsx lib/tools/__tests__/insights.test.ts`
- [ ] AC-6: Dois tenants diferentes não veem dados um do outro
      Verify: `npx tsx lib/tenants/__tests__/isolation.test.ts`
- [ ] AC-7: API de chat com streaming SSE funcionando
      Verify: `npx tsx app/api/__tests__/chat.test.ts`
- [ ] AC-8: Tools são testáveis sem levantar servidor Next.js
      Verify: `npx vitest run lib/tools/` (todas passam sem Next.js)

## TDD

Execute each acceptance criterion as a Red → Green → Anchor loop.

## Details

### Constraints

- LLM provider: Anthropic (Claude) como default, interface abstraída para troca futura
- Tenant ID passado como path param: `/api/[tenantId]/...`
- SQLite via `better-sqlite3` (síncrono, embedded, sem infra externa)
- Charts gerados server-side como PNG (via `sharp` + `canvas`) e retornados como base64 ou URL
- CSV parsing via `papaparse`, Excel via `xlsx`
- Tipos de coluna detectados: `string`, `number`, `boolean`, `date`, `datetime`, `category`
- Profiling: count, nulls, unique, min, max, mean, median para colunas numéricas
- Rate limiting: não incluso no MVP (future scope)
- Autenticação: não inclusa no MVP (tenant ID explícito)

### Out of Scope

- Autenticação e autorização
- Múltiplos provedores LLM (fixo em Anthropic MVP)
- Charts interativos client-side
- Embeddings/RAG para datasets grandes
- Atualização incremental de datasets
- Pivot tables
- Rate limiting e quotas
- Dashboard (além do chat)
- Export de análises (PDF, etc.)

---

## Dependencies

### Feature Dependencies

- Nenhuma (feature raiz do projeto)

### External Dependencies

- `better-sqlite3` — banco embedded
- `papaparse` — parsing CSV
- `xlsx` (SheetJS) — parsing Excel
- `sharp` — renderização de charts
- `@anthropic-ai/sdk` — LLM provider
- `zod` — validação de schemas e tool parameters
- `vitest` — test runner

---

## Technical Considerations

### Performance

- Arquivos de até 50MB e 500K linhas no MVP
- Ingestão síncrona (upload → parse → SQLite em uma request)
- Charts gerados on-demand, com cache simples por hash de parâmetros

### Security

- Tenant isolation: `WHERE tenant_id = ?` em toda query, diretórios prefixados
- SQL injection: queries do agente usam prepared statements; tool `query_dataset` aceita apenas SELECT
- File upload: validação de tipo MIME, tamanho máximo, scan básico
- Dados nunca enviados ao LLM provider — apenas schema, metadados e resultados de tool calls
- Input validation em toda API route com `zod`

### Backward Compatibility

- N/A (MVP inicial)

---

## API Contract

```
POST /api/[tenantId]/datasets/upload
  Content-Type: multipart/form-data
  Body: file (CSV ou Excel)
  Response: { datasetId, schema, rowCount, profiling }

POST /api/[tenantId]/chat
  Content-Type: application/json
  Body: { datasetId, message }
  Response: SSE stream (text/event-stream)
    events: text_delta, tool_call, tool_result, chart, done

GET /api/[tenantId]/datasets
  Response: { datasets: [{ id, name, rowCount, columns, createdAt }] }

GET /api/[tenantId]/datasets/[datasetId]
  Response: { id, name, schema, profiling, rowCount, createdAt }

GET /api/[tenantId]/charts/[chartId]
  Response: image/png
```

---

## Glossary

| Location | Type | Description |
|----------|------|-------------|
| `code::lib/datasets/types.ts::Dataset` | source | Tipo do dataset |
| `code::lib/datasets/types.ts::ColumnSchema` | source | Schema de coluna |
| `code::lib/datasets/ingest.ts::ingestFile` | source | Pipeline de ingestão |
| `code::lib/tools/types.ts::ToolDefinition` | source | Interface de tool |
| `code::lib/tools/types.ts::ToolResult` | source | Resultado padronizado de tool |
| `code::lib/tools/registry.ts::ToolRegistry` | source | Registro de tools |
| `code::lib/tools/query.ts::queryDataset` | source | Tool de query SQL |
| `code::lib/tools/plot.ts::plotChart` | source | Tool de geração de gráficos |
| `code::lib/tools/insights.ts::generateInsights` | source | Tool de insights |
| `code::lib/agent/orchestrator.ts::AgentOrchestrator` | source | Loop de tool calling do agente |
| `code::lib/tenants/types.ts::TenantContext` | source | Contexto de tenant |
| `code::app/api/[tenantId]/chat/route.ts` | source | Endpoint SSE de chat |
| `code::app/api/[tenantId]/datasets/route.ts` | source | Endpoints de dataset |
| `wiki::multi-tenancy::mental-model` | wiki | Isolamento por tenant |
| `wiki::datasets::mental-model` | wiki | Pipeline de dataset |
| `wiki::agent-tools::mental-model` | wiki | Tools como interface agente-dados |
| `wiki::decoupled-api::mental-model` | wiki | Arquitetura desacoplada |
