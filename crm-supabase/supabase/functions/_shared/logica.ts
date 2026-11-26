// =====================================================================
//  CRM Lara Altoé — regras do servidor (Supabase Edge Function "api")
//
//  Este arquivo não importa nada: recebe o "banco" (db), o "login" (auth) e
//  o acesso ao Google (fetch + chaves) prontos. Assim ele roda igual no Supabase (Deno) e nos testes (Node +
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
export type Ctx = { db: Db; auth: AuthAdmin; sess: Sessao; memo: Linha; google?: GoogleDeps };

export const VERSAO = '2.1.0';

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
function cfgPublica(c: Linha, google = false) {
  return {
    studioNome: c.studioNome, responsavel: c.responsavel, telefone: c.telefone, endereco: c.endereco,
    instagram: c.instagram, pix: c.pix,
    calendarAtivo: google, mostrarEventosGoogle: google && c.mostrarEventosGoogle !== false,
    horaAbertura: c.horaAbertura, horaFechamento: c.horaFechamento, intervaloAgenda: c.intervaloAgenda,
    diasInativa: c.diasInativa, sinalRetido: c.sinalRetido !== false,
    categoriasServico: c.categoriasServico, categoriasReceita: c.categoriasReceita,
    categoriasDespesa: c.categoriasDespesa, formasPagamento: c.formasPagamento, locais: c.locais,
    waAtivo: false, waConfirmacao: false,                         // WhatsApp automático: fase 4
    templates: { reativacao: c.templates.reativacao, aniversario: c.templates.aniversario, confirmacao: c.templates.confirmacao, lembrete1: c.templates.lembrete1 },
    recursos: { google: true, whatsapp: false, importar: google }
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
  return cfgPublica(await cfg(ctx), await gAtivo(ctx));
}

// ------------------------------------------------------------------ carga inicial
async function boot(_p: Linha, ctx: Ctx) {
  const [c, servicos, equipe, clientes, google] = await Promise.all([
    cfg(ctx),
    ctx.db.sel('servicos', { ordem: 'nome' }),
    ctx.db.sel('profissionais', { ordem: 'nome' }),
    ctx.db.sel('clientes', { cols: ['id', 'nome', 'telefone', 'nascimento'], ordem: 'nome' }),
    gAtivo(ctx)
  ]);
  ctx.db.upd('perfis', ctx.sess.id, { ultimoAcesso: new Date().toISOString() }).catch(() => {});
  return { user: ctx.sess, versao: VERSAO, cfg: cfgPublica(c, google), servicos, equipe, clientes };
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
    local: a.local, observacoes: a.observacoes, syncStatus: a.syncStatus, eventId: a.eventId,
    confirmEnviada: a.confirmEnviada, lembrete1Enviado: a.lembrete1Enviado, lembrete2Enviado: a.lembrete2Enviado,
    formaPagamento: a.formaPagamento, lancamentoId: a.lancamentoId, importado: !!a.origem
  };
}

async function agListar(p: Linha, ctx: Ctx) {
  const ini = dataOk(String(p.inicio || hoje()).slice(0, 10));
  const fim = dataOk(String(p.fim || ini).slice(0, 10));
  const f: Filtro = { gte: { inicio: ini + 'T00:00' }, lte: { inicio: fim + 'T23:59:59' }, ordem: 'inicio' };
  if (!p.incluirCancelados) f.neq = { status: 'cancelado' };
  const [ags, externos] = await Promise.all([
    ctx.db.sel('agendamentos', f),
    p.externos ? gExternos(ctx, ini, fim) : Promise.resolve([])
  ]);
  const m = await mapas(ctx, ags.map((a) => a.clienteId));
  m.porProfissional = !!p.corPorProfissional;
  return { agendamentos: ags.map((a) => agView(a, m)), externos };
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

  a = await gPush(a, ctx);
  const v: Linha = agView(a, await mapas(ctx, [a.clienteId]));
  v.aviso = String(a.syncStatus || '').indexOf('erro') === 0 ? 'Salvo no CRM, mas não foi para o Google Agenda: ' + a.syncStatus.slice(6) : '';
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
  const n = await gPush(await ctx.db.upd('agendamentos', a.id, patch), ctx);
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
  a = await gPush(await ctx.db.upd('agendamentos', a.id, { lancamentoId: lanc ? lanc.id : '' }), ctx);
  return agView(a, await mapas(ctx, [a.clienteId]));
}

async function agExcluir(p: Linha, ctx: Ctx) {
  const a = await ctx.db.um('agendamentos', p.id);
  if (!a) return true;
  if (a.eventId) await gPush(Object.assign({}, a, { status: 'cancelado' }), ctx);
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

// ------------------------------------------------------------------ Google Agenda
//  Conexão por OAuth (a dona autoriza uma vez), envio dos horários para a agenda,
//  leitura das mudanças feitas no Google (syncToken) e importação de eventos.
const G_ESCOPOS = 'openid email https://www.googleapis.com/auth/calendar';
const G_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const G_TOKEN = 'https://oauth2.googleapis.com/token';
const G_API = 'https://www.googleapis.com/calendar/v3';
const FUSO = '-03:00'; // horário de Brasília (sem horário de verão desde 2019)
const STATUS_EMOJI: Linha = { agendado: '🗓️', confirmado: '✅', concluido: '💖', faltou: '⚠️', remarcar: '🔁', cancelado: '❌' };
const COR_CATEGORIA: Linha = { 'Maquiagem': '7', 'Sobrancelha': '4', 'Penteado': '6', 'Cílios': '9', 'Noivas & Eventos': '3', 'Outros': '8' };
const brl = (v: number) => 'R$ ' + round2(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export type GoogleDeps = { fetch: (u: string, o?: any) => Promise<any>; clientId: string; clientSecret: string; redirectUri: string };

async function gCfg(ctx: Ctx): Promise<Linha> {
  if (ctx.memo.google) return ctx.memo.google;
  const r = await ctx.db.sel('config', { eq: { chave: 'google' } });
  ctx.memo.google = (r[0] && r[0].valor) || {};
  return ctx.memo.google;
}
async function gGravar(ctx: Ctx, patch: Linha, substituir = false) {
  const r = await ctx.db.sel('config', { eq: { chave: 'google' } });
  const g = substituir ? patch : Object.assign({}, (r[0] && r[0].valor) || {}, patch);
  await ctx.db.upsert('config', { chave: 'google', valor: g, atualizadoEm: new Date().toISOString() }, 'chave');
  ctx.memo.google = g;
}
/** Busca agendamentos pelos ids de evento do Google (em partes, para não estourar o tamanho da URL). */
async function porEventos(ctx: Ctx, ids: string[], cols?: string[]): Promise<Linha[]> {
  const out: Linha[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const f: Filtro = { in: { eventId: ids.slice(i, i + 80) } };
    if (cols) f.cols = cols;
    out.push(...(await ctx.db.sel('agendamentos', f)));
  }
  return out;
}
export const gConectado = async (ctx: Ctx) => gPronto(ctx) && !!(await gCfg(ctx)).refreshToken;
const gPronto = (ctx: Ctx) => !!(ctx.google && ctx.google.clientId && ctx.google.clientSecret);
async function gAtivo(ctx: Ctx) {
  if (!gPronto(ctx)) return false;
  const g = await gCfg(ctx);
  return !!g.refreshToken && !g.pausado;
}

async function gToken(ctx: Ctx): Promise<string> {
  const g = await gCfg(ctx);
  if (!g.refreshToken) throw erro('O Google Agenda não está conectado.');
  if (g.accessToken && g.expira > Date.now() + 60000) return g.accessToken;
  const gd = ctx.google!;
  const r = await gd.fetch(G_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: gd.clientId, client_secret: gd.clientSecret, refresh_token: g.refreshToken, grant_type: 'refresh_token' }).toString()
  });
  const j = await r.json();
  if (!r.ok) {
    if (j.error === 'invalid_grant') {
      await gGravar(ctx, { refreshToken: '', accessToken: '', syncToken: '', erro: 'A conexão com o Google foi removida ou expirou. Conecte de novo.' });
      throw erro('A conexão com o Google Agenda caiu. Em Configurações, toque em "Conectar Google Agenda" de novo.');
    }
    throw new Error('Google: ' + (j.error_description || j.error || r.status));
  }
  await gGravar(ctx, { accessToken: j.access_token, expira: Date.now() + Number(j.expires_in || 3600) * 1000, erro: '' });
  return j.access_token;
}

async function gApi(ctx: Ctx, metodo: string, caminho: string, corpo?: any): Promise<any> {
  const tk = await gToken(ctx);
  const r = await ctx.google!.fetch(G_API + caminho, {
    method: metodo, headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  if (r.status === 204) return null;
  const txt = await r.text();
  const j = txt ? JSON.parse(txt) : null;
  if (!r.ok) {
    const e: any = new Error('Google ' + r.status + ': ' + String((j && j.error && j.error.message) || txt).slice(0, 160));
    e.status = r.status;
    throw e;
  }
  return j;
}
const calPath = (g: Linha, id?: string) => '/calendars/' + encodeURIComponent(id || g.calendarId || 'primary');
const evPath = (g: Linha, evId: string, calId?: string) => calPath(g, calId) + '/events/' + encodeURIComponent(evId);
const paraGoogle = (s: string) => ({ dateTime: s.slice(0, 16) + ':00', timeZone: TZ });
const doGoogle = (t: Linha) => (t && t.dateTime ? local(new Date(t.dateTime)) : (t && t.date) || '');

/** Envia o atendimento para o Google Agenda (cria, atualiza ou apaga). Nunca derruba a ação: grava syncStatus. */
async function gPush(a: Linha, ctx: Ctx): Promise<Linha> {
  if (!(await gAtivo(ctx))) return a;
  const g = await gCfg(ctx);
  const c = await cfg(ctx);
  let patch: Linha = {};
  try {
    if (a.status === 'cancelado') {
      if (a.eventId) await gApi(ctx, 'DELETE', evPath(g, a.eventId)).catch((e) => { if (e.status !== 404 && e.status !== 410) throw e; });
      patch = { eventId: '', syncStatus: 'removido' };
    } else {
      const [cli, prof] = await Promise.all([
        a.clienteId ? ctx.db.um('clientes', a.clienteId) : Promise.resolve(null),
        a.profissionalId ? ctx.db.um('profissionais', a.profissionalId) : Promise.resolve(null)
      ]);
      const nome = (cli && cli.nome) || a.clienteNome;
      const tel = (cli && cli.telefone) || a.telefone;
      const total = num(a.valor) - num(a.desconto);
      const descricao = [
        '👤 Cliente: ' + nome,
        tel ? '📱 WhatsApp: https://wa.me/' + tel : '',
        '✨ Serviços: ' + a.servicoNomes,
        prof ? '💄 Profissional: ' + prof.nome : '',
        '💰 Valor: ' + brl(total) + (num(a.sinal) ? ' (sinal pago: ' + brl(num(a.sinal)) + ')' : ''),
        '📌 Status: ' + a.status,
        cli && cli.alergias ? '⚠️ Alergias: ' + cli.alergias : '',
        a.observacoes ? '📝 ' + a.observacoes : ''
      ].filter(Boolean).join('\n') + '\n\nCriado pelo ' + (c.studioNome || 'CRM');
      const servs = a.servicos || [];
      const corpo: Linha = {
        summary: (STATUS_EMOJI[a.status] || '') + ' ' + nome + ' — ' + a.servicoNomes,
        description: descricao,
        location: !a.local || a.local === 'Studio' ? (c.endereco || c.studioNome) : a.local,
        start: paraGoogle(a.inicio), end: paraGoogle(a.fim), status: 'confirmed',
        colorId: a.status === 'concluido' ? '10' : a.status === 'faltou' ? '8' : (COR_CATEGORIA[(servs[0] || {}).categoria] || '7')
      };
      let ev: Linha | null = null;
      if (a.eventId) {
        try { ev = await gApi(ctx, 'PATCH', evPath(g, a.eventId), corpo); } catch (e: any) {
          if (e.status !== 404 && e.status !== 410) throw e;
          // trocou de agenda: apaga o evento que ficou na agenda antiga
          if (g.calendarAnterior) await gApi(ctx, 'DELETE', evPath(g, a.eventId, g.calendarAnterior)).catch(() => {});
        }
      }
      if (!ev) {
        const min = num(c.lembreteAgendaMin);
        corpo.reminders = min > 0 ? { useDefault: false, overrides: [{ method: 'popup', minutes: min }] } : { useDefault: true };
        ev = await gApi(ctx, 'POST', calPath(g) + '/events', corpo);
      }
      patch = { eventId: ev!.id, syncStatus: 'ok' };
    }
  } catch (e: any) {
    patch = { syncStatus: 'erro: ' + String(e.message || e).slice(0, 120) };
  }
  if (patch.eventId === a.eventId && patch.syncStatus === a.syncStatus) return a;
  return ctx.db.upd('agendamentos', a.id, patch);
}

/** Eventos do Google no período (compromissos pessoais etc.), já expandidos (singleEvents). */
async function gEventos(ctx: Ctx, ini: string, fim: string): Promise<Linha[]> {
  const g = await gCfg(ctx);
  const out: Linha[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ timeMin: ini + 'T00:00:00' + FUSO, timeMax: fim + 'T23:59:59' + FUSO, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    if (pageToken) q.set('pageToken', pageToken);
    const j = await gApi(ctx, 'GET', calPath(g) + '/events?' + q.toString());
    out.push(...(j.items || []));
    pageToken = j.nextPageToken || '';
  } while (pageToken && out.length < 2000);
  return out.filter((e) => e.status !== 'cancelled');
}

async function gExternos(ctx: Ctx, ini: string, fim: string): Promise<Linha[]> {
  const c = await cfg(ctx);
  if (!(await gAtivo(ctx)) || c.mostrarEventosGoogle === false) return [];
  try {
    const evs = await gEventos(ctx, ini, fim);
    const ids = evs.map((e) => e.id);
    const ligados = new Set((await porEventos(ctx, ids, ['eventId'])).map((a) => a.eventId));
    return evs.filter((e) => !ligados.has(e.id)).map((e) => ({
      id: e.id, titulo: e.summary || '(sem título)', diaTodo: !!(e.start && e.start.date),
      inicio: doGoogle(e.start), fim: doGoogle(e.end)
    }));
  } catch (e) { console.warn('externos:', e); return []; }
}

/** Lê o que mudou no Google desde a última vez (remarcações e exclusões feitas direto na agenda). */
export async function gPull(ctx: Ctx): Promise<Linha> {
  if (!(await gAtivo(ctx))) return { conectado: false };
  let g = await gCfg(ctx);
  const res: Linha = { remarcados: 0, cancelados: 0 };
  const mudados: Linha[] = [];
  let pageToken = '', novoToken = '';
  const inicial = !g.syncToken;
  do {
    const q = new URLSearchParams({ maxResults: '2500', showDeleted: 'true' });
    if (g.syncToken) q.set('syncToken', g.syncToken);
    if (pageToken) q.set('pageToken', pageToken);
    if (inicial) q.set('fields', 'items(id),nextPageToken,nextSyncToken');
    let j: Linha;
    try { j = await gApi(ctx, 'GET', calPath(g) + '/events?' + q.toString()); } catch (e: any) {
      if (e.status === 410) { await gGravar(ctx, { syncToken: '' }); return gPull(ctx); }
      throw e;
    }
    if (!inicial) mudados.push(...(j.items || []));
    pageToken = j.nextPageToken || '';
    if (!pageToken) novoToken = j.nextSyncToken || '';
  } while (pageToken);

  if (mudados.length) {
    const ids = mudados.map((e) => e.id);
    const ags = await porEventos(ctx, ids);
    const porEvento: Linha = {};
    for (const a of ags) porEvento[a.eventId] = a;
    for (const ev of mudados) {
      const a = porEvento[ev.id];
      if (!a || a.status === 'cancelado') continue;
      if (ev.status === 'cancelled') {
        await agTratarFinanceiro(a.id, 'padrao', ctx);
        await ctx.db.upd('agendamentos', a.id, { status: 'cancelado', eventId: '', syncStatus: 'apagado no Google Agenda', lancamentoId: '', formaPagamento: '' });
        res.cancelados++;
        continue;
      }
      const ini = doGoogle(ev.start).slice(0, 16), fim = doGoogle(ev.end).slice(0, 16);
      if (ini.length < 16 || fim.length < 16) continue; // virou "dia todo": ignora
      if (ini === a.inicio.slice(0, 16) && fim === a.fim.slice(0, 16)) continue; // nada mudou (ou foi o próprio CRM)
      const patch: Linha = { inicio: ini, fim, syncStatus: 'horário mudado no Google Agenda' };
      if (ini !== a.inicio.slice(0, 16)) {
        patch.lembrete1Enviado = ''; patch.lembrete2Enviado = '';
        if (a.status === 'remarcar') patch.status = 'agendado';
      }
      await ctx.db.upd('agendamentos', a.id, patch);
      res.remarcados++;
    }
  }
  await gGravar(ctx, novoToken ? { syncToken: novoToken, ultimaSync: agora() } : { ultimaSync: agora() });
  res.inicial = inicial;
  return res;
}

// ---------- conexão (OAuth)
async function gStatus(_p: Linha, ctx: Ctx) {
  const g = await gCfg(ctx);
  const c = await cfg(ctx);
  return {
    configurado: gPronto(ctx), conectado: !!g.refreshToken, email: g.email || '', calendarId: g.calendarId || 'primary',
    calendarNome: g.calendarNome || '', ultimaSync: g.ultimaSync || '', erro: g.erro || '',
    ativo: !g.pausado, mostrarEventosGoogle: c.mostrarEventosGoogle !== false, lembreteAgendaMin: c.lembreteAgendaMin
  };
}
async function gIniciar(p: Linha, ctx: Ctx) {
  if (!gPronto(ctx)) throw erro('Falta cadastrar GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET em Edge Functions → Secrets no Supabase.');
  const volta = String(p.volta || '');
  if (!/^https?:\/\//.test(volta)) throw erro('Endereço de retorno inválido.');
  const estado = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await ctx.db.upsert('config', { chave: 'google_estado', valor: { estado, volta, usuario: ctx.sess.id, expira: Date.now() + 15 * 60000 }, atualizadoEm: new Date().toISOString() }, 'chave');
  const q = new URLSearchParams({
    client_id: ctx.google!.clientId, redirect_uri: ctx.google!.redirectUri, response_type: 'code', scope: G_ESCOPOS,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: estado
  });
  return { url: G_AUTH + '?' + q.toString() };
}
/** Retorno do Google depois da autorização (chamado pela função "google", sem login do CRM). Devolve para onde redirecionar. */
export async function googleCallback(q: Linha, ctx: Ctx): Promise<string> {
  const r = await ctx.db.sel('config', { eq: { chave: 'google_estado' } });
  const est = (r[0] && r[0].valor) || {};
  const volta = est.volta || '/';
  const ir = (s: string, msg?: string) => volta + (volta.includes('?') ? '&' : '?') + 'google=' + s + (msg ? '&msg=' + encodeURIComponent(msg) : '');
  if (!q.state || q.state !== est.estado || !(est.expira > Date.now())) return ir('erro', 'O link de conexão expirou. Tente de novo.');
  await ctx.db.upsert('config', { chave: 'google_estado', valor: {}, atualizadoEm: new Date().toISOString() }, 'chave');
  if (q.error || !q.code) return ir('erro', q.error === 'access_denied' ? 'A autorização foi cancelada.' : 'O Google não autorizou: ' + (q.error || 'sem código'));
  const gd = ctx.google!;
  const resp = await gd.fetch(G_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: q.code, client_id: gd.clientId, client_secret: gd.clientSecret, redirect_uri: gd.redirectUri, grant_type: 'authorization_code' }).toString()
  });
  const j = await resp.json();
  if (!resp.ok || !j.refresh_token) return ir('erro', 'Não consegui concluir a conexão: ' + (j.error_description || j.error || 'sem permissão de acesso contínuo'));
  let email = '';
  try { email = JSON.parse(atob(String(j.id_token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch (_) { /* sem e-mail */ }
  const antes = await gCfg(ctx);
  await gGravar(ctx, {
    pausado: false, calendarAnterior: '', refreshToken: j.refresh_token, accessToken: j.access_token, expira: Date.now() + Number(j.expires_in || 3600) * 1000,
    email, calendarId: antes.calendarId || 'primary', calendarNome: antes.calendarNome || '', conectadoEm: agora(), syncToken: '', erro: ''
  }, true);
  try { await gPull(ctx); } catch (e) { console.warn('primeira sincronização:', e); }
  return ir('ok');
}
async function gDesconectar(_p: Linha, ctx: Ctx) {
  const g = await gCfg(ctx);
  if (g.refreshToken && ctx.google) {
    await ctx.google.fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(g.refreshToken), { method: 'POST' }).catch(() => {});
  }
  await gGravar(ctx, { calendarId: g.calendarId || 'primary', calendarNome: g.calendarNome || '' }, true);
  return true;
}
async function gCalendarios(_p: Linha, ctx: Ctx) {
  const j = await gApi(ctx, 'GET', '/users/me/calendarList?minAccessRole=writer');
  const g = await gCfg(ctx);
  return {
    email: g.email || '',
    lista: (j.items || []).map((c: Linha) => ({ id: c.primary ? 'primary' : c.id, nome: c.summaryOverride || c.summary + (c.primary ? ' (principal)' : '') }))
  };
}
async function gSalvar(p: Linha, ctx: Ctx) {
  const c = JSON.parse(JSON.stringify(await cfg(ctx)));
  if (p.mostrarEventosGoogle !== undefined) c.mostrarEventosGoogle = p.mostrarEventosGoogle === true || p.mostrarEventosGoogle === 'true';
  if (p.lembreteAgendaMin !== undefined) c.lembreteAgendaMin = num(p.lembreteAgendaMin);
  await cfgGravar(ctx, c);
  if (p.ativo !== undefined) await gGravar(ctx, { pausado: !(p.ativo === true || p.ativo === 'true') });
  const g = await gCfg(ctx);
  if (p.calendarId && p.calendarId !== (g.calendarId || 'primary')) {
    const lista = (await gCalendarios({}, ctx)).lista;
    const escolhida = lista.find((x: Linha) => x.id === p.calendarId);
    if (!escolhida) throw erro('Essa agenda não aparece na conta conectada (ou está só para visualização).');
    await gGravar(ctx, { calendarAnterior: g.calendarId || 'primary', calendarId: p.calendarId, calendarNome: escolhida.nome, syncToken: '' });
    return Object.assign(await gStatus({}, ctx), { trocouAgenda: true });
  }
  return gStatus({}, ctx);
}
async function gSincronizar(_p: Linha, ctx: Ctx) {
  if (!(await gAtivo(ctx))) throw erro('Conecte o Google Agenda primeiro.');
  return gPull(ctx);
}
async function agRessincronizar(_p: Linha, ctx: Ctx) {
  if (!(await gAtivo(ctx))) throw erro('Conecte o Google Agenda primeiro.');
  const ags = await ctx.db.sel('agendamentos', { gte: { inicio: hoje() + 'T00:00' }, neq: { status: 'cancelado' } });
  let n = 0, erros = 0;
  for (const a of ags) { const r = await gPush(a, ctx); if (String(r.syncStatus).indexOf('erro') === 0) erros++; else n++; }
  return { sincronizados: n, erros };
}

// ---------- importar eventos que já estavam no Google (mesmas regras da versão Apps Script)
const IMP_IGNORAR = ['make', 'maquiagem', 'makeup', 'maquiar', 'sobrancelha', 'sobrancelhas', 'design', 'henna', 'penteado', 'escova',
  'cilios', 'cilio', 'noiva', 'noivas', 'madrinha', 'madrinhas', 'pacote', 'social', 'brow', 'lamination', 'studio', 'atendimento',
  'cliente', 'sinal', 'pago', 'paga', 'pix', 'r', 'e', 'de', 'da', 'do', 'das', 'dos', 'com', 'para', 'pra', 'no', 'na', 'x', 'teste',
  'formatura', 'casamento', 'festa', 'evento', 'aniversario', 'domicilio', 'hora', 'horario'];
const IMP_GRUPOS = [
  { chaves: ['make', 'maquiagem', 'makeup', 'maquiar', 'noiva', 'madrinha'], base: 'maquiagem', padrao: 'social', prefer: [['noiva', 'noiva'], ['madrinha', 'madrinha']] },
  { chaves: ['penteado', 'cabelo', 'escova', 'babyliss', 'tranca', 'coque'], base: 'penteado', padrao: 'social', prefer: [['escova', 'escova'], ['noiva', 'noiva']] },
  { chaves: ['sobrancelha', 'sobrancelhas', 'design', 'henna', 'brow', 'lamination'], base: 'sobrancelha', padrao: 'design', prefer: [['henna', 'henna'], ['brow', 'lamination'], ['lamination', 'lamination']] },
  { chaves: ['cilio', 'cilios', 'extensao', 'lash'], base: 'cilios', padrao: '', prefer: [] as string[][] }
];
export const norm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function impServicos(nx: string, servicos: Linha[]): Linha[] {
  const tem = (w: string) => nx.indexOf(' ' + w) >= 0;
  const nomes = servicos.map((s) => ({ s, n: norm(s.nome) }));
  const escolhidos: Linha[] = [];
  const add = (s: Linha | null) => { if (s && escolhidos.indexOf(s) < 0) escolhidos.push(s); };
  if (tem('pacote') || tem('combo')) {
    const pac = nomes.find((x) => x.n.indexOf('pacote') >= 0 || x.n.indexOf('combo') >= 0);
    if (pac) return [pac.s];
  }
  for (const x of nomes) if (x.n && nx.indexOf(' ' + x.n + ' ') >= 0) add(x.s);
  const jaCobre = (g: Linha) => escolhidos.some((s) => { const n = norm(s.nome); return n.indexOf(g.base) >= 0 || g.chaves.some((c: string) => n.split(' ').indexOf(c) >= 0); });
  const temMaqOuPent = ['make', 'maquiagem', 'makeup', 'maquiar', 'penteado', 'cabelo', 'escova'].some(tem);
  for (const g of IMP_GRUPOS) {
    const acionado = g.chaves.some((c) => ((c === 'noiva' || c === 'madrinha') && temMaqOuPent) ? false : tem(c));
    if (!acionado || jaCobre(g)) continue;
    let achou: Linha | null = null;
    for (const [palavra, trecho] of g.prefer) {
      if (achou || !tem(palavra)) continue;
      const cand = nomes.filter((x) => x.n.indexOf(trecho) >= 0 && x.n.indexOf('pacote') < 0);
      achou = (cand.find((x) => x.n.indexOf(g.base) >= 0) || cand[0] || { s: null }).s;
    }
    if (!achou) {
      const base = nomes.filter((x) => x.n.indexOf(g.base) >= 0 && x.n.indexOf('pacote') < 0 && x.n.indexOf('noiva') < 0 && x.n.indexOf('madrinha') < 0);
      const qualquer = nomes.filter((x) => x.n.indexOf(g.base) >= 0 && x.n.indexOf('pacote') < 0);
      achou = ((g.padrao && base.find((x) => x.n.indexOf(g.padrao) >= 0)) || base[0] || qualquer[0] || { s: null }).s;
    }
    add(achou);
  }
  return escolhidos;
}

export function impSugerir(titulo: string, desc: string, clientes: Linha[], servicos: Linha[]) {
  const texto = titulo + ' ' + desc;
  const nt = ' ' + norm(titulo) + ' ', nx = ' ' + norm(texto) + ' ';
  let tel = '';
  const mt = texto.match(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]?\d{4}/);
  if (mt) { tel = fone(mt[0]); if (tel.length < 12 || tel.length > 13) tel = ''; }
  let cliente: Linha | null = null;
  if (tel) { const k = foneChave(tel); cliente = clientes.find((c) => c.telefone && foneChave(c.telefone) === k) || null; }
  if (!cliente) {
    const cand: Linha[] = [];
    for (const c of clientes) {
      const n = norm(c.nome); if (!n) continue;
      const partes = n.split(' ');
      let score = 0;
      if (nx.indexOf(' ' + n + ' ') >= 0) score = 3;
      else if (partes.length > 1 && nt.indexOf(' ' + partes[0] + ' ') >= 0 && nt.indexOf(' ' + partes[partes.length - 1] + ' ') >= 0) score = 2;
      else if (partes[0].length >= 3 && nt.indexOf(' ' + partes[0] + ' ') >= 0) score = 1;
      if (score) cand.push({ c, score });
    }
    cand.sort((a, b) => b.score - a.score);
    const soPrimeiro = cand.filter((x) => x.score === 1).length;
    if (cand.length && (cand[0].score >= 2 || soPrimeiro === 1)) cliente = cand[0].c;
  }
  const serv = impServicos(nx, servicos);
  let valor: number | null = null;
  const mv = texto.match(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (mv) valor = num(mv[1]);
  let nomeNovo = '';
  if (!cliente) {
    const palavrasServ: Linha = {};
    for (const s of serv) for (const w of norm(s.nome).split(' ')) palavrasServ[w] = 1;
    const limpo = titulo.replace(/R\$\s*[\d.,]+/g, ' ').replace(/\d+/g, ' ');
    nomeNovo = limpo.split(/[^A-Za-zÀ-ÿ']+/).filter((w) => { const n = norm(w); return n.length > 1 && IMP_IGNORAR.indexOf(n) < 0 && !palavrasServ[n]; })
      .slice(0, 4).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return { clienteId: cliente ? cliente.id : '', clienteNome: cliente ? cliente.nome : '', nomeNovo, telefone: tel,
    servicoIds: serv.map((x) => x.id), valor, provavel: !!(cliente || tel || serv.length) };
}

async function impPrevia(p: Linha, ctx: Ctx) {
  if (!(await gAtivo(ctx))) throw erro('Conecte o Google Agenda em Configurações primeiro.');
  const ini = /^\d{4}-\d{2}-\d{2}$/.test(p.inicio || '') ? dataOk(p.inicio) : addMeses(hoje(), -1);
  const fim = /^\d{4}-\d{2}-\d{2}$/.test(p.fim || '') ? dataOk(p.fim) : addMeses(hoje(), 6);
  if (fim < ini) throw erro('A data final precisa ser depois da inicial.');
  const [evs, clientes, servicos, g] = await Promise.all([
    gEventos(ctx, ini, fim), ctx.db.sel('clientes', { cols: ['id', 'nome', 'telefone'] }),
    ctx.db.sel('servicos', { eq: { ativo: true } }), gCfg(ctx)
  ]);
  const ids = evs.map((e) => e.id);
  const ligados = new Set((await porEventos(ctx, ids, ['eventId'])).map((a) => a.eventId));
  const out: Linha[] = [];
  const vistosRec: Linha = {};
  for (const ev of evs) {
    if (ligados.has(ev.id) || (ev.start && ev.start.date)) continue;
    const desc = String(ev.description || '');
    if (/Criado pelo /.test(desc)) continue;
    const recorrente = !!ev.recurringEventId;
    if (recorrente) { if (vistosRec[ev.recurringEventId]) continue; vistosRec[ev.recurringEventId] = 1; }
    const titulo = String(ev.summary || '');
    const sug = impSugerir(titulo, desc, clientes, servicos);
    out.push({ eventId: ev.id, titulo, descricao: desc.slice(0, 300), recorrente, inicio: doGoogle(ev.start), fim: doGoogle(ev.end),
      clienteId: sug.clienteId, clienteNome: sug.clienteNome, nomeNovo: sug.nomeNovo, telefone: sug.telefone,
      servicoIds: sug.servicoIds, valor: sug.valor, provavel: sug.provavel && !recorrente });
  }
  return { eventos: out.slice(0, 600), total: out.length, agenda: g.calendarNome || g.email || 'Google Agenda', inicio: ini, fim };
}

async function impAcharOuCriarCliente(nome: string, telefone: string, ctx: Ctx) {
  nome = String(nome || '').trim();
  const tel = fone(telefone);
  const todos = await ctx.db.sel('clientes', { cols: ['id', 'nome', 'telefone'] });
  let achada = tel && tel.length >= 12 ? todos.find((c) => c.telefone && foneChave(c.telefone) === foneChave(tel)) : null;
  if (!achada) achada = todos.find((c) => norm(c.nome) === norm(nome));
  if (achada) {
    if (tel && tel.length >= 12 && !achada.telefone) await ctx.db.upd('clientes', achada.id, { telefone: tel });
    return { id: achada.id, nova: false };
  }
  return { id: (await cliSalvar({ nome, telefone: tel, forcar: true }, ctx)).id, nova: true };
}

async function impImportar(p: Linha, ctx: Ctx) {
  if (!(await gAtivo(ctx))) throw erro('Conecte o Google Agenda em Configurações primeiro.');
  const g = await gCfg(ctx);
  const itens = (p.itens || []).slice(0, 40);
  const ids = itens.map((i: Linha) => i.eventId);
  const ligados = new Set((await porEventos(ctx, ids, ['eventId'])).map((a) => a.eventId));
  const servMap: Linha = {};
  for (const s of await ctx.db.sel('servicos')) servMap[s.id] = s;
  const ag = agora().slice(0, 16);
  const res: Linha = { importados: 0, clientesNovas: 0, lancados: 0, erros: [] };
  for (const it of itens) {
    try {
      if (ligados.has(it.eventId)) continue;
      const ev = await gApi(ctx, 'GET', evPath(g, it.eventId)).catch((e: any) => { if (e.status === 404) return null; throw e; });
      if (!ev || ev.status === 'cancelled') throw new Error('evento não encontrado na agenda');
      if (ev.recurringEventId || ev.recurrence) throw new Error('evento que se repete não pode ser importado');
      let clienteId = it.clienteId;
      if (!clienteId) {
        if (!it.novaCliente || !String(it.novaCliente.nome || '').trim()) throw new Error('informe a cliente');
        const r = await impAcharOuCriarCliente(it.novaCliente.nome, it.novaCliente.telefone, ctx);
        clienteId = r.id; if (r.nova) res.clientesNovas++;
      }
      const cli = await ctx.db.um('clientes', clienteId);
      if (!cli) throw new Error('cliente não encontrada');
      const servs = (it.servicoIds || []).map((id: string) => servMap[id]).filter(Boolean)
        .map((s: Linha) => ({ id: s.id, nome: s.nome, categoria: s.categoria, preco: num(s.preco), duracao: num(s.duracao), cor: s.cor }));
      if (!servs.length) throw new Error('escolha o serviço');
      const inicio = doGoogle(ev.start).slice(0, 16), fim = doGoogle(ev.end).slice(0, 16);
      const valor = it.valor !== null && it.valor !== undefined && it.valor !== '' ? round2(num(it.valor)) : servs.reduce((t: number, s: Linha) => t + s.preco, 0);
      const original = String(ev.description || '').trim(), titulo = String(ev.summary || '').trim();
      const localOriginal = String(ev.location || '').trim();
      const a = await ctx.db.ins('agendamentos', {
        clienteId: cli.id, clienteNome: cli.nome, telefone: cli.telefone, servicos: servs, servicoNomes: servs.map((s: Linha) => s.nome).join(' + '),
        profissionalId: it.profissionalId || '', inicio, fim, status: fim <= ag ? 'concluido' : 'agendado',
        valor, desconto: 0, sinal: 0, local: localOriginal || 'Studio',
        observacoes: ('Importado do Google Agenda: "' + titulo + '"' + (original ? '\n' + original : '')).slice(0, 3000),
        eventId: ev.id, syncStatus: 'ok', origem: { titulo, descricao: original, local: localOriginal, cor: ev.colorId || '' }
      });
      if (a.status === 'concluido') {
        if (p.lancarPassados) {
          const l = await finDoAtendimento(a, 'Não informado', true, ctx);
          if (l) { await ctx.db.upd('agendamentos', a.id, { lancamentoId: l.id }); res.lancados++; }
        }
      } else if (p.renomear !== false) await gPush(a, ctx);
      ligados.add(it.eventId);
      res.importados++;
    } catch (e: any) { res.erros.push({ eventId: it.eventId, erro: String(e.message || e) }); }
  }
  return res;
}

async function impDesfazer(p: Linha, ctx: Ctx) {
  const a = await ctx.db.um('agendamentos', p.id);
  if (!a) throw erro('Agendamento não encontrado.');
  const o = a.origem;
  if (!o) throw erro('Este atendimento não veio do Google Agenda.');
  if (a.eventId && (await gAtivo(ctx))) {
    const g = await gCfg(ctx);
    const corpo: Linha = { summary: o.titulo || '', description: o.descricao || '', location: o.local || '' };
    if (o.cor) corpo.colorId = o.cor;
    await gApi(ctx, 'PATCH', evPath(g, a.eventId), corpo).catch(() => {});
  }
  await agTratarFinanceiro(a.id, 'remover', ctx);
  await ctx.db.del('agendamentos', a.id);
  return true;
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
  // Google Agenda
  'google.status': { fn: gStatus, admin: true },
  'google.iniciar': { fn: gIniciar, admin: true },
  'google.desconectar': { fn: gDesconectar, admin: true },
  'google.calendarios': { fn: gCalendarios, admin: true },
  'google.salvar': { fn: gSalvar, admin: true },
  'google.sincronizar': { fn: gSincronizar, admin: true },
  'cfg.calendarios': { fn: gCalendarios, admin: true },
  'agenda.ressincronizar': { fn: agRessincronizar, admin: true },
  'agenda.importarPrevia': { fn: impPrevia, admin: true },
  'agenda.importar': { fn: impImportar, admin: true },
  'agenda.desfazerImportacao': { fn: impDesfazer, admin: true },
  // próxima fase
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
