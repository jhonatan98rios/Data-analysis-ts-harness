# Multi-Tenancy

## Summary

O sistema é multi-tenant de fábrica. Cada tenant representa uma organização ou workspace isolado. Todo dado — datasets, metadados, histórico de chat, arquivos — é particionado por `tenant_id`. O tenant é resolvido no início de cada request e propagado para todas as camadas (API → services → tools → data stores).

## Mental Model

Um tenant é um namespace de isolamento. Dentro do mesmo deployment, múltiplos tenants coexistem sem vazar dados entre si. O tenant context é estabelecido via header/cookie/session e carregado em um `TenantContext` que percorre todo o ciclo de vida do request.

Invariantes:
- Toda query ao banco inclui `WHERE tenant_id = ?`
- Arquivos em disco ficam em diretórios com prefixo `tenant-{id}/`
- O agente nunca recebe dados de outro tenant
- Tools do agente recebem `tenantId` como parâmetro obrigatório
- Rate limiting e quotas são por tenant

## Anchors

- `code::lib/tenants/types.ts::TenantContext` — tipo do contexto de tenant
- `code::lib/tenants/resolve.ts::resolveTenant` — resolução de tenant por request
- `code::app/api/middleware.ts::tenantMiddleware` — middleware de tenant
- `wiki::datasets::mental-model` — datasets isolados por tenant
- `wiki::agent-tools::mental-model` — tools recebem tenantId

## Decisions

- **Tenant via path ou subdomain?** Path-based (`/api/[tenantId]/...`) para simplicidade inicial. Subdomain pode vir depois com proxy reverso.
- **Autenticação por tenant?** Future scope. MVP assume tenant ID explícito; autenticação será adicionada como middleware antes da resolução de tenant.

## Open Questions

- Tenant provisioning: self-service ou admin-only?
- Quotas: storage por tenant, requests por tenant?
- Cross-tenant analytics para o operador da plataforma?

## Evidence

- `code::.github/idd/architecture.md::§Data Stores` — cada store referencia tenant isolation
- `code::.github/idd/conventions.md::§Anti-Patterns` — regras de tenant isolation
- Entrevista com stakeholder (2026-07-22)
