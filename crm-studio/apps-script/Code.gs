/**
 * ============================================================
 *  STUDIO CRM — CRM para Studio de Maquiagem, Sobrancelha e Penteado
 *  Google Apps Script (Web App com portal protegido por senha)
 * ============================================================
 *
 *  PRIMEIRA INSTALAÇÃO (veja o README.md para o passo a passo):
 *   1. Cole todos os arquivos no projeto do Apps Script.
 *   2. Selecione a função  instalar  e clique em "Executar".
 *   3. Autorize o acesso e copie a SENHA PROVISÓRIA exibida no log.
 *   4. Implantar > Nova implantação > App da Web
 *        Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *   5. Abra a URL do app, entre com usuário "admin" e a senha provisória.
 *
 *  SEGURANÇA: toda função global SEM "_" no final pode ser chamada pelo
 *  navegador (google.script.run). Por isso todas as funções internas
 *  terminam com "_" e o app só expõe: login(), api() e include().
 */

var APP_VERSAO = '1.1.0';

/* ------------------------------------------------------------------ */
/*  Web App                                                            */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  var c = cfg_();
  t.studioNome = c.studioNome || 'Studio CRM';
  return t.evaluate()
    .setTitle(c.studioNome ? c.studioNome + ' · CRM' : 'Studio CRM')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    // ALLOWALL: permite abrir o CRM dentro da página do portal (pasta portal/) ou do Google Sites,
    // o que esconde a faixa "Este aplicativo foi criado por um usuário...". O acesso continua exigindo senha.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Inclui um arquivo HTML dentro do template (Styles / Scripts). */
function include(nome) {
  var permitidos = ['Brand', 'Styles', 'Scripts'];
  if (permitidos.indexOf(nome) < 0) return '';
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

/** Login público — devolve token de sessão. */
function login(usuario, senha, lembrar) {
  return JSON.stringify(safe_(function () { return auth_login_(usuario, senha, lembrar); }));
}

/** Ponto único de entrada de todas as ações autenticadas do portal. */
function api(token, action, payload) {
  return JSON.stringify(safe_(function () {
    var sess = auth_check_(token);
    var rota = rotas_()[action];
    if (!rota) throw erro_('Ação desconhecida: ' + action);
    if (rota.admin && sess.perfil !== 'admin') throw erro_('Seu usuário não tem permissão para isso.');
    payload = payload || {};
    if (rota.escrita) {
      var lock = LockService.getScriptLock();
      lock.waitLock(25000);
      try { return rota.fn(payload, sess, token); } finally { lock.releaseLock(); }
    }
    return rota.fn(payload, sess, token);
  }));
}

/** Tabela de rotas: nome da ação -> função (lazy para funcionar entre arquivos). */
function rotas_() {
  return {
    // Sessão
    'auth.me':            { fn: function (p, s) { return s; } },
    'auth.logout':        { fn: function (p, s, t) { auth_logout_(t); return true; } },
    'auth.alterarSenha':  { fn: auth_alterarSenha_, escrita: true },

    // Carga inicial
    'boot':               { fn: boot_ },

    // Painel / relatórios
    'dashboard':          { fn: dash_get_ },
    'relatorio':          { fn: rel_get_, admin: true },

    // Clientes
    'clientes.listar':    { fn: cli_listar_ },
    'clientes.obter':     { fn: cli_obter_ },
    'clientes.salvar':    { fn: cli_salvar_, escrita: true },
    'clientes.excluir':   { fn: cli_excluir_, escrita: true, admin: true },

    // Serviços e equipe
    'servicos.salvar':    { fn: srv_salvar_, escrita: true, admin: true },
    'servicos.excluir':   { fn: srv_excluir_, escrita: true, admin: true },
    'equipe.salvar':      { fn: prof_salvar_, escrita: true, admin: true },
    'equipe.excluir':     { fn: prof_excluir_, escrita: true, admin: true },

    // Agenda
    'agenda.listar':      { fn: ag_listar_ },
    'agenda.obter':       { fn: ag_obter_ },
    'agenda.salvar':      { fn: ag_salvar_, escrita: true },
    'agenda.status':      { fn: ag_status_, escrita: true },
    'agenda.finalizar':   { fn: ag_finalizar_, escrita: true },
    'agenda.excluir':     { fn: ag_excluir_, escrita: true },
    'agenda.ressincronizar': { fn: ag_ressincronizar_, escrita: true, admin: true },
    'agenda.importarPrevia': { fn: imp_previa_, admin: true },
    'agenda.importar':    { fn: imp_importar_, escrita: true, admin: true },

    // Financeiro
    'fin.listar':         { fn: fin_listar_, admin: true },
    'fin.salvar':         { fn: fin_salvar_, escrita: true, admin: true },
    'fin.pagar':          { fn: fin_pagar_, escrita: true, admin: true },
    'fin.excluir':        { fn: fin_excluir_, escrita: true, admin: true },

    // WhatsApp
    'wa.config':          { fn: wa_getConfig_, admin: true },
    'wa.salvarConfig':    { fn: wa_saveConfig_, escrita: true, admin: true },
    'wa.testar':          { fn: wa_testar_, admin: true },
    'wa.enviar':          { fn: wa_enviarManual_, escrita: true },
    'wa.logs':            { fn: wa_logs_, admin: true },
    'wa.processar':       { fn: function () { return processarAutomacoes_(true); }, escrita: true, admin: true },

    // Configurações
    'cfg.obter':          { fn: cfg_getFull_, admin: true },
    'cfg.salvar':         { fn: cfg_save_, escrita: true, admin: true },
    'cfg.calendarios':    { fn: cal_listar_, admin: true },

    // Usuários
    'usuarios.listar':    { fn: usr_listar_, admin: true },
    'usuarios.salvar':    { fn: usr_salvar_, escrita: true, admin: true },
    'usuarios.excluir':   { fn: usr_excluir_, escrita: true, admin: true }
  };
}

/** Dados que o portal carrega logo após o login. */
function boot_(p, sess) {
  var c = cfg_();
  return {
    user: sess,
    versao: APP_VERSAO,
    cfg: cfg_publica_(c),
    servicos: db_all_('Servicos'),
    equipe: db_all_('Profissionais'),
    clientes: cli_listar_({}).map(function (x) {
      return { id: x.id, nome: x.nome, telefone: x.telefone, nascimento: x.nascimento };
    })
  };
}

/* ------------------------------------------------------------------ */
/*  Utilitários                                                        */
/* ------------------------------------------------------------------ */

function safe_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    var out = { ok: false, error: (err && err.message) || String(err) };
    if (err && err.auth === false) out.auth = false;
    if (err && err.dados) out.dados = err.dados;
    if (!(err && err.usuario)) console.error(err && err.stack ? err.stack : err);
    return out;
  }
}

/** Erro "amigável" (mensagem para o usuário, sem log de stack). */
function erro_(msg, dados) {
  var e = new Error(msg);
  e.usuario = true;
  if (dados) e.dados = dados;
  return e;
}

function tz_() { return Session.getScriptTimeZone() || 'America/Sao_Paulo'; }

/** Agora no fuso do studio: 'yyyy-MM-ddTHH:mm:ss' */
function agora_() { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm:ss"); }
function hoje_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

/** Converte 'yyyy-MM-ddTHH:mm[:ss]' (horário local do studio) em Date. */
function parseLocal_(s) {
  s = String(s || '');
  if (s.length === 10) s += 'T00:00';
  s = s.slice(0, 16);
  return Utilities.parseDate(s, tz_(), "yyyy-MM-dd'T'HH:mm");
}

function fmtLocal_(d, fmt) { return Utilities.formatDate(d, tz_(), fmt || "yyyy-MM-dd'T'HH:mm"); }

/** Soma minutos a uma string local e devolve string local. */
function addMin_(s, min) {
  return fmtLocal_(new Date(parseLocal_(s).getTime() + min * 60000));
}

/** Diferença em minutos (b - a) entre duas strings locais. */
function diffMin_(a, b) { return Math.round((parseLocal_(b).getTime() - parseLocal_(a).getTime()) / 60000); }

/** Soma meses a 'yyyy-MM-dd'. */
function addMeses_(dataStr, n) {
  var p = dataStr.split('-').map(Number);
  var y = p[0], m = p[1] - 1 + n, d = p[2];
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  var ult = new Date(y, m + 1, 0).getDate();
  return y + '-' + pad2_(m + 1) + '-' + pad2_(Math.min(d, ult));
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function num_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  var s = String(v).trim().replace(/[R$\s]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function round2_(n) { return Math.round(n * 100) / 100; }

function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }

function brl_(v) {
  var n = round2_(num_(v)).toFixed(2).split('.');
  return 'R$ ' + n[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + n[1];
}

/** Telefone só com dígitos, com DDI 55 quando faltar. */
function fone_(t) {
  var d = String(t || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.charAt(0) === '0') d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

/** Chave para comparar telefones (DDD + 8 últimos dígitos — ignora o 9º dígito). */
function foneChave_(t) {
  var d = fone_(t);
  if (d.indexOf('55') === 0 && d.length >= 12) d = d.slice(2);
  if (d.length < 10) return d;
  return d.slice(0, 2) + d.slice(-8);
}

function editorOnly_() {
  var ativo = '', efetivo = '';
  try { ativo = Session.getActiveUser().getEmail(); } catch (e) {}
  try { efetivo = Session.getEffectiveUser().getEmail(); } catch (e) {}
  if (!ativo || ativo !== efetivo) throw new Error('Execute esta função pelo editor do Apps Script.');
}

/* ------------------------------------------------------------------ */
/*  Funções para rodar pelo EDITOR do Apps Script                      */
/* ------------------------------------------------------------------ */

/**
 * ▶ Rode UMA vez pelo editor: cria a planilha/abas, os serviços de
 * exemplo, o usuário administrador e os gatilhos automáticos.
 */
function instalar() {
  editorOnly_();
  db_setup_();
  srv_seed_();
  var senha = usr_seedAdmin_();
  gatilhos_instalar_();
  // força a autorização da agenda já na instalação
  try { CalendarApp.getDefaultCalendar().getName(); } catch (e) {}
  var url = ss_().getUrl();
  Logger.log('✅ Instalação concluída!');
  Logger.log('📄 Banco de dados (planilha): ' + url);
  if (senha) {
    Logger.log('👤 Usuário: admin');
    Logger.log('🔑 Senha provisória: ' + senha + '   (você vai trocar no primeiro acesso)');
  } else {
    Logger.log('👤 Usuários já existiam — nenhuma senha foi alterada.');
  }
  Logger.log('➡ Agora vá em Implantar > Nova implantação > App da Web.');
}

/** ▶ Esqueceu a senha? Rode pelo editor para gerar uma nova senha do "admin". */
function redefinirSenhaAdmin() {
  editorOnly_();
  db_setup_();
  var senha = usr_resetAdmin_();
  Logger.log('🔑 Nova senha provisória do usuário "admin": ' + senha);
}

/** ▶ Recria os gatilhos (lembretes automáticos a cada 15 minutos). */
function reinstalarGatilhos() {
  editorOnly_();
  gatilhos_instalar_();
  Logger.log('⏰ Gatilhos recriados.');
}

function gatilhos_instalar_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processarLembretes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processarLembretes').timeBased().everyMinutes(15).create();
}
