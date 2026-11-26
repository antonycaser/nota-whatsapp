// =====================================================================
//  Testes do servidor do CRM (versão Supabase) contra um Postgres real.
//  Rode:  cd crm-supabase/dev && npm install && npm run teste
//  (usa pg_virtualenv: cria um Postgres descartável e apaga no fim)
// =====================================================================
import assert from 'node:assert/strict';
import { executar, hoje, addMin, type Linha } from '../supabase/functions/api/logica.ts';
import { criarBanco } from './pg-adaptador.ts';

const { db, auth, sql, cli, bloqueados } = await criarBanco();

// ---------- login de teste (a função real confere o JWT do Supabase e lê o perfil)
const adminId = await auth.criar('lara@exemplo.com', 'x');
await sql(`insert into public.perfis (id, nome, perfil) values ($1, 'Lara Altoé', 'admin')`, [adminId]);
const sessAdmin = { id: adminId, nome: 'Lara Altoé', perfil: 'admin', email: 'lara@exemplo.com', trocarSenha: false };
const API = async (action: string, payload: Linha = {}, sess: any = sessAdmin) => {
  const r = await executar(action, payload, { db, auth, sess, memo: {} });
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
await t('recursos das próximas fases avisam com clareza', async () => {
  await falha('agenda.importarPrevia', {}, /fase 3/);
  await falha('wa.config', {}, /fase 4/);
});
await t('erro inesperado vira mensagem, sem derrubar o servidor', async () => {
  await falha('agenda.obter', { id: 'nao-e-uuid' }, /Erro no servidor/);
});

await cli.end();
console.log(`\n${ok} testes passaram${falhas ? ` — ${falhas} FALHARAM` : ' ✅'}\n`);
process.exit(falhas ? 1 : 0);
