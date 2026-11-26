/**
 * Financeiro: lançamentos de receitas e despesas (fluxo de caixa).
 * tipo: receita | despesa      status: pago | pendente
 */

/** Lançamentos ligados a um atendimento. */
function fin_doAgendamento_(agId) {
  return db_all_('Financeiro').filter(function (l) { return l.agendamentoId === agId; });
}

/** Resumo do dinheiro de um atendimento (para a tela perguntar o que fazer ao cancelar/excluir). */
function fin_resumoAgendamento_(agId) {
  var itens = fin_doAgendamento_(agId);
  return {
    pago: round2_(itens.filter(function (l) { return l.status === 'pago'; }).reduce(function (s, l) { return s + num_(l.valor); }, 0)),
    pendente: round2_(itens.filter(function (l) { return l.status !== 'pago'; }).reduce(function (s, l) { return s + num_(l.valor); }, 0)),
    sinal: round2_(itens.filter(function (l) { return l.categoria === 'Sinal / Reserva' && l.status === 'pago'; }).reduce(function (s, l) { return s + num_(l.valor); }, 0)),
    itens: itens.map(function (l) { return { categoria: l.categoria, valor: num_(l.valor), status: l.status }; })
  };
}

function fin_listar_(p) {
  var ini = String(p.inicio || hoje_().slice(0, 8) + '01').slice(0, 10);
  var fim = String(p.fim || addMeses_(ini, 1)).slice(0, 10);
  var clientes = {};
  db_all_('Clientes').forEach(function (c) { clientes[c.id] = c.nome; });
  var ags = {};
  db_all_('Agendamentos').forEach(function (a) { ags[a.id] = a.status; });
  var lista = db_all_('Financeiro').filter(function (l) {
    var d = l.status === 'pendente' && l.vencimento ? l.vencimento : l.data;
    return d >= ini && d <= fim;
  }).map(function (l) {
    l.clienteNome = clientes[l.clienteId] || '';
    l.atrasado = l.status === 'pendente' && (l.vencimento || l.data) < hoje_();
    // dinheiro de atendimento que não existe mais (excluído antes desta correção) ou foi cancelado
    if (l.agendamentoId && !/^Sinal retido/.test(l.descricao)) {
      l.agAviso = !ags[l.agendamentoId] ? 'atendimento excluído' : ags[l.agendamentoId] === 'cancelado' ? 'atendimento cancelado' : '';
    }
    return l;
  }).sort(function (a, b) { return a.data < b.data ? 1 : -1; });

  var tot = { receitas: 0, despesas: 0, aReceber: 0, aPagar: 0 };
  lista.forEach(function (l) {
    if (l.status === 'pago') { if (l.tipo === 'receita') tot.receitas += l.valor; else tot.despesas += l.valor; }
    else { if (l.tipo === 'receita') tot.aReceber += l.valor; else tot.aPagar += l.valor; }
  });
  Object.keys(tot).forEach(function (k) { tot[k] = round2_(tot[k]); });
  tot.saldo = round2_(tot.receitas - tot.despesas);
  return { lancamentos: lista, totais: tot };
}

/** p.repetir = nº de meses (ex.: aluguel) — cria os próximos lançamentos como pendentes. */
function fin_salvar_(p) {
  var valor = round2_(num_(p.valor));
  if (!(valor > 0)) throw erro_('Informe um valor maior que zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || '')) throw erro_('Informe a data.');
  var dados = {
    data: p.data, tipo: p.tipo === 'despesa' ? 'despesa' : 'receita',
    categoria: p.categoria || (p.tipo === 'despesa' ? 'Outras despesas' : 'Outras receitas'),
    descricao: String(p.descricao || '').trim(), valor: valor, forma: p.forma || '',
    status: p.status === 'pendente' ? 'pendente' : 'pago',
    vencimento: p.status === 'pendente' ? (p.vencimento || p.data) : '',
    clienteId: p.clienteId || '', profissionalId: p.profissionalId || ''
  };
  if (p.id) return db_update_('Financeiro', p.id, dados);

  var r = db_insert_('Financeiro', dados);
  var n = Math.min(24, Math.max(0, Math.round(num_(p.repetir))));
  for (var i = 1; i <= n; i++) {
    var d = addMeses_(p.data, i);
    db_insert_('Financeiro', Object.assign({}, dados, {
      data: d, vencimento: d, status: 'pendente',
      descricao: (dados.descricao || dados.categoria) + ' (' + (i + 1) + '/' + (n + 1) + ')'
    }));
  }
  return r;
}

function fin_pagar_(p) {
  return db_update_('Financeiro', p.id, { status: 'pago', data: p.data || hoje_(), forma: p.forma || '' });
}

function fin_excluir_(p) {
  db_delete_('Financeiro', p.id);
  return true;
}

/** Lança (ou atualiza) o sinal/reserva de um agendamento. */
function fin_sinal_(a, forma) {
  var existente = db_all_('Financeiro').filter(function (l) {
    return l.agendamentoId === a.id && l.categoria === 'Sinal / Reserva';
  })[0];
  var dados = {
    data: hoje_(), tipo: 'receita', categoria: 'Sinal / Reserva',
    descricao: 'Sinal — ' + a.clienteNome,
    valor: num_(a.sinal), forma: forma, status: 'pago', agendamentoId: a.id, clienteId: a.clienteId,
    profissionalId: a.profissionalId
  };
  if (existente) return db_update_('Financeiro', existente.id, dados);
  return db_insert_('Financeiro', dados);
}

/** Receita do atendimento concluído (valor - desconto - sinal já recebido). */
function fin_doAtendimento_(a, forma, pago) {
  var lancs = db_all_('Financeiro').filter(function (l) { return l.agendamentoId === a.id; });
  var sinal = lancs.filter(function (l) { return l.categoria === 'Sinal / Reserva'; })
    .reduce(function (s, l) { return s + num_(l.valor); }, 0);
  var restante = round2_(num_(a.valor) - num_(a.desconto) - sinal);
  var existente = lancs.filter(function (l) { return l.categoria === 'Serviços'; })[0];
  if (restante <= 0) { if (existente) db_delete_('Financeiro', existente.id); return null; }
  var dados = {
    data: a.inicio.slice(0, 10), tipo: 'receita', categoria: 'Serviços',
    descricao: a.servicoNomes + ' — ' + a.clienteNome,
    valor: restante, forma: forma, status: pago ? 'pago' : 'pendente', vencimento: pago ? '' : a.inicio.slice(0, 10),
    agendamentoId: a.id, clienteId: a.clienteId, profissionalId: a.profissionalId
  };
  if (existente) return db_update_('Financeiro', existente.id, dados);
  return db_insert_('Financeiro', dados);
}
