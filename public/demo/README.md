# Datasets de demonstração

Dados fictícios para a demo do app. Foram desenhados **de trás para frente**: partindo
das ferramentas de análise disponíveis (`trend`, `compare_periods`, `group_by`, `pivot`,
`pareto`, `correlation`, `ratio`, `describe_conditional`, `top_n`, `filter`, ...),
cada coluna existe para sustentar uma pergunta de negócio real.

Objetivo: qualquer empresário abre a demo, roda as perguntas sugeridas e enxerga
valor imediato — e como usaria os próprios dados do mesmo jeito.

> ⚠️ O parser do app (`lib/data/store.ts`) divide a linha por `,` sem tratar vírgula
> dentro de aspas. Por isso **nenhum campo de texto tem vírgula** e os números usam
> ponto decimal sem separador de milhar. Mantenha assim ao editar/regenerar.
>
> Regerar: `node scripts/generate-demo-data.mjs` (determinístico). Ele também gera
> `public/demo/en-us/` — mesmo dado numérico, com arquivo, cabeçalho e valores
> categóricos em inglês (`sales.csv`, `marketing.csv`, `production.csv`, `customers.csv`).

---

## 1. `vendas.csv` — Aumentar lucro
Lançamento item-a-item de vendas de 2024 de um varejo (418 pedidos). Receita cresce o ano
todo, mas o lucro não acompanha na mesma proporção.

| Coluna | Tipo | Papel na análise |
|---|---|---|
| `data` | data | filtros, comparação entre períodos |
| `mes` | período (YYYY-MM) | tendência mensal |
| `pedido_id` | texto | identificador |
| `cliente` | categoria | Pareto / top clientes |
| `canal` | categoria | receita e margem por canal |
| `regiao` | categoria | desempenho regional |
| `vendedor` | categoria | ranking de vendedores |
| `categoria` | categoria | mix de receita vs mix de lucro |
| `produto` | categoria | Pareto de produtos |
| `quantidade` | numérico | volume |
| `preco_unitario` | numérico | preço de tabela |
| `desconto_pct` | numérico | causa raiz da perda de margem |
| `receita` | numérico | = qtd × preço × (1 − desconto) |
| `custo_total` | numérico | CMV |
| `lucro` | numérico | = receita − custo_total (há pedidos negativos) |

**Histórias embutidas:** receita ~ago→dez acelera (sazonalidade de fim de ano);
Eletrônicos ≈ 19% da receita mas só ~7% do lucro (margem 13% vs 55% em Vestuário/Beleza);
12 pedidos com prejuízo por desconto agressivo.

**Perguntas sugeridas**
- "As vendas estão crescendo?" / "Qual a tendência de receita e lucro por mês?"
- "Qual categoria dá mais lucro?" e "Eletrônicos vale a pena?"
- "Qual a margem de lucro?" (ratio `lucro / receita`)
- "Descontos estão destruindo minha margem?" (correlation `desconto_pct` × `lucro` / `lucro`×`receita`)
- "Top 10 clientes por receita" / "Pareto de produtos"
- "Receita por canal em cada mês" (pivot) e "Online está crescendo?"

---

## 2. `marketing.csv` — Onde investir
Gasto e retorno de 12 campanhas em 5 canais, mensal, 2024 (144 linhas).

| Coluna | Tipo | Papel na análise |
|---|---|---|
| `data` / `mes` | data / período | evolução do investimento |
| `canal` | categoria | ROI por canal (a decisão central) |
| `campanha` | categoria | Pareto de campanhas |
| `investimento` | numérico | custo |
| `impressoes` | numérico | topo de funil |
| `cliques` | numérico | CTR |
| `leads` | numérico | CPL = investimento / leads |
| `pedidos` | numérico | conversão |
| `novos_clientes` | numérico | CAC |
| `receita` | numérico | ROAS = receita / investimento |

**Histórias embutidas:** TikTok é o canal de **maior gasto** e **pior retorno**
(ROAS ~1.9, inviável); Email gasta pouco e devolve ~11× (subinvestido);
Google é o mais consistente (~5.4×); Meta intermediário (~3.6×).

**Perguntas sugeridas**
- "Qual o ROI/ROAS de cada canal?" (ratio `receita / investimento`)
- "Onde devo investir mais e onde devo cortar?"
- "Qual o custo por lead e o CAC por canal?" (ratio)
- "Investir em marketing aumenta a receita?" (correlation)
- "Gasto vs retorno mês a mês" (trend / dual_axis)

---

## 3. `producao.csv` — Cortar desperdício
Produção mensal por linha × turno de uma fábrica de bebidas, 2024 (108 linhas).

| Coluna | Tipo | Papel na análise |
|---|---|---|
| `data` / `mes` | data / período | tendência do refugo |
| `linha` | categoria | concentração do desperdício |
| `turno` | categoria | Manhã / Tarde / Noite |
| `produto` | categoria | produto por linha |
| `unidades_produzidas` | numérico | volume |
| `unidades_defeituosas` | numérico | taxa de defeito (ratio) |
| `horas_paradas` | numérico | parada de máquina |
| `energia_kwh` | numérico | custo energético |
| `custo_materia_prima` | numérico | insumo |
| `custo_mao_obra` | numérico | mão de obra |
| `custo_total` | numérico | custo do lote |
| `valor_producao` | numérico | valor do que saiu bom |
| `custo_desperdicio` | numérico | **R$ literalmente jogado fora** |

**Histórias embutidas:** Linha C concentra ~51% do desperdício (taxa 6.8% vs 2.4% da
Linha A); turno Noite é o pior (~5.2%); `horas_paradas` correlaciona forte com defeito
(r ≈ 0.88) — a causa raiz é parada de máquina.

**Perguntas sugeridas**
- "Quanto estou perdendo com refugo?" (aggregate `custo_desperdicio`)
- "Qual linha/turno concentra o desperdício?" (group_by / pivot)
- "Qual a taxa de defeito por linha?" (ratio)
- "Paradas de máquina causam defeito?" (correlation)
- "Top produtos por custo de desperdício" (pareto)

---

## 4. `clientes.csv` — Reter e crescer
Base de 200 clientes PJ com histórico agregado.

| Coluna | Tipo | Papel na análise |
|---|---|---|
| `cliente_id` / `nome` | texto | identificação |
| `segmento` | categoria | Pequeno / Medio / Grande |
| `regiao` | categoria | regionalização |
| `canal_aquisicao` | categoria | qualidade da aquisição |
| `data_cadastro` | data | coorte |
| `meses_como_cliente` | numérico | tempo de casa |
| `pedidos_total` | numérico | frequência |
| `receita_total` | numérico | LTV |
| `custo_atendimento` | numérico | custo de servir |
| `ticket_medio` | numérico | valor por pedido |
| `tickets_suporte` | numérico | esforço de suporte |
| `nps` | numérico | satisfação (0–10) |
| `dias_desde_ultima_compra` | numérico | recência |
| `churn` | numérico | 1 = cancelou/inativo |

**Histórias embutidas:** ~20% dos clientes = ~74% da receita (Pareto); clientes vindos
por **Indicação** têm maior LTV e menor churn, **Meta Ads** o oposto;
mais `tickets_suporte` e menor `nps` → mais churn; perfil de churn tem recência alta.

**Perguntas sugeridas**
- "Quantos clientes eu perdi (churn)?" (value_counts / filter)
- "Qual canal traz os melhores clientes?" (group_by receita, describe_conditional + churn)
- "Quem são meus 20% que fazem 80% da receita?" (pareto)
- "Suporte e NPS influenciam o churn?" (correlation)
- "Qual o ticket médio por segmento?" (group_by / ratio)

---

### Cobertura das ferramentas
Cada uma das 15 ferramentas tem pelo menos um caso de uso natural nos 4 arquivos:
`data_profile` (todos), `aggregate`/`group_by`/`value_counts`/`top_n`/`filter`/
`describe_conditional` (todos), `trend`/`compare_periods` (vendas, marketing, produção),
`pivot`/`plot` (vendas, produção), `pareto` (vendas, produção, clientes),
`correlation`/`ratio` (todos).
