/**
 * Configurações do studio (guardadas nas Propriedades do Script).
 * Chaves de API do WhatsApp ficam separadas (WA_SECRET) e nunca são
 * enviadas completas para o navegador.
 */

var CFG_PADRAO = {
  studioNome: 'Meu Studio',
  responsavel: '',
  telefone: '',
  endereco: '',
  instagram: '',
  pix: '',

  // Google Agenda
  calendarAtivo: true,
  calendarId: 'primary',
  mostrarEventosGoogle: true,
  lembreteAgendaMin: 60,

  // Agenda
  horaAbertura: '08:00',
  horaFechamento: '20:00',
  intervaloAgenda: 15,
  diasInativa: 60,

  // Listas
  categoriasServico: ['Maquiagem', 'Sobrancelha', 'Penteado', 'Cílios', 'Noivas & Eventos', 'Outros'],
  categoriasReceita: ['Serviços', 'Sinal / Reserva', 'Venda de produtos', 'Cursos e workshops', 'Outras receitas'],
  categoriasDespesa: ['Produtos e insumos', 'Aluguel', 'Energia, água e internet', 'Marketing e anúncios',
    'Comissões', 'Equipamentos', 'Taxas de cartão', 'Impostos (MEI/DAS)', 'Pró-labore', 'Transporte', 'Outras despesas'],
  formasPagamento: ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Outro'],
  locais: ['Studio', 'Domicílio', 'Evento / Salão de festa'],

  // Automação de WhatsApp
  wa: {
    ativo: false,
    confirmacao: true,
    lembrete1: true, lembrete1Horas: 24,
    lembrete2: true, lembrete2Horas: 2,
    pos: false, posHoras: 3,
    aniversario: false, aniversarioHora: 9,
    respostasAuto: true,
    silencioInicio: 21, silencioFim: 8
  },

  templates: {
    confirmacao:
      'Olá, {nome}! 💖\n\nSeu horário no *{studio}* está agendado:\n\n📅 {diaSemana}, {data} às {hora}\n✨ {servico}\n📍 {endereco}\n\nQualquer dúvida é só chamar por aqui!',
    lembrete1:
      'Oi, {nome}! Tudo bem? ✨\n\nPassando para lembrar do seu horário:\n\n📅 {diaSemana}, {data} às {hora}\n💄 {servico}\n📍 {endereco}\n\nResponda *1* para CONFIRMAR ou *2* se precisar remarcar. 💕',
    lembrete2:
      '{nome}, falta pouquinho! ⏰\nTe esperamos hoje às *{hora}* para {servico}. Até já! 💖',
    pos:
      'Obrigada pela visita, {nome}! 💖\nEspero que tenha amado o resultado. Se puder, marca a gente no Instagram {instagram} — e quando quiser, é só chamar para agendar de novo! ✨',
    aniversario:
      'Feliz aniversário, {nome}! 🎉🎂\nO *{studio}* te deseja um dia lindo! Como presente, você tem um mimo especial no seu próximo atendimento este mês. 💝',
    respostaConfirmado:
      'Perfeito, {nome}! Seu horário de {data} às {hora} está *confirmado* ✅ Até lá! 💖',
    respostaRemarcar:
      'Sem problemas, {nome}! Já avisei o studio e em breve te chamamos para escolher um novo horário. 💕',
    reativacao:
      'Oi, {nome}! Que saudade! 💖 Faz um tempinho que você não vem ao *{studio}*. Que tal agendar um horário essa semana? ✨'
  }
};

var WA_SECRET_PADRAO = {
  provedor: '',          // zapi | evolution | meta | webhook
  zapiInstancia: '', zapiToken: '', zapiClientToken: '',
  evoUrl: '', evoInstancia: '', evoApiKey: '',
  metaPhoneId: '', metaToken: '', metaIdioma: 'pt_BR', metaTemplates: {},
  webhookUrl: '', webhookAuth: '',
  webhookKey: ''         // chave para receber respostas (doPost)
};

var _cfg = null;

function cfg_() {
  if (_cfg) return _cfg;
  var raw = PropertiesService.getScriptProperties().getProperty('CFG');
  var salvo = raw ? json_(raw, {}) : {};
  var c = Object.assign({}, CFG_PADRAO, salvo);
  c.wa = Object.assign({}, CFG_PADRAO.wa, salvo.wa || {});
  c.templates = Object.assign({}, CFG_PADRAO.templates, salvo.templates || {});
  _cfg = c;
  return c;
}

function cfg_gravar_(c) {
  PropertiesService.getScriptProperties().setProperty('CFG', JSON.stringify(c));
  _cfg = null;
}

/** Configuração sem dados sensíveis — vai para todos os usuários logados. */
function cfg_publica_(c) {
  return {
    studioNome: c.studioNome, responsavel: c.responsavel, telefone: c.telefone, endereco: c.endereco,
    instagram: c.instagram, pix: c.pix,
    calendarAtivo: c.calendarAtivo, mostrarEventosGoogle: c.mostrarEventosGoogle,
    horaAbertura: c.horaAbertura, horaFechamento: c.horaFechamento, intervaloAgenda: c.intervaloAgenda,
    diasInativa: c.diasInativa,
    categoriasServico: c.categoriasServico, categoriasReceita: c.categoriasReceita,
    categoriasDespesa: c.categoriasDespesa, formasPagamento: c.formasPagamento, locais: c.locais,
    waAtivo: !!(c.wa.ativo && waSecret_().provedor), waConfirmacao: c.wa.confirmacao,
    templates: { reativacao: c.templates.reativacao, aniversario: c.templates.aniversario, confirmacao: c.templates.confirmacao, lembrete1: c.templates.lembrete1 }
  };
}

function cfg_getFull_() {
  var c = cfg_();
  var url = '';
  try { url = ss_().getUrl(); } catch (e) {}
  return { cfg: c, planilhaUrl: url, versao: APP_VERSAO };
}

function cfg_save_(p) {
  var c = cfg_();
  var permitidos = ['studioNome', 'responsavel', 'telefone', 'endereco', 'instagram', 'pix',
    'calendarAtivo', 'calendarId', 'mostrarEventosGoogle', 'lembreteAgendaMin',
    'horaAbertura', 'horaFechamento', 'intervaloAgenda', 'diasInativa',
    'categoriasServico', 'categoriasReceita', 'categoriasDespesa', 'formasPagamento', 'locais'];
  permitidos.forEach(function (k) {
    if (p[k] === undefined) return;
    var v = p[k];
    if (Array.isArray(CFG_PADRAO[k])) {
      v = (Array.isArray(v) ? v : String(v).split(/\n|,/)).map(function (s) { return String(s).trim(); }).filter(String);
      if (!v.length) v = CFG_PADRAO[k];
    } else if (typeof CFG_PADRAO[k] === 'number') v = num_(v);
    else if (typeof CFG_PADRAO[k] === 'boolean') v = v === true || v === 'true' || v === 'sim';
    else v = String(v).trim();
    c[k] = v;
  });
  if (p.calendarId !== undefined && c.calendarAtivo) {
    if (!cal_()) throw erro_('Não encontrei essa agenda do Google. Escolha outra na lista.');
  }
  cfg_gravar_(c);
  return cfg_publica_(cfg_());
}

function cal_listar_() {
  var lista = [{ id: 'primary', nome: 'Agenda principal (' + Session.getEffectiveUser().getEmail() + ')' }];
  CalendarApp.getAllOwnedCalendars().forEach(function (cal) {
    if (cal.isMyPrimaryCalendar && cal.isMyPrimaryCalendar()) return;
    lista.push({ id: cal.getId(), nome: cal.getName() });
  });
  return lista;
}

function waSecret_() {
  var raw = PropertiesService.getScriptProperties().getProperty('WA_SECRET');
  var s = Object.assign({}, WA_SECRET_PADRAO, raw ? json_(raw, {}) : {});
  if (!s.webhookKey) {
    s.webhookKey = uid_() + uid_();
    PropertiesService.getScriptProperties().setProperty('WA_SECRET', JSON.stringify(s));
  }
  return s;
}
