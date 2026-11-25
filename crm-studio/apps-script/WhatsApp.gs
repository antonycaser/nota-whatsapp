/**
 * WhatsApp automático: confirmação, lembretes, pós-atendimento,
 * aniversário e leitura das respostas (1 = confirmar, 2 = remarcar).
 *
 * Provedores suportados:
 *  - zapi       → Z-API (z-api.io)
 *  - evolution  → Evolution API (self-hosted)
 *  - meta       → WhatsApp Cloud API oficial (Meta) — exige templates aprovados
 *  - webhook    → envia {phone, message} para qualquer URL (n8n, Make, etc.)
 */

var SEGREDOS = ['zapiToken', 'zapiClientToken', 'evoApiKey', 'metaToken', 'webhookAuth'];
var DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
var MAX_POR_EXECUCAO = 30;

/* ------------------------- Templates ------------------------- */

function wa_render_(tpl, a, cli) {
  var c = cfg_();
  cli = cli || {};
  var nomeCompleto = cli.nome || (a && a.clienteNome) || '';
  var vars = {
    nome: String(nomeCompleto).split(' ')[0],
    nomeCompleto: nomeCompleto,
    studio: c.studioNome || '',
    endereco: c.endereco || '',
    instagram: c.instagram || '',
    pix: c.pix || '',
    telefoneStudio: c.telefone || '',
    servico: '', data: '', hora: '', diaSemana: '', profissional: '', valor: ''
  };
  if (a) {
    var d = parseLocal_(a.inicio);
    var prof = db_get_('Profissionais', a.profissionalId);
    vars.servico = a.servicoNomes || '';
    vars.data = a.inicio.slice(8, 10) + '/' + a.inicio.slice(5, 7);
    vars.hora = a.inicio.slice(11, 16);
    vars.diaSemana = DIAS_SEMANA[Number(Utilities.formatDate(d, tz_(), 'u')) % 7];
    vars.profissional = prof ? prof.nome : '';
    vars.valor = brl_(num_(a.valor) - num_(a.desconto));
  }
  return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
}

/* ------------------------- Envio ------------------------- */

/** Envia e registra no histórico. meta: {tipo, clienteId, agendamentoId, vars[]} */
function wa_enviar_(telefone, mensagem, meta) {
  meta = meta || {};
  var tel = fone_(telefone);
  if (!tel) throw erro_('Cliente sem telefone cadastrado.');
  var log = { data: agora_(), tipo: meta.tipo || 'manual', direcao: 'enviada', clienteId: meta.clienteId || '',
    agendamentoId: meta.agendamentoId || '', telefone: tel, mensagem: mensagem };
  try {
    var resp = wa_provider_send_(tel, mensagem, meta);
    log.status = 'enviada'; log.detalhe = String(resp || '').slice(0, 250);
    db_insert_('Mensagens', log);
    return true;
  } catch (e) {
    log.status = 'erro'; log.detalhe = String(e.message || e).slice(0, 250);
    db_insert_('Mensagens', log);
    throw erro_('WhatsApp: ' + log.detalhe);
  }
}

function wa_provider_send_(tel, msg, meta) {
  var s = waSecret_();
  var opts = { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: {} };
  var url;
  switch (s.provedor) {
    case 'zapi':
      if (!s.zapiInstancia || !s.zapiToken) throw new Error('Z-API sem instância/token.');
      url = 'https://api.z-api.io/instances/' + encodeURIComponent(s.zapiInstancia) + '/token/' + encodeURIComponent(s.zapiToken) + '/send-text';
      if (s.zapiClientToken) opts.headers['Client-Token'] = s.zapiClientToken;
      opts.payload = JSON.stringify({ phone: tel, message: msg });
      break;
    case 'evolution':
      if (!s.evoUrl || !s.evoInstancia || !s.evoApiKey) throw new Error('Evolution API incompleta.');
      url = s.evoUrl.replace(/\/+$/, '') + '/message/sendText/' + encodeURIComponent(s.evoInstancia);
      opts.headers.apikey = s.evoApiKey;
      opts.payload = JSON.stringify({ number: tel, text: msg });
      break;
    case 'meta':
      if (!s.metaPhoneId || !s.metaToken) throw new Error('WhatsApp Cloud API sem Phone ID/token.');
      url = 'https://graph.facebook.com/v21.0/' + encodeURIComponent(s.metaPhoneId) + '/messages';
      opts.headers.Authorization = 'Bearer ' + s.metaToken;
      var tplName = (s.metaTemplates || {})[meta.tipo || ''];
      if (tplName) {
        opts.payload = JSON.stringify({
          messaging_product: 'whatsapp', to: tel, type: 'template',
          template: { name: tplName, language: { code: s.metaIdioma || 'pt_BR' },
            components: meta.vars && meta.vars.length ? [{ type: 'body', parameters: meta.vars.map(function (v) { return { type: 'text', text: String(v || '-') }; }) }] : [] }
        });
      } else {
        opts.payload = JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'text', text: { body: msg } });
      }
      break;
    case 'webhook':
      if (!s.webhookUrl) throw new Error('URL do webhook não configurada.');
      url = s.webhookUrl;
      if (s.webhookAuth) opts.headers.Authorization = s.webhookAuth;
      opts.payload = JSON.stringify({ phone: tel, message: msg, tipo: meta.tipo || 'manual' });
      break;
    default:
      throw new Error('Configure um provedor de WhatsApp no menu WhatsApp.');
  }
  var r = UrlFetchApp.fetch(url, opts);
  var code = r.getResponseCode();
  var body = r.getContentText();
  if (code < 200 || code >= 300) throw new Error('HTTP ' + code + ' — ' + body.slice(0, 200));
  var j = json_(body, null);
  if (j && (j.error || j.erro) && !j.messageId && !j.key) throw new Error(JSON.stringify(j.error || j.erro).slice(0, 200));
  return body;
}

/** Envia um template de agendamento (confirmacao, lembrete1, lembrete2, pos). */
function wa_enviarAg_(tipo, a) {
  var c = cfg_();
  var cli = db_get_('Clientes', a.clienteId) || { nome: a.clienteNome, telefone: a.telefone };
  var msg = wa_render_(c.templates[tipo], a, cli);
  var vars = [String(cli.nome || '').split(' ')[0], a.inicio.slice(8, 10) + '/' + a.inicio.slice(5, 7), a.inicio.slice(11, 16), a.servicoNomes];
  return wa_enviar_(cli.telefone || a.telefone, msg, { tipo: tipo, clienteId: a.clienteId, agendamentoId: a.id, vars: vars });
}

/** Envio manual pelo portal. p: {clienteId?, agendamentoId?, mensagem?, template?} */
function wa_enviarManual_(p) {
  var a = p.agendamentoId ? db_get_('Agendamentos', p.agendamentoId) : null;
  var cli = db_get_('Clientes', p.clienteId || (a && a.clienteId));
  if (!cli) throw erro_('Cliente não encontrada.');
  var c = cfg_();
  var texto = p.mensagem || c.templates[p.template] || '';
  if (!texto.trim()) throw erro_('Escreva a mensagem.');
  var msg = wa_render_(texto, a, cli);
  wa_enviar_(cli.telefone, msg, { tipo: p.template || 'manual', clienteId: cli.id, agendamentoId: a ? a.id : '',
    vars: [String(cli.nome).split(' ')[0]] });
  if (a && p.template === 'confirmacao') db_update_('Agendamentos', a.id, { confirmEnviada: agora_() });
  if (a && p.template === 'lembrete1') db_update_('Agendamentos', a.id, { lembrete1Enviado: agora_() });
  return { enviada: true, mensagem: msg };
}

function wa_testar_(p) {
  var c = cfg_();
  var msg = '✅ Teste do ' + (c.studioNome || 'Studio CRM') + ': a integração com o WhatsApp está funcionando! 💖';
  wa_enviar_(p.telefone, msg, { tipo: 'teste', vars: ['Teste'] });
  return true;
}

/* ------------------------- Configuração ------------------------- */

function wa_getConfig_() {
  var c = cfg_();
  var s = waSecret_();
  var pub = {};
  Object.keys(WA_SECRET_PADRAO).forEach(function (k) {
    if (SEGREDOS.indexOf(k) >= 0) { pub[k] = ''; pub[k + 'Salvo'] = s[k] ? '••••' + String(s[k]).slice(-4) : ''; }
    else if (k !== 'webhookKey') pub[k] = s[k];
  });
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  return {
    wa: c.wa, templates: c.templates, segredos: pub,
    webhookUrl: url ? url + '?k=' + s.webhookKey : '(implante o app da Web para gerar o endereço)',
    gatilhoAtivo: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processarLembretes'; })
  };
}

function wa_saveConfig_(p) {
  var c = cfg_();
  if (p.wa) {
    Object.keys(CFG_PADRAO.wa).forEach(function (k) {
      if (p.wa[k] === undefined) return;
      c.wa[k] = typeof CFG_PADRAO.wa[k] === 'boolean' ? !!p.wa[k] : num_(p.wa[k]);
    });
  }
  if (p.templates) {
    Object.keys(CFG_PADRAO.templates).forEach(function (k) {
      if (typeof p.templates[k] === 'string') c.templates[k] = p.templates[k].trim() || CFG_PADRAO.templates[k];
    });
  }
  cfg_gravar_(c);

  if (p.segredos) {
    var s = waSecret_();
    Object.keys(WA_SECRET_PADRAO).forEach(function (k) {
      if (k === 'webhookKey' || p.segredos[k] === undefined) return;
      var v = p.segredos[k];
      if (SEGREDOS.indexOf(k) >= 0 && v === '' && !p.segredos[k + 'Limpar']) return; // mantém o salvo
      if (k === 'metaTemplates') { s[k] = typeof v === 'object' ? v : json_(v, {}); return; }
      s[k] = String(v || '').trim();
    });
    PropertiesService.getScriptProperties().setProperty('WA_SECRET', JSON.stringify(s));
  }
  if (c.wa.ativo && !ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processarLembretes'; })) {
    gatilhos_instalar_();
  }
  return wa_getConfig_();
}

function wa_logs_(p) {
  var lim = Math.min(300, num_(p.limite) || 100);
  var nomes = {};
  db_all_('Clientes').forEach(function (c) { nomes[c.id] = c.nome; });
  return db_all_('Mensagens').sort(function (a, b) { return a.data < b.data ? 1 : -1; }).slice(0, lim)
    .map(function (m) { m.clienteNome = nomes[m.clienteId] || ''; return m; });
}

/* ------------------------- Automação (gatilho) ------------------------- */

/** ⏰ Executado pelo gatilho a cada 15 minutos. */
function processarLembretes() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try { processarAutomacoes_(false); } finally { lock.releaseLock(); }
}

function processarAutomacoes_(manual) {
  var c = cfg_();
  var res = { enviadas: 0, erros: 0, dispensadas: 0, silencio: false };
  if (!c.wa.ativo || !waSecret_().provedor) { res.inativo = true; return res; }

  var agora = agora_().slice(0, 16);
  var hora = Number(agora.slice(11, 13));
  var ini = num_(c.wa.silencioInicio), fim = num_(c.wa.silencioFim);
  var silencio = ini > fim ? (hora >= ini || hora < fim) : (hora >= ini && hora < fim);
  if (silencio) { res.silencio = true; return res; }

  var envios = 0;
  function enviar(tipo, a, campo) {
    if (envios >= MAX_POR_EXECUCAO) return;
    try {
      wa_enviarAg_(tipo, a);
      db_update_('Agendamentos', a.id, (function () { var o = {}; o[campo] = agora_(); return o; })());
      res.enviadas++;
    } catch (e) {
      res.erros++;
      db_update_('Agendamentos', a.id, (function () { var o = {}; o[campo] = 'erro ' + agora_(); return o; })());
    }
    envios++;
    Utilities.sleep(1200); // pausa entre mensagens (evita bloqueio por spam)
  }
  function dispensar(a, campo) {
    var o = {}; o[campo] = 'dispensado'; db_update_('Agendamentos', a.id, o); res.dispensadas++;
  }

  var h1 = num_(c.wa.lembrete1Horas) * 60, h2 = num_(c.wa.lembrete2Horas) * 60;
  var limiteFuturo = addMin_(agora, Math.max(h1, h2) + 60);
  var ags = db_all_('Agendamentos').filter(function (a) { return a.inicio.slice(0, 16) > agora || a.status === 'concluido'; });

  ags.forEach(function (a) {
    var inicio = a.inicio.slice(0, 16);
    var temTel = !!(a.telefone);
    if (STATUS_ATIVOS.indexOf(a.status) >= 0 && a.status !== 'remarcar' && inicio > agora && inicio <= limiteFuturo && temTel) {
      var criado = String(a.criadoEm || '').slice(0, 16);
      var falta = diffMin_(agora, inicio);
      // Lembrete 1 (ex.: 24h antes)
      if (c.wa.lembrete1 && !a.lembrete1Enviado && falta <= h1) {
        var criadoNaJanela = criado && diffMin_(criado, inicio) <= h1 && a.confirmEnviada;
        if (criadoNaJanela || (c.wa.lembrete2 && falta <= h2)) dispensar(a, 'lembrete1Enviado');
        else enviar('lembrete1', a, 'lembrete1Enviado');
      }
      // Lembrete 2 (ex.: 2h antes)
      if (c.wa.lembrete2 && !a.lembrete2Enviado && falta <= h2) {
        if (criado && diffMin_(criado, inicio) <= h2) dispensar(a, 'lembrete2Enviado');
        else enviar('lembrete2', a, 'lembrete2Enviado');
      }
    }
    // Pós-atendimento
    if (c.wa.pos && a.status === 'concluido' && !a.posEnviado && temTel) {
      var fimAt = a.fim.slice(0, 16);
      var desde = diffMin_(fimAt, agora);
      if (desde >= num_(c.wa.posHoras) * 60 && desde <= 48 * 60) enviar('pos', a, 'posEnviado');
      else if (desde > 48 * 60) dispensar(a, 'posEnviado');
    }
  });

  // Aniversariantes (uma vez por dia, a partir do horário configurado)
  if (c.wa.aniversario && hora >= num_(c.wa.aniversarioHora)) {
    var props = PropertiesService.getScriptProperties();
    var hoje = agora.slice(0, 10);
    if (props.getProperty('ANIV_DIA') !== hoje) {
      db_all_('Clientes').forEach(function (cl) {
        if (envios >= MAX_POR_EXECUCAO) return;
        if (cl.telefone && cl.nascimento && cl.nascimento.slice(5, 10) === hoje.slice(5, 10)) {
          try {
            wa_enviar_(cl.telefone, wa_render_(c.templates.aniversario, null, cl), { tipo: 'aniversario', clienteId: cl.id, vars: [String(cl.nome).split(' ')[0]] });
            res.enviadas++;
          } catch (e) { res.erros++; }
          envios++;
          Utilities.sleep(1200);
        }
      });
      if (envios < MAX_POR_EXECUCAO) props.setProperty('ANIV_DIA', hoje);
    }
  }
  return res;
}

/* ------------------------- Respostas (webhook) ------------------------- */

/**
 * Recebe mensagens do provedor (configure a URL exibida no menu WhatsApp
 * como webhook de "mensagens recebidas"). A chave ?k= protege o endereço.
 */
function doPost(e) {
  var out = function (t) { return ContentService.createTextOutput(t).setMimeType(ContentService.MimeType.TEXT); };
  try {
    var k = e && e.parameter && e.parameter.k;
    if (!k || k !== waSecret_().webhookKey) return out('forbidden');
    var body = json_(e.postData && e.postData.contents, {}) || {};
    var msg = wa_parseRecebida_(body);
    if (!msg || msg.fromMe || msg.grupo || !msg.texto || !msg.telefone) return out('ignorado');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { wa_resposta_(msg.telefone, msg.texto); } finally { lock.releaseLock(); }
    return out('ok');
  } catch (err) {
    console.error(err);
    return out('erro');
  }
}

function wa_parseRecebida_(b) {
  // Z-API
  if (b.phone !== undefined && (b.text || b.buttonsResponseMessage || b.listResponseMessage)) {
    return { telefone: b.phone, fromMe: !!b.fromMe, grupo: !!b.isGroup,
      texto: (b.text && b.text.message) || (b.buttonsResponseMessage && b.buttonsResponseMessage.message) || '' };
  }
  // Evolution API
  if (b.data && b.data.key) {
    var jid = String(b.data.key.remoteJid || '');
    var m = b.data.message || {};
    return { telefone: jid.split('@')[0], fromMe: !!b.data.key.fromMe, grupo: jid.indexOf('@g.us') > 0,
      texto: m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || '' };
  }
  // Meta Cloud API
  if (b.entry && b.entry[0] && b.entry[0].changes) {
    var v = (b.entry[0].changes[0] || {}).value || {};
    var mm = (v.messages || [])[0];
    if (!mm) return null;
    var t = (mm.text && mm.text.body) || (mm.button && mm.button.text) ||
      (mm.interactive && mm.interactive.button_reply && mm.interactive.button_reply.title) || '';
    return { telefone: mm.from, fromMe: false, grupo: false, texto: t };
  }
  // Genérico
  if (b.phone && b.message) return { telefone: b.phone, texto: b.message };
  return null;
}

function wa_resposta_(telefone, texto) {
  var c = cfg_();
  var chave = foneChave_(telefone);
  var clientes = db_all_('Clientes').filter(function (cl) { return cl.telefone && foneChave_(cl.telefone) === chave; });
  var ids = clientes.map(function (cl) { return cl.id; });
  db_insert_('Mensagens', { data: agora_(), tipo: 'resposta', direcao: 'recebida', clienteId: ids[0] || '',
    telefone: fone_(telefone), mensagem: String(texto).slice(0, 500), status: 'recebida' });
  if (!ids.length || !c.wa.respostasAuto) return;

  var agora = agora_().slice(0, 16);
  var proximo = db_all_('Agendamentos').filter(function (a) {
    return ids.indexOf(a.clienteId) >= 0 && STATUS_ATIVOS.indexOf(a.status) >= 0 && a.inicio.slice(0, 16) > agora &&
      (a.lembrete1Enviado || a.lembrete2Enviado || a.confirmEnviada);
  }).sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; })[0];
  if (!proximo) return;

  var t = String(texto).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  var cli = clientes[0];
  if (/^(1|sim|confirm|confirmado|confirmo|ok|pode confirmar)\b/.test(t)) {
    if (proximo.status === 'confirmado') return;
    var a1 = ag_sync_(db_update_('Agendamentos', proximo.id, { status: 'confirmado' }));
    try { wa_enviar_(cli.telefone, wa_render_(c.templates.respostaConfirmado, a1, cli), { tipo: 'respostaConfirmado', clienteId: cli.id, agendamentoId: a1.id, vars: [String(cli.nome).split(' ')[0]] }); } catch (e) {}
  } else if (/^(2|nao|remarc|desmarc|cancel|nao vou|nao posso)/.test(t)) {
    if (proximo.status === 'remarcar') return;
    var a2 = ag_sync_(db_update_('Agendamentos', proximo.id, { status: 'remarcar' }));
    try { wa_enviar_(cli.telefone, wa_render_(c.templates.respostaRemarcar, a2, cli), { tipo: 'respostaRemarcar', clienteId: cli.id, agendamentoId: a2.id, vars: [String(cli.nome).split(' ')[0]] }); } catch (e) {}
  }
}
