// Gera os datasets de demonstração (public/demo/*.csv).
// Determinístico: mesma seed => mesmo CSV. Rode: node scripts/generate-demo-data.mjs
//
// IMPORTANTE: o parser do app (lib/data/store.ts) divide cada linha por "," sem
// tratar vírgulas dentro de aspas. Por isso nenhum texto aqui pode conter ",".
// Números usam ponto decimal e sem separador de milhar.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo');
mkdirSync(OUT, { recursive: true });

// ── utils ──────────────────────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r, min, max) => Math.floor(r() * (max - min + 1)) + min;
const rf = (r, min, max) => r() * (max - min) + min;
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function pickW(r, pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of pairs) if ((x -= w) < 0) return v;
  return pairs[pairs.length - 1][0];
}
const f = (n, d = 2) => Number(n).toFixed(d);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function toCSV(headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n') + '\n';
}
const MESES = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`);

// ── 1) VENDAS ──────────────────────────────────────────────────────────────
// Análise: aumento de lucro. Receita cresce, mas o lucro revela onde a margem sangra.
function genVendas() {
  const r = mulberry32(1001);
  const catalog = [
    ['Fone Bluetooth', 'Eletronicos', 199, 155],
    ['Caixa de Som', 'Eletronicos', 349, 268],
    ['Smartwatch', 'Eletronicos', 599, 468],
    ['Carregador Turbo', 'Eletronicos', 89, 52],
    ['Cadeira Escritorio', 'Moveis', 899, 560],
    ['Mesa Escritorio', 'Moveis', 1290, 820],
    ['Estante', 'Moveis', 649, 410],
    ['Camiseta Basica', 'Vestuario', 79, 28],
    ['Jaqueta Jeans', 'Vestuario', 269, 110],
    ['Tenis Esportivo', 'Vestuario', 399, 175],
    ['Kit Cafe Especial', 'Alimentos', 59, 32],
    ['Cesta Organica', 'Alimentos', 129, 78],
    ['Kit Skincare', 'Beleza', 189, 62],
    ['Perfume Importado', 'Beleza', 429, 175],
  ].map(([produto, categoria, preco, custo]) => ({ produto, categoria, preco, custo }));

  const pesoCat = [['Eletronicos', 0.30], ['Moveis', 0.12], ['Vestuario', 0.20], ['Alimentos', 0.20], ['Beleza', 0.18]];
  const qty = { Eletronicos: [1, 4], Moveis: [1, 3], Vestuario: [1, 8], Alimentos: [3, 20], Beleza: [1, 6] };
  const prefixos = ['Mercado', 'Farmacia', 'Padaria', 'Restaurante', 'Loja', 'Distribuidora', 'Clinica', 'Auto Pecas', 'Supermercado', 'Boutique'];
  const sufrixos = ['Sao Jose', 'Central', 'do Vale', 'Primavera', 'Modelo', 'Boa Vista', 'Ipiranga', 'da Praia', 'do Norte', 'Aurora'];
  const clientes = [];
  for (let i = 0; i < 30; i++) clientes.push([`${prefixos[i % 10]} ${sufrixos[Math.floor(i / 10) % 10]} ${i + 1}`, 1 / Math.pow(i + 1, 0.8)]);
  const vendedores = ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Elisa Prado', 'Fabio Nunes'];
  const regioes = [['Sudeste', 0.40], ['Sul', 0.20], ['Nordeste', 0.18], ['Centro-Oeste', 0.12], ['Norte', 0.10]];
  const growth = [0.78, 0.82, 0.88, 0.90, 0.95, 0.98, 1.02, 1.03, 1.08, 1.12, 1.25, 1.45];

  const rows = [];
  let pedido = 1000;
  for (let m = 0; m < 12; m++) {
    const mes = MESES[m];
    const t = m / 11;
    const loja = Math.max(0.30, 0.60 - 0.30 * t);
    const online = 0.15 + 0.25 * t;
    const marketplace = 0.06 + 0.09 * t;
    const televendas = Math.max(0.03, 1 - loja - online - marketplace);
    const n = Math.round(34 * growth[m]);
    for (let k = 0; k < n; k++) {
      const data = `${mes}-${String(ri(r, 1, 28)).padStart(2, '0')}`;
      const canal = pickW(r, [['Loja Fisica', loja], ['Online', online], ['Marketplace', marketplace], ['Televendas', televendas]]);
      const categoria = pickW(r, pesoCat);
      const prod = pick(r, catalog.filter((p) => p.categoria === categoria));
      const qtd = ri(r, qty[categoria][0], qty[categoria][1]);
      const faixa = { 'Loja Fisica': [0, 8], Online: [5, 18], Marketplace: [8, 22], Televendas: [0, 10] }[canal];
      let desc = rf(r, faixa[0], faixa[1]);
      if (r() < 0.10) desc += rf(r, 10, 20); // promoção
      // promoções profundas em eletrônicos: viram lucro negativo (história de desperdício)
      if (categoria === 'Eletronicos' && ['Smartwatch', 'Caixa de Som'].includes(prod.produto) && r() < 0.10) desc = rf(r, 40, 48);
      desc = clamp(desc, 0, 60);
      const receita = qtd * prod.preco * (1 - desc / 100);
      const custo = qtd * prod.custo;
      rows.push({
        data, mes, pedido_id: `PED-${pedido++}`,
        cliente: pickW(r, clientes), canal,
        regiao: pickW(r, regioes), vendedor: pick(r, vendedores),
        categoria, produto: prod.produto, quantidade: qtd,
        preco_unitario: f(prod.preco), desconto_pct: f(desc, 1),
        receita: f(receita), custo_total: f(custo), lucro: f(receita - custo),
      });
    }
  }
  return toCSV(['data', 'mes', 'pedido_id', 'cliente', 'canal', 'regiao', 'vendedor', 'categoria', 'produto', 'quantidade', 'preco_unitario', 'desconto_pct', 'receita', 'custo_total', 'lucro'], rows);
}

// ── 2) MARKETING ───────────────────────────────────────────────────────────
// Análise: onde investir. ROI (ROAS) por canal e retorno decrescente com o aumento do gasto.
function genMarketing() {
  const r = mulberry32(2002);
  const canais = {
    'Google Ads': { campanhas: ['Search Institucional', 'Search Concorrentes', 'Shopping'], roas: [5.0, 5.8], spend: [7000, 18000], cpc: 2.5, ctr: 0.035, leadConv: 0.10, pedidoConv: 0.30, novoRate: 0.35 },
    'Meta Ads': { campanhas: ['Remarketing', 'Publico Frio', 'Stories'], roas: [4.2, 3.0], spend: [9000, 16000], cpc: 1.6, ctr: 0.015, leadConv: 0.08, pedidoConv: 0.22, novoRate: 0.45 },
    'TikTok Ads': { campanhas: ['TikTok Criadores', 'TikTok Lancamento'], roas: [2.3, 1.5], spend: [3000, 22000], cpc: 1.1, ctr: 0.020, leadConv: 0.05, pedidoConv: 0.12, novoRate: 0.60 },
    'Email Marketing': { campanhas: ['Newsletter Semanal', 'Base Inativos'], roas: [12.0, 10.0], spend: [800, 2500], cpc: 0.15, ctr: 0.12, leadConv: 0.15, pedidoConv: 0.40, novoRate: 0.10 },
    'Influenciadores': { campanhas: ['Micro Influencers', 'Creator Parceria'], roas: [4.0, 3.2], spend: [3000, 9000], cpc: 0.9, ctr: 0.03, leadConv: 0.07, pedidoConv: 0.18, novoRate: 0.50 },
  };
  const rows = [];
  for (let m = 0; m < 12; m++) {
    const mes = MESES[m];
    const t = m / 11;
    for (const [canal, c] of Object.entries(canais)) {
      const campanhas = c.campanhas;
      for (let ci = 0; ci < campanhas.length; ci++) {
        const share = campanhas.length === 2 ? [0.55, 0.45][ci] : [0.45, 0.30, 0.25][ci];
        const investimento = rf(r, c.spend[0], c.spend[1]) * (0.75 + 0.5 * t) * share;
        const roas = rf(r, c.roas[1], c.roas[0]); // do menor pro maior conforme t
        const receita = investimento * roas;
        const cliques = investimento / c.cpc;
        const impressoes = cliques / c.ctr;
        const leads = cliques * c.leadConv;
        const pedidos = Math.max(1, Math.round(leads * c.pedidoConv));
        const novos = Math.round(pedidos * c.novoRate);
        rows.push({
          data: `${mes}-28`, mes, canal, campanha: campanhas[ci],
          investimento: f(investimento), impressoes: Math.round(impressoes),
          cliques: Math.round(cliques), leads: Math.round(leads),
          pedidos, novos_clientes: novos, receita: f(receita),
        });
      }
    }
  }
  return toCSV(['data', 'mes', 'canal', 'campanha', 'investimento', 'impressoes', 'cliques', 'leads', 'pedidos', 'novos_clientes', 'receita'], rows);
}

// ── 3) PRODUCAO ────────────────────────────────────────────────────────────
// Análise: reduzir desperdício e paradas. Linha C / turno Noite concentram o custo do refugo.
function genProducao() {
  const r = mulberry32(3003);
  const linhas = [
    { linha: 'Linha A', produto: 'Refrigerante Cola', output: 42000, defect: 0.018, preco: 1.20, matUnit: 0.55, paradas: 3 },
    { linha: 'Linha B', produto: 'Cha Gelado', output: 36000, defect: 0.026, preco: 1.45, matUnit: 0.62, paradas: 5 },
    { linha: 'Linha C', produto: 'Suco Natural', output: 30000, defect: 0.045, preco: 1.80, matUnit: 0.70, paradas: 9 },
  ];
  const turnos = [
    { nome: 'Manha', out: 1.00, defeito: 1.00, mao: 12000 },
    { nome: 'Tarde', out: 0.95, defeito: 1.15, mao: 11500 },
    { nome: 'Noite', out: 0.85, defeito: 1.55, mao: 14500 },
  ];
  const rows = [];
  for (let m = 0; m < 12; m++) {
    const mes = MESES[m];
    for (const l of linhas) {
      for (const t of turnos) {
        const unidades = Math.round(l.output * t.out * rf(r, 0.90, 1.10));
        let paradas = rf(r, l.paradas, l.paradas + 4) + (t.nome === 'Noite' ? rf(r, 1, 3) : 0);
        paradas = Math.round(paradas * 10) / 10;
        const taxaDefeito = clamp(l.defect * t.defeito * (1 + paradas * 0.02) * rf(r, 0.85, 1.15), 0.005, 0.15);
        const defeituosas = Math.round(unidades * taxaDefeito);
        const energia = unidades * rf(r, 0.020, 0.030);
        const materia = unidades * l.matUnit * rf(r, 0.97, 1.03);
        const custoTotal = materia + t.mao + energia * 0.55;
        const custoUnit = custoTotal / unidades;
        rows.push({
          data: `${mes}-28`, mes, linha: l.linha, turno: t.nome, produto: l.produto,
          unidades_produzidas: unidades, unidades_defeituosas: defeituosas,
          horas_paradas: f(paradas, 1), energia_kwh: f(energia),
          custo_materia_prima: f(materia), custo_mao_obra: f(t.mao),
          custo_total: f(custoTotal), valor_producao: f((unidades - defeituosas) * l.preco),
          custo_desperdicio: f(defeituosas * custoUnit),
        });
      }
    }
  }
  return toCSV(['data', 'mes', 'linha', 'turno', 'produto', 'unidades_produzidas', 'unidades_defeituosas', 'horas_paradas', 'energia_kwh', 'custo_materia_prima', 'custo_mao_obra', 'custo_total', 'valor_producao', 'custo_desperdicio'], rows);
}

// ── 4) CLIENTES ────────────────────────────────────────────────────────────
// Análise: reter os melhores. Pareto de receita + churn ligado a suporte e canal de aquisição.
function genClientes() {
  const r = mulberry32(4004);
  const prefixos = ['Mercado', 'Farmacia', 'Padaria', 'Restaurante', 'Loja', 'Distribuidora', 'Clinica', 'Auto Pecas', 'Supermercado', 'Boutique', 'Pizzaria', 'Academia', 'Escritorio', 'Hotel', 'Livraria', 'Petshop', 'Barbearia', 'Otica', 'Confeitaria', 'Cafeteria'];
  const sufrixos = ['Sao Jose', 'Central', 'do Vale', 'Primavera', 'Modelo', 'Boa Vista', 'Ipiranga', 'da Praia', 'do Norte', 'Aurora'];
  const canais = [['Indicacao', 0.22], ['Google Ads', 0.28], ['Meta Ads', 0.24], ['Evento', 0.12], ['Venda Direta', 0.14]];
  const canalLtv = { Indicacao: 1.40, 'Venda Direta': 1.15, 'Google Ads': 1.00, Evento: 1.05, 'Meta Ads': 0.80 };
  const segmentos = [['Pequeno', 0.55], ['Medio', 0.30], ['Grande', 0.15]];
  const regioes = [['Sudeste', 0.40], ['Sul', 0.20], ['Nordeste', 0.18], ['Centro-Oeste', 0.12], ['Norte', 0.10]];

  const rows = [];
  for (let i = 0; i < 200; i++) {
    const nome = `${prefixos[i % 20]} ${sufrixos[Math.floor(i / 20)]}`;
    const segmento = pickW(r, segmentos);
    const canal = pickW(r, canais);
    const regiao = pickW(r, regioes);
    const meses = ri(r, 3, 72);
    const ticketBase = { Pequeno: rf(r, 250, 900), Medio: rf(r, 900, 3000), Grande: rf(r, 3000, 12000) }[segmento];
    const ticket = ticketBase * canalLtv[canal] * rf(r, 0.9, 1.1);
    const freq = { Pequeno: rf(r, 0.2, 0.7), Medio: rf(r, 0.4, 0.9), Grande: rf(r, 0.6, 1.2) }[segmento];
    const pedidos = Math.max(1, Math.round(meses * freq));
    const receita = pedidos * ticket;
    const tickets = Math.max(0, Math.round(rf(r, 0, 6) + (segmento === 'Grande' ? 4 : 0) + (r() < 0.15 ? ri(r, 4, 10) : 0)));
    const nps = clamp(Math.round(8.8 - tickets * 0.35 - rf(r, 0, 2)), 0, 10);
    let risco = 0.10;
    if (canal === 'Meta Ads') risco += 0.18;
    if (canal === 'Evento') risco += 0.06;
    if (canal === 'Indicacao') risco -= 0.06;
    risco += Math.min(0.35, tickets * 0.05);
    risco += (7 - nps) * 0.04;
    risco += Math.max(0, 18 - meses) * 0.004;
    const churn = r() < clamp(risco, 0.02, 0.85) ? 1 : 0;
    const dias = churn ? ri(r, 120, 400) : ri(r, 1, 90);
    const custoAtendimento = rf(r, 30, 120) + tickets * rf(r, 25, 60);
    const cadastro = new Date(Date.UTC(2024, 11, 31));
    cadastro.setUTCMonth(cadastro.getUTCMonth() - meses);
    rows.push({
      cliente_id: `CLI-${String(i + 1).padStart(3, '0')}`, nome, segmento, regiao,
      canal_aquisicao: canal, data_cadastro: cadastro.toISOString().slice(0, 10),
      meses_como_cliente: meses, pedidos_total: pedidos, receita_total: f(receita),
      custo_atendimento: f(custoAtendimento), ticket_medio: f(ticket),
      tickets_suporte: tickets, nps, dias_desde_ultima_compra: dias, churn,
    });
  }
  return toCSV(['cliente_id', 'nome', 'segmento', 'regiao', 'canal_aquisicao', 'data_cadastro', 'meses_como_cliente', 'pedidos_total', 'receita_total', 'custo_atendimento', 'ticket_medio', 'tickets_suporte', 'nps', 'dias_desde_ultima_compra', 'churn'], rows);
}

// ── run ────────────────────────────────────────────────────────────────────
const files = {
  'vendas.csv': genVendas(),
  'marketing.csv': genMarketing(),
  'producao.csv': genProducao(),
  'clientes.csv': genClientes(),
};
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(OUT, name), content, 'utf-8');
  console.log(`${name}: ${content.trim().split('\n').length - 1} linhas`);
}
