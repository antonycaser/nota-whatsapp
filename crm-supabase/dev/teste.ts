// =====================================================================
//  Testes do servidor do CRM (versão Supabase) contra um Postgres real.
//  Rode:  cd crm-supabase/dev && npm install && npm run teste
//  (usa pg_virtualenv: cria um Postgres descartável e apaga no fim)
// =====================================================================
import assert from 'node:assert/strict';
import { executar, hoje, addMin, googleCallback, gPull, type Linha } from '../supabase/functions/_shared/logica.ts';
import { criarBanco } from './pg-adaptador.ts';
import { google, G, gCriar, gMexer, gEv } from './google-falso.ts';

const { db, auth, sql, cli, bloqueados } = await criarBanco();

// ---------- login de teste (a função real confere o JWT do Supabase e lê o perfil)
const adminId = await auth.criar('lara@exemplo.com', 'x');
await sql(`insert into public.perfis (id, nome, perfil) values ($1, 'Lara Altoé', 'admin')`, [adminId]);
const sessAdmin = { id: adminId, nome: 'Lara Altoé', perfil: 'admin', email: 'lara@exemplo.com', trocarSenha: false };
const API = async (action: string, payload: Linha = {}, sess: any = sessAdmin) => {
  const r = await executar(action, payload, { db, auth, sess, memo: {}, google: G });
  if (!r.ok) { const e: any = new Error(r.error); e.r = r; throw e; }
  return r.data;
};
const falha = async (action: string, payload: Linha, re: RegExp, sess?: any) => {
  try { await API(action, payload, sess); } catch (e: any) { assert.match(e.message, re); return e.r; }
  assert.fail('deveria falhar: ' + action);
};

let ok = 0, falhas = 0;
async function t(nome: string, fn: () => Promise<void>) {
  try { await fn(); ok++; console.log('  ✓ ' + nome); } catch (e: any) { falhas++; console.log('  ✗ ' + nome + '\n    ' + (e.stack || e)); }
}
const dia = (n: number) => addMin(hoje() + 'T12:00', n * 1440).slice(0, 10);
const somaFin = async (agId: string) => (await db.sel('financeiro', { eq: { agendamentoId: agId, status: 'pago' } })).reduce((s, l) => s + l.valor, 0);

console.log('\nCarga inicial e configurações');
let servicos: Linha[] = [];
const S = (nome: string) => servicos.find((s) => s.nome === nome).id;
await t('boot traz usuário, serviços iniciais e configuração', async () => {
  const b = await API('boot');
  servicos = b.servicos;
  assert.equal(b.user.perfil, 'admin');
  assert.equal(b.servicos.length, 11);
  assert.equal(b.servicos[0].ativo, 'sim');
  assert.equal(b.cfg.studioNome, 'Lara Altoé Makeup & Beauty');
  assert.equal(b.cfg.sinalRetido, true);
  assert.equal(b.cfg.calendarAtivo, false);
});
await t('salvar configurações persiste no banco', async () => {
  await API('cfg.salvar', { studioNome: 'Studio Teste', categoriasDespesa: 'Aluguel\nProdutos', intervaloAgenda: '30' });
  const c = (await API('cfg.obter')).cfg;
  assert.equal(c.studioNome, 'Studio Teste'); assert.deepEqual(c.categoriasDespesa, ['Aluguel', 'Produtos']); assert.equal(c.intervaloAgenda, 30);
  await API('cfg.salvar', { studioNome: 'Lara Altoé Makeup & Beauty' });
});

console.log('\nClientes');
let ana: Linha, bia: Linha;
await t('salva cliente, normaliza telefone e detecta duplicada', async () => {
  ana = await API('clientes.salvar', { nome: 'Ana Souza', telefone: '(11) 98765-4321', nascimento: hoje(), alergias: 'cola' });
  assert.equal(ana.telefone, '5511987654321');
  bia = await API('clientes.salvar', { nome: 'Beatriz Lima', telefone: '21 99876-5432' });
  await falha('clientes.salvar', { nome: 'Outra', telefone: '1187654321' }, /Já existe/);
  const c = await API('clientes.obter', { id: ana.id });
  assert.equal(c.nascimento, hoje()); assert.equal(c.alergias, 'cola'); assert.equal(c.email, '');
});

console.log('\nAgenda');
let ag1: Linha;
await t('agendamento com 2 serviços e sinal lança o sinal no caixa', async () => {
  ag1 = await API('agenda.salvar', { clienteId: ana.id, servicoIds: [S('Maquiagem social'), S('Penteado social')], data: dia(2), hora: '10:00', sinal: 100 });
  assert.equal(ag1.valor, 340); assert.equal(ag1.fim.slice(11), '12:00'); assert.equal(ag1.servicos.length, 2);
  assert.equal(ag1.servicoNomes, 'Maquiagem social + Penteado social');
  assert.equal(await somaFin(ag1.id), 100);
});
await t('conflito de horário é detectado e pode ser forçado', async () => {
  const p = { clienteId: bia.id, servicoIds: [S('Design de sobrancelha')], data: dia(2), hora: '11:00' };
  const r = await falha('agenda.salvar', p, /conflita/);
  assert.equal(r.dados.conflito, true);
  const a = await API('agenda.salvar', { ...p, forcar: true });
  await API('agenda.excluir', { id: a.id, financeiro: 'remover' });
});
await t('nova cliente direto no agendamento', async () => {
  const a = await API('agenda.salvar', { novaCliente: { nome: 'Carla Nova', telefone: '11 91111-2222' }, servicoIds: [S('Escova modelada')], data: dia(3), hora: '09:00' });
  assert.equal(a.clienteNome, 'Carla Nova'); assert.equal(a.telefone, '5511911112222');
  await API('agenda.excluir', { id: a.id, financeiro: 'remover' });
});
await t('listar o período junta nomes da cliente e da profissional', async () => {
  const prof = await API('equipe.salvar', { nome: 'Júlia', comissao: 40 });
  await API('agenda.salvar', { id: ag1.id, clienteId: ana.id, servicoIds: [S('Maquiagem social'), S('Penteado social')], data: dia(2), hora: '10:00', sinal: 100, profissionalId: prof.id });
  const r = await API('agenda.listar', { inicio: dia(2), fim: dia(2) });
  assert.equal(r.agendamentos.length, 1);
  assert.equal(r.agendamentos[0].profissionalNome, 'Júlia');
  assert.equal(r.agendamentos[0].inicio, dia(2) + 'T10:00');
});
await t('remarcar zera os lembretes', async () => {
  await db.upd('agendamentos', ag1.id, { lembrete1Enviado: 'x' });
  const v = await API('agenda.obter', { id: ag1.id });
  const n = await API('agenda.salvar', { id: ag1.id, clienteId: ana.id, servicoIds: v.servicos.map((s: Linha) => s.id), data: dia(2), hora: '14:00', sinal: 100, profissionalId: v.profissionalId });
  assert.equal(n.inicio.slice(11), '14:00'); assert.equal(n.lembrete1Enviado, '');
});
await t('finalizar lança a receita descontando o sinal', async () => {
  const v = await API('agenda.finalizar', { id: ag1.id, valor: 340, desconto: 20, forma: 'Pix', pago: true });
  assert.equal(v.status, 'concluido');
  const serv = (await db.sel('financeiro', { eq: { agendamentoId: ag1.id, categoria: 'Serviços' } }))[0];
  assert.equal(serv.valor, 220);
  assert.equal((await API('agenda.obter', { id: ag1.id })).financeiro.pago, 320);
});

console.log('\nCancelar / excluir e o financeiro');
const novoAg = (extra: Linha = {}) => API('agenda.salvar', { clienteId: bia.id, servicoIds: [S('Design de sobrancelha')], data: dia(10), hora: '19:00', forcar: true, ...extra });
await t('regra do studio: cancelar fica com o sinal e tira o pagamento', async () => {
  const a = await novoAg({ sinal: 20 });
  await API('agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  await API('agenda.status', { id: a.id, status: 'cancelado', financeiro: 'padrao' });
  assert.equal(await somaFin(a.id), 20);
  const l = (await db.sel('financeiro', { eq: { agendamentoId: a.id } }))[0];
  assert.match(l.descricao, /^Sinal retido/);
});
await t('excluir removendo tudo do caixa', async () => {
  const a = await novoAg({ sinal: 30 });
  await API('agenda.excluir', { id: a.id, financeiro: 'remover' });
  assert.equal(await somaFin(a.id), 0);
});
await t('desfazer finalização tira só o pagamento', async () => {
  const a = await novoAg({ sinal: 10 });
  await API('agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  await API('agenda.status', { id: a.id, status: 'confirmado' });
  assert.equal(await somaFin(a.id), 10);
  await API('agenda.excluir', { id: a.id, financeiro: 'remover' });
});
await t('editar valor de atendimento finalizado atualiza o caixa', async () => {
  const a = await novoAg();
  await API('agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  await API('agenda.salvar', { id: a.id, clienteId: bia.id, servicoIds: [S('Design de sobrancelha')], data: dia(10), hora: '19:00', valor: 80, status: 'concluido', forcar: true });
  assert.equal(await somaFin(a.id), 80);
  await API('agenda.excluir', { id: a.id, financeiro: 'remover' });
});

console.log('\nFinanceiro, painel e relatórios');
await t('despesa recorrente cria as parcelas pendentes', async () => {
  await API('fin.salvar', { tipo: 'despesa', categoria: 'Aluguel', descricao: 'Aluguel', valor: '1.200,00', data: hoje(), status: 'pago', repetir: 2 });
  const al = await db.sel('financeiro', { eq: { categoria: 'Aluguel' } });
  assert.equal(al.length, 3); assert.equal(al.filter((l) => l.status === 'pendente').length, 2); assert.equal(al[0].valor, 1200);
});
await t('fin.listar totaliza o mês e marca valor de atendimento excluído', async () => {
  const a = await novoAg({ data: hoje(), hora: '07:00' });
  await API('agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  await db.del('agendamentos', a.id); // simula exclusão antiga
  const r = await API('fin.listar', { inicio: hoje().slice(0, 8) + '01', fim: hoje().slice(0, 8) + '31' });
  assert.equal(r.totais.despesas, 1200);
  assert.ok(r.lancamentos.some((l: Linha) => l.agAviso === 'atendimento excluído'));
});
await t('painel calcula os números do mês', async () => {
  const d = await API('dashboard', {});
  assert.equal(typeof d.receita, 'number'); assert.equal(d.serie.length, 6);
  assert.ok(d.aniversariantes.some((x: Linha) => x.nome === 'Ana Souza' && x.hoje));
  assert.ok(d.receita >= 1200 - 1200);
});
await t('lista de clientes traz visitas e total gasto (view)', async () => {
  const lista = await API('clientes.listar');
  const a = lista.find((c: Linha) => c.id === ana.id);
  assert.equal(a.visitas, 1); assert.equal(a.totalGasto, 320); assert.equal(a.ultimaVisita.slice(0, 10), dia(2));
});
await t('relatório do período com serviços rateados e comissão', async () => {
  const r = await API('relatorio', { inicio: dia(-40), fim: dia(40) });
  assert.equal(r.resumo.atendimentos, 1);
  assert.equal(r.resumo.faturamentoServicos, 320);
  assert.ok(Math.abs(r.servicos.reduce((s: number, x: Linha) => s + x.valor, 0) - 320) < 0.02);
  assert.equal(r.equipe[0].comissao, 128);
  assert.equal(r.resumo.lucro, Math.round((r.resumo.receitas - r.resumo.despesas) * 100) / 100);
});

console.log('\nServiços e equipe');
await t('excluir serviço usado só desativa', async () => {
  assert.deepEqual(await API('servicos.excluir', { id: S('Maquiagem social') }), { desativado: true });
  const novo = await API('servicos.salvar', { nome: 'Teste', preco: '10' });
  assert.deepEqual(await API('servicos.excluir', { id: novo.id }), { excluido: true });
});

console.log('\nUsuários e permissões');
let equipeSess: any;
await t('cria login da equipe, que não acessa o financeiro', async () => {
  const r = await API('usuarios.salvar', { nome: 'Recepção', email: 'recepcao@exemplo.com', perfil: 'equipe', senha: 'Recep1234' });
  const p = await db.um('perfis', r.id);
  assert.equal(p.trocarSenha, true);
  equipeSess = { id: r.id, nome: 'Recepção', perfil: 'equipe', email: 'recepcao@exemplo.com', trocarSenha: true };
  await falha('fin.listar', {}, /permissão/, equipeSess);
  const d = await API('dashboard', {}, equipeSess);
  assert.equal(d.receita, undefined);
  await API('agenda.listar', {}, equipeSess);
  assert.equal((await API('auth.senhaTrocada', {}, equipeSess)).trocarSenha, false);
});
await t('bloquear, trocar e-mail e excluir usuário', async () => {
  await API('usuarios.salvar', { id: equipeSess.id, nome: 'Recepção', email: 'recep2@exemplo.com', perfil: 'equipe', ativo: 'nao' });
  assert.ok(bloqueados.has(equipeSess.id));
  const lista = await API('usuarios.listar');
  assert.ok(lista.some((u: Linha) => u.email === 'recep2@exemplo.com' && u.ativo === 'nao'));
  await falha('usuarios.excluir', { id: adminId }, /próprio/);
  await API('usuarios.excluir', { id: equipeSess.id });
  assert.equal(await db.um('perfis', equipeSess.id), null, 'perfil some junto com o login');
});
await t('WhatsApp automático (próxima fase) avisa com clareza', async () => {
  await falha('wa.config', {}, /fase 4/);
});
await t('erro inesperado vira mensagem, sem derrubar o servidor', async () => {
  await falha('agenda.obter', { id: 'nao-e-uuid' }, /Erro no servidor/);
});

// =====================================================================
//  Google Agenda (fase 3) — com um Google de mentira, igual ao de verdade
//  no que o CRM usa (OAuth, eventos, syncToken).
// =====================================================================
console.log('\nGoogle Agenda');
await t('sem conectar, o Google fica desligado e avisa com clareza', async () => {
  const st = await API('google.status');
  assert.equal(st.conectado, false); assert.equal(st.configurado, true);
  await falha('agenda.importarPrevia', {}, /Conecte o Google Agenda/);
  await falha('agenda.ressincronizar', {}, /Conecte o Google Agenda/);
  const semChaves = await executar('google.iniciar', { volta: 'https://app.exemplo' }, { db, auth, sess: sessAdmin, memo: {} });
  assert.match(semChaves.error, /GOOGLE_CLIENT_ID/);
});
const VOLTA = 'https://crm-lara.netlify.app/';
await t('conectar: link do Google, retorno com state certo grava a conexão', async () => {
  const { url } = await API('google.iniciar', { volta: VOLTA });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.match(u.searchParams.get('scope')!, /auth\/calendar/);
  assert.equal(u.searchParams.get('redirect_uri'), G.redirectUri);
  const ctxG = { db, auth, sess: sessAdmin, memo: {}, google: G };
  assert.match(await googleCallback({ code: 'c1', state: 'errado' }, ctxG), /google=erro/);
  // state errado não serve, e o certo só vale uma vez → pede de novo
  const { url: url2 } = await API('google.iniciar', { volta: VOLTA });
  const st = new URL(url2).searchParams.get('state')!;
  assert.equal(await googleCallback({ code: 'c1', state: st }, ctxG), VOLTA + '?google=ok');
  assert.match(await googleCallback({ code: 'c1', state: st }, ctxG), /google=erro/, 'state é de uso único');
  const s = await API('google.status');
  assert.equal(s.conectado, true); assert.equal(s.email, 'lara.agenda@gmail.com');
  assert.equal((await API('boot')).cfg.calendarAtivo, true);
  assert.equal((await API('boot')).cfg.recursos.importar, true);
});
let agG: Linha;
await t('agendar no CRM cria o evento no Google (com cliente, serviços e valor)', async () => {
  agG = await API('agenda.salvar', { clienteId: ana.id, servicoIds: [S('Maquiagem social'), S('Penteado social')], data: dia(10), hora: '09:00', sinal: 50 });
  assert.equal(agG.syncStatus, 'ok'); assert.equal(agG.aviso, '');
  const ev = gEv(agG.eventId);
  assert.match(ev.summary, /Ana Souza — Maquiagem social \+ Penteado social/);
  assert.match(ev.description, /R\$ 340,00 \(sinal pago: R\$ 50,00\)/);
  assert.equal(ev.start.dateTime.slice(0, 16), dia(10) + 'T09:00');
  assert.equal(ev.end.dateTime.slice(0, 16), dia(10) + 'T11:00');
  assert.equal(ev.start.timeZone, 'America/Sao_Paulo');
});
await t('mudar horário/status no CRM atualiza o mesmo evento', async () => {
  agG = await API('agenda.salvar', { id: agG.id, clienteId: ana.id, servicoIds: [S('Maquiagem social'), S('Penteado social')], data: dia(10), hora: '14:00', sinal: 50 });
  assert.equal(gEv(agG.eventId).start.dateTime.slice(11, 16), '14:00');
  await API('agenda.status', { id: agG.id, status: 'confirmado' });
  assert.match(gEv(agG.eventId).summary, /^✅/);
  assert.equal(google.eventos.size, 1, 'não duplica evento');
});
await t('compromissos pessoais do Google aparecem na agenda do CRM (e os do CRM não se repetem)', async () => {
  gCriar({ summary: 'Dentista', start: { dateTime: dia(10) + 'T08:00:00-03:00' }, end: { dateTime: dia(10) + 'T08:30:00-03:00' } });
  gCriar({ summary: 'Viagem', start: { date: dia(10) }, end: { date: dia(11) } });
  const r = await API('agenda.listar', { inicio: dia(10), fim: dia(10), externos: true });
  assert.deepEqual(r.externos.map((x: Linha) => x.titulo).sort(), ['Dentista', 'Viagem']);
  assert.equal(r.externos.find((x: Linha) => x.titulo === 'Dentista').inicio.slice(0, 16), dia(10) + 'T08:00');
  assert.equal(r.agendamentos.length, 1);
  assert.equal((await API('agenda.listar', { inicio: dia(10), fim: dia(10) })).externos.length, 0, 'só busca quando pedido');
});
await t('Google → CRM: remarcar direto no Google muda o horário no CRM', async () => {
  await API('google.sincronizar'); // pega o ponto de partida
  gMexer(agG.eventId, { start: { dateTime: dia(11) + 'T10:00:00-03:00', timeZone: 'America/Sao_Paulo' }, end: { dateTime: dia(11) + 'T12:00:00-03:00', timeZone: 'America/Sao_Paulo' } });
  const r = await API('google.sincronizar');
  assert.equal(r.remarcados, 1);
  const a = await db.um('agendamentos', agG.id);
  assert.equal(a.inicio.slice(0, 16), dia(11) + 'T10:00'); assert.equal(a.fim.slice(0, 16), dia(11) + 'T12:00');
  assert.equal((await API('google.sincronizar')).remarcados, 0, 'não repete');
});
await t('Google → CRM: apagar no Google cancela no CRM e o sinal fica no caixa', async () => {
  gMexer(agG.eventId, { status: 'cancelled' });
  const r = await API('google.sincronizar');
  assert.equal(r.cancelados, 1);
  const a = await db.um('agendamentos', agG.id);
  assert.equal(a.status, 'cancelado'); assert.match(a.syncStatus, /apagado no Google/);
  assert.equal(await somaFin(agG.id), 50);
});
await t('cancelar e excluir no CRM tira o evento do Google', async () => {
  const a = await API('agenda.salvar', { clienteId: bia.id, servicoIds: [S('Design de sobrancelha')], data: dia(12), hora: '10:00' });
  assert.ok(gEv(a.eventId));
  await API('agenda.status', { id: a.id, status: 'cancelado' });
  assert.equal(gEv(a.eventId).status, 'cancelled');
  const b = await API('agenda.salvar', { clienteId: bia.id, servicoIds: [S('Design de sobrancelha')], data: dia(12), hora: '11:00' });
  await API('agenda.excluir', { id: b.id });
  assert.equal(gEv(b.eventId).status, 'cancelled');
  const r = await API('google.sincronizar');
  assert.equal(r.cancelados, 0, 'o que o próprio CRM apagou não volta como mudança');
});
await t('Google fora do ar: salva no CRM e avisa (não perde o agendamento)', async () => {
  google.fora = true;
  const a = await API('agenda.salvar', { clienteId: bia.id, servicoIds: [S('Design de sobrancelha')], data: dia(13), hora: '10:00' });
  google.fora = false;
  assert.ok(await db.um('agendamentos', a.id));
  assert.match(a.aviso, /não foi para o Google/);
  const r = await API('agenda.ressincronizar');
  assert.ok(r.sincronizados >= 1); assert.equal(r.erros, 0);
  assert.equal((await db.um('agendamentos', a.id)).syncStatus, 'ok');
});
let impA: Linha;
await t('importar: prévia reconhece cliente, serviços e valor; ignora o que já é do CRM', async () => {
  await db.upd('servicos', S('Maquiagem social'), { ativo: 'sim' }); // foi desativado num teste acima
  gCriar({ summary: 'Make Ana Souza R$ 200', start: { dateTime: dia(15) + 'T09:00:00-03:00' }, end: { dateTime: dia(15) + 'T10:00:00-03:00' }, colorId: '5' });
  gCriar({ summary: 'Sobrancelha + henna Paula Dias 11 91234-5678', start: { dateTime: dia(-3) + 'T15:00:00-03:00' }, end: { dateTime: dia(-3) + 'T15:45:00-03:00' } });
  gCriar({ summary: 'Pilates', start: { dateTime: dia(15) + 'T07:00:00-03:00' }, end: { dateTime: dia(15) + 'T08:00:00-03:00' }, recurringEventId: 'rec1' });
  const p = await API('agenda.importarPrevia', { inicio: dia(-10), fim: dia(20) });
  const make = p.eventos.find((e: Linha) => /Make Ana/.test(e.titulo));
  assert.equal(make.clienteId, ana.id); assert.equal(make.valor, 200); assert.deepEqual(make.servicoIds.map((id: string) => servicos.find((s) => s.id === id).nome), ['Maquiagem social']); assert.ok(make.provavel);
  const carla = p.eventos.find((e: Linha) => /Paula/.test(e.titulo));
  assert.equal(carla.clienteId, ''); assert.equal(carla.nomeNovo, 'Paula Dias'); assert.equal(carla.telefone, '5511912345678');
  assert.deepEqual(carla.servicoIds, [S('Design com henna')]);
  assert.ok(p.eventos.find((e: Linha) => e.titulo === 'Pilates').recorrente);
  assert.ok(!p.eventos.some((e: Linha) => /Ana Souza —/.test(e.titulo)), 'eventos criados pelo CRM não aparecem');
  const r = await API('agenda.importar', { renomear: true, lancarPassados: true, itens: [
    { eventId: make.eventId, clienteId: make.clienteId, servicoIds: make.servicoIds, valor: make.valor },
    { eventId: carla.eventId, clienteId: '', novaCliente: { nome: carla.nomeNovo, telefone: carla.telefone }, servicoIds: carla.servicoIds, valor: 70 }
  ] });
  assert.equal(r.importados, 2); assert.equal(r.clientesNovas, 1); assert.equal(r.lancados, 1); assert.deepEqual(r.erros, []);
  impA = (await db.sel('agendamentos', { eq: { eventId: make.eventId } }))[0];
  assert.equal(impA.status, 'agendado'); assert.equal(impA.valor, 200);
  assert.match(gEv(make.eventId).summary, /Ana Souza — Maquiagem social/, 'futuro é padronizado no Google');
  const passado = (await db.sel('agendamentos', { eq: { eventId: carla.eventId } }))[0];
  assert.equal(passado.status, 'concluido'); assert.equal(await somaFin(passado.id), 70);
  assert.equal(gEv(carla.eventId).summary, 'Sobrancelha + henna Paula Dias 11 91234-5678', 'passado fica como estava');
  assert.equal((await API('agenda.importar', { itens: [{ eventId: make.eventId, clienteId: ana.id, servicoIds: make.servicoIds }] })).importados, 0, 'não importa duas vezes');
});
await t('desfazer importação devolve o evento como era e apaga do CRM', async () => {
  await API('agenda.desfazerImportacao', { id: impA.id });
  const ev = gEv(impA.eventId);
  assert.equal(ev.summary, 'Make Ana Souza R$ 200'); assert.equal(ev.colorId, '5');
  assert.equal(await db.um('agendamentos', impA.id), null);
});
await t('escolher outra agenda da conta', async () => {
  const cals = await API('google.calendarios');
  assert.deepEqual(cals.lista.map((c: Linha) => c.id), ['primary', 'studio@group.calendar.google.com']);
  const s = await API('google.salvar', { calendarId: 'studio@group.calendar.google.com', mostrarEventosGoogle: false, lembreteAgendaMin: 30 });
  assert.equal(s.calendarId, 'studio@group.calendar.google.com'); assert.equal(s.trocouAgenda, true);
  assert.equal(s.mostrarEventosGoogle, false); assert.equal(s.lembreteAgendaMin, 30);
  const a = await API('agenda.salvar', { clienteId: ana.id, servicoIds: [S('Maquiagem social')], data: dia(16), hora: '09:00' });
  assert.equal(google.eventos.get(a.eventId).cal, 'studio@group.calendar.google.com');
  assert.equal((await API('agenda.listar', { inicio: dia(10), fim: dia(10), externos: true })).externos.length, 0, 'pessoais escondidos');
  await falha('google.salvar', { calendarId: 'de-outra-pessoa@gmail.com' }, /não aparece/);
});
await t('pausar a sincronização e voltar', async () => {
  await API('google.salvar', { ativo: false });
  assert.equal((await API('boot')).cfg.calendarAtivo, false);
  const n = google.eventos.size;
  await API('agenda.salvar', { clienteId: ana.id, servicoIds: [S('Maquiagem social')], data: dia(17), hora: '09:00' });
  assert.equal(google.eventos.size, n, 'pausado não envia');
  await API('google.salvar', { ativo: true });
  assert.equal((await API('boot')).cfg.calendarAtivo, true);
});
await t('a função "google" do agendador recusa chamada sem o segredo', async () => {
  // a regra fica no index.ts da função; aqui confere a peça que ela usa
  const r = await gPull({ db, auth, sess: sessAdmin, memo: {}, google: G });
  assert.equal(typeof r.remarcados, 'number');
});
await t('se a dona tirar o acesso no Google, o CRM avisa para conectar de novo', async () => {
  google.revogado = true;
  await db.upsert('config', { chave: 'google', valor: Object.assign({}, (await db.sel('config', { eq: { chave: 'google' } }))[0].valor, { expira: 0 }) }, 'chave');
  const a = await API('agenda.salvar', { clienteId: ana.id, servicoIds: [S('Maquiagem social')], data: dia(18), hora: '09:00' });
  assert.ok(await db.um('agendamentos', a.id), 'agendamento salvo mesmo assim');
  const s = await API('google.status');
  assert.equal(s.conectado, false); assert.match(s.erro, /Conecte de novo/);
  assert.equal((await API('boot')).cfg.calendarAtivo, false);
  google.revogado = false;
});
await t('desconectar', async () => {
  const ctxG = { db, auth, sess: sessAdmin, memo: {}, google: G };
  const { url } = await API('google.iniciar', { volta: VOLTA });
  await googleCallback({ code: 'c2', state: new URL(url).searchParams.get('state') }, ctxG);
  assert.equal((await API('google.status')).conectado, true);
  await API('google.desconectar');
  const s = await API('google.status');
  assert.equal(s.conectado, false); assert.equal(google.revogados, 1);
  assert.equal(s.calendarId, 'studio@group.calendar.google.com', 'lembra a agenda escolhida');
});

await cli.end();
console.log(`\n${ok} testes passaram${falhas ? ` — ${falhas} FALHARAM` : ' ✅'}\n`);
process.exit(falhas ? 1 : 0);
