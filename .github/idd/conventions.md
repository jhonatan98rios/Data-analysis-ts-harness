# Conventions

## Summary

Next.js 16 App Router com TypeScript strict, Tailwind CSS v4, ESLint (`eslint-config-next`). Server components por padrão; `"use client"` apenas quando necessário. API routes e lógica de domínio desacopladas da UI.

## Languages And Tooling

| Area | Choice | Notes |
|------|--------|-------|
| Languages | TypeScript 5 (strict) | `tsconfig.json` com strict mode |
| Package Manager | npm | `package-lock.json` presente |
| Frameworks | Next.js 16 (App Router), React 19, Tailwind CSS v4 | RSC-first |
| Linters And Formatters | ESLint 9 (`eslint-config-next`) | `npm run lint` |
| Test Tooling | Vitest (planejado) | Ainda não adicionado ao projeto |

## Formatting

- Indentation: 2 espaços
- Quotes: single quotes (`'`)
- Line Length: 100 caracteres (soft), sem trailing whitespace
- File Organization: `app/` para rotas e páginas, `lib/` para lógica compartilhada, `components/` para componentes reutilizáveis

## Naming

- Files: kebab-case para componentes (`user-profile.tsx`), kebab-case ou camelCase para módulos (`dataset-service.ts`, `useChat.ts`)
- Functions: camelCase
- Classes: PascalCase
- Types/Interfaces: PascalCase, prefer `type` sobre `interface` a menos que declaration merging seja necessário
- Tests: `*.test.ts` ou `*.spec.ts` ao lado do arquivo testado ou em `__tests__/`

## Imports And Boundaries

- Barrel exports via `index.ts` apenas para APIs públicas de módulos
- `lib/` não importa de `app/` ou `components/` — dependência unidirecional: `app/` → `components/` → `lib/`
- API routes (`app/api/`) importam de `lib/`, nunca de componentes UI
- `lib/tools/` é a camada de tools do agente, exporta interfaces testáveis

## Testing

- Testes unitários em `lib/` e `lib/tools/` — devem rodar sem Next.js, sem banco, sem rede
- Testes de integração em `app/api/` — podem usar SQLite em memória
- Testes E2E (Playwright, futuro) para fluxos de chat e upload
- Mock do LLM provider em todos os testes que não são de integração com provider real

## Logging And Errors

- `console.error` para erros server-side; evitar `console.log` solto em produção
- Erros de tool devem retornar mensagens estruturadas (`{ error: string, code: string }`)
- Nunca vazar dados de arquivo ou schema sensível em logs
- Tenant ID deve estar presente em todo log server-side

## Library Patterns

| Library Or Tool | Approved Usage Pattern | Avoid |
|-----------------|------------------------|-------|
| Next.js | App Router, RSC, API routes, streaming | Pages Router |
| Tailwind CSS | Utility classes no JSX, `@apply` em CSS modules quando necessário | CSS-in-JS, styled-components |
| SQLite (better-sqlite3) | Banco embedded para metadados e estado | ORMs pesados (Prisma, Drizzle para este caso) |
| Chart generation | Sharp/Canvas para render server-side PNG, ou lightweight SVG builder | Bibliotecas de chart client-side no servidor |
| CSV/Excel parsing | PapaParse (CSV), SheetJS/xlsx (Excel) | Parsers customizados |

## Component Locations

| Component Type | Preferred Location | Notes |
|----------------|--------------------|-------|
| Páginas e layouts | `app/` | App Router conventions |
| Componentes UI reutilizáveis | `components/` | Separados por domínio se crescer |
| Lógica de negócio | `lib/` | `lib/datasets/`, `lib/chat/`, `lib/tools/`, `lib/tenants/` |
| API routes | `app/api/` | REST endpoints, agent chat endpoint |
| Types compartilhados | `lib/types.ts` ou `lib/*/types.ts` | |
| Tools do agente | `lib/tools/` | Uma tool por arquivo, interface comum |

## Anti-Patterns

- Enviar dados brutos de arquivos para o LLM provider
- SQLite sem `tenant_id` nas queries (multi-tenant isolation)
- Lógica de análise de dados em componentes React
- Hardcoding de tenant ou assumir tenant único
- Tools do agente que dependem de contexto HTTP (devem receber parâmetros explícitos)

## Evidence

- `package.json` — Next.js 16, React 19, Tailwind v4, TypeScript 5
- `eslint.config.mjs` — `eslint-config-next`
- `tsconfig.json` — TypeScript config
- `next.config.ts` — Next.js config padrão
- Entrevista com stakeholder (2026-07-22)
