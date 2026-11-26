// ARQUIVO GERADO por dev/montar-funcao.py — edite logica.ts / index.ts e gere de novo.
// Cole TODO este conteúdo na função "api" do Supabase (Edge Functions).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// =====================================================================
//  CRM Lara Altoé — regras do servidor (Supabase Edge Function "api")
//
//  Este arquivo não importa nada: recebe o "banco" (db) e o "login" (auth)
//  prontos. Assim ele roda igual no Supabase (Deno) e nos testes (Node +
//  Postgres local). As regras são as mesmas da versão Google Apps Script.
// =====================================================================

// ------------------------------------------------------------------ tipos
export type Linha = Record<string, any>;
export type Filtro = {
  eq?: Linha; neq?: Linha; gte?: Linha; gt?: Linha; lte?: Linha; lt?: Linha;
  in?: Record<string, any[]>; contem?: Linha; cols?: string[];
  ordem?: string; desc?: boolean; limite?: number;
};
export interface Db {
  sel(tabela: string, f?: Filtro): Promise<Linha[]>;
  um(tabela: string, id: string): Promise<Linha | null>;
  ins(tabela: string, obj: Linha): Promise<Linha>;
  upd(tabela: string, id: string, patch: Linha): Promise<Linha>;
  updOnde(tabela: string, eq: Linha, patch: Linha): Promise<void>;
  del(tabela: string, id: string): Promise<void>;
  upsert(tabela: string, obj: Linha, chave: string): Promise<void>;
}
export interface AuthAdmin {
  criar(email: string, senha: string): Promise<string>;
  senha(id: string, senha: string): Promise<void>;
  email(id: string, email: string): Promise<void>;
  bloquear(id: string, bloquear: boolean): Promise<void>;
  excluir(id: string): Promise<void>;
  emails(): Promise<Record<string, string>>;
}
export type Sessao = { id: string; nome: string; perfil: string; email: string; trocarSenha: boolean };
export type Ctx = { db: Db; auth: AuthAdmin; sess: Sessao; memo: Linha };

export const VERSAO = '2.0.0';

// ------------------------------------------------------------------ erros
export class ErroUsuario extends Error {
  dados: any;
  constructor(msg: string, dados?: any) { super(msg); this.dados = dados; }
}
const erro = (msg: string, dados?: any) => new ErroUsuario(msg, dados);

// ------------------------------------------------------------------ relógio (horário do studio)
const TZ = 'America/Sao_Paulo';
let relogio = () => new Date();
export function setRelogio(fn: () => Date) { relogio = fn; }
export function local(d: Date): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const o: Linha = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}:${o.second}`;
}
export const agora = () => local(relogio());
export const hoje = () => agora().slice(0, 10);
const ms = (s: string) => { s = String(s || ''); if (s.length === 10) s += 'T00:00'; return Date.parse(s.slice(0, 16) + ':00Z'); };
const fmt = (v: number) => new Date(v).toISOString().slice(0, 16);
export const addMin = (s: string, m: number) => fmt(ms(s) + m * 60000);
export const diffMin = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 60000);
const diaDaSemana = (s: string) => new Date(ms(s)).getUTCDay();
export function addMeses(d: string, n: number): string {
  const p = d.split('-').map(Number);
  let y = p[0], m = p[1] - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  const ult = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${pad2(m + 1)}-${pad2(Math.min(p[2], ult))}`;
}
const pad2 = (n: number) => (n < 10 ? '0' : '') + n;
/** Corrige datas que não existem (ex.: 31/11 → 30/11), que o Postgres recusaria. */
export function dataOk(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  if (!m) return d;
  const ult = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return `${m[1]}-${m[2]}-${pad2(Math.min(Number(m[3]), ult))}`;
}

// ------------------------------------------------------------------ utilidades
export function num(v: any): number {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
export function fone(t: any): string {
  let d = String(t || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}
export function foneChave(t: any): string {
  let d = fone(t);
  if (d.indexOf('55') === 0 && d.length >= 12) d = d.slice(2);
  if (d.length < 10) return d;
  return d.slice(0, 2) + d.slice(-8);
}
const liquido = (a: Linha) => num(a.valor) - num(a.desconto);
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const STATUS_ATIVOS = ['agendado', 'confirmado', 'remarcar'];

// ------------------------------------------------------------------ banco: nomes e tipos das colunas
export const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const NUMERICAS = new Set(['valor', 'desconto', 'sinal', 'preco', 'custo', 'duracao', 'comissao', 'visitas', 'total', 'faltas']);
const JSONS = new Set(['servicos', 'origem']);
const COM_FUSO = new Set(['criado_em', 'atualizado_em', 'ultimo_acesso']);
const SEM_FUSO = new Set(['inicio', 'fim', 'ultima', 'proxima']);

/** Linha do banco → objeto do CRM (camelCase, vazios como '' e 0, horários locais). */
export function doBanco(tabela: string, r: Linha): Linha {
  const o: Linha = {};
  for (const k of Object.keys(r)) {
    let v = r[k];
    const ck = camel(k);
    if (tabela === 'config' && k === 'valor') { o.valor = v; continue; }
    if (JSONS.has(k)) { o[ck] = typeof v === 'string' ? JSON.parse(v) : v; continue; }
    if (NUMERICAS.has(k)) { o[ck] = v === null || v === undefined ? 0 : Number(v); continue; }
    if (k === 'ativo') { o[ck] = v === false ? 'nao' : 'sim'; continue; }
    if (k === 'trocar_senha') { o[ck] = !!v; continue; }
    if (v === null || v === undefined) { o[ck] = ''; continue; }
    if (v instanceof Date) v = v.toISOString();
    if (tabela === 'mensagens' && k === 'data') v = local(new Date(v));
    else if (COM_FUSO.has(k)) v = local(new Date(v));
    else if (SEM_FUSO.has(k)) v = String(v).replace(' ', 'T').slice(0, 19);
    else if (/^\d{4}-\d{2}-\d{2}/.test(String(v)) && String(v).length > 10 && (k === 'data' || k === 'vencimento' || k === 'nascimento')) v = String(v).slice(0, 10);
    o[ck] = typeof v === 'object' ? v : String(v);
  }
  return o;
}

/** Objeto do CRM → linha do banco (snake_case, '' vira null). */
export function paraBanco(tabela: string, o: Linha): Linha {
  const r: Linha = {};
  for (const k of Object.keys(o)) {
    if (k === 'id' && !o[k]) continue;
    const sk = snake(k);
    let v = o[k];
    if (tabela === 'config' && k === 'valor') { r.valor = v; continue; }
    if (sk === 'ativo') v = !(v === 'nao' || v === false);
    else if (JSONS.has(sk)) v = typeof v === 'string' ? (v ? JSON.parse(v) : null) : v;
    else if (v === '' || v === undefined) v = null;
    r[sk] = v;
  }
  return r;
}

// ------------------------------------------------------------------ configurações
export const CFG_PADRAO: Linha = {
  studioNome: 'Lara Altoé Makeup & Beauty', responsavel: '', telefone: '', endereco: '', instagram: '', pix: '',
  calendarAtivo: false, calendarId: 'primary', mostrarEventosGoogle: true, lembreteAgendaMin: 60,
  horaAbertura: '08:00', horaFechamento: '20:00', intervaloAgenda: 15, diasInativa: 60, sinalRetido: true,
  categoriasServico: ['Maquiagem', 'Sobrancelha', 'Penteado', 'Cílios', 'Noivas & Eventos', 'Outros'],
  categoriasReceita: ['Serviços', 'Sinal / Reserva', 'Venda de produtos', 'Cursos e workshops', 'Outras receitas'],
  categoriasDespesa: ['Produtos e insumos', 'Aluguel', 'Energia, água e internet', 'Marketing e anúncios',
    'Comissões', 'Equipamentos', 'Taxas de cartão', 'Impostos (MEI/DAS)', 'Pró-labore', 'Transporte', 'Outras despesas'],
  formasPagamento: ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Outro'],
  locais: ['Studio', 'Domicílio', 'Evento / Salão de festa'],
  wa: { ativo: false, confirmacao: true },
  templates: {
    confirmacao: 'Olá, {nome}! 💖\n\nSeu horário no *{studio}* está agendado:\n\n📅 {diaSemana}, {data} às {hora}\n✨ {servico}\n📍 {endereco}\n\nQualquer dúvida é só chamar por aqui!',
    lembrete1: 'Oi, {nome}! Tudo bem? ✨\n\nPassando para lembrar do seu horário:\n\n📅 {diaSemana}, {data} às {hora}\n💄 {servico}\n📍 {endereco}\n\nResponda *1* para CONFIRMAR ou *2* se precisar remarcar. 💕',
    aniversario: 'Feliz aniversário, {nome}! 🎉🎂\nO *{studio}* te deseja um dia lindo! Como presente, você tem um mimo especial no seu próximo atendimento este mês. 💝',
    reativacao: 'Oi, {nome}! Que saudade! 💖 Faz um tempinho que você não vem ao *{studio}*. Que tal agendar um horário essa semana? ✨'
  }
};

async function cfg(ctx: Ctx): Promise<Linha> {
  if (ctx.memo.cfg) return ctx.memo.cfg;
  const r = await ctx.db.sel('config', { eq: { chave: 'cfg' } });
  const salvo = (r[0] && r[0].valor) || {};
  const c = Object.assign({}, CFG_PADRAO, salvo);
  c.wa = Object.assign({}, CFG_PADRAO.wa, salvo.wa || {});
  c.templates = Object.assign({}, CFG_PADRAO.templates, salvo.templates || {});
  ctx.memo.cfg = c;
  return c;
}
async function cfgGravar(ctx: Ctx, c: Linha) {
  await ctx.db.upsert('config', { chave: 'cfg', valor: c, atualizadoEm: new Date().toISOString() }, 'chave');
  ctx.memo.cfg = null;
}
function cfgPublica(c: Linha) {
  return {
    studioNome: c.studioNome, responsavel: c.responsavel, telefone: c.telefone, endereco: c.endereco,
    instagram: c.instagram, pix: c.pix,
    calendarAtivo: false, mostrarEventosGoogle: false,           // Google Agenda: fase 3
    horaAbertura: c.horaAbertura, horaFechamento: c.horaFechamento, intervaloAgenda: c.intervaloAgenda,
    diasInativa: c.diasInativa, sinalRetido: c.sinalRetido !== false,
    categoriasServico: c.categoriasServico, categoriasReceita: c.categoriasReceita,
    categoriasDespesa: c.categoriasDespesa, formasPagamento: c.formasPagamento, locais: c.locais,
    waAtivo: false, waConfirmacao: false,                         // WhatsApp automático: fase 4
    templates: { reativacao: c.templates.reativacao, aniversario: c.templates.aniversario, confirmacao: c.templates.confirmacao, lembrete1: c.templates.lembrete1 },
    recursos: { google: false, whatsapp: false, importar: false }
  };
}

async function cfgObter(_p: Linha, ctx: Ctx) {
  return { cfg: await cfg(ctx), planilhaUrl: '', versao: VERSAO };
}
async function cfgSalvar(p: Linha, ctx: Ctx) {
  const c = JSON.parse(JSON.stringify(await cfg(ctx)));
  const permitidos = ['studioNome', 'responsavel', 'telefone', 'endereco', 'instagram', 'pix',
    'horaAbertura', 'horaFechamento', 'intervaloAgenda', 'diasInativa', 'sinalRetido',
    'categoriasServico', 'categoriasReceita', 'categoriasDespesa', 'formasPagamento', 'locais'];
  for (const k of permitidos) {
    if (p[k] === undefined) continue;
    let v = p[k];
    if (Array.isArray(CFG_PADRAO[k])) {
      v = (Array.isArray(v) ? v : String(v).split(/\n|,/)).map((s: any) => String(s).trim()).filter(Boolean);
      if (!v.length) v = CFG_PADRAO[k];
    } else if (typeof CFG_PADRAO[k] === 'number') v = num(v);
    else if (typeof CFG_PADRAO[k] === 'boolean') v = v === true || v === 'true' || v === 'sim';
    else v = String(v).trim();
    c[k] = v;
  }
  await cfgGravar(ctx, c);
  return cfgPublica(await cfg(ctx));
}

// ------------------------------------------------------------------ carga inicial
async function boot(_p: Linha, ctx: Ctx) {
  const [c, servicos, equipe, clientes] = await Promise.all([
    cfg(ctx),
    ctx.db.sel('servicos', { ordem: 'nome' }),
    ctx.db.sel('profissionais', { ordem: 'nome' }),
    ctx.db.sel('clientes', { cols: ['id', 'nome', 'telefone', 'nascimento'], ordem: 'nome' })
  ]);
  ctx.db.upd('perfis', ctx.sess.id, { ultimoAcesso: new Date().toISOString() }).catch(() => {});
  return { user: ctx.sess, versao: VERSAO, cfg: cfgPublica(c), servicos, equipe, clientes };
}

// ------------------------------------------------------------------ clientes
async function cliListar(_p: Linha, ctx: Ctx) {
  const [clientes, stats] = await Promise.all([ctx.db.sel('clientes'), ctx.db.sel('vw_cliente_stats')]);
  const por: Linha = {};
  for (const s of stats) por[s.clienteId] = s;
  return clientes.map((c) => {
    const s = por[c.id] || {};
    return Object.assign(c, { visitas: num(s.visitas), totalGasto: round2(num(s.total)), ultimaVisita: s.ultima || '',
      proxima: s.proxima || '', faltas: num(s.faltas) });
  }).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

async function cliObter(p: Linha, ctx: Ctx) {
  const c = await ctx.db.um('clientes', p.id);
  if (!c) throw erro('Cliente não encontrada.');
  const [ags, equipe, msgs] = await Promise.all([
    ctx.db.sel('agendamentos', { eq: { clienteId: c.id }, ordem: 'inicio', desc: true }),
    ctx.db.sel('profissionais'),
    ctx.db.sel('mensagens', { eq: { clienteId: c.id }, ordem: 'data', desc: true, limite: 30 })
  ]);
  const nomes: Linha = {};
  for (const e of equipe) nomes[e.id] = e.nome;
  const hist = ags.map((a) => ({ id: a.id, inicio: a.inicio, servicoNomes: a.servicoNomes, status: a.status,
    valor: liquido(a), profissional: nomes[a.profissionalId] || '' }));
  const concl = hist.filter((h) => h.status === 'concluido');
  const total = concl.reduce((s, h) => s + h.valor, 0);
  c.resumo = {
    visitas: concl.length, totalGasto: round2(total), ticketMedio: concl.length ? round2(total / concl.length) : 0,
    ultimaVisita: concl.length ? concl[0].inicio : '',
    faltas: hist.filter((h) => h.status === 'faltou').length,
    cancelamentos: hist.filter((h) => h.status === 'cancelado').length
  };
  c.historico = hist;
  c.mensagens = msgs;
  return c;
}

async function cliSalvar(p: Linha, ctx: Ctx) {
  const nome = String(p.nome || '').trim();
  if (!nome) throw erro('Informe o nome da cliente.');
  const tel = fone(p.telefone);
  if (tel && (tel.length < 12 || tel.length > 13)) throw erro('Telefone inválido. Use DDD + número, ex.: (11) 98765-4321');
  if (tel && !p.forcar) {
    const k = foneChave(tel);
    const todos = await ctx.db.sel('clientes', { cols: ['id', 'nome', 'telefone'] });
    const dup = todos.find((c) => c.id !== p.id && c.telefone && foneChave(c.telefone) === k);
    if (dup) throw erro('Já existe uma cliente com esse telefone: ' + dup.nome, { duplicada: dup.id });
  }
  const campos = ['email', 'nascimento', 'instagram', 'origem', 'tags', 'tipoPele', 'tomBase', 'alergias',
    'sobrancelha', 'anamnese', 'observacoes'];
  const dados: Linha = { nome, telefone: tel };
  for (const k of campos) if (p[k] !== undefined) dados[k] = String(p[k] || '').trim();
  let r;
  if (p.id) {
    const antigo = await ctx.db.um('clientes', p.id);
    r = await ctx.db.upd('clientes', p.id, dados);
    if (antigo && (antigo.nome !== nome || antigo.telefone !== tel)) {
      await ctx.db.updOnde('agendamentos', { clienteId: p.id }, { clienteNome: nome, telefone: tel });
    }
  } else {
    r = await ctx.db.ins('clientes', dados);
  }
  return { id: r.id, nome: r.nome, telefone: r.telefone, nascimento: r.nascimento };
}

async function cliExcluir(p: Linha, ctx: Ctx) {
  const futuros = await ctx.db.sel('agendamentos', { eq: { clienteId: p.id }, in: { status: STATUS_ATIVOS }, gte: { inicio: agora().slice(0, 16) } });
  if (futuros.length) throw erro('Essa cliente tem horários futuros. Cancele-os antes de excluir.');
  await ctx.db.del('clientes', p.id);
  return true;
}

// ------------------------------------------------------------------ serviços e equipe
async function srvSalvar(p: Linha, ctx: Ctx) {
  if (!String(p.nome || '').trim()) throw erro('Informe o nome do serviço.');
  const dados = {
    nome: String(p.nome).trim(), categoria: p.categoria || 'Outros',
    duracao: Math.max(5, Math.round(num(p.duracao) || 60)), preco: round2(num(p.preco)),
    custo: round2(num(p.custo)), cor: p.cor || '#0f7f7c', descricao: p.descricao || '',
    ativo: p.ativo === 'nao' ? 'nao' : 'sim'
  };
  return p.id ? ctx.db.upd('servicos', p.id, dados) : ctx.db.ins('servicos', dados);
}
async function srvExcluir(p: Linha, ctx: Ctx) {
  const usado = await ctx.db.sel('agendamentos', { contem: { servicos: [{ id: p.id }] }, limite: 1, cols: ['id'] });
  if (usado.length) { await ctx.db.upd('servicos', p.id, { ativo: 'nao' }); return { desativado: true }; }
  await ctx.db.del('servicos', p.id);
  return { excluido: true };
}
async function profSalvar(p: Linha, ctx: Ctx) {
  if (!String(p.nome || '').trim()) throw erro('Informe o nome da profissional.');
  const dados = {
    nome: String(p.nome).trim(), telefone: fone(p.telefone),
    comissao: Math.min(100, Math.max(0, num(p.comissao))), cor: p.cor || '#9c8074',
    ativo: p.ativo === 'nao' ? 'nao' : 'sim'
  };
  return p.id ? ctx.db.upd('profissionais', p.id, dados) : ctx.db.ins('profissionais', dados);
}
async function profExcluir(p: Linha, ctx: Ctx) {
  const usado = await ctx.db.sel('agendamentos', { eq: { profissionalId: p.id }, limite: 1, cols: ['id'] });
  if (usado.length) { await ctx.db.upd('profissionais', p.id, { ativo: 'nao' }); return { desativado: true }; }
  await ctx.db.del('profissionais', p.id);
  return { excluido: true };
}

// ------------------------------------------------------------------ agenda
async function mapas(ctx: Ctx, clienteIds?: string[]) {
  const ids = clienteIds ? [...new Set(clienteIds.filter(Boolean))] : null;
  const [clientes, equipe] = await Promise.all([
    ids ? (ids.length ? ctx.db.sel('clientes', { in: { id: ids }, cols: ['id', 'nome', 'telefone'] }) : Promise.resolve([])) : ctx.db.sel('clientes', { cols: ['id', 'nome', 'telefone'] }),
    ctx.db.sel('profissionais')
  ]);
  const m: Linha = { clientes: {}, equipe: {} };
  for (const c of clientes) m.clientes[c.id] = c;
  for (const e of equipe) m.equipe[e.id] = e;
  return m;
}
function agView(a: Linha, m: Linha) {
  const cli = m.clientes[a.clienteId] || {};
  const prof = m.equipe[a.profissionalId] || {};
  const servs = a.servicos || [];
  return {
    id: a.id, clienteId: a.clienteId, clienteNome: cli.nome || a.clienteNome, telefone: cli.telefone || a.telefone,
    servicos: servs, servicoNomes: a.servicoNomes, categoria: (servs[0] && servs[0].categoria) || '',
    cor: (prof.cor && m.porProfissional) ? prof.cor : ((servs[0] && servs[0].cor) || '#0f7f7c'),
    profissionalId: a.profissionalId, profissionalNome: prof.nome || '',
    inicio: a.inicio.slice(0, 16), fim: a.fim.slice(0, 16), status: a.status,
    valor: num(a.valor), desconto: num(a.desconto), sinal: num(a.sinal),
    local: a.local, observacoes: a.observacoes, syncStatus: a.syncStatus,
    confirmEnviada: a.confirmEnviada, lembrete1Enviado: a.lembrete1Enviado, lembrete2Enviado: a.lembrete2Enviado,
    formaPagamento: a.formaPagamento, lancamentoId: a.lancamentoId, importado: !!a.origem
  };
}

async function agListar(p: Linha, ctx: Ctx) {
  const ini = dataOk(String(p.inicio || hoje()).slice(0, 10));
  const fim = dataOk(String(p.fim || ini).slice(0, 10));
  const f: Filtro = { gte: { inicio: ini + 'T00:00' }, lte: { inicio: fim + 'T23:59:59' }, ordem: 'inicio' };
  if (!p.incluirCancelados) f.neq = { status: 'cancelado' };
  const ags = await ctx.db.sel('agendamentos', f);
  const m = await mapas(ctx, ags.map((a) => a.clienteId));
  m.porProfissional = !!p.corPorProfissional;
  return { agendamentos: ags.map((a) => agView(a, m)), externos: [] };
}

async function agObter(p: Linha, ctx: Ctx) {
  const a = await ctx.db.um('agendamentos', p.id);
  if (!a) throw erro('Agendamento não encontrado.');
  const v: Linha = agView(a, await mapas(ctx, [a.clienteId]));
  v.financeiro = await finResumoAgendamento(a.id, ctx);
  return v;
}

async function agSalvar(p: Linha, ctx: Ctx) {
  let clienteId = p.clienteId;
  if (!clienteId && p.novaCliente && p.novaCliente.nome) {
    clienteId = (await cliSalvar({ nome: p.novaCliente.nome, telefone: p.novaCliente.telefone, forcar: true }, ctx)).id;
  }
  const cli = clienteId ? await ctx.db.um('clientes', clienteId) : null;
  if (!cli) throw erro('Selecione a cliente.');

  const ids = (p.servicoIds || []).filter(Boolean);
  if (!ids.length) throw erro('Selecione pelo menos um serviço.');
  const todosServ = await ctx.db.sel('servicos', { in: { id: ids } });
  const servs = ids.map((id: string) => {
    const s = todosServ.find((x) => x.id === id);
    if (!s) throw erro('Serviço não encontrado.');
    return { id: s.id, nome: s.nome, categoria: s.categoria, preco: num(s.preco), duracao: num(s.duracao), cor: s.cor };
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || '') || !/^\d{2}:\d{2}$/.test(p.hora || '')) throw erro('Informe data e horário.');
  const duracao = Math.round(num(p.duracao)) || servs.reduce((s: number, x: Linha) => s + x.duracao, 0) || 60;
  const inicio = p.data + 'T' + p.hora;
  const fim = addMin(inicio, duracao);
  const valor = (p.valor !== undefined && p.valor !== '' && p.valor !== null) ? round2(num(p.valor)) : servs.reduce((s: number, x: Linha) => s + x.preco, 0);

  if (!p.forcar) {
    const doDia = await ctx.db.sel('agendamentos', { gte: { inicio: addMin(inicio, -24 * 60) }, lt: { inicio: fim }, in: { status: STATUS_ATIVOS } });
    const conflito = doDia.find((a) => {
      if (a.id === p.id) return false;
      if (p.profissionalId && a.profissionalId && a.profissionalId !== p.profissionalId) return false;
      return a.inicio.slice(0, 16) < fim && a.fim.slice(0, 16) > inicio;
    });
    if (conflito) {
      throw erro('Esse horário conflita com ' + (conflito.clienteNome || 'outra cliente') + ' (' +
        conflito.inicio.slice(11, 16) + '–' + conflito.fim.slice(11, 16) + '). Deseja agendar mesmo assim?', { conflito: true });
    }
  }

  const dados: Linha = {
    clienteId: cli.id, clienteNome: cli.nome, telefone: cli.telefone,
    servicos: servs, servicoNomes: servs.map((s: Linha) => s.nome).join(' + '),
    profissionalId: p.profissionalId || '', inicio, fim,
    valor, desconto: round2(num(p.desconto)), sinal: round2(num(p.sinal)),
    local: p.local || 'Studio', observacoes: p.observacoes || ''
  };

  const antigo = p.id ? await ctx.db.um('agendamentos', p.id) : null;
  let a: Linha;
  if (antigo) {
    dados.status = p.status || antigo.status;
    if (antigo.inicio.slice(0, 16) !== inicio) {
      dados.lembrete1Enviado = ''; dados.lembrete2Enviado = '';
      if (dados.status === 'remarcar') dados.status = 'agendado';
    }
    a = await ctx.db.upd('agendamentos', antigo.id, dados);
  } else {
    dados.status = p.status || 'agendado';
    a = await ctx.db.ins('agendamentos', dados);
  }

  if (dados.sinal > 0 && !(antigo && num(antigo.sinal) === dados.sinal)) {
    await finSinal(a, p.formaSinal || 'Pix', ctx);
  } else if (!dados.sinal && antigo && num(antigo.sinal) > 0) {
    for (const l of await finDoAgendamento(a.id, ctx)) if (l.categoria === 'Sinal / Reserva') await ctx.db.del('financeiro', l.id);
  }
  if (antigo && antigo.status === 'concluido') {
    if (a.status === 'concluido') {
      const lancServ = (await finDoAgendamento(a.id, ctx)).find((l) => l.categoria === 'Serviços');
      const novo = await finDoAtendimento(a, a.formaPagamento || (lancServ && lancServ.forma) || 'Pix', !lancServ || lancServ.status === 'pago', ctx);
      a = await ctx.db.upd('agendamentos', a.id, { lancamentoId: novo ? novo.id : '' });
    } else {
      if (a.status === 'cancelado') await agTratarFinanceiro(a.id, p.financeiro, ctx);
      else for (const l of await finDoAgendamento(a.id, ctx)) if (l.categoria === 'Serviços') await ctx.db.del('financeiro', l.id);
      a = await ctx.db.upd('agendamentos', a.id, { lancamentoId: '', formaPagamento: '' });
    }
  } else if (antigo && a.status === 'cancelado' && antigo.status !== 'cancelado') {
    await agTratarFinanceiro(a.id, p.financeiro, ctx);
  }

  const v: Linha = agView(a, await mapas(ctx, [a.clienteId]));
  v.aviso = '';
  return v;
}

/** O que fazer com o dinheiro já lançado quando o atendimento sai da agenda (ver versão Apps Script). */
async function agTratarFinanceiro(agId: string, financeiro: string, ctx: Ctx) {
  const c = await cfg(ctx);
  const reterSinal = c.sinalRetido !== false;
  const ag = (await ctx.db.um('agendamentos', agId)) || {};
  for (const l of await finDoAgendamento(agId, ctx)) {
    const pago = l.status === 'pago';
    const ehSinal = l.categoria === 'Sinal / Reserva';
    const fica = financeiro === 'manter' ? pago : financeiro === 'remover' ? false : (pago && ehSinal && reterSinal);
    if (!fica) { await ctx.db.del('financeiro', l.id); continue; }
    if (ehSinal && !/^Sinal retido/.test(l.descricao)) {
      await ctx.db.upd('financeiro', l.id, { descricao: 'Sinal retido (cancelou) — ' + String(ag.clienteNome || '').trim() });
    }
  }
}

async function agStatus(p: Linha, ctx: Ctx) {
  const validos = ['agendado', 'confirmado', 'faltou', 'cancelado', 'remarcar', 'concluido'];
  if (validos.indexOf(p.status) < 0) throw erro('Status inválido.');
  const a = await ctx.db.um('agendamentos', p.id);
  if (!a) throw erro('Agendamento não encontrado.');
  const patch: Linha = { status: p.status };
  if (p.status === 'cancelado') {
    await agTratarFinanceiro(a.id, p.financeiro, ctx);
    patch.lancamentoId = ''; patch.formaPagamento = '';
  } else if (a.status === 'concluido' && p.status !== 'concluido') {
    for (const l of await finDoAgendamento(a.id, ctx)) if (l.categoria === 'Serviços') await ctx.db.del('financeiro', l.id);
    patch.lancamentoId = ''; patch.formaPagamento = '';
  }
  const n = await ctx.db.upd('agendamentos', a.id, patch);
  return agView(n, await mapas(ctx, [n.clienteId]));
}

async function agFinalizar(p: Linha, ctx: Ctx) {
  let a = await ctx.db.um('agendamentos', p.id);
  if (!a) throw erro('Agendamento não encontrado.');
  const valor = round2(num(p.valor !== undefined ? p.valor : a.valor));
  const desconto = round2(num(p.desconto !== undefined ? p.desconto : a.desconto));
  const forma = p.forma || 'Pix';
  a = await ctx.db.upd('agendamentos', a.id, { status: 'concluido', valor, desconto, formaPagamento: forma });
  const lanc = await finDoAtendimento(a, forma, p.pago !== false, ctx);
  a = await ctx.db.upd('agendamentos', a.id, { lancamentoId: lanc ? lanc.id : '' });
  return agView(a, await mapas(ctx, [a.clienteId]));
}

async function agExcluir(p: Linha, ctx: Ctx) {
  const a = await ctx.db.um('agendamentos', p.id);
  if (!a) return true;
  await agTratarFinanceiro(a.id, p.financeiro, ctx);
  await ctx.db.del('agendamentos', a.id);
  return true;
}

// ------------------------------------------------------------------ financeiro
const finDoAgendamento = (agId: string, ctx: Ctx) => ctx.db.sel('financeiro', { eq: { agendamentoId: agId } });

async function finResumoAgendamento(agId: string, ctx: Ctx) {
  const itens = await finDoAgendamento(agId, ctx);
  const soma = (fn: (l: Linha) => boolean) => round2(itens.filter(fn).reduce((s, l) => s + num(l.valor), 0));
  return {
    pago: soma((l) => l.status === 'pago'),
    pendente: soma((l) => l.status !== 'pago'),
    sinal: soma((l) => l.categoria === 'Sinal / Reserva' && l.status === 'pago'),
    itens: itens.map((l) => ({ categoria: l.categoria, valor: num(l.valor), status: l.status }))
  };
}

async function finSinal(a: Linha, forma: string, ctx: Ctx) {
  const existente = (await finDoAgendamento(a.id, ctx)).find((l) => l.categoria === 'Sinal / Reserva');
  const dados = {
    data: hoje(), tipo: 'receita', categoria: 'Sinal / Reserva', descricao: 'Sinal — ' + a.clienteNome,
    valor: num(a.sinal), forma, status: 'pago', agendamentoId: a.id, clienteId: a.clienteId, profissionalId: a.profissionalId
  };
  return existente ? ctx.db.upd('financeiro', existente.id, dados) : ctx.db.ins('financeiro', dados);
}

async function finDoAtendimento(a: Linha, forma: string, pago: boolean, ctx: Ctx) {
  const lancs = await finDoAgendamento(a.id, ctx);
  const sinal = lancs.filter((l) => l.categoria === 'Sinal / Reserva').reduce((s, l) => s + num(l.valor), 0);
  const restante = round2(num(a.valor) - num(a.desconto) - sinal);
  const existente = lancs.find((l) => l.categoria === 'Serviços');
  if (restante <= 0) { if (existente) await ctx.db.del('financeiro', existente.id); return null; }
  const dados = {
    data: a.inicio.slice(0, 10), tipo: 'receita', categoria: 'Serviços', descricao: a.servicoNomes + ' — ' + a.clienteNome,
    valor: restante, forma, status: pago ? 'pago' : 'pendente', vencimento: pago ? '' : a.inicio.slice(0, 10),
    agendamentoId: a.id, clienteId: a.clienteId, profissionalId: a.profissionalId
  };
  return existente ? ctx.db.upd('financeiro', existente.id, dados) : ctx.db.ins('financeiro', dados);
}

async function finListar(p: Linha, ctx: Ctx) {
  const ini = dataOk(String(p.inicio || hoje().slice(0, 8) + '01').slice(0, 10));
  const fim = dataOk(String(p.fim || addMeses(ini, 1)).slice(0, 10));
  const [porData, porVenc] = await Promise.all([
    ctx.db.sel('financeiro', { gte: { data: ini }, lte: { data: fim } }),
    ctx.db.sel('financeiro', { eq: { status: 'pendente' }, gte: { vencimento: ini }, lte: { vencimento: fim } })
  ]);
  const vistos: Linha = {};
  const brutos = porData.concat(porVenc).filter((l) => (vistos[l.id] ? false : (vistos[l.id] = true)));
  const lista0 = brutos.filter((l) => {
    const d = l.status === 'pendente' && l.vencimento ? l.vencimento : l.data;
    return d >= ini && d <= fim;
  });
  const cliIds = [...new Set(lista0.map((l) => l.clienteId).filter(Boolean))];
  const agIds = [...new Set(lista0.map((l) => l.agendamentoId).filter(Boolean))];
  const [clientes, ags] = await Promise.all([
    cliIds.length ? ctx.db.sel('clientes', { in: { id: cliIds }, cols: ['id', 'nome'] }) : Promise.resolve([]),
    agIds.length ? ctx.db.sel('agendamentos', { in: { id: agIds }, cols: ['id', 'status'] }) : Promise.resolve([])
  ]);
  const nomes: Linha = {}, st: Linha = {};
  for (const c of clientes) nomes[c.id] = c.nome;
  for (const a of ags) st[a.id] = a.status;
  const h = hoje();
  const lista = lista0.map((l) => {
    l.clienteNome = nomes[l.clienteId] || '';
    l.atrasado = l.status === 'pendente' && (l.vencimento || l.data) < h;
    if (l.agendamentoId && !/^Sinal retido/.test(l.descricao)) {
      l.agAviso = !st[l.agendamentoId] ? 'atendimento excluído' : st[l.agendamentoId] === 'cancelado' ? 'atendimento cancelado' : '';
    }
    return l;
  }).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  const tot: Linha = { receitas: 0, despesas: 0, aReceber: 0, aPagar: 0 };
  for (const l of lista) {
    if (l.status === 'pago') { if (l.tipo === 'receita') tot.receitas += l.valor; else tot.despesas += l.valor; }
    else { if (l.tipo === 'receita') tot.aReceber += l.valor; else tot.aPagar += l.valor; }
  }
  for (const k of Object.keys(tot)) tot[k] = round2(tot[k]);
  tot.saldo = round2(tot.receitas - tot.despesas);
  return { lancamentos: lista, totais: tot };
}

async function finSalvar(p: Linha, ctx: Ctx) {
  const valor = round2(num(p.valor));
  if (!(valor > 0)) throw erro('Informe um valor maior que zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || '')) throw erro('Informe a data.');
  const dados: Linha = {
    data: p.data, tipo: p.tipo === 'despesa' ? 'despesa' : 'receita',
    categoria: p.categoria || (p.tipo === 'despesa' ? 'Outras despesas' : 'Outras receitas'),
    descricao: String(p.descricao || '').trim(), valor, forma: p.forma || '',
    status: p.status === 'pendente' ? 'pendente' : 'pago',
    vencimento: p.status === 'pendente' ? (p.vencimento || p.data) : '',
    clienteId: p.clienteId || '', profissionalId: p.profissionalId || ''
  };
  if (p.id) return ctx.db.upd('financeiro', p.id, dados);
  const r = await ctx.db.ins('financeiro', dados);
  const n = Math.min(24, Math.max(0, Math.round(num(p.repetir))));
  for (let i = 1; i <= n; i++) {
    const d = addMeses(p.data, i);
    await ctx.db.ins('financeiro', Object.assign({}, dados, {
      data: d, vencimento: d, status: 'pendente', descricao: (dados.descricao || dados.categoria) + ' (' + (i + 1) + '/' + (n + 1) + ')'
    }));
  }
  return r;
}
const finPagar = (p: Linha, ctx: Ctx) => ctx.db.upd('financeiro', p.id, { status: 'pago', data: p.data || hoje(), forma: p.forma || '' });
async function finExcluir(p: Linha, ctx: Ctx) { await ctx.db.del('financeiro', p.id); return true; }

// ------------------------------------------------------------------ painel e relatórios
async function dashboard(p: Linha, ctx: Ctx) {
  const mes = /^\d{4}-\d{2}$/.test(p.mes || '') ? p.mes : hoje().slice(0, 7);
  const ini = mes + '-01', prox = addMeses(ini, 1), iniAnt = addMeses(ini, -1), iniSerie = addMeses(ini, -5);
  const h = hoje(), ag = agora().slice(0, 16);
  const admin = ctx.sess.perfil === 'admin';
  const em7 = addMin(h + 'T00:00', 8 * 24 * 60).slice(0, 10);
  const c = await cfg(ctx);

  const deIni = [ini, iniAnt, iniSerie].sort()[0];
  const [finPeriodo, finPend, agsMes, agsProx, agsRemarcar, clientes, stats, hojeLista] = await Promise.all([
    admin ? ctx.db.sel('financeiro', { eq: { status: 'pago' }, gte: { data: deIni }, lt: { data: prox } }) : Promise.resolve([]),
    admin ? ctx.db.sel('financeiro', { eq: { status: 'pendente' } }) : Promise.resolve([]),
    ctx.db.sel('agendamentos', { gte: { inicio: ini + 'T00:00' }, lt: { inicio: prox + 'T00:00' } }),
    ctx.db.sel('agendamentos', { gte: { inicio: ag }, lt: { inicio: em7 + 'T00:00' }, in: { status: STATUS_ATIVOS }, cols: ['id', 'status', 'inicio'] }),
    ctx.db.sel('agendamentos', { eq: { status: 'remarcar' }, ordem: 'inicio' }),
    ctx.db.sel('clientes', { cols: ['id', 'nome', 'telefone', 'nascimento', 'criadoEm'] }),
    ctx.db.sel('vw_cliente_stats'),
    agListar({ inicio: h, fim: h }, ctx)
  ]);
  const somaFin = (tipo: string, de: string, ate: string) =>
    round2(finPeriodo.reduce((s, l) => s + (l.tipo === tipo && l.data >= de && l.data < ate ? num(l.valor) : 0), 0));

  const concl = agsMes.filter((a) => a.status === 'concluido');
  const fatServ = concl.reduce((s, a) => s + liquido(a), 0);
  const faltas = agsMes.filter((a) => a.status === 'faltou').length;
  const cancel = agsMes.filter((a) => a.status === 'cancelado').length;
  const receita = somaFin('receita', ini, prox), despesa = somaFin('despesa', ini, prox);
  const receitaAnt = somaFin('receita', iniAnt, ini);

  const serie = [];
  for (let i = 5; i >= 0; i--) {
    const m0 = addMeses(ini, -i), m1 = addMeses(m0, 1);
    serie.push({ mes: m0.slice(0, 7), rotulo: MESES_ABREV[Number(m0.slice(5, 7)) - 1] + '/' + m0.slice(2, 4),
      receitas: somaFin('receita', m0, m1), despesas: somaFin('despesa', m0, m1) });
  }

  const porServ: Linha = {};
  for (const a of agsMes) {
    if (a.status === 'cancelado' || a.status === 'faltou') continue;
    for (const s of a.servicos || []) {
      const x = porServ[s.nome] || (porServ[s.nome] = { nome: s.nome, qtd: 0, valor: 0, categoria: s.categoria });
      x.qtd++; x.valor += num(s.preco);
    }
  }
  const topServicos = Object.values(porServ).sort((a: any, b: any) => b.qtd - a.qtd || b.valor - a.valor).slice(0, 6);

  const proximos = agsProx.length;
  const naoConfirmados = agsProx.filter((a) => a.status === 'agendado').length;

  const mm = mes.slice(5, 7);
  const aniversariantes = clientes.filter((cl) => cl.nascimento && cl.nascimento.slice(5, 7) === mm)
    .map((cl) => ({ id: cl.id, nome: cl.nome, telefone: cl.telefone, dia: cl.nascimento.slice(8, 10), hoje: cl.nascimento.slice(5) === h.slice(5) }))
    .sort((a, b) => (a.dia < b.dia ? -1 : 1));

  const porCli: Linha = {};
  for (const s of stats) porCli[s.clienteId] = s;
  const limite = addMin(h + 'T00:00', -num(c.diasInativa || 60) * 24 * 60);
  const inativas = clientes.filter((cl) => { const s = porCli[cl.id]; return s && s.ultima && s.ultima.slice(0, 16) < limite && !s.proxima; })
    .map((cl) => {
      const u = porCli[cl.id].ultima;
      return { id: cl.id, nome: cl.nome, telefone: cl.telefone, ultimaVisita: u.slice(0, 10), dias: Math.floor(diffMin(u.slice(0, 16), h + 'T00:00') / 1440) };
    }).sort((a, b) => a.dias - b.dias).slice(0, 8);

  const remarcar = agsRemarcar.map((a) => ({ id: a.id, clienteNome: a.clienteNome, telefone: a.telefone, inicio: a.inicio.slice(0, 16), servicoNomes: a.servicoNomes }));
  const aReceber = finPend.filter((l) => l.tipo === 'receita');
  const aPagar = finPend.filter((l) => l.tipo === 'despesa' && (l.vencimento || l.data) < prox);

  const out: Linha = {
    mes, atendimentos: concl.length,
    agendadosMes: agsMes.filter((a) => a.status !== 'cancelado').length,
    ticketMedio: concl.length ? round2(fatServ / concl.length) : 0,
    taxaFaltas: agsMes.length ? Math.round((faltas / agsMes.length) * 1000) / 10 : 0,
    faltas, cancelamentos: cancel,
    novasClientes: clientes.filter((cl) => cl.criadoEm >= ini && cl.criadoEm < prox).length,
    totalClientes: clientes.length,
    hoje: hojeLista.agendamentos, proximos7: proximos, naoConfirmados,
    topServicos, aniversariantes, inativas, remarcar
  };
  if (admin) {
    Object.assign(out, {
      receita, despesa, lucro: round2(receita - despesa), receitaAnterior: receitaAnt,
      variacao: receitaAnt ? Math.round(((receita - receitaAnt) / receitaAnt) * 1000) / 10 : null,
      aReceber: round2(aReceber.reduce((s, l) => s + num(l.valor), 0)), aReceberQtd: aReceber.length,
      aPagar: round2(aPagar.reduce((s, l) => s + num(l.valor), 0)), aPagarQtd: aPagar.length, serie
    });
  }
  return out;
}

async function relatorio(p: Linha, ctx: Ctx) {
  const ini = dataOk(String(p.inicio || hoje().slice(0, 8) + '01').slice(0, 10));
  const fim = dataOk(String(p.fim || hoje()).slice(0, 10));
  if (fim < ini) throw erro('A data final precisa ser depois da inicial.');
  const dentro = (d: string) => { d = String(d).slice(0, 10); return d >= ini && d <= fim; };
  const [pagos, pendentes, ags, clientes, equipe] = await Promise.all([
    ctx.db.sel('financeiro', { eq: { status: 'pago' }, gte: { data: ini }, lte: { data: fim } }),
    ctx.db.sel('financeiro', { eq: { status: 'pendente' } }),
    ctx.db.sel('agendamentos', { gte: { inicio: ini + 'T00:00' }, lte: { inicio: fim + 'T23:59:59' } }),
    ctx.db.sel('clientes', { cols: ['id', 'nome', 'criadoEm'] }),
    ctx.db.sel('profissionais')
  ]);
  const nomeCli: Linha = {};
  for (const c of clientes) nomeCli[c.id] = c.nome;

  const recCat: Linha = {}, despCat: Linha = {}, formas: Linha = {}, porDia: Linha = {};
  let receitas = 0, despesas = 0;
  const dias = Math.round(diffMin(ini + 'T00:00', fim + 'T00:00') / 1440) + 1;
  const agruparMes = dias > 62;
  for (const l of pagos) {
    const v = num(l.valor);
    const chave = agruparMes ? l.data.slice(0, 7) : l.data;
    const d = porDia[chave] || (porDia[chave] = { receitas: 0, despesas: 0 });
    if (l.tipo === 'receita') {
      receitas += v; recCat[l.categoria] = (recCat[l.categoria] || 0) + v;
      const f = l.forma || 'Não informado'; formas[f] = (formas[f] || 0) + v; d.receitas += v;
    } else { despesas += v; despCat[l.categoria] = (despCat[l.categoria] || 0) + v; d.despesas += v; }
  }
  const lista = (obj: Linha, total: number) => Object.keys(obj).map((k) => ({ nome: k, valor: round2(obj[k]), pct: total ? Math.round(obj[k] / total * 1000) / 10 : 0 }))
    .sort((a, b) => b.valor - a.valor);

  const timeline = [];
  if (agruparMes) {
    for (let m = ini.slice(0, 7) + '-01'; m <= fim; m = addMeses(m, 1)) {
      const k = m.slice(0, 7), x = porDia[k] || { receitas: 0, despesas: 0 };
      timeline.push({ chave: k, rotulo: MESES_ABREV[Number(k.slice(5, 7)) - 1] + '/' + k.slice(2, 4), receitas: round2(x.receitas), despesas: round2(x.despesas) });
    }
  } else {
    for (let dd = ini; dd <= fim; dd = addMin(dd + 'T12:00', 1440).slice(0, 10)) {
      const y = porDia[dd] || { receitas: 0, despesas: 0 };
      timeline.push({ chave: dd, rotulo: dd.slice(8, 10) + '/' + dd.slice(5, 7), receitas: round2(y.receitas), despesas: round2(y.despesas) });
    }
  }

  const concl = ags.filter((a) => a.status === 'concluido');
  const fatServicos = concl.reduce((s, a) => s + liquido(a), 0);
  const porServ: Linha = {}, porCat: Linha = {}, porProf: Linha = {}, porCliente: Linha = {}, horas: Linha = {};
  const semana = [0, 0, 0, 0, 0, 0, 0];
  for (const a of concl) {
    const servs = a.servicos || [];
    const bruto = servs.reduce((s: number, x: Linha) => s + num(x.preco), 0) || 1;
    const liq = liquido(a);
    for (const s of servs) {
      const parte = servs.length === 1 ? liq : liq * (num(s.preco) / bruto);
      const x = porServ[s.nome] || (porServ[s.nome] = { nome: s.nome, categoria: s.categoria, qtd: 0, valor: 0 });
      x.qtd++; x.valor += parte;
      porCat[s.categoria || 'Outros'] = (porCat[s.categoria || 'Outros'] || 0) + parte;
    }
    const pid = a.profissionalId || '_';
    const pr = porProf[pid] || (porProf[pid] = { qtd: 0, valor: 0 }); pr.qtd++; pr.valor += liq;
    const cl = porCliente[a.clienteId] || (porCliente[a.clienteId] = { qtd: 0, valor: 0 }); cl.qtd++; cl.valor += liq;
    semana[diaDaSemana(a.inicio)]++;
    const hh = a.inicio.slice(11, 13); horas[hh] = (horas[hh] || 0) + 1;
  }
  const servicos = Object.values(porServ).map((s: any) => ({ nome: s.nome, categoria: s.categoria, qtd: s.qtd, valor: round2(s.valor),
    ticket: round2(s.valor / s.qtd), pct: fatServicos ? Math.round(s.valor / fatServicos * 1000) / 10 : 0 })).sort((a, b) => b.valor - a.valor);
  const equipeRel = Object.keys(porProf).map((id) => {
    const pr = equipe.find((e) => e.id === id);
    const com = pr ? num(pr.comissao) : 0;
    return { nome: pr ? pr.nome : 'Sem profissional definida', qtd: porProf[id].qtd, valor: round2(porProf[id].valor), comissaoPct: com, comissao: round2(porProf[id].valor * com / 100) };
  }).sort((a, b) => b.valor - a.valor);
  const topClientes = Object.keys(porCliente).map((id) => ({ nome: nomeCli[id] || '(removida)', qtd: porCliente[id].qtd, valor: round2(porCliente[id].valor) }))
    .sort((a, b) => b.valor - a.valor).slice(0, 10);
  const status: Linha = {};
  for (const a of ags) status[a.status] = (status[a.status] || 0) + 1;
  const aReceber = pendentes.filter((l) => l.tipo === 'receita').reduce((s, l) => s + num(l.valor), 0);
  const aPagar = pendentes.filter((l) => l.tipo === 'despesa' && String(l.vencimento || l.data) <= fim).reduce((s, l) => s + num(l.valor), 0);
  const atendidas = new Set(concl.map((a) => a.clienteId));

  return {
    inicio: ini, fim, agrupadoPorMes: agruparMes,
    resumo: {
      receitas: round2(receitas), despesas: round2(despesas), lucro: round2(receitas - despesas),
      margem: receitas ? Math.round((receitas - despesas) / receitas * 1000) / 10 : 0,
      atendimentos: concl.length, faturamentoServicos: round2(fatServicos),
      ticketMedio: concl.length ? round2(fatServicos / concl.length) : 0,
      clientesAtendidas: atendidas.size, novasClientes: clientes.filter((c) => dentro(c.criadoEm)).length,
      faltas: status.faltou || 0, cancelamentos: status.cancelado || 0,
      taxaFaltas: ags.length ? Math.round(((status.faltou || 0) / ags.length) * 1000) / 10 : 0,
      aReceber: round2(aReceber), aPagar: round2(aPagar),
      comissoes: round2(equipeRel.reduce((s, e) => s + e.comissao, 0))
    },
    receitasPorCategoria: lista(recCat, receitas), despesasPorCategoria: lista(despCat, despesas),
    formasPagamento: lista(formas, receitas), timeline, servicos, categorias: lista(porCat, fatServicos),
    equipe: equipeRel, topClientes, status, diasSemana: semana,
    horarios: Object.keys(horas).sort().map((hh) => ({ hora: hh + 'h', qtd: horas[hh] }))
  };
}

// ------------------------------------------------------------------ usuários (login pelo e-mail)
function senhaValidar(s: any) {
  s = String(s || '');
  if (s.length < 8) throw erro('A senha precisa ter pelo menos 8 caracteres.');
  if (!/[0-9]/.test(s) || !/[a-zA-Z]/.test(s)) throw erro('Use letras e números na senha.');
}
async function usrListar(_p: Linha, ctx: Ctx) {
  const [perfis, emails] = await Promise.all([ctx.db.sel('perfis', { ordem: 'nome' }), ctx.auth.emails()]);
  return perfis.map((u) => ({ id: u.id, nome: u.nome, email: emails[u.id] || '', usuario: emails[u.id] || '', perfil: u.perfil, ativo: u.ativo, ultimoAcesso: u.ultimoAcesso }));
}
async function usrSalvar(p: Linha, ctx: Ctx) {
  const email = String(p.email || p.usuario || '').trim().toLowerCase();
  if (!String(p.nome || '').trim() || !email) throw erro('Preencha nome e e-mail.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw erro('E-mail inválido.');
  const perfil = p.perfil === 'admin' ? 'admin' : 'equipe';
  const ativo = p.ativo === 'nao' ? 'nao' : 'sim';
  if (p.id && p.id === ctx.sess.id && (perfil !== 'admin' || ativo === 'nao')) throw erro('Você não pode remover o seu próprio acesso de administradora.');
  if (p.senha) senhaValidar(p.senha);
  if (!p.id) {
    if (!p.senha) throw erro('Defina uma senha provisória para o novo usuário.');
    const emails = await ctx.auth.emails();
    if (Object.values(emails).includes(email)) throw erro('Já existe um login com esse e-mail.');
    const id = await ctx.auth.criar(email, p.senha);
    await ctx.db.ins('perfis', { id, nome: String(p.nome).trim(), perfil, ativo, trocarSenha: true });
    return { id };
  }
  const emails = await ctx.auth.emails();
  if (emails[p.id] !== email) {
    if (Object.entries(emails).some(([id, e]) => e === email && id !== p.id)) throw erro('Já existe um login com esse e-mail.');
    await ctx.auth.email(p.id, email);
  }
  const patch: Linha = { nome: String(p.nome).trim(), perfil, ativo };
  if (p.senha) { await ctx.auth.senha(p.id, p.senha); patch.trocarSenha = p.id !== ctx.sess.id; }
  await ctx.auth.bloquear(p.id, ativo === 'nao');
  await ctx.db.upd('perfis', p.id, patch);
  return { id: p.id };
}
async function usrExcluir(p: Linha, ctx: Ctx) {
  if (p.id === ctx.sess.id) throw erro('Você não pode excluir o seu próprio usuário.');
  const admins = (await ctx.db.sel('perfis', { eq: { perfil: 'admin' } })).filter((u) => u.ativo !== 'nao' && u.id !== p.id);
  if (!admins.length) throw erro('O sistema precisa de pelo menos uma administradora.');
  await ctx.auth.excluir(p.id);
  return true;
}
async function senhaTrocada(_p: Linha, ctx: Ctx) {
  await ctx.db.upd('perfis', ctx.sess.id, { trocarSenha: false });
  return Object.assign({}, ctx.sess, { trocarSenha: false });
}

// ------------------------------------------------------------------ rotas
const emBreve = (fase: number) => async () => { throw erro(`Disponível na fase ${fase} da versão nova.`); };
type Rota = { fn: (p: Linha, ctx: Ctx) => Promise<any>; admin?: boolean };
export const ROTAS: Record<string, Rota> = {
  'auth.me': { fn: async (_p, ctx) => ctx.sess },
  'auth.logout': { fn: async () => true },
  'auth.senhaTrocada': { fn: senhaTrocada },
  'boot': { fn: boot },
  'dashboard': { fn: dashboard },
  'relatorio': { fn: relatorio, admin: true },
  'clientes.listar': { fn: cliListar },
  'clientes.obter': { fn: cliObter },
  'clientes.salvar': { fn: cliSalvar },
  'clientes.excluir': { fn: cliExcluir, admin: true },
  'servicos.salvar': { fn: srvSalvar, admin: true },
  'servicos.excluir': { fn: srvExcluir, admin: true },
  'equipe.salvar': { fn: profSalvar, admin: true },
  'equipe.excluir': { fn: profExcluir, admin: true },
  'agenda.listar': { fn: agListar },
  'agenda.obter': { fn: agObter },
  'agenda.salvar': { fn: agSalvar },
  'agenda.status': { fn: agStatus },
  'agenda.finalizar': { fn: agFinalizar },
  'agenda.excluir': { fn: agExcluir },
  'fin.listar': { fn: finListar, admin: true },
  'fin.salvar': { fn: finSalvar, admin: true },
  'fin.pagar': { fn: finPagar, admin: true },
  'fin.excluir': { fn: finExcluir, admin: true },
  'cfg.obter': { fn: cfgObter, admin: true },
  'cfg.salvar': { fn: cfgSalvar, admin: true },
  'usuarios.listar': { fn: usrListar, admin: true },
  'usuarios.salvar': { fn: usrSalvar, admin: true },
  'usuarios.excluir': { fn: usrExcluir, admin: true },
  // próximas fases
  'agenda.ressincronizar': { fn: emBreve(3), admin: true },
  'agenda.importarPrevia': { fn: emBreve(3), admin: true },
  'agenda.importar': { fn: emBreve(3), admin: true },
  'agenda.desfazerImportacao': { fn: emBreve(3), admin: true },
  'cfg.calendarios': { fn: emBreve(3), admin: true },
  'wa.config': { fn: emBreve(4), admin: true },
  'wa.salvarConfig': { fn: emBreve(4), admin: true },
  'wa.testar': { fn: emBreve(4), admin: true },
  'wa.enviar': { fn: emBreve(4) },
  'wa.logs': { fn: emBreve(4), admin: true },
  'wa.processar': { fn: emBreve(4), admin: true }
};

/** Executa uma ação já com a sessão conferida. Devolve {ok, data} ou {ok:false, error}. */
export async function executar(action: string, payload: Linha, ctx: Ctx): Promise<Linha> {
  try {
    const rota = ROTAS[action];
    if (!rota) throw erro('Ação desconhecida: ' + action);
    if (rota.admin && ctx.sess.perfil !== 'admin') throw erro('Seu usuário não tem permissão para isso.');
    return { ok: true, data: await rota.fn(payload || {}, ctx) };
  } catch (e: any) {
    if (e instanceof ErroUsuario) return { ok: false, error: e.message, dados: e.dados };
    console.error(e);
    return { ok: false, error: 'Erro no servidor: ' + (e && e.message ? e.message : String(e)) };
  }
}


// =====================================================================
//  CRM Lara Altoé — função "api" do Supabase (porta de entrada do servidor)
//  Confere o login (Supabase Auth) e o perfil, e executa a ação pedida.
//  As regras do CRM ficam em logica.ts.
// =====================================================================

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function aplicarFiltro(q: any, f: Filtro = {}) {
  for (const [k, v] of Object.entries(f.eq || {})) q = q.eq(snake(k), v);
  for (const [k, v] of Object.entries(f.neq || {})) q = q.neq(snake(k), v);
  for (const [k, v] of Object.entries(f.gte || {})) q = q.gte(snake(k), v);
  for (const [k, v] of Object.entries(f.gt || {})) q = q.gt(snake(k), v);
  for (const [k, v] of Object.entries(f.lte || {})) q = q.lte(snake(k), v);
  for (const [k, v] of Object.entries(f.lt || {})) q = q.lt(snake(k), v);
  for (const [k, v] of Object.entries(f.in || {})) q = q.in(snake(k), v);
  // jsonb: manda como texto JSON (o supabase-js monta errado listas de objetos)
  for (const [k, v] of Object.entries(f.contem || {})) q = q.contains(snake(k), typeof v === 'string' ? v : JSON.stringify(v));
  return q;
}
const falhou = (error: any) => { if (error) throw new Error(error.message || String(error)); };

const db: Db = {
  async sel(tabela, f = {}) {
    if (f.in && Object.values(f.in).some((arr) => !arr.length)) return [];
    const cols = f.cols ? f.cols.map(snake).join(',') : '*';
    const tam = 1000, limite = f.limite || Infinity, out: Linha[] = [];
    for (let de = 0; out.length < limite; de += tam) {
      let q = aplicarFiltro(sb.from(tabela).select(cols), f);
      if (f.ordem) q = q.order(snake(f.ordem), { ascending: !f.desc });
      const ate = Math.min(de + tam, limite) - 1;
      const { data, error } = await q.range(de, ate);
      falhou(error);
      out.push(...(data || []).map((r: Linha) => doBanco(tabela, r)));
      if (!data || data.length < ate - de + 1) break;
    }
    return out;
  },
  async um(tabela, id) {
    const { data, error } = await sb.from(tabela).select('*').eq('id', id).maybeSingle();
    falhou(error);
    return data ? doBanco(tabela, data) : null;
  },
  async ins(tabela, obj) {
    const { data, error } = await sb.from(tabela).insert(paraBanco(tabela, obj)).select('*').single();
    falhou(error);
    return doBanco(tabela, data);
  },
  async upd(tabela, id, patch) {
    const { data, error } = await sb.from(tabela).update(paraBanco(tabela, patch)).eq('id', id).select('*').maybeSingle();
    falhou(error);
    if (!data) throw new Error('Registro não encontrado.');
    return doBanco(tabela, data);
  },
  async updOnde(tabela, eq, patch) {
    const { error } = await aplicarFiltro(sb.from(tabela).update(paraBanco(tabela, patch)), { eq });
    falhou(error);
  },
  async del(tabela, id) {
    const { error } = await sb.from(tabela).delete().eq('id', id);
    falhou(error);
  },
  async upsert(tabela, obj, chave) {
    const { error } = await sb.from(tabela).upsert(paraBanco(tabela, obj), { onConflict: snake(chave) });
    falhou(error);
  }
};

const auth: AuthAdmin = {
  async criar(email, senha) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
    falhou(error);
    return data.user!.id;
  },
  async senha(id, senha) { const { error } = await sb.auth.admin.updateUserById(id, { password: senha }); falhou(error); },
  async email(id, email) { const { error } = await sb.auth.admin.updateUserById(id, { email, email_confirm: true }); falhou(error); },
  async bloquear(id, bloquear) {
    const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: bloquear ? '876000h' : 'none' });
    falhou(error);
  },
  async excluir(id) { const { error } = await sb.auth.admin.deleteUser(id); falhou(error); },
  async emails() {
    const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    falhou(error);
    const m: Record<string, string> = {};
    for (const u of data.users) m[u.id] = u.email || '';
    return m;
  }
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resposta = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u, error } = await sb.auth.getUser(token);
    if (error || !u || !u.user) return resposta({ ok: false, auth: false, error: 'Sua sessão expirou. Entre novamente.' });
    const perfil = await db.um('perfis', u.user.id);
    if (!perfil || perfil.ativo === 'nao') {
      return resposta({ ok: false, auth: false, error: 'Este login não tem acesso ao CRM. Fale com a administradora.' });
    }
    const sess = { id: perfil.id, nome: perfil.nome, perfil: perfil.perfil, email: u.user.email || '', trocarSenha: !!perfil.trocarSenha };
    const { action, payload } = await req.json();
    return resposta(await executar(String(action || ''), payload || {}, { db, auth, sess, memo: {} }));
  } catch (e) {
    console.error(e);
    return resposta({ ok: false, error: 'Erro no servidor: ' + ((e as Error).message || String(e)) });
  }
});
