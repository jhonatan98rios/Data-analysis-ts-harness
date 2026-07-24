# Datasets

## Summary

Datasets são a unidade central de dados no harness. Criados a partir de upload de CSV/Excel, cada dataset armazena o arquivo original, um schema detectado automaticamente (colunas, tipos, estatísticas), e metadados de profiling (contagem de linhas, valores nulos, distribuições). O dataset é a fonte que o agente consulta via tools — o agente nunca acessa o arquivo bruto diretamente.

## Mental Model

Pipeline de criação de dataset:

```
Upload (CSV/Excel) → Parse → Schema Detection → Profiling → Dataset Metadata
                                                      ↓
                                               SQLite (dados processados)
```

O arquivo original é preservado em disco para referência. Os dados são ingeridos em SQLite para consultas rápidas. O schema é inferido (tipos de coluna, nullable, unique hints) e exposto ao agente como contexto para tool calling.

Invariantes:
- Cada dataset pertence a exatamente um tenant
- Schema é imutável após criação (snapshot); reprocessamento requer novo dataset
- O agente só vê schema + metadados + resultados de queries, nunca o arquivo bruto
- Dados processados em SQLite são read-only para o agente (apenas SELECT)

## Anchors

- `code::lib/datasets/types.ts::Dataset` — tipo do dataset
- `code::lib/datasets/types.ts::ColumnSchema` — schema de coluna (nome, tipo, nullable, stats)
- `code::lib/datasets/ingest.ts::ingestFile` — pipeline de ingestão (parse → schema → profiling → SQLite)
- `code::lib/datasets/parser.ts::parseCSV` — parser CSV
- `code::lib/datasets/parser.ts::parseExcel` — parser Excel
- `code::lib/datasets/profiler.ts::profileDataset` — profiling estatístico
- `wiki::agent-tools::mental-model` — tools que consultam datasets
- `wiki::multi-tenancy::mental-model` — isolamento por tenant

## Open Questions

- Suporte a atualização incremental (append de novos dados)?
- Schema versioning quando o usuário re-uploada?
- Limite de tamanho de dataset (linhas, colunas, bytes)?
- Streaming para arquivos grandes ou ingestão completa em memória?

## Evidence

- `code::.github/idd/architecture.md::§Capabilities` — upload e criação de dataset
- Entrevista com stakeholder (2026-07-22)
