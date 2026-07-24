# Learned Rules

## Summary

Conjunto inicial de regras para o Data Analysis Harness. Foco em multi-tenant isolation, segurança de dados (nunca enviar dados brutos ao LLM), desacoplamento UI/lógica, e testabilidade.

## Rules

| Rule-Id | Rule Type | Scope | Constraint | Rationale | Enforcement | Check-Id | Status |
|---------|-----------|-------|------------|-----------|-------------|----------|--------|
| tenant-id-every-query | data-access | `lib/**` | Toda query ao banco deve incluir `WHERE tenant_id = ?` ou equivalente. Nenhum acesso a dados sem filtro de tenant. | Multi-tenant isolation é requisito de fábrica. Um query sem tenant_id vaza dados entre tenants. | judgment | | active |
| no-raw-data-to-llm | security | `lib/agent/**` | O agente nunca deve enviar dados brutos de arquivos para o LLM provider. Apenas schema, metadados, e resultados de tool calls. | Segurança e privacidade dos dados do usuário. O LLM é um serviço externo; dados brutos nunca devem sair do servidor. | judgment | | active |
| tools-no-http-deps | boundaries | `lib/tools/**` | Tools do agente não devem depender de objetos HTTP (Request, Response, headers, cookies). Devem receber parâmetros explícitos. | Ferramental testável sem servidor. Tools com dependência HTTP não podem ser testadas isoladamente. | judgment | | active |
| lib-no-ui-imports | boundaries | `lib/**` | Nenhum módulo em `lib/` pode importar de `app/`, `components/`, ou `next/*`. | Desacoplamento da lógica de negócio da UI. `lib/` deve funcionar sem React e sem Next.js. | mechanical | idd-no-ui-imports | enforced |
| zod-validation-api | errors | `app/api/**` | Toda API route deve validar input com `zod` antes de delegar para `lib/`. | Segurança e previsibilidade. Input não validado é a principal fonte de bugs e vulnerabilidades. | judgment | | active |
| tool-result-structured | errors | `lib/tools/**` | Toda tool deve retornar `{ data, metadata }` em sucesso ou `{ error, code }` em falha. Nunca throw sem captura estruturada. | O agente precisa de resultados parseáveis para continuar a conversa. Erros não estruturados quebram o loop de tool calling. | judgment | | active |

## Notes

- `lib-no-ui-imports` compilado como `idd-no-ui-imports.yml` com fixture test em `idd-no-ui-imports-test.yml` — status `enforced`
- MVP não inclui autenticação; tenant ID é passado explicitamente. Isso deve ser revisitado antes de qualquer deploy público.
- Regras importadas de `/idd-discover` ou de outros repositórios devem entrar como `Status: proposed` até terem evidência neste repositório.
