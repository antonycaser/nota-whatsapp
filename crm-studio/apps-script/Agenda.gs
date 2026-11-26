/**
 * Agenda: agendamentos + sincronização automática com o Google Agenda.
 * Tudo que é marcado/alterado/cancelado no CRM é refletido na agenda.
 *
 * Status: agendado | confirmado | concluido | faltou | cancelado | remarcar
 */

var STATUS_ATIVOS = ['agendado', 'confirmado', 'remarcar'];
var STATUS_EMOJI = { agendado: '🗓️', confirmado: '✅', concluido: '💖', faltou: '⚠️', remarcar: '🔁', cancelado: '❌' };

function ag_view_(a, mapas) {
  var cli = mapas.clientes[a.clienteId] || {};
  var prof = mapas.equipe[a.profissionalId] || {};
  var servs = json_(a.servicos, []);
  return {
    id: a.id, clienteId: a.clienteId, clienteNome: cli.nome || a.clienteNome, telefone: cli.telefone || a.telefone,
    servicos: servs, servicoNomes: a.servicoNomes, categoria: (servs[0] && servs[0].categoria) || '',
    cor: (prof.cor && mapas.porProfissional) ? prof.cor : ((servs[0] && servs[0].cor) || '#0f7f7c'),
    profissionalId: a.profissionalId, profissionalNome: prof.nome || '',
    inicio: a.inicio.slice(0, 16), fim: a.fim.slice(0, 16), status: a.status,
    valor: num_(a.valor), desconto: num_(a.desconto), sinal: num_(a.sinal),
    local: a.local, observacoes: a.observacoes, syncStatus: a.syncStatus,
    confirmEnviada: a.confirmEnviada, lembrete1Enviado: a.lembrete1Enviado, lembrete2Enviado: a.lembrete2Enviado,
    formaPagamento: a.formaPagamento, lancamentoId: a.lancamentoId
  };
}

function ag_mapas_() {
  var m = { clientes: {}, equipe: {}, servicos: {} };
  db_all_('Clientes').forEach(function (c) { m.clientes[c.id] = c; });
  db_all_('Profissionais').forEach(function (p) { m.equipe[p.id] = p; });
  db_all_('Servicos').forEach(function (s) { m.servicos[s.id] = s; });
  return m;
}

/** Lista agendamentos entre p.inicio e p.fim (yyyy-MM-dd, fim inclusivo). */
function ag_listar_(p) {
  var ini = String(p.inicio || hoje_()).slice(0, 10);
  var fim = String(p.fim || ini).slice(0, 10);
  var mapas = ag_mapas_();
  mapas.porProfissional = !!p.corPorProfissional;
  var lista = db_all_('Agendamentos').filter(function (a) {
    var d = String(a.inicio).slice(0, 10);
    return d >= ini && d <= fim && (p.incluirCancelados || a.status !== 'cancelado');
  }).map(function (a) { return ag_view_(a, mapas); })
    .sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });

  var externos = [];
  var c = cfg_();
  if (p.externos && c.calendarAtivo && c.mostrarEventosGoogle) {
    try {
      var ids = {};
      db_all_('Agendamentos').forEach(function (a) { if (a.eventId) ids[a.eventId] = 1; });
      var cal = cal_();
      var evs = cal.getEvents(parseLocal_(ini), new Date(parseLocal_(fim).getTime() + 86400000));
      evs.forEach(function (ev) {
        if (ids[ev.getId()]) return;
        externos.push({
          id: ev.getId(), titulo: ev.getTitle(), diaTodo: ev.isAllDayEvent(),
          inicio: fmtLocal_(ev.getStartTime()), fim: fmtLocal_(ev.getEndTime())
        });
      });
    } catch (e) { console.warn('Eventos externos: ' + e); }
  }
  return { agendamentos: lista, externos: externos };
}

function ag_obter_(p) {
  var a = db_get_('Agendamentos', p.id);
  if (!a) throw erro_('Agendamento não encontrado.');
  var v = ag_view_(a, ag_mapas_());
  v.financeiro = fin_resumoAgendamento_(a.id);
  return v;
}

/**
 * O que fazer com o dinheiro já lançado quando um atendimento sai da agenda.
 * financeiro: 'remover' (padrão) tira tudo do caixa; 'manter' deixa o que já foi pago
 * (ex.: sinal não devolvido) e só apaga o que estava pendente.
 */
function ag_tratarFinanceiro_(agId, financeiro) {
  var manter = financeiro === 'manter';
  fin_doAgendamento_(agId).forEach(function (l) {
    if (!manter || l.status !== 'pago') db_delete_('Financeiro', l.id);
  });
}

/**
 * Cria ou altera um agendamento.
 * p: {id?, clienteId | novaCliente{nome,telefone}, servicoIds[], profissionalId, data, hora,
 *     duracao?, valor?, desconto?, sinal?, formaSinal?, local, observacoes, status, enviarConfirmacao, forcar}
 */
function ag_salvar_(p) {
  var mapas = ag_mapas_();
  var c = cfg_();

  // Cliente
  var clienteId = p.clienteId;
  if (!clienteId && p.novaCliente && p.novaCliente.nome) {
    clienteId = cli_salvar_({ nome: p.novaCliente.nome, telefone: p.novaCliente.telefone, forcar: true }).id;
    mapas = ag_mapas_();
  }
  var cli = mapas.clientes[clienteId];
  if (!cli) throw erro_('Selecione a cliente.');

  // Serviços
  var ids = (p.servicoIds || []).filter(String);
  if (!ids.length) throw erro_('Selecione pelo menos um serviço.');
  var servs = ids.map(function (id) {
    var s = mapas.servicos[id];
    if (!s) throw erro_('Serviço não encontrado.');
    return { id: s.id, nome: s.nome, categoria: s.categoria, preco: num_(s.preco), duracao: num_(s.duracao), cor: s.cor };
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || '') || !/^\d{2}:\d{2}$/.test(p.hora || '')) throw erro_('Informe data e horário.');
  var duracao = Math.round(num_(p.duracao)) || servs.reduce(function (s, x) { return s + x.duracao; }, 0) || 60;
  var inicio = p.data + 'T' + p.hora;
  var fim = addMin_(inicio, duracao);
  var valor = (p.valor !== undefined && p.valor !== '') ? round2_(num_(p.valor)) : servs.reduce(function (s, x) { return s + x.preco; }, 0);

  // Conflito de horário (mesma profissional, ou geral se não houver equipe)
  if (!p.forcar) {
    var conflitos = db_all_('Agendamentos').filter(function (a) {
      if (a.id === p.id || STATUS_ATIVOS.indexOf(a.status) < 0) return false;
      if (p.profissionalId && a.profissionalId && a.profissionalId !== p.profissionalId) return false;
      return a.inicio.slice(0, 16) < fim && a.fim.slice(0, 16) > inicio;
    });
    if (conflitos.length) {
      var x = conflitos[0];
      throw erro_('Esse horário conflita com ' + (x.clienteNome || 'outra cliente') + ' (' +
        x.inicio.slice(11, 16) + '–' + x.fim.slice(11, 16) + '). Deseja agendar mesmo assim?', { conflito: true });
    }
  }

  var dados = {
    clienteId: cli.id, clienteNome: cli.nome, telefone: cli.telefone,
    servicos: JSON.stringify(servs), servicoNomes: servs.map(function (s) { return s.nome; }).join(' + '),
    profissionalId: p.profissionalId || '', inicio: inicio, fim: fim,
    valor: valor, desconto: round2_(num_(p.desconto)), sinal: round2_(num_(p.sinal)),
    local: p.local || 'Studio', observacoes: p.observacoes || ''
  };

  var antigo = p.id ? db_get_('Agendamentos', p.id) : null;
  var a;
  if (antigo) {
    dados.status = p.status || antigo.status;
    if (antigo.inicio.slice(0, 16) !== inicio) {
      // remarcou: zera os lembretes para reenviar no novo horário
      dados.lembrete1Enviado = ''; dados.lembrete2Enviado = '';
      if (dados.status === 'remarcar') dados.status = 'agendado';
    }
    a = db_update_('Agendamentos', antigo.id, dados);
  } else {
    dados.status = p.status || 'agendado';
    a = db_insert_('Agendamentos', dados);
  }

  // Sinal / reserva → lançamento de receita
  if (dados.sinal > 0 && !(antigo && num_(antigo.sinal) === dados.sinal)) {
    fin_sinal_(a, p.formaSinal || 'Pix');
  } else if (!dados.sinal && antigo && num_(antigo.sinal) > 0) {
    // tirou o sinal na edição: apaga o lançamento do sinal
    fin_doAgendamento_(a.id).forEach(function (l) { if (l.categoria === 'Sinal / Reserva') db_delete_('Financeiro', l.id); });
  }
  // Atendimento já finalizado e editado: mantém o caixa igual ao novo valor (ou tira, se deixou de ser concluído)
  if (antigo && antigo.status === 'concluido') {
    if (a.status === 'concluido') {
      var lancServ = fin_doAgendamento_(a.id).filter(function (l) { return l.categoria === 'Serviços'; })[0];
      var novo = fin_doAtendimento_(a, a.formaPagamento || (lancServ && lancServ.forma) || 'Pix', !lancServ || lancServ.status === 'pago');
      a = db_update_('Agendamentos', a.id, { lancamentoId: novo ? novo.id : '' });
    } else {
      if (a.status === 'cancelado') ag_tratarFinanceiro_(a.id, p.financeiro);
      else fin_doAgendamento_(a.id).forEach(function (l) { if (l.categoria === 'Serviços') db_delete_('Financeiro', l.id); });
      a = db_update_('Agendamentos', a.id, { lancamentoId: '', formaPagamento: '' });
    }
  } else if (antigo && a.status === 'cancelado' && antigo.status !== 'cancelado') {
    ag_tratarFinanceiro_(a.id, p.financeiro);
  }

  a = ag_sync_(a);

  // Confirmação por WhatsApp (somente em agendamentos novos)
  var aviso = '';
  if (!antigo && p.enviarConfirmacao && c.wa.ativo && c.wa.confirmacao && cli.telefone) {
    try {
      wa_enviarAg_('confirmacao', a);
      a = db_update_('Agendamentos', a.id, { confirmEnviada: agora_() });
    } catch (e) { aviso = 'Agendado, mas o WhatsApp falhou: ' + e.message; }
  }
  if (String(a.syncStatus).indexOf('erro') === 0) aviso = (aviso ? aviso + ' | ' : '') + 'Google Agenda: ' + a.syncStatus;

  var v = ag_view_(a, ag_mapas_());
  v.aviso = aviso;
  return v;
}

/** Muda o status (confirmar, faltou, cancelar, remarcar, agendado). */
function ag_status_(p) {
  var validos = ['agendado', 'confirmado', 'faltou', 'cancelado', 'remarcar', 'concluido'];
  if (validos.indexOf(p.status) < 0) throw erro_('Status inválido.');
  var a = db_get_('Agendamentos', p.id);
  if (!a) throw erro_('Agendamento não encontrado.');
  var patch = { status: p.status };
  if (p.status === 'cancelado') {
    // cancelou: tira o dinheiro do caixa (ou mantém o sinal, se a dona escolher)
    ag_tratarFinanceiro_(a.id, p.financeiro);
    patch.lancamentoId = ''; patch.formaPagamento = '';
  } else if (a.status === 'concluido' && p.status !== 'concluido') {
    // desfez a finalização: tira só o pagamento do atendimento (o sinal continua)
    fin_doAgendamento_(a.id).forEach(function (l) { if (l.categoria === 'Serviços') db_delete_('Financeiro', l.id); });
    patch.lancamentoId = ''; patch.formaPagamento = '';
  }
  a = db_update_('Agendamentos', a.id, patch);
  a = ag_sync_(a);
  return ag_view_(a, ag_mapas_());
}

/** Finaliza o atendimento e lança a receita no financeiro. */
function ag_finalizar_(p) {
  var a = db_get_('Agendamentos', p.id);
  if (!a) throw erro_('Agendamento não encontrado.');
  var valor = round2_(num_(p.valor !== undefined ? p.valor : a.valor));
  var desconto = round2_(num_(p.desconto !== undefined ? p.desconto : a.desconto));
  var forma = p.forma || 'Pix';
  a = db_update_('Agendamentos', a.id, { status: 'concluido', valor: valor, desconto: desconto, formaPagamento: forma });
  var lanc = fin_doAtendimento_(a, forma, p.pago !== false);
  a = db_update_('Agendamentos', a.id, { lancamentoId: lanc ? lanc.id : '' });
  a = ag_sync_(a);
  return ag_view_(a, ag_mapas_());
}

function ag_excluir_(p) {
  var a = db_get_('Agendamentos', p.id);
  if (!a) return true;
  if (a.eventId) { try { var ev = cal_().getEventById(a.eventId); if (ev) ev.deleteEvent(); } catch (e) {} }
  ag_tratarFinanceiro_(a.id, p.financeiro);
  db_delete_('Agendamentos', a.id);
  return true;
}

/** Reenvia para o Google Agenda todos os horários futuros (útil após trocar de agenda). */
function ag_ressincronizar_() {
  var desde = hoje_();
  var n = 0, erros = 0;
  db_all_('Agendamentos').forEach(function (a) {
    if (a.inicio.slice(0, 10) < desde) return;
    var r = ag_sync_(a);
    if (String(r.syncStatus).indexOf('erro') === 0) erros++; else n++;
  });
  return { sincronizados: n, erros: erros };
}

/* ------------------------- Google Agenda ------------------------- */

function cal_() { return cal_abrir_(cfg_().calendarId); }

/**
 * Abre uma agenda pelo ID. Funciona também com a agenda de OUTRA conta Google,
 * desde que ela tenha sido compartilhada com a conta dona deste script
 * (se ainda não estiver inscrita, o CRM se inscreve sozinho).
 */
function cal_abrir_(id) {
  if (!id || id === 'primary') return CalendarApp.getDefaultCalendar();
  var cal = null;
  try { cal = CalendarApp.getCalendarById(id); } catch (e) { cal = null; }
  if (!cal) {
    try { cal = CalendarApp.subscribeToCalendar(id, { hidden: false }); } catch (e) { cal = null; }
  }
  return cal;
}

/** Confere se dá para criar eventos na agenda (cria e apaga um evento de teste). */
function cal_podeEditar_(cal) {
  try {
    var t = new Date(Date.now() + 400 * 86400000);
    var ev = cal.createEvent('Teste do CRM (pode apagar)', t, new Date(t.getTime() + 60000));
    ev.deleteEvent();
    return true;
  } catch (e) { return false; }
}

var COR_CATEGORIA = {
  'Maquiagem': 'CYAN', 'Sobrancelha': 'PALE_RED', 'Penteado': 'ORANGE', 'Cílios': 'BLUE',
  'Noivas & Eventos': 'MAUVE', 'Outros': 'GRAY'
};

/** Cria/atualiza/remove o evento na agenda. Nunca lança erro — grava syncStatus. */
function ag_sync_(a) {
  var c = cfg_();
  if (!c.calendarAtivo) return a;
  var patch = {};
  try {
    var cal = cal_();
    if (!cal) throw new Error('agenda não encontrada');
    var ev = null;
    if (a.eventId) { try { ev = cal.getEventById(a.eventId); } catch (e) { ev = null; } }
    if (!ev && a.eventId && c.calendarAnterior && c.calendarAnterior !== c.calendarId) {
      // trocou de agenda: apaga o evento que ficou na agenda antiga para não duplicar
      try { var antiga = cal_abrir_(c.calendarAnterior); var velho = antiga && antiga.getEventById(a.eventId); if (velho) velho.deleteEvent(); } catch (e) {}
    }

    if (a.status === 'cancelado') {
      if (ev) ev.deleteEvent();
      patch = { eventId: '', syncStatus: 'removido' };
    } else {
      var cli = db_get_('Clientes', a.clienteId) || {};
      var prof = db_get_('Profissionais', a.profissionalId) || {};
      var servs = json_(a.servicos, []);
      var titulo = (STATUS_EMOJI[a.status] || '') + ' ' + (cli.nome || a.clienteNome) + ' — ' + a.servicoNomes;
      var tel = cli.telefone || a.telefone;
      var total = num_(a.valor) - num_(a.desconto);
      var desc = [
        '👤 Cliente: ' + (cli.nome || a.clienteNome),
        tel ? '📱 WhatsApp: https://wa.me/' + tel : '',
        '✨ Serviços: ' + a.servicoNomes,
        prof.nome ? '💄 Profissional: ' + prof.nome : '',
        '💰 Valor: ' + brl_(total) + (num_(a.sinal) ? ' (sinal pago: ' + brl_(a.sinal) + ')' : ''),
        '📌 Status: ' + a.status,
        cli.alergias ? '⚠️ Alergias: ' + cli.alergias : '',
        a.observacoes ? '📝 ' + a.observacoes : ''
      ].filter(Boolean).join('\n') + '\n\nCriado pelo ' + (c.studioNome || 'Studio CRM');
      var local = a.local === 'Studio' || !a.local ? (c.endereco || c.studioNome) : a.local;
      var ini = parseLocal_(a.inicio), fim = parseLocal_(a.fim);

      if (!ev) {
        ev = cal.createEvent(titulo, ini, fim, { description: desc, location: local });
        try {
          ev.removeAllReminders();
          if (num_(c.lembreteAgendaMin) > 0) ev.addPopupReminder(num_(c.lembreteAgendaMin));
        } catch (e) {}
      } else {
        ev.setTime(ini, fim);
        ev.setTitle(titulo);
        ev.setDescription(desc);
        ev.setLocation(local);
      }
      var cor = a.status === 'concluido' ? 'GREEN' : a.status === 'faltou' ? 'GRAY'
        : (COR_CATEGORIA[(servs[0] || {}).categoria] || 'CYAN');
      try { ev.setColor(CalendarApp.EventColor[cor]); } catch (e) {}
      patch = { eventId: ev.getId(), syncStatus: 'ok' };
    }
  } catch (e) {
    patch = { syncStatus: 'erro: ' + String(e.message || e).slice(0, 120) };
  }
  if (patch.eventId === a.eventId && patch.syncStatus === a.syncStatus) return a;
  return db_update_('Agendamentos', a.id, patch);
}
