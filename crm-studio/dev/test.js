/**
 * Teste ponta a ponta do backend do CRM usando o simulador (gas-mock.js).
 * Rode:  TZ=America/Sao_Paulo node crm-studio/dev/test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

require('./gas-mock.js');
const MOCK = globalThis.__MOCK;
MOCK.convertDates = true; // simula o Sheets transformando texto ISO em Date

const SRC = path.join(__dirname, '..', 'apps-script');
fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort().forEach(f => {
  vm.runInThisContext(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f });
});

let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log('  ✓ ' + nome); } catch (e) { console.error('  ✗ ' + nome + '\n    ' + (e.stack || e)); process.exitCode = 1; } };
const API = (token, action, payload) => {
  const r = JSON.parse(api(token, action, payload));
  if (!r.ok) { const e = new Error(r.error); e.r = r; throw e; }
  return r.data;
};
const pad = n => String(n).padStart(2, '0');
const local = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const em = (min) => { const d = new Date(Date.now() + min * 60000); d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / 5) * 5); return d; };

console.log('\nInstalação e login');
let senha, token, sess;
t('instalar() cria abas, serviços, admin e gatilho', () => {
  instalar();
  const linha = MOCK.logs.find(l => l.includes('Senha provisória'));
  assert(linha, 'senha não exibida');
  senha = linha.split('Senha provisória: ')[1].split(' ')[0];
  assert(ScriptApp.getProjectTriggers().length === 1);
  assert(db_all_('Servicos').length >= 10);
});
t('funções de editor bloqueadas fora do editor', () => {
  MOCK.activeEmail = '';
  assert.throws(() => instalar(), /editor/);
  assert.throws(() => redefinirSenhaAdmin(), /editor/);
  MOCK.activeEmail = undefined;
});
t('login com senha errada falha', () => {
  const r = JSON.parse(login('admin', 'errada123'));
  assert(!r.ok && /incorretos/.test(r.error));
});
t('login correto devolve token e pede troca de senha', () => {
  const r = JSON.parse(login('ADMIN ', senha));
  assert(r.ok, r.error);
  token = r.data.token; sess = r.data.user;
  assert(sess.trocarSenha === true && sess.perfil === 'admin');
});
t('api sem token é recusada com auth=false', () => {
  const r = JSON.parse(api('x', 'boot', {}));
  assert(!r.ok && r.auth === false);
});
t('troca de senha valida força e senha atual', () => {
  assert.throws(() => API(token, 'auth.alterarSenha', { atual: senha, nova: 'curta' }), /8 caracteres/);
  assert.throws(() => API(token, 'auth.alterarSenha', { atual: 'errada', nova: 'NovaSenha123' }), /atual/);
  const s = API(token, 'auth.alterarSenha', { atual: senha, nova: 'NovaSenha123' });
  assert(s.trocarSenha === false);
  assert(JSON.parse(login('admin', 'NovaSenha123')).ok);
});
t('bloqueio após 5 tentativas erradas', () => {
  for (let i = 0; i < 5; i++) login('admin', 'x' + i);
  const r = JSON.parse(login('admin', 'NovaSenha123'));
  assert(!r.ok && /Muitas tentativas/.test(r.error));
  CacheService.getScriptCache().remove('falha_admin');
});

console.log('\nCadastros');
let ana, bia, servMake, servPent, servSob, prof;
t('salva cliente e normaliza telefone', () => {
  ana = API(token, 'clientes.salvar', { nome: 'Ana Souza', telefone: '(11) 98765-4321', nascimento: local(new Date()), alergias: 'cola de cílios' });
  assert.strictEqual(ana.telefone, '5511987654321');
  bia = API(token, 'clientes.salvar', { nome: 'Beatriz Lima', telefone: '21 99876-5432' });
});
t('detecta telefone duplicado (inclusive sem o 9º dígito)', () => {
  assert.throws(() => API(token, 'clientes.salvar', { nome: 'Ana 2', telefone: '1187654321' }), /Já existe/);
});
t('profissional e serviços', () => {
  prof = API(token, 'equipe.salvar', { nome: 'Júlia', comissao: 40, cor: '#257de0' });
  const b = API(token, 'boot');
  servMake = b.servicos.find(s => s.nome === 'Maquiagem social');
  servPent = b.servicos.find(s => s.nome === 'Penteado social');
  servSob = b.servicos.find(s => s.nome === 'Design de sobrancelha');
  assert(servMake && servPent && servSob);
  assert.strictEqual(b.clientes.length, 2);
});

console.log('\nAgenda + Google Agenda');
let ag1, ag2;
t('agendamento com 2 serviços cria evento no Google Agenda', () => {
  const amanha = em(26 * 60);
  ag1 = API(token, 'agenda.salvar', { clienteId: ana.id, servicoIds: [servMake.id, servPent.id], profissionalId: prof.id,
    data: local(amanha), hora: '10:00', sinal: 100, local: 'Studio' });
  assert.strictEqual(ag1.valor, 340);
  assert.strictEqual(ag1.fim.slice(11), '12:00');
  assert.strictEqual(ag1.syncStatus, 'ok');
  const ev = Object.values(MOCK.events)[0];
  assert(ev.title.includes('Ana Souza') && ev.title.includes('Maquiagem social + Penteado social'));
  assert(ev.desc.includes('cola de cílios'), 'alergia na descrição do evento');
  assert.strictEqual(ev.color, '7');
});
t('sinal virou lançamento de receita', () => {
  const l = db_all_('Financeiro').filter(x => x.agendamentoId === ag1.id);
  assert.strictEqual(l.length, 1); assert.strictEqual(l[0].valor, 100); assert.strictEqual(l[0].categoria, 'Sinal / Reserva');
});
t('conflito de horário é detectado e pode ser forçado', () => {
  const p = { clienteId: bia.id, servicoIds: [servSob.id], profissionalId: prof.id, data: ag1.inicio.slice(0, 10), hora: '11:00' };
  try { API(token, 'agenda.salvar', p); assert.fail('deveria conflitar'); } catch (e) { assert(e.r && e.r.dados && e.r.dados.conflito, e.message); }
  ag2 = API(token, 'agenda.salvar', Object.assign({ forcar: true }, p));
  assert(ag2.id);
});
t('listar agenda junta cliente/profissional e mostra eventos externos', () => {
  const d = ag1.inicio.slice(0, 10);
  MOCK.addExterno('Dentista', new Date(d + 'T15:00'), new Date(d + 'T16:00'));
  const r = API(token, 'agenda.listar', { inicio: d, fim: d, externos: true });
  assert.strictEqual(r.agendamentos.length, 2);
  assert.strictEqual(r.agendamentos[0].profissionalNome, 'Júlia');
  assert.strictEqual(r.externos.length, 1);
  assert.strictEqual(r.externos[0].titulo, 'Dentista');
});
t('remarcar atualiza o evento e zera lembretes', () => {
  db_update_('Agendamentos', ag2.id, { lembrete1Enviado: 'x' });
  const v = API(token, 'agenda.salvar', { id: ag2.id, clienteId: bia.id, servicoIds: [servSob.id], profissionalId: prof.id, data: ag1.inicio.slice(0, 10), hora: '14:00' });
  assert.strictEqual(v.inicio.slice(11), '14:00');
  assert.strictEqual(v.lembrete1Enviado, '');
  const ev = MOCK.events[db_get_('Agendamentos', ag2.id).eventId];
  assert.strictEqual(ev.start.getHours(), 14);
});
t('cancelar remove do Google Agenda', () => {
  const v = API(token, 'agenda.status', { id: ag2.id, status: 'cancelado' });
  assert.strictEqual(v.syncStatus, 'removido');
  assert.strictEqual(Object.values(MOCK.events).filter(e => e.title.includes('Beatriz')).length, 0);
});
t('finalizar lança receita descontando o sinal', () => {
  const v = API(token, 'agenda.finalizar', { id: ag1.id, valor: 340, desconto: 20, forma: 'Pix', pago: true });
  assert.strictEqual(v.status, 'concluido');
  const serv = db_all_('Financeiro').find(x => x.agendamentoId === ag1.id && x.categoria === 'Serviços');
  assert.strictEqual(serv.valor, 220); // 340 - 20 - 100
  const ev = MOCK.events[db_get_('Agendamentos', ag1.id).eventId];
  assert(ev.title.startsWith('💖')); assert.strictEqual(ev.color, '10');
});

console.log('\nCancelar/excluir mexe no financeiro');
const somaAg = id => db_all_('Financeiro').filter(l => l.agendamentoId === id && l.status === 'pago').reduce((s, l) => s + l.valor, 0);
const novoAg = (extra) => { const d = em(50 * 60 + Math.floor(Math.random() * 3000)); return API(token, 'agenda.salvar', Object.assign({ clienteId: ana.id, servicoIds: [servSob.id], data: local(d), hora: '19:00', forcar: true }, extra || {})); };
t('excluir atendimento pago tira o valor do caixa', () => {
  const a = novoAg(); API(token, 'agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  assert.strictEqual(somaAg(a.id), 50);
  assert.strictEqual(API(token, 'agenda.obter', { id: a.id }).financeiro.pago, 50);
  API(token, 'agenda.excluir', { id: a.id, financeiro: 'remover' });
  assert.strictEqual(somaAg(a.id), 0);
});
t('excluir mantendo o sinal no caixa', () => {
  const a = novoAg({ sinal: 30 });
  API(token, 'agenda.excluir', { id: a.id, financeiro: 'manter' });
  assert.strictEqual(somaAg(a.id), 30);
});
t('cancelar tira o sinal e o pagamento do caixa', () => {
  const a = novoAg({ sinal: 20 }); API(token, 'agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  assert.strictEqual(somaAg(a.id), 50);
  API(token, 'agenda.status', { id: a.id, status: 'cancelado', financeiro: 'remover' });
  assert.strictEqual(somaAg(a.id), 0);
});
t('regra do studio: cancelar fica com o sinal e tira só o pagamento', () => {
  const a = novoAg({ sinal: 20 }); API(token, 'agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  API(token, 'agenda.status', { id: a.id, status: 'cancelado', financeiro: 'padrao' });
  assert.strictEqual(somaAg(a.id), 20);
  const l = db_all_('Financeiro').find(x => x.agendamentoId === a.id);
  assert(/^Sinal retido/.test(l.descricao));
  const r = API(token, 'fin.listar', { inicio: l.data, fim: l.data });
  assert(!r.lancamentos.find(x => x.id === l.id).agAviso, 'sinal retido não aparece como pendência');
});
t('regra do studio: excluir só com sinal mantém o sinal', () => {
  const a = novoAg({ sinal: 40 });
  API(token, 'agenda.excluir', { id: a.id, financeiro: 'padrao' });
  assert.strictEqual(somaAg(a.id), 40);
});
t('com a regra desligada, cancelar devolve o sinal', () => {
  API(token, 'cfg.salvar', { sinalRetido: false });
  assert.strictEqual(API(token, 'boot').cfg.sinalRetido, false);
  const a = novoAg({ sinal: 15 });
  API(token, 'agenda.status', { id: a.id, status: 'cancelado', financeiro: 'padrao' });
  assert.strictEqual(somaAg(a.id), 0);
  API(token, 'cfg.salvar', { sinalRetido: true });
});
t('desfazer finalização tira só o pagamento (sinal fica)', () => {
  const a = novoAg({ sinal: 20 }); API(token, 'agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  API(token, 'agenda.status', { id: a.id, status: 'confirmado' });
  assert.strictEqual(somaAg(a.id), 20);
  assert.strictEqual(db_get_('Agendamentos', a.id).lancamentoId, '');
});
t('editar valor de atendimento finalizado atualiza o caixa', () => {
  const a = novoAg(); API(token, 'agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  const v = API(token, 'agenda.obter', { id: a.id });
  API(token, 'agenda.salvar', { id: a.id, clienteId: v.clienteId, servicoIds: v.servicos.map(s => s.id), data: v.inicio.slice(0, 10), hora: v.inicio.slice(11, 16), valor: 80, desconto: 0, sinal: 0, status: 'concluido', forcar: true });
  assert.strictEqual(somaAg(a.id), 80);
  API(token, 'agenda.excluir', { id: a.id, financeiro: 'remover' });
});
t('tirar o sinal na edição apaga o lançamento do sinal', () => {
  const a = novoAg({ sinal: 25 });
  const v = API(token, 'agenda.obter', { id: a.id });
  API(token, 'agenda.salvar', { id: a.id, clienteId: v.clienteId, servicoIds: v.servicos.map(s => s.id), data: v.inicio.slice(0, 10), hora: v.inicio.slice(11, 16), sinal: 0, forcar: true });
  assert.strictEqual(somaAg(a.id), 0);
});
t('financeiro sinaliza valor de atendimento excluído antes da correção', () => {
  const a = novoAg(); API(token, 'agenda.finalizar', { id: a.id, valor: 50, forma: 'Pix', pago: true });
  const ev = MOCK.events[db_get_('Agendamentos', a.id).eventId]; if (ev) ev.deleteEvent();
  db_delete_('Agendamentos', a.id); // simula o comportamento antigo
  const d = db_all_('Financeiro').find(l => l.agendamentoId === a.id).data;
  const r = API(token, 'fin.listar', { inicio: d, fim: d });
  assert(r.lancamentos.some(l => l.agendamentoId === a.id && l.agAviso === 'atendimento excluído'));
  db_all_('Financeiro').filter(l => l.agendamentoId === a.id).forEach(l => db_delete_('Financeiro', l.id));
});

console.log('\nFinanceiro e relatórios');
t('despesa recorrente cria parcelas pendentes', () => {
  API(token, 'fin.salvar', { tipo: 'despesa', categoria: 'Aluguel', descricao: 'Aluguel sala', valor: '1.200,00', data: local(new Date()), status: 'pago', repetir: 2 });
  const al = db_all_('Financeiro').filter(l => l.categoria === 'Aluguel');
  assert.strictEqual(al.length, 3);
  assert.strictEqual(al.filter(l => l.status === 'pendente').length, 2);
  assert.strictEqual(al[0].valor, 1200);
});
t('fin.listar totaliza o mês', () => {
  const hoje = local(new Date());
  const r = API(token, 'fin.listar', { inicio: hoje.slice(0, 8) + '01', fim: hoje.slice(0, 8) + '31' });
  assert.strictEqual(r.totais.despesas, 1200);
  assert(r.totais.receitas >= 100);
});
t('dashboard calcula KPIs', () => {
  const d = API(token, 'dashboard', {});
  assert(typeof d.receita === 'number' && d.serie.length === 6);
  assert(d.aniversariantes.some(a => a.nome === 'Ana Souza' && a.hoje));
});
t('relatório do período com DRE, serviços e comissões', () => {
  const ini = local(new Date(Date.now() - 40 * 86400000)), fim = local(new Date(Date.now() + 40 * 86400000));
  const r = API(token, 'relatorio', { inicio: ini, fim });
  assert.strictEqual(r.resumo.atendimentos, 1);
  assert.strictEqual(r.resumo.faturamentoServicos, 320);
  const soma = r.servicos.reduce((s, x) => s + x.valor, 0);
  assert(Math.abs(soma - 320) < 0.02, 'rateio dos serviços = ' + soma);
  assert.strictEqual(r.equipe[0].comissao, 128);
  assert.strictEqual(r.resumo.lucro, r.resumo.receitas - r.resumo.despesas);
});

console.log('\nImportar do Google Agenda');
t('sugere cliente, serviço e valor a partir dos eventos', () => {
  const base = em(3 * 24 * 60); const dia = local(base);
  const ev = (titulo, h, desc, extra) => MOCK.addExterno(titulo, new Date(dia + 'T' + h), new Date(new Date(dia + 'T' + h).getTime() + 3600000), Object.assign({ description: desc || '' }, extra || {}));
  ev('Ana Souza - Penteado social', '09:00');
  ev('Make Maria Clara 11 98888-7777', '10:30');
  ev('Beatriz escova R$ 120', '13:00');
  ev('Dentista', '15:00');
  ev('Henna', '16:00', 'Cliente: Juliana Prado (11) 97777-6666');
  ev('Aula de inglês', '18:00', '', { recorrente: true });
  const r = API(token, 'agenda.importarPrevia', { inicio: dia, fim: dia });
  const by = t => r.eventos.find(x => x.titulo === t);
  assert.strictEqual(by('Ana Souza - Penteado social').clienteId, ana.id);
  assert.deepStrictEqual(by('Ana Souza - Penteado social').servicoIds, [servPent.id]);
  const maria = by('Make Maria Clara 11 98888-7777');
  assert.strictEqual(maria.clienteId, ''); assert.strictEqual(maria.nomeNovo, 'Maria Clara'); assert.strictEqual(maria.telefone, '5511988887777');
  assert(maria.servicoIds.length === 1 && maria.provavel);
  const bea = by('Beatriz escova R$ 120');
  assert.strictEqual(bea.clienteId, bia.id); assert.strictEqual(bea.valor, 120);
  assert.strictEqual(by('Dentista').provavel, false);
  assert.strictEqual(by('Henna').telefone, '5511977776666');
  assert.strictEqual(by('Aula de inglês').recorrente, true);
  assert.strictEqual(by('Aula de inglês').provavel, false);
});
t('reconhece mais de um serviço no mesmo evento', () => {
  const dia = local(em(5 * 24 * 60));
  const nomes = ids => ids.map(id => db_get_('Servicos', id).nome).sort();
  const ev = (t, h) => MOCK.addExterno(t, new Date(dia + 'T' + h), new Date(new Date(dia + 'T' + h).getTime() + 3600000), {});
  const e1 = ev('Ana Souza make + penteado', '08:00');
  const e2 = ev('Noiva Bia - make e penteado', '09:00');
  const e3 = ev('Camila henna e design + cílios', '10:00');
  const e4 = ev('Pacote make e penteado Lu', '11:00');
  const e5 = ev('Noiva Patrícia', '12:00');
  const e6 = ev('Escova e make Bruna', '13:00');
  const r = API(token, 'agenda.importarPrevia', { inicio: dia, fim: dia });
  const sv = e => nomes(r.eventos.find(x => x.eventId === e.id).servicoIds);
  const s1 = sv(e1); assert.strictEqual(s1.length, 2); assert(s1.includes('Penteado social') && s1.some(n => /^Maquiagem/.test(n)), s1);
  assert.deepStrictEqual(sv(e2), ['Maquiagem de noiva', 'Penteado de noiva']);
  assert.deepStrictEqual(sv(e3), ['Cílios fio a fio', 'Design com henna']);
  assert.deepStrictEqual(sv(e4), ['Pacote Make + Penteado']);
  assert.deepStrictEqual(sv(e5), ['Maquiagem de noiva']);
  const s6 = sv(e6); assert(s6.includes('Escova modelada') && s6.some(n => /^Maquiagem/.test(n)) && s6.length === 2, s6);
  // importa com 2 serviços: valor e duração somados vêm do evento/serviços
  const res = API(token, 'agenda.importar', { itens: [{ eventId: e2.id, clienteId: bia.id, servicoIds: r.eventos.find(x => x.eventId === e2.id).servicoIds }] });
  assert.strictEqual(res.importados, 1);
  const a = db_all_('Agendamentos').find(x => x.eventId === e2.id);
  assert.strictEqual(a.servicoNomes, 'Maquiagem de noiva + Penteado de noiva');
  assert.strictEqual(a.valor, 650 + 450);
  API(token, 'agenda.excluir', { id: a.id, financeiro: 'remover' });
  [e1, e3, e4, e5, e6].forEach(e => e.deleteEvent());
});
t('importa sem duplicar o evento e cria a cliente nova', () => {
  const dia = local(em(3 * 24 * 60));
  const r = API(token, 'agenda.importarPrevia', { inicio: dia, fim: dia });
  const evsAntes = Object.keys(MOCK.events).length;
  const itens = r.eventos.filter(x => x.provavel).map(x => x.clienteId
    ? { eventId: x.eventId, clienteId: x.clienteId, servicoIds: x.servicoIds.length ? x.servicoIds : [servSob.id], valor: x.valor }
    : { eventId: x.eventId, novaCliente: { nome: x.nomeNovo || 'Juliana Prado', telefone: x.telefone }, servicoIds: x.servicoIds.length ? x.servicoIds : [servSob.id], valor: x.valor });
  const res = API(token, 'agenda.importar', { itens, renomear: true });
  assert.strictEqual(res.erros.length, 0, JSON.stringify(res.erros));
  assert.strictEqual(res.importados, 4);
  assert.strictEqual(res.clientesNovas, 2);
  assert.strictEqual(Object.keys(MOCK.events).length, evsAntes, 'nenhum evento novo criado');
  const ags = db_all_('Agendamentos').filter(a => itens.some(i => i.eventId === a.eventId));
  assert.strictEqual(ags.length, 4);
  const bea = ags.find(a => a.clienteId === bia.id);
  assert.strictEqual(bea.valor, 120);
  assert(bea.observacoes.includes('Beatriz escova R$ 120'), 'título original guardado nas observações');
  const ev = MOCK.events[bea.eventId];
  assert(ev.title.includes('Beatriz Lima') && ev.title.includes('Escova'), 'título padronizado: ' + ev.title);
  assert(ev.desc.includes('Importado do Google Agenda'), 'descrição original preservada');
  const de_novo = API(token, 'agenda.importarPrevia', { inicio: dia, fim: dia });
  assert.strictEqual(de_novo.eventos.filter(x => x.provavel).length, 0, 'não aparece de novo para importar');
  assert(db_all_('Clientes').some(c => c.nome === 'Maria Clara' && c.telefone === '5511988887777'));
  // limpa para não afetar os testes seguintes
  ags.forEach(a => API(token, 'agenda.excluir', { id: a.id, financeiro: 'remover' }));
});
t('mantém o endereço do evento e desfaz a importação devolvendo o original', () => {
  const dia = local(em(4 * 24 * 60));
  const ev = MOCK.addExterno('Noiva Patrícia Andrade', new Date(dia + 'T08:00'), new Date(dia + 'T10:00'),
    { description: 'Casamento às 16h. ' + 'x'.repeat(900), location: 'Rua das Noivas, 50 - Moema' });
  ev.setColor('11');
  const sug = API(token, 'agenda.importarPrevia', { inicio: dia, fim: dia }).eventos.find(x => x.eventId === ev.id);
  const res = API(token, 'agenda.importar', { itens: [{ eventId: ev.id, novaCliente: { nome: sug.nomeNovo }, servicoIds: [servPent.id] }] });
  assert.strictEqual(res.importados, 1, JSON.stringify(res.erros));
  const a = db_all_('Agendamentos').find(x => x.eventId === ev.id);
  assert.strictEqual(a.local, 'Rua das Noivas, 50 - Moema');
  assert.strictEqual(ev.loc, 'Rua das Noivas, 50 - Moema', 'endereço continua no evento');
  assert(a.observacoes.length > 900, 'descrição longa não foi cortada');
  assert(ev.title.includes('Patrícia Andrade') && ev.title !== 'Noiva Patrícia Andrade');
  assert.strictEqual(API(token, 'agenda.obter', { id: a.id }).importado, true);
  API(token, 'agenda.desfazerImportacao', { id: a.id });
  assert(!db_get_('Agendamentos', a.id), 'saiu do CRM');
  assert(MOCK.events[ev.id], 'evento continua no Google');
  assert.strictEqual(ev.title, 'Noiva Patrícia Andrade');
  assert(ev.desc.startsWith('Casamento às 16h.'));
  assert.strictEqual(ev.loc, 'Rua das Noivas, 50 - Moema');
  assert.strictEqual(ev.color, '11');
  const de_novo = API(token, 'agenda.importarPrevia', { inicio: dia, fim: dia });
  assert(de_novo.eventos.some(x => x.eventId === ev.id), 'pode ser importado de novo');
  ev.deleteEvent();
});
t('histórico: passados entram como concluídos, lançam no caixa e não repetem cliente', () => {
  const d1 = local(new Date(Date.now() - 40 * 86400000)), d2 = local(new Date(Date.now() - 20 * 86400000));
  const e1 = MOCK.addExterno('Juliana Prado sobrancelha', new Date(d1 + 'T10:00'), new Date(d1 + 'T10:30'), {});
  const e2 = MOCK.addExterno('Juliana Prado henna', new Date(d2 + 'T10:00'), new Date(d2 + 'T10:45'), {});
  const e3 = MOCK.addExterno('Gabi Rocha', new Date(d2 + 'T15:00'), new Date(d2 + 'T16:00'), {});
  const r = API(token, 'agenda.importarPrevia', { inicio: d1, fim: d2 });
  const sug = e => r.eventos.find(x => x.eventId === e.id);
  assert.strictEqual(sug(e3).provavel, false, 'só nome, sem cliente/serviço: fica desmarcado');
  const clientesAntes = db_all_('Clientes').length;
  const itens = [e1, e2, e3].map(e => ({ eventId: e.id, novaCliente: { nome: sug(e).clienteId ? '' : sug(e).nomeNovo }, clienteId: sug(e).clienteId,
    servicoIds: sug(e).servicoIds.length ? sug(e).servicoIds : [servSob.id] }));
  const res = API(token, 'agenda.importar', { itens, renomear: true, lancarPassados: true });
  assert.strictEqual(res.erros.length, 0, JSON.stringify(res.erros));
  assert.strictEqual(res.importados, 3);
  assert.strictEqual(res.lancados, 3);
  const novas = db_all_('Clientes').length - clientesAntes;
  assert(novas <= 2, 'Juliana Prado cadastrada uma vez só (novas: ' + novas + ')');
  assert.strictEqual(db_all_('Clientes').filter(c => c.nome === 'Juliana Prado').length, 1);
  const ags = db_all_('Agendamentos').filter(a => [e1.id, e2.id, e3.id].includes(a.eventId));
  assert(ags.every(a => a.status === 'concluido'));
  assert.strictEqual(e1.title, 'Juliana Prado sobrancelha', 'evento antigo não foi alterado');
  const l = db_all_('Financeiro').find(x => x.agendamentoId === ags[0].id);
  assert(l && l.status === 'pago' && l.data === ags[0].inicio.slice(0, 10) && l.forma === 'Não informado');
  const rel = API(token, 'relatorio', { inicio: d1, fim: d2 });
  assert(rel.resumo.receitas >= ags.reduce((s, a) => s + a.valor, 0), 'faturamento do período inclui o histórico');
  ags.forEach(a => API(token, 'agenda.excluir', { id: a.id, financeiro: 'remover' }));
});
t('histórico sem lançar no financeiro', () => {
  const d = local(new Date(Date.now() - 50 * 86400000));
  const e = MOCK.addExterno('Ana Souza penteado', new Date(d + 'T09:00'), new Date(d + 'T10:00'), {});
  const res = API(token, 'agenda.importar', { itens: [{ eventId: e.id, clienteId: ana.id, servicoIds: [servPent.id] }], lancarPassados: false });
  assert.strictEqual(res.importados, 1); assert(!res.lancados);
  const a = db_all_('Agendamentos').find(x => x.eventId === e.id);
  assert.strictEqual(db_all_('Financeiro').filter(x => x.agendamentoId === a.id).length, 0);
  API(token, 'agenda.excluir', { id: a.id, financeiro: 'remover' });
});
t('evento que se repete não é importado', () => {
  const dia = local(em(3 * 24 * 60));
  const r = API(token, 'agenda.importarPrevia', { inicio: dia, fim: dia });
  const rec = r.eventos.find(x => x.recorrente);
  const res = API(token, 'agenda.importar', { itens: [{ eventId: rec.eventId, clienteId: ana.id, servicoIds: [servSob.id] }] });
  assert.strictEqual(res.importados, 0); assert(/repete/.test(res.erros[0].erro));
  Object.values(MOCK.events).filter(e => e.title === 'Aula de inglês' || e.title === 'Dentista').forEach(e => e.deleteEvent());
});

console.log('\nWhatsApp');
t('configura Z-API sem expor token', () => {
  API(token, 'wa.salvarConfig', { segredos: { provedor: 'zapi', zapiInstancia: 'INST1', zapiToken: 'TOKENSECRETO1234', zapiClientToken: 'CT99' },
    wa: { ativo: true, silencioInicio: 0, silencioFim: 0 } });
  const c = API(token, 'wa.config');
  assert.strictEqual(c.segredos.zapiToken, '');
  assert.strictEqual(c.segredos.zapiTokenSalvo, '••••1234');
  assert(c.webhookUrl.includes('?k='));
  API(token, 'wa.salvarConfig', { segredos: { provedor: 'zapi', zapiInstancia: 'INST1', zapiToken: '' } });
  assert.strictEqual(waSecret_().zapiToken, 'TOKENSECRETO1234', 'campo vazio mantém o segredo');
});
t('confirmação enviada ao agendar (Z-API send-text)', () => {
  MOCK.fetches.length = 0;
  const d = em(23 * 60);
  const a = API(token, 'agenda.salvar', { clienteId: bia.id, servicoIds: [servSob.id], data: local(d), hora: hhmm(d), enviarConfirmacao: true });
  assert.strictEqual(MOCK.fetches.length, 1);
  const f = MOCK.fetches[0];
  assert.strictEqual(f.url, 'https://api.z-api.io/instances/INST1/token/TOKENSECRETO1234/send-text');
  assert.strictEqual(f.opts.headers['Client-Token'], 'CT99');
  const body = JSON.parse(f.opts.payload);
  assert.strictEqual(body.phone, '5521998765432');
  assert(body.message.includes('Beatriz') && body.message.includes('Design de sobrancelha'));
  assert(a.confirmEnviada);
});
let agLemb;
t('lembrete 24h enviado pelo gatilho (e só uma vez)', () => {
  const d = em(20 * 60);
  // criado "há 2 dias" para não cair na regra de dispensa
  agLemb = API(token, 'agenda.salvar', { clienteId: ana.id, servicoIds: [servMake.id], data: local(d), hora: hhmm(d) });
  db_update_('Agendamentos', agLemb.id, { criadoEm: local(new Date(Date.now() - 2 * 86400000)) + 'T10:00:00' });
  MOCK.fetches.length = 0;
  processarLembretes();
  const msgs = MOCK.fetches.map(f => JSON.parse(f.opts.payload).message);
  assert(msgs.some(m => m.includes('Responda *1*')), 'lembrete 1 enviado: ' + msgs.join(' | '));
  const n = MOCK.fetches.length;
  processarLembretes();
  assert.strictEqual(MOCK.fetches.length, n, 'não reenvia');
  assert(db_get_('Agendamentos', agLemb.id).lembrete1Enviado);
});
t('resposta "1" pelo webhook confirma o horário', () => {
  const key = waSecret_().webhookKey;
  assert.strictEqual(doPost({ parameter: { k: 'errada' }, postData: { contents: '{}' } }).text, 'forbidden');
  MOCK.fetches.length = 0;
  const r = doPost({ parameter: { k: key }, postData: { contents: JSON.stringify({ phone: '551187654321', fromMe: false, text: { message: '1' } }) } });
  assert.strictEqual(r.text, 'ok');
  assert.strictEqual(db_get_('Agendamentos', agLemb.id).status, 'confirmado');
  assert(JSON.parse(MOCK.fetches[0].opts.payload).message.includes('confirmado'));
  const ev = MOCK.events[db_get_('Agendamentos', agLemb.id).eventId];
  assert(ev.title.startsWith('✅'));
});
t('resposta "2" (Evolution) marca pedido de remarcação', () => {
  API(token, 'agenda.status', { id: agLemb.id, status: 'agendado' });
  const key = waSecret_().webhookKey;
  doPost({ parameter: { k: key }, postData: { contents: JSON.stringify({ event: 'messages.upsert', data: { key: { remoteJid: '5511987654321@s.whatsapp.net', fromMe: false }, message: { conversation: 'Não vou conseguir, 2' } } }) } });
  // "Não vou..." começa com "nao" → remarcar
  assert.strictEqual(db_get_('Agendamentos', agLemb.id).status, 'remarcar');
});
t('falha do provedor é registrada no histórico', () => {
  MOCK.fetchResponder = () => ({ code: 401, body: '{"error":"invalid token"}' });
  assert.throws(() => API(token, 'wa.testar', { telefone: '11999990000' }), /HTTP 401/);
  MOCK.fetchResponder = null;
  const logs = API(token, 'wa.logs', {});
  assert(logs.some(l => l.status === 'erro'));
});
t('Evolution e Meta montam a requisição certa', () => {
  API(token, 'wa.salvarConfig', { segredos: { provedor: 'evolution', evoUrl: 'https://evo.exemplo.com/', evoInstancia: 'studio', evoApiKey: 'K1' } });
  MOCK.fetches.length = 0;
  API(token, 'wa.testar', { telefone: '11999990000' });
  assert.strictEqual(MOCK.fetches[0].url, 'https://evo.exemplo.com/message/sendText/studio');
  assert.strictEqual(MOCK.fetches[0].opts.headers.apikey, 'K1');
  API(token, 'wa.salvarConfig', { segredos: { provedor: 'meta', metaPhoneId: '123', metaToken: 'MT', metaTemplates: { lembrete1: 'lembrete_horario' } } });
  MOCK.fetches.length = 0;
  wa_enviarAg_('lembrete1', db_get_('Agendamentos', agLemb.id));
  const b = JSON.parse(MOCK.fetches[0].opts.payload);
  assert.strictEqual(b.type, 'template'); assert.strictEqual(b.template.name, 'lembrete_horario');
  assert.strictEqual(b.template.components[0].parameters.length, 4);
});

console.log('\nVelocidade (cache das abas)');
const novaExecucao = () => { _memo = {}; _gen = null; };
t('segunda leitura vem do cache, sem abrir a planilha', () => {
  novaExecucao(); db_all_('Clientes');
  const antes = MOCK.leituras;
  novaExecucao(); const lista = db_all_('Clientes');
  assert.strictEqual(MOCK.leituras, antes, 'não leu a planilha');
  assert(lista.length >= 2 && lista.every(c => c.id && c.nome));
});
t('gravar invalida o cache e a próxima leitura vê o dado novo', () => {
  novaExecucao(); db_all_('Clientes');
  novaExecucao(); const c = API(token, 'clientes.salvar', { nome: 'Cliente Cache', telefone: '11955554444' });
  novaExecucao(); assert(db_all_('Clientes').some(x => x.id === c.id));
  novaExecucao(); db_delete_('Clientes', c.id);
  novaExecucao(); assert(!db_all_('Clientes').some(x => x.id === c.id));
});
t('cache com números e datas preserva os tipos', () => {
  novaExecucao(); const a1 = db_all_('Agendamentos')[0];
  novaExecucao(); const a2 = db_all_('Agendamentos')[0];
  assert.deepStrictEqual(a1, a2);
  assert.strictEqual(typeof a2.valor, 'number');
});
t('gravação usa a planilha ao vivo (linha certa mesmo com cache antigo)', () => {
  novaExecucao(); db_all_('Servicos');
  // alguém apaga uma linha direto na planilha (cache ficou desatualizado)
  const sh = MOCK.books[PropertiesService.getScriptProperties().getProperty('DB_ID')].getSheetByName('Servicos');
  const alvo = sh.data[sh.data.length - 1][0];
  sh.deleteRow(2);
  novaExecucao(); db_update_('Servicos', alvo, { descricao: 'ok' });
  novaExecucao(); _gen = { Servicos: -1 }; // força ler da planilha
  const r = db_read_('Servicos', true).objs.find(x => x.id === alvo);
  assert.strictEqual(r.descricao, 'ok');
});

console.log('\nGoogle Agenda de outro e-mail');
t('lista agendas desta conta e esconde feriados', () => {
  const r = API(token, 'cfg.calendarios', {});
  assert.strictEqual(r.email, 'dona@studio.com');
  assert(r.lista.some(x => x.id === 'primary'));
  assert(!r.lista.some(x => x.id.includes('#holiday')));
});
t('agenda de outra conta sem compartilhamento dá erro explicativo', () => {
  assert.throws(() => API(token, 'cfg.salvar', { calendarId: 'lara@gmail.com' }), /compartilhe-a com dona@studio.com/);
  assert.strictEqual(cfg_().calendarId, 'primary');
});
t('agenda compartilhada só para ver é recusada', () => {
  MOCK.compartilhadas['so.ver@gmail.com'] = { nome: 'Só ver', soLeitura: true };
  assert.throws(() => API(token, 'cfg.salvar', { calendarId: 'so.ver@gmail.com' }), /só para ver/);
  assert.strictEqual(cfg_().calendarId, 'primary');
});
t('agenda compartilhada com edição: conecta e os horários vão para ela', () => {
  MOCK.compartilhadas['lara@gmail.com'] = { nome: 'Lara Altoé' };
  API(token, 'cfg.salvar', { calendarId: 'lara@gmail.com' });
  assert.strictEqual(cfg_().calendarId, 'lara@gmail.com');
  const lista = API(token, 'cfg.calendarios', {}).lista;
  assert(lista.some(x => x.id === 'lara@gmail.com' && x.nome.includes('compartilhada')));
  const d = em(30 * 60);
  const a = API(token, 'agenda.salvar', { clienteId: bia.id, servicoIds: [servSob.id], data: local(d), hora: '09:00', forcar: true });
  assert.strictEqual(a.syncStatus, 'ok');
  const ev = MOCK.events[db_get_('Agendamentos', a.id).eventId];
  assert.strictEqual(ev.cal.getId(), 'lara@gmail.com');
  assert(!Object.values(MOCK.events).some(e => e.title === 'Teste do CRM (pode apagar)'), 'evento de teste foi apagado');
  const antes = Object.values(MOCK.events).filter(e => e.cal.getId() === 'dona@studio.com' && !e.title.includes('Almoço') && !e.title.includes('Dentista')).length;
  assert(antes > 0, 'havia eventos na agenda antiga');
  const r = API(token, 'agenda.ressincronizar', {});
  assert.strictEqual(r.erros, 0);
  const futurosAntiga = Object.values(MOCK.events).filter(e => e.cal.getId() === 'dona@studio.com' && e.start >= new Date(new Date().toDateString()) && !e.title.includes('Dentista'));
  assert.strictEqual(futurosAntiga.length, 0, 'eventos futuros saíram da agenda antiga: ' + futurosAntiga.map(e => e.title + ' ' + e.start.toISOString()).join(' | '));
  API(token, 'cfg.salvar', { calendarId: 'primary' });
});

console.log('\nPermissões');
t('usuário da equipe não acessa o financeiro', () => {
  API(token, 'usuarios.salvar', { nome: 'Recepção', usuario: 'recepcao', perfil: 'equipe', senha: 'Recep1234' });
  const tk = JSON.parse(login('recepcao', 'Recep1234')).data.token;
  assert.throws(() => API(tk, 'fin.listar', {}), /permissão/);
  assert.throws(() => API(tk, 'wa.config', {}), /permissão/);
  const d = API(tk, 'dashboard', {});
  assert.strictEqual(d.receita, undefined, 'dashboard da equipe sem valores financeiros');
  API(tk, 'agenda.listar', {});
});
t('não dá para excluir a si mesma nem o último admin', () => {
  assert.throws(() => API(token, 'usuarios.excluir', { id: sess.id }), /próprio/);
});
t('sessão continua válida mesmo se o cache do Google for limpo', () => {
  Object.keys(MOCK.cache).filter(k => k.startsWith('S_')).forEach(k => delete MOCK.cache[k]);
  assert(API(token, 'auth.me').id === sess.id);
});
t('"manter conectada" dura meses e renova com o uso', () => {
  const me = API(token, 'auth.me');
  assert(me.exp - Date.now() > 170 * 86400000);
  const tk = JSON.parse(login('admin', 'NovaSenha123', false)).data.token;
  const curta = API(tk, 'auth.me');
  assert(curta.exp - Date.now() < 13 * 3600000, 'sessão curta de 12h');
  MOCK.nowOffsetMs = 13 * 3600000;
  assert.strictEqual(JSON.parse(api(tk, 'boot', {})).auth, false, 'sessão curta venceu');
  assert(API(token, 'auth.me').id, 'sessão longa segue valendo');
  MOCK.nowOffsetMs = 0;
});
t('o token não fica gravado em texto puro', () => {
  assert(!Object.keys(MOCK.props).some(k => k.includes(token)));
  assert(!Object.values(MOCK.props).some(v => String(v).includes(token)));
});
t('bloquear usuário derruba as sessões dele', () => {
  const rec = db_all_('Usuarios').find(u => u.usuario === 'recepcao');
  const tk = JSON.parse(login('recepcao', 'Recep1234')).data.token;
  API(token, 'usuarios.salvar', { id: rec.id, nome: rec.nome, usuario: 'recepcao', perfil: 'equipe', ativo: 'nao' });
  assert.strictEqual(JSON.parse(api(tk, 'boot', {})).auth, false);
});
t('trocar a senha desconecta os outros aparelhos, mas não o atual', () => {
  const outro = JSON.parse(login('admin', 'NovaSenha123')).data.token;
  API(token, 'auth.alterarSenha', { atual: 'NovaSenha123', nova: 'OutraSenha456' });
  assert.strictEqual(JSON.parse(api(outro, 'boot', {})).auth, false);
  assert(API(token, 'auth.me').id);
});
t('limpeza diária remove sessões vencidas', () => {
  const tk = JSON.parse(login('admin', 'OutraSenha456', false)).data.token;
  const k = sess_chave_(tk);
  assert(MOCK.props[k]);
  MOCK.nowOffsetMs = 2 * 86400000;
  delete MOCK.props.SESS_LIMPEZA;
  auth_limparSessoes_();
  MOCK.nowOffsetMs = 0;
  assert(!MOCK.props[k]);
});
t('logout invalida a sessão', () => {
  API(token, 'auth.logout');
  assert.strictEqual(JSON.parse(api(token, 'boot', {})).auth, false);
});

console.log(`\n${ok} testes passaram${process.exitCode ? ' — HÁ FALHAS' : ' ✅'}\n`);
