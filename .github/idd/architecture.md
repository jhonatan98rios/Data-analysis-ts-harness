# Architecture

## Summary

Data Analysis Harness é um sistema agentico multi-tenant para análise de dados. Usuários fazem upload de arquivos CSV/Excel, o harness cria datasets com metadados automáticos, e o usuário interage via chat com linguagem natural para fazer perguntas, gerar análises, gráficos e insights — um "Power BI agentico". O agente nunca recebe os arquivos diretamente; ele os consulta via tools server-side. A lógica de análise é desacoplada da UI, exposta como API testável de forma independente.

## Mode

- Mode: greenfield
- Source: interview
- Last Updated: 2026-07-22

## Projects

| Name | Path | Role | Notes |
|------|------|------|-------|
| data-analysis-harness | `/` | Next.js monolith | App Router, API routes, UI, e tools do agente no mesmo processo |

## Capabilities

- Upload de CSV e Excel com parsing server-side
- Criação automática de dataset com schema detection, profiling e metadados
- Chat com linguagem natural (streaming) para consultas analíticas
- Agente com toolset: query, aggregate, filter, plot, correlate, insight generation
- Geração de gráficos (plot) server-side retornados como imagem/SVG
- Multi-tenant de fábrica (tenant isolation via org/workspace context)
- API de tools testável independentemente (sem UI)

## Runtime Topology

Monolito Next.js rodando em Node.js (ou edge functions para rotas leves). O mesmo processo serve UI (React RSC), API routes (REST), e o agent runtime que orquestra tools.

| Component | Type | Runtime Or Host | Notes |
|-----------|------|-----------------|-------|
| Next.js App Router | web framework | Node.js / Vercel | Rotas de página e API no mesmo processo |
| Agent Runtime | library internal | Node.js (server-side) | Orquestração de tools, sem enviar dados ao LLM provider |
| Dataset Store | file system + SQLite | Node.js (server-side) | Arquivos originais em disco, metadados e dados processados em SQLite |
| LLM Provider | external API | cloud (Anthropic / OpenAI) | Apenas recebe schema e resultados de tool calls, nunca dados brutos |
| Chart Renderer | library internal | Node.js (server-side) | Gera PNG/SVG a partir de dados processados |

## Data Stores

| Name | Type | Used By | Notes |
|------|------|---------|-------|
| File Store | disk | Dataset Service | Arquivos originais CSV/Excel, isolados por tenant |
| Metadata DB | SQLite | Dataset Service, Agent Tools | Schema, profiling, estatísticas, tenant isolation via row-level `tenant_id` |
| Chat History | SQLite | Chat Service | Histórico de mensagens por tenant |
| Session State | in-memory / SQLite | Agent Runtime | Estado da conversa ativa do agente |

## Integrations

| System | Direction | Purpose | Notes |
|--------|-----------|---------|-------|
| LLM API (Anthropic/OpenAI) | outbound | Processamento de linguagem natural e tool calling | Nunca recebe dados brutos, apenas schema/metadados e resultados de tools |
| File System | internal | Armazenamento de uploads e charts gerados | Isolado por tenant |
| SQLite | internal | Metadados, histórico, estado | Embedded, sem infra externa |

## Open Questions

- Suporte a múltiplos provedores LLM ou fixar em um?
- Autenticação: built-in (NextAuth) ou delegada a proxy externo?
- Charts: PNG server-side ou renderização client-side com biblioteca (ECharts/Plotly)?
- Limite de tamanho de arquivo e política de retenção?
- Embeddings/RAG para datasets grandes ou apenas schema-driven?
- Rate limiting e quota por tenant?

## Evidence

- `package.json` — Next.js 16 + React 19 + Tailwind v4 + TypeScript
- `AGENTS.md` — Next.js project marker
- Entrevista com stakeholder (2026-07-22)
