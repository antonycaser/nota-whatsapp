/* GERADO por crm-supabase/dev/gerar-app.py a partir de crm-studio/apps-script/Scripts.html */
/* =====================================================================
   STUDIO CRM — Front-end (portal)
   ===================================================================== */
(function () {
'use strict';

/* ------------------------- Estado ------------------------- */
const S = {
  token: null, user: null, cfg: {}, servicos: [], equipe: [], clientes: [],
  page: 'dashboard', charts: [], cal: null, dashMes: null, finMes: null, finFiltro: 'todos',
  cliFiltro: 'todas', relPeriodo: 'mes', relIni: null, relFim: null, corPorProf: false, filtroProf: ''
};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const $ = (sel, el) => (el || document).querySelector(sel);
const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
const isAdmin = () => S.user && S.user.perfil === 'admin';

/* ------------------------- Servidor ------------------------- */
const CFG_SB = window.CRM_CONFIG || {};
const sb = window.supabase.createClient(CFG_SB.url, CFG_SB.chave, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
function traduzirErroLogin(m) {
  m = String(m || '');
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (/password should be|weak password/i.test(m)) return 'Senha fraca: use pelo menos 8 caracteres, com letras e números.';
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão. Verifique sua internet.';
  return m;
}
/* Guarda a última resposta de cada tela no aparelho: a tela abre na hora com o que
   já tinha e se atualiza sozinha quando os dados novos chegam do Google. */
const RC = {
  chave: (a, p) => 'rc_' + (S.user ? S.user.id : '') + '_' + a + '_' + JSON.stringify(p || {}),
  ler(a, p) { try { const v = localStorage.getItem(this.chave(a, p)); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  gravar(a, p, d) { try { localStorage.setItem(this.chave(a, p), JSON.stringify(d)); } catch (e) { RC.limpar(); } },
  limpar() { try { Object.keys(localStorage).filter(k => k.indexOf('rc_') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {} }
};
async function callRapido(action, payload, desenhar, el) {
  const salvo = RC.ler(action, payload);
  if (salvo) { try { desenhar(salvo, true); } catch (e) { console.warn(e); } }
  const d = await call(action, payload);
  RC.gravar(action, payload, d);
  if (el && !document.body.contains(el)) return d; // usuária já mudou de tela
  if (!salvo || JSON.stringify(salvo) !== JSON.stringify(d)) {
    const y = window.scrollY;
    desenhar(d, false);
    if (salvo) window.scrollTo(0, y);
  }
  return d;
}
async function call(action, payload) {
  const { data } = await sb.auth.getSession();
  const sessao = data && data.session;
  if (!sessao) {
    const e = new Error('Faça login para continuar.'); e.auth = true;
    sessaoExpirada(e.message); throw e;
  }
  let r, o;
  try {
    r = await fetch(CFG_SB.url + '/functions/v1/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token, apikey: CFG_SB.chave },
      body: JSON.stringify({ action, payload: payload || {} })
    });
  } catch (e) { throw new Error('Sem conexão. Verifique sua internet.'); }
  try { o = await r.json(); } catch (e) { throw new Error('Resposta inválida do servidor (' + r.status + ').'); }
  if (o && o.ok) return o.data;
  const err = new Error((o && (o.error || o.msg || o.message)) || 'Erro no servidor (' + r.status + ').');
  err.dados = o && o.dados;
  err.auth = (o && o.auth === false) || r.status === 401;
  if (err.auth) sessaoExpirada(err.message);
  throw err;
}

/* ------------------------- Utilidades ------------------------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlK = v => { v = Number(v) || 0; return Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : 'R$ ' + Math.round(v); };
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hoje = () => ymd(new Date());
const addDias = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return ymd(d); };
const addMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const fimMes = ym => { const [y, m] = ym.split('-').map(Number); return ymd(new Date(y, m, 0)); };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const mesLabel = ym => MESES[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
const fData = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—';
const fDataCurta = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';
const fHora = s => s ? s.slice(11, 16) : '';
const diaSemana = s => DIAS[new Date(s.slice(0, 10) + 'T12:00').getDay()];
const fDataHora = s => s ? fData(s) + ' ' + fHora(s) : '—';
const fDur = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? h + 'h' + (m ? pad(m) : '') : m + 'min'; };
const durEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
const iniciais = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const primeiroNome = n => String(n || '').split(' ')[0];
const num = v => { if (typeof v === 'number') return v; let s = String(v || '').replace(/[R$\s]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
function foneFmt(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '';
}
function waLink(tel, msg) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return 'https://wa.me/' + d + (msg ? '?text=' + encodeURIComponent(msg) : '');
}
function renderTpl(tpl, vars) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] !== undefined ? vars[k] : m); }
function tplVars(cli, ag) {
  const v = { nome: primeiroNome(cli && cli.nome), nomeCompleto: (cli && cli.nome) || '', studio: S.cfg.studioNome || '',
    endereco: S.cfg.endereco || '', instagram: S.cfg.instagram || '', pix: S.cfg.pix || '', telefoneStudio: S.cfg.telefone || '' };
  if (ag) Object.assign(v, { servico: ag.servicoNomes, data: fDataCurta(ag.inicio), hora: fHora(ag.inicio),
    diaSemana: diaSemana(ag.inicio), profissional: ag.profissionalNome || '', valor: brl(ag.valor - (ag.desconto || 0)) });
  return v;
}
function inkFor(hex) {
  const h = String(hex || '#0f7f7c').replace('#', '');
  const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#241b26' : '#ffffff';
}
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const STATUS = {
  agendado: 'Agendado', confirmado: 'Confirmado', concluido: 'Concluído', faltou: 'Faltou',
  cancelado: 'Cancelado', remarcar: 'Pediu remarcação'
};
const pill = (st, label) => `<span class="pill st-${esc(st)}">${esc(label || STATUS[st] || st)}</span>`;

/* ------------------------- Ícones ------------------------- */
const ICONS = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  sparkles: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/><path d="M19 3v4M17 5h4"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  up: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  down: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8H8M16 12H8M13 16H8"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  coins: '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'
};
const ico = (n, cls) => `<span class="ico ${cls || ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg></span>`;
function hydrateIcons(root) { $$('[data-ico]', root).forEach(el => { el.outerHTML = ico(el.dataset.ico); }); }

/* ------------------------- Toast / Modal ------------------------- */
function toast(msg, tipo) {
  const el = document.createElement('div');
  el.className = 'toast ' + (tipo || 'ok');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, tipo === 'err' ? 5200 : 3000);
  setTimeout(() => el.remove(), tipo === 'err' ? 5600 : 3400);
}
const erroToast = e => toast((e && e.message) || String(e), 'err');

function modal({ title, body, foot, wide, drawer, onMount, fixo, sheet }) {
  const ov = document.createElement('div');
  ov.className = 'overlay' + (drawer ? ' drawer' : '') + (sheet ? ' sheet' : '');
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${title || ''}</h2>${fixo ? '' : `<button class="icon-btn" data-close aria-label="Fechar">${ico('x')}</button>`}</div>
    <div class="modal-body">${body || ''}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  $('#modalRoot').appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape' && !fixo) close(); };
  document.addEventListener('keydown', onKey);
  if (!fixo) ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  $$('[data-close]', ov).forEach(b => b.addEventListener('click', close));
  const m = { el: ov, close, body: $('.modal-body', ov) };
  if (onMount) onMount(m);
  const first = $('input:not([type=hidden]):not([readonly]), select, textarea', ov);
  if (first && !isMobile()) setTimeout(() => first.focus(), 50);
  return m;
}
function confirmar(msg, { ok = 'Confirmar', perigo = false, titulo = 'Confirmar' } = {}) {
  return new Promise(res => {
    const m = modal({
      title: titulo, body: `<p style="margin:0">${msg}</p>`,
      foot: `<button class="btn" data-close>Voltar</button><button class="btn ${perigo ? 'danger' : 'primary'}" data-ok>${ok}</button>`
    });
    let r = false;
    $('[data-ok]', m.el).addEventListener('click', () => { r = true; m.close(); });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); res(r); } });
    obs.observe($('#modalRoot'), { childList: true });
  });
}
/** Pergunta com várias respostas. Devolve o valor do botão escolhido (ou null). */
function escolher(msg, botoes, titulo) {
  return new Promise(res => {
    const m = modal({
      title: titulo || 'Confirmar', body: `<div style="margin:0">${msg}</div>`,
      foot: `<button class="btn" data-close>Voltar</button>` + botoes.map((b, i) => `<button class="btn ${b.cls || ''}" data-esc="${i}">${b.l}</button>`).join('')
    });
    let r = null;
    $$('[data-esc]', m.el).forEach(b => b.addEventListener('click', () => { r = botoes[Number(b.dataset.esc)].v; m.close(); }));
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); res(r); } });
    obs.observe($('#modalRoot'), { childList: true });
  });
}
/**
 * Ao cancelar/excluir: decide o que fazer com o dinheiro que já entrou no caixa.
 * Regra do studio (Configurações): o sinal NÃO é devolvido — fica no caixa automaticamente.
 */
async function perguntarFinanceiro(a, acao) {
  const f = a.financeiro || { pago: 0, sinal: 0 };
  const excluir = acao === 'excluir';
  const titulo = excluir ? 'Excluir agendamento' : 'Cancelar horário';
  const texto = excluir ? 'Excluir definitivamente este agendamento? <span class="muted">(Para manter o histórico, prefira “Cancelar”.)</span>' : 'Cancelar este horário? Ele será removido do Google Agenda.';
  const verbo = excluir ? 'Excluir' : 'Cancelar';
  const reter = S.cfg.sinalRetido !== false;
  const sinal = f.sinal || 0, resto = Math.max(0, (f.pago || 0) - sinal);

  if (!f.pago) {
    const ok = await confirmar(texto, { ok: excluir ? 'Excluir' : 'Cancelar horário', perigo: true });
    return ok ? 'padrao' : null;
  }
  if (reter && sinal && !resto) {
    // só tem sinal pago → fica com o studio
    return escolher(`${texto}<div class="alert info" style="margin:14px 0 0">${ico('wallet')}<div>O <b>sinal de ${brl(sinal)}</b> fica com você e continua no caixa.</div></div>`, [
      { v: 'remover', l: 'Devolvi o sinal', cls: 'ghost' },
      { v: 'padrao', l: `${verbo} e ficar com o sinal`, cls: 'primary' }
    ], titulo);
  }
  if (reter && sinal && resto) {
    return escolher(`${texto}<div class="alert warn" style="margin:14px 0 0">${ico('wallet')}<div>Este atendimento tem <b>${brl(f.pago)}</b> no caixa: <b>${brl(sinal)}</b> de sinal e <b>${brl(resto)}</b> de pagamento.</div></div>`, [
      { v: 'remover', l: 'Tirar tudo (devolvi)', cls: 'ghost' },
      { v: 'manter', l: 'Manter tudo' },
      { v: 'padrao', l: `Tirar ${brl(resto)} e ficar com o sinal`, cls: 'primary' }
    ], titulo);
  }
  return escolher(`${texto}<div class="alert warn" style="margin:14px 0 0">${ico('wallet')}<div>Este atendimento tem <b>${brl(f.pago)}</b> lançado no financeiro. O que fazer com esse valor?</div></div>`, [
    { v: 'manter', l: 'Manter no caixa' },
    { v: 'remover', l: `Tirar ${brl(f.pago)} do caixa`, cls: 'danger' }
  ], titulo);
}
function avisoFinanceiro(a, financeiro, base) {
  const f = a.financeiro || {};
  if (!f.pago) return base;
  if (financeiro === 'padrao' && S.cfg.sinalRetido !== false && f.sinal) return base + ` · sinal de ${brl(f.sinal)} ficou no caixa`;
  if (financeiro === 'remover') return base + ' · valor retirado do caixa';
  return base;
}
function formData(form) {
  const o = {};
  $$('input[name], select[name], textarea[name]', form).forEach(el => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value;
  });
  return o;
}
async function busy(btn, fn) {
  const txt = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span>'; }
  try { return await fn(); } finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = txt; } }
}
const opts = (lista, sel) => lista.map(v => typeof v === 'object'
  ? `<option value="${esc(v.v)}" ${String(v.v) === String(sel) ? 'selected' : ''}>${esc(v.l)}</option>`
  : `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

/* ------------------------- Tema ------------------------- */
function aplicarTema(t) {
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
}
function temaAtual() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function alternarTema() {
  const novo = temaAtual() === 'dark' ? 'light' : 'dark';
  aplicarTema(novo); store.set('crm_tema', novo);
  render();
}

/* ------------------------- Login / sessão ------------------------- */
function mostrarLogin(msg) {
  $('#boot').classList.add('hidden');
  $('#shell').classList.add('hidden');
  $('#login').classList.remove('hidden');
  const err = $('#loginErro');
  if (msg) { err.textContent = msg; err.classList.remove('hidden'); } else err.classList.add('hidden');
}
function esquecerToken() {
  RC.limpar(); store.del('rc_boot');
}
function sessaoExpirada(msg) {
  esquecerToken();
  sb.auth.signOut({ scope: 'local' }).catch(() => {});
  $('#modalRoot').innerHTML = '';
  mostrarLogin(msg || 'Sua sessão expirou. Entre novamente.');
}
async function iniciar() {
  const t = store.get('crm_tema'); if (t) aplicarTema(t);
  hydrateIcons(document);
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = formData(e.target);
    const btn = $('#loginBtn');
    $('#loginErro').classList.add('hidden');
    await busy(btn, async () => {
      const { error } = await sb.auth.signInWithPassword({ email: String(f.email || '').trim(), password: f.senha });
      if (error) return mostrarLogin(traduzirErroLogin(error.message));
      e.target.reset();
      try { await carregar(); } catch (err) { if (!err.auth) mostrarLogin(err.message); }
    });
  });
  $('[data-eye]').addEventListener('click', () => { const i = $('#loginForm [name=senha]'); i.type = i.type === 'password' ? 'text' : 'password'; });
  $('#esqueciSenha').addEventListener('click', async e => {
    e.preventDefault();
    const email = String($('#loginForm [name=email]').value || '').trim();
    if (!email) return mostrarLogin('Digite o seu e-mail no campo acima e toque de novo em “Esqueci minha senha”.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) return mostrarLogin(traduzirErroLogin(error.message));
    mostrarLogin('');
    toast('Enviamos um link para ' + email + '. Abra o e-mail para criar uma senha nova.');
  });
  sb.auth.onAuthStateChange(evento => { if (evento === 'PASSWORD_RECOVERY') setTimeout(novaSenhaRecuperacao, 300); });

  const { data } = await sb.auth.getSession();
  if (!data || !data.session) return mostrarLogin();
  try { await carregar(); } catch (e) { if (!e.auth) mostrarLogin(e.message); }
}
async function carregar() {
  let salvo = null;
  try { salvo = JSON.parse(store.get('rc_boot') || 'null'); } catch (e) {}
  const buscar = call('boot').then(d => { store.set('rc_boot', JSON.stringify(d)); return d; });
  if (salvo && salvo.user) {
    abrirPortal(salvo);
    buscar.then(d => {
      const mudouUsuario = d.user.id !== salvo.user.id || d.user.perfil !== salvo.user.perfil;
      Object.assign(S, { user: d.user, cfg: d.cfg, servicos: d.servicos, equipe: d.equipe, clientes: d.clientes });
      $('#brandName').textContent = S.cfg.studioNome || 'Studio CRM';
      if (mudouUsuario) { montarShell(); ir('dashboard'); }
      if (S.user.trocarSenha && !salvo.user.trocarSenha) trocarSenhaObrigatoria();
    }).catch(e => { if (!e.auth) erroToast(e); });
    return;
  }
  abrirPortal(await buscar);
}
function abrirPortal(d) {
  Object.assign(S, { user: d.user, cfg: d.cfg, servicos: d.servicos, equipe: d.equipe, clientes: d.clientes });
  S.dashMes = S.dashMes || hoje().slice(0, 7);
  S.finMes = S.finMes || hoje().slice(0, 7);
  $('#login').classList.add('hidden');
  $('#boot').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  $('#brandName').textContent = S.cfg.studioNome || 'Studio CRM';
  $('#avatar').textContent = iniciais(S.user.nome);
  $('#avatar').title = S.user.nome + ' · ' + (isAdmin() ? 'Administradora' : 'Equipe');
  montarShell();
  ir(S.page && NAV.some(n => n.id === S.page && (!n.admin || isAdmin())) ? S.page : 'dashboard');
  if (S.user.trocarSenha) trocarSenhaObrigatoria();
}
async function recarregarCadastros() {
  const d = await call('boot');
  store.set('rc_boot', JSON.stringify(d));
  Object.assign(S, { cfg: d.cfg, servicos: d.servicos, equipe: d.equipe, clientes: d.clientes });
}
/** Confere a senha atual e grava a nova no Supabase Auth. */
async function alterarSenha(atual, nova, nova2) {
  if (nova !== nova2) throw new Error('As senhas não conferem.');
  if (String(nova || '').length < 8 || !/[0-9]/.test(nova) || !/[a-zA-Z]/.test(nova)) throw new Error('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
  const { error: e1 } = await sb.auth.signInWithPassword({ email: S.user.email, password: atual });
  if (e1) throw new Error(/invalid login/i.test(e1.message) ? 'A senha atual está incorreta.' : traduzirErroLogin(e1.message));
  const { error: e2 } = await sb.auth.updateUser({ password: nova });
  if (e2) throw new Error(traduzirErroLogin(e2.message));
  S.user = await call('auth.senhaTrocada');
}
function trocarSenhaObrigatoria() {
  const m = modal({
    title: '🔐 Crie sua nova senha', fixo: true,
    body: `<div class="alert accent">${ico('lock')}<div>Por segurança, troque a senha provisória antes de continuar.</div></div>
      <form id="fSenha"><label class="field"><span>Senha atual (provisória)</span><input type="password" name="atual" required autocomplete="current-password"></label>
      <label class="field"><span>Nova senha</span><input type="password" name="nova" required autocomplete="new-password"><small>Mínimo 8 caracteres, com letras e números.</small></label>
      <label class="field"><span>Repita a nova senha</span><input type="password" name="nova2" required autocomplete="new-password"></label></form>`,
    foot: `<button class="btn primary" id="bSenha">Salvar nova senha</button>`
  });
  $('#bSenha', m.el).addEventListener('click', e => busy(e.currentTarget, async () => {
    const f = formData($('#fSenha', m.el));
    try { await alterarSenha(f.atual, f.nova, f.nova2); m.close(); toast('Senha alterada! 💖'); } catch (err) { erroToast(err); }
  }));
}
/** Chegou pelo link "Esqueci minha senha" do e-mail. */
function novaSenhaRecuperacao() {
  const m = modal({
    title: '🔐 Criar senha nova', fixo: true,
    body: `<form id="fRec"><label class="field"><span>Nova senha</span><input type="password" name="nova" required autocomplete="new-password"><small>Mínimo 8 caracteres, com letras e números.</small></label>
      <label class="field"><span>Repita a nova senha</span><input type="password" name="nova2" required autocomplete="new-password"></label></form>`,
    foot: `<button class="btn primary" id="bRec">Salvar e entrar</button>`
  });
  $('#bRec', m.el).addEventListener('click', e => busy(e.currentTarget, async () => {
    const f = formData($('#fRec', m.el));
    if (f.nova !== f.nova2) return toast('As senhas não conferem.', 'err');
    if (String(f.nova).length < 8 || !/[0-9]/.test(f.nova) || !/[a-zA-Z]/.test(f.nova)) return toast('Use pelo menos 8 caracteres, com letras e números.', 'err');
    const { error } = await sb.auth.updateUser({ password: f.nova });
    if (error) return toast(traduzirErroLogin(error.message), 'err');
    m.close(); toast('Senha criada! 💖');
    history.replaceState(null, '', location.pathname);
    try { await carregar(); } catch (err) { if (!err.auth) erroToast(err); }
  }));
}
async function sair() {
  esquecerToken();
  try { await sb.auth.signOut(); } catch (e) {}
  mostrarLogin();
}

/* ------------------------- Navegação ------------------------- */
const NAV = [
  { id: 'dashboard', label: 'Painel', ico: 'dashboard', sub: () => saudacao() + ', ' + primeiroNome(S.user.nome) + ' ✨' },
  { id: 'agenda', label: 'Agenda', ico: 'calendar', sub: () => S.cfg.calendarAtivo ? 'Sincronizada com o Google Agenda' : 'Agenda do studio' },
  { id: 'clientes', label: 'Clientes', ico: 'users', sub: () => S.clientes.length + ' clientes cadastradas' },
  { id: 'servicos', label: 'Serviços & Equipe', ico: 'sparkles', admin: true, sub: () => 'Catálogo, preços e profissionais' },
  { id: 'financeiro', label: 'Financeiro', ico: 'wallet', admin: true, grupo: 'Gestão', sub: () => 'Receitas, despesas e contas' },
  { id: 'relatorios', label: 'Relatórios', ico: 'chart', admin: true, sub: () => 'Desempenho e resultado do studio' },
  { id: 'whatsapp', label: 'WhatsApp', ico: 'message', admin: true, grupo: 'Automação', sub: () => 'Lembretes e mensagens automáticas' },
  { id: 'config', label: 'Configurações', ico: 'settings', admin: true, sub: () => 'Studio, agenda, usuários e senha' }
];
function montarShell() {
  const itens = NAV.filter(n => (!n.admin || isAdmin()) && (n.id !== 'whatsapp' || !S.cfg.recursos || S.cfg.recursos.whatsapp));
  $('#nav').innerHTML = itens.map(n => (n.grupo ? `<div class="nav-label">${n.grupo}</div>` : '') +
    `<button class="nav-item" data-nav="${n.id}">${ico(n.ico)}<span>${n.label}</span></button>`).join('');
  const tab = (id, label) => { const n = NAV.find(x => x.id === id); return `<button data-nav="${id}">${ico(n.ico)}<span>${label || n.label}</span></button>`; };
  $('#bottomNav').innerHTML = tab('dashboard', 'Início') + tab('agenda')
    + `<button class="fab" data-action="novo-ag" aria-label="Novo agendamento">${ico('plus')}</button>`
    + tab('clientes') + `<button data-action="mais">${ico('more')}<span>Mais</span></button>`;
  if (montarShell.ok) return;
  montarShell.ok = true;
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { ir(nav.dataset.nav); return; }
    const act = e.target.closest('[data-action]');
    if (!act) return;
    const a = act.dataset.action;
    if (a === 'sair') sair();
    else if (a === 'tema') alternarTema();
    else if (a === 'menu') $('#shell').classList.toggle('menu-open');
    else if (a === 'mais') menuMais();
    else if (a === 'novo-ag') formAgendamento({});
  });
  $('#menuBtn').addEventListener('click', () => isMobile() ? menuMais() : $('#shell').classList.toggle('menu-open'));
  $('#avatar').addEventListener('click', () => { if (isMobile()) menuMais(); });
  $('#scrim').addEventListener('click', () => $('#shell').classList.remove('menu-open'));
  $('#novoAgBtn').addEventListener('click', () => formAgendamento({}));
  montarBusca();
}
function menuMais() {
  const itens = NAV.filter(n => (!n.admin || isAdmin()) && (n.id !== 'whatsapp' || !S.cfg.recursos || S.cfg.recursos.whatsapp) && !['dashboard', 'agenda', 'clientes'].includes(n.id));
  const m = modal({
    title: `<span style="display:flex;align-items:center;gap:10px"><span class="avatar">${esc(iniciais(S.user.nome))}</span><span>${esc(S.user.nome)}<br><span class="tiny muted" style="font-weight:500">${isAdmin() ? 'Administradora' : 'Equipe'}</span></span></span>`,
    sheet: true,
    body: `<div class="menu-grid">${itens.map(n => `<button class="menu-tile ${S.page === n.id ? 'on' : ''}" data-ir="${n.id}">${ico(n.ico)}<span>${esc(n.label)}</span></button>`).join('')}
      <button class="menu-tile" data-t="tema">${ico(temaAtual() === 'dark' ? 'sun' : 'moon')}<span>${temaAtual() === 'dark' ? 'Tema claro' : 'Tema escuro'}</span></button>
      <button class="menu-tile" data-t="sair">${ico('logout')}<span>Sair</span></button></div>`
  });
  $$('[data-ir]', m.el).forEach(b => b.addEventListener('click', () => { m.close(); ir(b.dataset.ir); }));
  $('[data-t=tema]', m.el).addEventListener('click', () => { m.close(); alternarTema(); });
  $('[data-t=sair]', m.el).addEventListener('click', () => { m.close(); sair(); });
}
function ir(page) {
  S.page = page;
  $('#shell').classList.remove('menu-open');
  $$('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === page));
  const mais = $('[data-action=mais]');
  if (mais) mais.classList.toggle('active', !['dashboard', 'agenda', 'clientes'].includes(page));
  render();
  window.scrollTo(0, 0);
}
function limparCharts() { S.charts.forEach(c => { try { c.destroy(); } catch (e) {} }); S.charts = []; if (S.cal) { try { S.cal.destroy(); } catch (e) {} S.cal = null; } }
function render() {
  limparCharts();
  const n = NAV.find(x => x.id === S.page) || NAV[0];
  $('#pageTitle').textContent = n.label;
  $('#pageSub').textContent = n.sub ? n.sub() : '';
  const tema = $('[data-action=tema]');
  if (tema) tema.innerHTML = ico(temaAtual() === 'dark' ? 'sun' : 'moon') + `<span>${temaAtual() === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>`;
  const antigo = $('#page');
  const el = antigo.cloneNode(false); // elemento novo = sem ouvintes de cliques das telas anteriores
  antigo.replaceWith(el);
  el.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
  const fn = PAGES[S.page] || PAGES.dashboard;
  Promise.resolve(fn(el)).catch(e => { el.innerHTML = `<div class="card card-pad empty"><div class="big">😕</div>${esc(e.message)}</div>`; });
}
function montarBusca() {
  const inp = $('#buscaGlobal'), box = $('#buscaResultados');
  const mostrar = () => {
    const q = inp.value.trim().toLowerCase();
    if (!q) { box.classList.add('hidden'); return; }
    const qd = q.replace(/\D/g, '');
    const res = S.clientes.filter(c => String(c.nome).toLowerCase().includes(q) || (qd.length >= 3 && String(c.telefone).includes(qd))).slice(0, 8);
    box.innerHTML = res.length ? res.map(c => `<div class="dropdown-item" data-cli="${c.id}"><span>${esc(c.nome)}</span><span class="muted tiny">${esc(foneFmt(c.telefone))}</span></div>`).join('')
      : '<div class="dropdown-item muted">Nenhuma cliente encontrada</div>';
    box.classList.remove('hidden');
  };
  inp.addEventListener('input', debounce(mostrar, 120));
  inp.addEventListener('focus', mostrar);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('[data-cli]', box); if (f) f.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } });
  box.addEventListener('mousedown', e => { const it = e.target.closest('[data-cli]'); if (it) { e.preventDefault(); inp.value = ''; box.classList.add('hidden'); fichaCliente(it.dataset.cli); } });
  inp.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 150));
}

/* ------------------------- Gráficos ------------------------- */
function chartDefaults() {
  if (!window.Chart) return false;
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = cssVar('--muted');
  Chart.defaults.borderColor = cssVar('--grid');
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = cssVar('--text');
  Chart.defaults.plugins.tooltip.titleColor = cssVar('--bg');
  Chart.defaults.plugins.tooltip.bodyColor = cssVar('--bg');
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.boxPadding = 4;
  return true;
}
const SERIES = () => ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'].map(cssVar);
function barChart(canvas, labels, datasets, { money = true, horizontal = false } = {}) {
  if (!chartDefaults() || !canvas) return;
  const c = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: datasets.map(d => Object.assign({
      borderRadius: 4, borderSkipped: horizontal ? 'start' : 'bottom', maxBarThickness: 26,
      categoryPercentage: 0.7, barPercentage: 0.88
    }, d)) },
    options: {
      indexAxis: horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: horizontal, drawTicks: false }, border: { display: false }, ticks: horizontal && money ? { callback: v => brlK(v) } : {} },
        y: { grid: { display: !horizontal, drawTicks: false }, border: { display: false }, beginAtZero: true,
          ticks: !horizontal && money ? { callback: v => brlK(v), maxTicksLimit: 5 } : { precision: 0, maxTicksLimit: 6 } }
      },
      plugins: { tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + (money ? brl(ctx.parsed[horizontal ? 'x' : 'y']) : ctx.parsed[horizontal ? 'x' : 'y']) } } }
    }
  });
  S.charts.push(c);
  return c;
}
function donutChart(canvas, labels, values, { money = true } = {}) {
  if (!chartDefaults() || !canvas) return;
  const cores = SERIES();
  const c = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => cores[i % cores.length]), borderColor: cssVar('--surface'), borderWidth: 2, hoverOffset: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + (money ? brl(ctx.parsed) : ctx.parsed) } } } }
  });
  S.charts.push(c);
  return c;
}
/** Legenda/tabela ao lado do donut (rótulo, valor, %) — a identidade nunca fica só na cor. */
function donutLegend(items, { money = true } = {}) {
  const cores = SERIES();
  const total = items.reduce((s, x) => s + x.valor, 0) || 1;
  return `<div class="list">${items.map((x, i) => `<div class="list-item" style="padding:8px 0">
    <span class="dot" style="background:${i < cores.length ? cores[i] : cssVar('--muted')}"></span>
    <div class="grow"><div class="title" style="font-weight:500">${esc(x.nome)}</div></div>
    <span class="num">${money ? brl(x.valor) : x.valor}</span><span class="muted tiny num" style="width:44px;text-align:right">${Math.round(x.valor / total * 100)}%</span></div>`).join('')}</div>`;
}
/** Agrupa a partir do 6º item em "Outros" (nunca gera uma 7ª cor). */
function top6(items) {
  if (items.length <= 6) return items;
  const resto = items.slice(5).reduce((s, x) => s + x.valor, 0);
  return items.slice(0, 5).concat([{ nome: 'Outros', valor: resto }]);
}

/* =====================================================================
   PÁGINAS
   ===================================================================== */
const PAGES = {};

/* ------------------------- Painel ------------------------- */
PAGES.dashboard = el => callRapido('dashboard', { mes: S.dashMes }, d => desenharPainel(el, d), el);
function desenharPainel(el, d) {
  limparCharts();
  const caixa = document.createElement('div'); el.replaceChildren(caixa); el = caixa; // sem ouvintes duplicados ao redesenhar
  const atual = S.dashMes === hoje().slice(0, 7);
  const trend = d.variacao == null ? '' : `<span class="trend ${d.variacao >= 0 ? 'up' : 'down'}">${ico(d.variacao >= 0 ? 'up' : 'down')}${Math.abs(d.variacao).toLocaleString('pt-BR')}%</span>`;
  const kpis = isAdmin() ? `
    <div class="card kpi hero"><div class="kpi-label">${ico('coins')}Faturamento do mês</div><div class="kpi-value">${brl(d.receita)}</div>
      <div class="kpi-foot">${trend} ${d.variacao == null ? 'primeiro mês com dados' : 'vs. ' + brl(d.receitaAnterior) + ' no mês anterior'}</div></div>
    <div class="card kpi"><div class="kpi-label">${ico('wallet')}Lucro do mês</div><div class="kpi-value ${d.lucro < 0 ? 'neg' : ''}">${brl(d.lucro)}</div><div class="kpi-foot">Despesas: ${brl(d.despesa)}</div></div>
    <div class="card kpi"><div class="kpi-label">${ico('heart')}Atendimentos</div><div class="kpi-value">${d.atendimentos}</div><div class="kpi-foot">${d.agendadosMes} marcados no mês</div></div>
    <div class="card kpi"><div class="kpi-label">${ico('receipt')}Ticket médio</div><div class="kpi-value">${brl(d.ticketMedio)}</div><div class="kpi-foot">${d.novasClientes} novas clientes</div></div>
    <div class="card kpi"><div class="kpi-label">${ico('clock')}A receber</div><div class="kpi-value">${brl(d.aReceber)}</div><div class="kpi-foot">${d.aReceberQtd} pendências · a pagar ${brl(d.aPagar)}</div></div>`
    : `
    <div class="card kpi hero"><div class="kpi-label">${ico('calendar')}Próximos 7 dias</div><div class="kpi-value">${d.proximos7}</div><div class="kpi-foot">horários marcados</div></div>
    <div class="card kpi"><div class="kpi-label">${ico('heart')}Atendimentos no mês</div><div class="kpi-value">${d.atendimentos}</div><div class="kpi-foot">${d.agendadosMes} marcados</div></div>
    <div class="card kpi"><div class="kpi-label">${ico('userPlus')}Novas clientes</div><div class="kpi-value">${d.novasClientes}</div><div class="kpi-foot">${d.totalClientes} no total</div></div>
    <div class="card kpi"><div class="kpi-label">${ico('alert')}Faltas</div><div class="kpi-value">${d.taxaFaltas}%</div><div class="kpi-foot">${d.faltas} faltas · ${d.cancelamentos} cancelamentos</div></div>`;

  const hojeHtml = d.hoje.length ? `<div class="list">${d.hoje.map(itemAgendamento).join('')}</div>`
    : `<div class="empty"><div class="big">🌸</div>Nenhum horário para hoje.<br><button class="btn primary sm" style="margin-top:12px" data-novo-ag>${ico('plus')}Agendar cliente</button></div>`;

  const alertas = [];
  if (d.remarcar.length) alertas.push(`<div class="alert accent">${ico('repeat')}<div><b>${d.remarcar.length} cliente(s) pediram para remarcar</b><br>${d.remarcar.slice(0, 4).map(r => `<a href="#" data-ag="${r.id}">${esc(r.clienteNome)} · ${fDataCurta(r.inicio)} ${fHora(r.inicio)}</a>`).join('<br>')}</div></div>`);
  if (d.naoConfirmados) alertas.push(`<div class="alert info">${ico('clock')}<div><b>${d.naoConfirmados} horário(s)</b> nos próximos 7 dias ainda não confirmados.${S.cfg.waAtivo ? ' Os lembretes automáticos vão pedir confirmação.' : ''}</div></div>`);
  const anivHoje = d.aniversariantes.filter(a => a.hoje);
  if (anivHoje.length && atual) alertas.push(`<div class="alert warn">${ico('gift')}<div><b>Aniversário hoje:</b> ${anivHoje.map(a => `<a href="#" data-cli="${a.id}">${esc(a.nome)}</a>`).join(', ')} 🎉</div></div>`);
  if (!S.cfg.waAtivo && isAdmin() && (!S.cfg.recursos || S.cfg.recursos.whatsapp)) alertas.push(`<div class="alert info">${ico('message')}<div><b>Lembretes automáticos desligados.</b> <a href="#" data-nav="whatsapp">Conecte seu WhatsApp</a> para reduzir faltas.</div></div>`);

  el.innerHTML = `
    <div class="toolbar">
      <div class="month-nav"><button class="icon-btn sm" data-mes="-1">${ico('left')}</button><span>${mesLabel(S.dashMes)}</span><button class="icon-btn sm" data-mes="1">${ico('right')}</button></div>
      ${atual ? '' : `<button class="btn sm ghost" data-mes="0">Voltar para o mês atual</button>`}
      <div class="spacer"></div>
      <span class="muted tiny hide-sm">${d.proximos7} horários nos próximos 7 dias</span>
    </div>
    <div class="quick only-m">
      <button data-q="ag"><span class="q-ico">${ico('calendar')}</span>Agendar</button>
      <button data-q="cli"><span class="q-ico">${ico('userPlus')}</span>Nova cliente</button>
      ${isAdmin() ? `<button data-q="rec"><span class="q-ico">${ico('up')}</span>Receita</button>
      <button data-q="desp"><span class="q-ico">${ico('down')}</span>Despesa</button>` : `<button data-nav="agenda"><span class="q-ico">${ico('clock')}</span>Agenda</button>`}
    </div>
    <div class="kpis">${kpis}</div>
    <div class="grid cols-12">
      <div class="card span-7"><div class="card-head"><div><h3>Agenda de hoje</h3><div class="sub">${diaSemana(hoje())}, ${fData(hoje())} · ${d.hoje.length} horário(s)</div></div>
        <button class="btn sm" data-nav="agenda">Ver agenda</button></div><div class="card-body">${hojeHtml}</div></div>
      <div class="span-5" style="display:flex;flex-direction:column;gap:18px">
        ${alertas.length ? `<div class="card"><div class="card-head"><h3>Atenção</h3></div><div class="card-body" style="padding-bottom:6px">${alertas.join('')}</div></div>` : ''}
        <div class="card"><div class="card-head"><div><h3>Serviços em alta</h3><div class="sub">Mais agendados em ${MESES[Number(S.dashMes.slice(5)) - 1]}</div></div></div>
          <div class="card-body">${d.topServicos.length ? `<div class="chart-box sm"><canvas id="chTop"></canvas></div>${donutLegend(d.topServicos.map(s => ({ nome: s.nome, valor: s.qtd })), { money: false })}` : '<div class="empty">Sem atendimentos no mês ainda.</div>'}</div></div>
      </div>
      ${isAdmin() ? `<div class="card span-12"><div class="card-head"><div><h3>Receitas × despesas</h3><div class="sub">Últimos 6 meses (valores pagos)</div></div>
        <div class="legend"><span><i style="background:${cssVar('--s1')}"></i>Receitas</span><span><i style="background:${cssVar('--s2')}"></i>Despesas</span></div></div>
        <div class="card-body"><div class="chart-box"><canvas id="chSerie"></canvas></div></div></div>` : ''}
      <div class="card span-6"><div class="card-head"><div><h3>🎂 Aniversariantes de ${MESES[Number(S.dashMes.slice(5)) - 1]}</h3><div class="sub">Mande um carinho e um mimo</div></div></div>
        <div class="card-body">${d.aniversariantes.length ? `<div class="list">${d.aniversariantes.slice(0, 8).map(a => `
          <div class="list-item"><div class="avatar">${esc(iniciais(a.nome))}</div><div class="grow"><div class="title">${esc(a.nome)} ${a.hoje ? '🎉' : ''}</div><div class="sub">Dia ${a.dia}</div></div>
          ${a.telefone ? `<a class="btn sm wa" target="_blank" href="${waLink(a.telefone, renderTpl(S.cfg.templates.aniversario, tplVars(a)))}">${ico('send')}Parabéns</a>` : ''}</div>`).join('')}</div>`
          : '<div class="empty">Nenhuma aniversariante cadastrada neste mês.</div>'}</div></div>
      <div class="card span-6"><div class="card-head"><div><h3>💌 Clientes para reativar</h3><div class="sub">Sem visitar há mais de ${S.cfg.diasInativa || 60} dias e sem horário marcado</div></div></div>
        <div class="card-body">${d.inativas.length ? `<div class="list">${d.inativas.map(a => `
          <div class="list-item"><div class="avatar">${esc(iniciais(a.nome))}</div><div class="grow"><div class="title"><a href="#" data-cli="${a.id}" style="color:inherit;text-decoration:none">${esc(a.nome)}</a></div><div class="sub">Última visita ${fData(a.ultimaVisita)} · há ${a.dias} dias</div></div>
          ${a.telefone ? `<a class="btn sm" target="_blank" href="${waLink(a.telefone, renderTpl(S.cfg.templates.reativacao, tplVars(a)))}">${ico('send')}Chamar</a>` : ''}</div>`).join('')}</div>`
          : '<div class="empty">Todas as clientes estão em dia! 💖</div>'}</div></div>
    </div>`;

  if (d.topServicos.length) donutChart($('#chTop'), d.topServicos.map(s => s.nome), d.topServicos.map(s => s.qtd), { money: false });
  if (isAdmin()) barChart($('#chSerie'), d.serie.map(s => s.rotulo), [
    { label: 'Receitas', data: d.serie.map(s => s.receitas), backgroundColor: cssVar('--s1') },
    { label: 'Despesas', data: d.serie.map(s => s.despesas), backgroundColor: cssVar('--s2') }
  ]);
  $$('[data-mes]', el).forEach(b => b.addEventListener('click', () => {
    const n = Number(b.dataset.mes); S.dashMes = n === 0 ? hoje().slice(0, 7) : addMes(S.dashMes, n); render();
  }));
  $$('[data-q]', el).forEach(b => b.addEventListener('click', () => {
    const q = b.dataset.q;
    if (q === 'ag') formAgendamento({});
    else if (q === 'cli') formCliente({}, () => recarregarCadastros());
    else formLancamento({ tipo: q === 'rec' ? 'receita' : 'despesa' });
  }));
  ligarAcoesLista(el, () => render());
};

function itemAgendamento(a) {
  const dur = durEntre(a.inicio, a.fim);
  return `<div class="list-item" data-ag="${a.id}" style="cursor:pointer">
    <div class="time-box"><b>${fHora(a.inicio)}</b><span>${fDur(dur)}</span></div>
    <span class="ag-bar" style="background:${esc(a.cor)}"></span>
    <div class="grow"><div class="title">${esc(a.clienteNome)}</div>
      <div class="sub">${esc(a.servicoNomes)}${a.profissionalNome ? ' · ' + esc(a.profissionalNome) : ''}${a.local && a.local !== 'Studio' ? ' · 📍' + esc(a.local) : ''}</div><div class="m-pill">${pill(a.status)}</div></div>
    ${pill(a.status)}
    <div class="actions-row no-print" style="flex-wrap:nowrap">
      ${a.status === 'agendado' ? `<button class="icon-btn sm" title="Confirmar" data-acao="confirmado" data-id="${a.id}">${ico('check')}</button>` : ''}
      ${a.telefone ? `<a class="icon-btn sm" title="WhatsApp" target="_blank" href="${waLink(a.telefone)}" data-stop>${ico('send')}</a>` : ''}
    </div></div>`;
}
/** Liga cliques comuns: abrir agendamento, abrir cliente, ações rápidas. */
function ligarAcoesLista(el, depois) {
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-stop]')) return;
    const acao = e.target.closest('[data-acao]');
    if (acao) {
      e.stopPropagation();
      try { await call('agenda.status', { id: acao.dataset.id, status: acao.dataset.acao }); toast('Horário confirmado ✅'); depois && depois(); } catch (err) { erroToast(err); }
      return;
    }
    const novo = e.target.closest('[data-novo-ag]');
    if (novo) { formAgendamento({}); return; }
    const cli = e.target.closest('[data-cli]');
    if (cli && !cli.closest('#buscaResultados')) { e.preventDefault(); fichaCliente(cli.dataset.cli); return; }
    const ag = e.target.closest('[data-ag]');
    if (ag) { e.preventDefault(); detalheAgendamento(ag.dataset.ag, depois); }
  });
}

/* ------------------------- Agenda ------------------------- */
PAGES.agenda = async el => {
  if (isMobile() && S.agendaModo !== 'calendario') return agendaMobile(el);
  const equipeAtiva = S.equipe.filter(p => p.ativo !== 'nao');
  el.innerHTML = `
    <div class="toolbar">
      ${isMobile() ? `<button class="btn sm" id="bModoLista">${ico('left')}Lista do dia</button>` : ''}
      ${isAdmin() && S.cfg.calendarAtivo ? `<button class="btn sm" id="bImportarAg">${ico('download')}Importar do Google</button>` : ''}
      ${equipeAtiva.length ? `<select id="fProf" style="width:auto;min-width:180px"><option value="">Toda a equipe</option>${opts(equipeAtiva.map(p => ({ v: p.id, l: p.nome })), S.filtroProf)}</select>
      <label class="switch" style="margin:0"><input type="checkbox" id="fCorProf" ${S.corPorProf ? 'checked' : ''}><span class="tiny">Cores por profissional</span></label>` : ''}
      <div class="spacer"></div>
      ${S.cfg.calendarAtivo ? `<span class="muted tiny">${ico('check')} Sincronizada com Google Agenda${S.cfg.mostrarEventosGoogle ? ' · compromissos pessoais aparecem hachurados' : ''}</span>` : ''}
    </div>
    <div class="card cal-card"><div id="calendar"></div></div>`;
  if (!window.FullCalendar) { $('#calendar').innerHTML = '<div class="empty">Não foi possível carregar o calendário. Verifique a internet.</div>'; return; }

  const toLocal = d => ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const cal = new FullCalendar.Calendar($('#calendar'), {
    locale: 'pt-br',
    initialView: store.get('crm_view') || (isMobile() ? 'timeGridDay' : 'timeGridWeek'),
    headerToolbar: isMobile()
      ? { left: 'prev,next', center: 'title', right: 'today' }
      : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
    footerToolbar: isMobile() ? { center: 'timeGridDay,timeGridWeek,listWeek,dayGridMonth' } : false,
    buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' },
    allDayText: 'Dia todo', noEventsText: 'Nenhum horário neste período', moreLinkText: n => '+' + n + ' mais',
    firstDay: 0, nowIndicator: true, selectable: true, selectMirror: true, editable: true, eventDurationEditable: true,
    slotMinTime: (S.cfg.horaAbertura || '08:00') + ':00', slotMaxTime: (S.cfg.horaFechamento || '20:00') + ':00',
    scrollTime: '08:00:00', slotDuration: '00:30:00', snapDuration: '00:' + pad(S.cfg.intervaloAgenda || 15) + ':00',
    slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    dayHeaderFormat: isMobile() ? { weekday: 'short', day: 'numeric' } : { weekday: 'short', day: '2-digit', month: '2-digit' },
    height: 'auto', dayMaxEvents: 3, expandRows: true,
    datesSet: info => store.set('crm_view', info.view.type),
    events: (info, ok, fail) => {
      const fim = new Date(info.end.getTime() - 1);
      call('agenda.listar', { inicio: ymd(info.start), fim: ymd(fim), externos: true, corPorProfissional: S.corPorProf })
        .then(r => {
          const evs = r.agendamentos.filter(a => !S.filtroProf || a.profissionalId === S.filtroProf).map(a => ({
            id: a.id, title: a.clienteNome, start: a.inicio, end: a.fim, backgroundColor: a.cor, textColor: inkFor(a.cor),
            classNames: ['ag-ev', 'st-x-' + a.status], extendedProps: { a },
            editable: a.status !== 'concluido'
          }));
          r.externos.forEach(x => evs.push({ id: 'ext_' + x.id, title: '🔒 ' + x.titulo, start: x.inicio, end: x.fim, allDay: x.diaTodo,
            editable: false, classNames: ['ext-ev'], extendedProps: { externo: true } }));
          ok(evs);
        }).catch(e => { erroToast(e); fail(e); });
    },
    eventContent: arg => {
      if (arg.event.extendedProps.externo) return { html: `<div class="ev-in"><b>${esc(arg.event.title)}</b></div>` };
      const a = arg.event.extendedProps.a;
      if (arg.view.type.startsWith('list')) return { html: `<b>${esc(a.clienteNome)}</b> · ${esc(a.servicoNomes)} ${pill(a.status)}` };
      if (arg.view.type === 'dayGridMonth') return { html: `<div class="ev-in" style="padding:0 2px"><b>${fHora(a.inicio)} ${esc(primeiroNome(a.clienteNome))}</b></div>` };
      const st = a.status === 'confirmado' ? '✓ ' : a.status === 'remarcar' ? '↻ ' : '';
      return { html: `<div class="ev-in"><b>${st}${esc(a.clienteNome)}</b><span>${fHora(a.inicio)}–${fHora(a.fim)} · ${esc(a.servicoNomes)}</span>${a.profissionalNome ? `<span>${esc(a.profissionalNome)}</span>` : ''}</div>` };
    },
    eventClick: info => { info.jsEvent.preventDefault(); if (info.event.extendedProps.externo) return toast('Compromisso do seu Google Agenda (não é do CRM).'); detalheAgendamento(info.event.id, () => cal.refetchEvents()); },
    select: info => {
      cal.unselect();
      const dur = info.allDay ? null : durEntre(info.start, info.end);
      formAgendamento({ data: ymd(info.start), hora: info.allDay ? '' : pad(info.start.getHours()) + ':' + pad(info.start.getMinutes()), duracao: dur > 30 ? dur : null }, () => cal.refetchEvents());
    },
    eventDrop: info => moverEvento(info, toLocal),
    eventResize: info => moverEvento(info, toLocal)
  });
  S.cal = cal;
  cal.render();
  const bImp = $('#bImportarAg');
  if (bImp) bImp.addEventListener('click', () => importarGoogle());
  const bLista = $('#bModoLista');
  if (bLista) bLista.addEventListener('click', () => { S.agendaModo = 'lista'; render(); });
  const fProf = $('#fProf');
  if (fProf) fProf.addEventListener('change', () => { S.filtroProf = fProf.value; cal.refetchEvents(); });
  const fCor = $('#fCorProf');
  if (fCor) fCor.addEventListener('change', () => { S.corPorProf = fCor.checked; cal.refetchEvents(); });
};
/** Agenda no celular: visão "Dia" (faixa de dias) ou "Mês" (calendário do mês) + lista do dia. */
async function agendaMobile(el) {
  S.agDia = S.agDia || hoje();
  S.agModo = S.agModo || store.get('crm_agmodo') || 'dia';
  let ini, fim;
  if (S.agModo === 'mes') {
    const primeiro = S.agDia.slice(0, 7) + '-01';
    ini = addDias(primeiro, -new Date(primeiro + 'T12:00').getDay()); // domingo da 1ª semana
    fim = addDias(ini, 41);                                           // 6 semanas na grade
  } else {
    if (!S.agBase || S.agDia < S.agBase || S.agDia > addDias(S.agBase, 20)) S.agBase = addDias(S.agDia, -7);
    ini = S.agBase; fim = addDias(ini, 27);                           // 4 semanas na faixa
  }
  return callRapido('agenda.listar', { inicio: ini, fim, externos: true }, r => montarAgendaMobile(el, r, ini, fim), el);
}
function montarAgendaMobile(el, r, base, fimStrip) {
  const modo = S.agModo;
  const equipeAtiva = S.equipe.filter(p => p.ativo !== 'nao');
  const porDia = {}, ext = {};
  r.agendamentos.forEach(a => { const k = a.inicio.slice(0, 10); (porDia[k] = porDia[k] || []).push(a); });
  r.externos.forEach(x => { const k = x.inicio.slice(0, 10); (ext[k] = ext[k] || []).push(x); });
  const dias = [];
  for (let d = base; d <= fimStrip; d = addDias(d, 1)) dias.push(d);
  const doFiltro = a => !S.filtroProf || !a.profissionalId || a.profissionalId === S.filtroProf;
  const ativosDe = d => (porDia[d] || []).filter(a => a.status !== 'cancelado' && doFiltro(a));
  const mesAtual = S.agDia.slice(0, 7);

  el.innerHTML = `
    <div class="ag-m-head">
      ${modo === 'mes'
        ? `<div class="month-nav"><button class="icon-btn sm" data-mm="-1" aria-label="Mês anterior">${ico('left')}</button><span id="agMes"></span><button class="icon-btn sm" data-mm="1" aria-label="Próximo mês">${ico('right')}</button></div>`
        : `<b id="agMes" style="text-transform:capitalize"></b>`}
      <div class="actions-row">
        <button class="btn sm" id="agHoje">Hoje</button>
        ${modo === 'dia' ? `<label class="btn sm" style="position:relative" title="Escolher data">${ico('calendar')}<input type="date" id="agPick" value="${S.agDia}" style="position:absolute;inset:0;opacity:0;width:100%;height:100%"></label>` : ''}
        <button class="btn sm" id="agCal" title="Calendário completo (semana)">${ico('dashboard')}</button>
      </div>
    </div>
    <div class="seg ag-modo" id="agModo"><button data-modo="dia" class="${modo === 'dia' ? 'active' : ''}">Dia</button><button data-modo="mes" class="${modo === 'mes' ? 'active' : ''}">Mês</button></div>
    ${modo === 'mes'
      ? `<div class="mes-grid" id="agGrade"></div><div id="agMesResumo" class="muted tiny" style="margin:-4px 2px 12px"></div>`
      : `<div class="day-strip" id="agStrip">${dias.map(d => `<button class="day-chip ${d === hoje() ? 'today' : ''}" data-dia="${d}"><span>${DIAS_ABREV[new Date(d + 'T12:00').getDay()]}</span><b>${Number(d.slice(8))}</b><i class="dots"></i></button>`).join('')}</div>`}
    ${equipeAtiva.length > 1 ? `<div class="seg" id="agProf" style="margin:4px 0 12px"><button data-p="" class="${!S.filtroProf ? 'active' : ''}">Todas</button>${equipeAtiva.map(p => `<button data-p="${p.id}" class="${S.filtroProf === p.id ? 'active' : ''}">${esc(primeiroNome(p.nome))}</button>`).join('')}</div>` : ''}
    <div id="agDiaInfo" class="muted tiny" style="margin:4px 2px 10px"></div>
    <div id="agLista"></div>`;

  const minutos = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };
  const hhmm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

  function cardAg(a) {
    const podeFinalizar = !['concluido', 'cancelado'].includes(a.status);
    return `<div class="ag-card st-x-${a.status}" data-ag="${a.id}">
      <div class="ag-time"><b>${fHora(a.inicio)}</b><span>${fHora(a.fim)}</span></div>
      <div class="ag-body" style="border-left-color:${esc(a.cor)}">
        <div class="ag-top"><div class="title">${esc(a.clienteNome)}</div>${pill(a.status)}</div>
        <div class="sub">${esc(a.servicoNomes)}</div>
        <div class="sub">${a.profissionalNome ? esc(a.profissionalNome) + ' · ' : ''}${brl(a.valor - (a.desconto || 0))}${a.local && a.local !== 'Studio' ? ' · 📍' + esc(a.local) : ''}</div>
        <div class="ag-actions">
          ${a.status === 'agendado' || a.status === 'remarcar' ? `<button class="btn sm" data-acao="confirmado" data-id="${a.id}">${ico('check')}Confirmar</button>` : ''}
          ${podeFinalizar ? `<button class="btn sm primary" data-fin="${a.id}">${ico('heart')}Finalizar</button>` : ''}
          ${a.telefone ? `<a class="btn sm wa" target="_blank" href="${waLink(a.telefone)}" data-stop aria-label="WhatsApp">${ico('send')}</a>` : ''}
        </div></div></div>`;
  }

  /** Grade do mês: número do dia + bolinhas com a cor dos serviços. */
  function desenharGrade() {
    const grade = $('#agGrade', el);
    if (!grade) return;
    const cab = DIAS_ABREV.map(d => `<div class="mes-dow">${d.charAt(0)}</div>`).join('');
    grade.innerHTML = cab + dias.map(d => {
      const ag = ativosDe(d);
      const temExt = (ext[d] || []).length > 0;
      const bolinhas = ag.slice(0, 3).map(a => `<em style="background:${esc(a.cor)}"></em>`).join('')
        + (ag.length > 3 ? `<small>+${ag.length - 3}</small>` : '') + (temExt && ag.length < 3 ? '<em class="ext"></em>' : '');
      const cls = ['mes-cel', d.slice(0, 7) !== mesAtual ? 'fora' : '', d === hoje() ? 'hoje' : '', d === S.agDia ? 'on' : '', d < hoje() ? 'passado' : ''].join(' ');
      return `<button class="${cls}" data-dia="${d}" aria-label="${fData(d)}: ${ag.length} horário(s)"><b>${Number(d.slice(8))}</b><i class="mes-dots">${bolinhas}</i></button>`;
    }).join('');
    const doMes = dias.filter(d => d.slice(0, 7) === mesAtual);
    const qtd = doMes.reduce((t, d) => t + ativosDe(d).length, 0);
    const valor = doMes.reduce((t, d) => t + ativosDe(d).reduce((s, a) => s + a.valor - (a.desconto || 0), 0), 0);
    const livres = doMes.filter(d => d >= hoje() && new Date(d + 'T12:00').getDay() !== 0 && !ativosDe(d).length).length;
    $('#agMesResumo', el).innerHTML = `${qtd} horário(s) no mês${isAdmin() && valor ? ' · ' + brl(valor) : ''}${livres ? ` · ${livres} dia(s) livre(s) pela frente` : ''}`;
  }

  const desenhar = () => {
    const dia = S.agDia;
    $('#agMes', el).textContent = MESES[Number(dia.slice(5, 7)) - 1] + ' ' + dia.slice(0, 4);
    if (modo === 'mes') desenharGrade();
    else {
      $$('.day-chip', el).forEach(c => {
        c.classList.toggle('on', c.dataset.dia === dia);
        const n = ativosDe(c.dataset.dia).length;
        $('.dots', c).innerHTML = n ? '<em></em>'.repeat(Math.min(n, 3)) : '';
      });
    }
    const lista = (porDia[dia] || []).filter(doFiltro);
    const ativos = lista.filter(a => a.status !== 'cancelado');
    const total = ativos.reduce((t, a) => t + a.valor - (a.desconto || 0), 0);
    $('#agDiaInfo', el).innerHTML = `<b style="color:var(--text);text-transform:capitalize">${diaSemana(dia)}, ${fData(dia)}</b> · ${ativos.length} horário(s)${isAdmin() && total ? ' · previsto ' + brl(total) : ''}`;

    // linha do tempo: atendimentos, compromissos pessoais e janelas livres
    const itens = lista.map(a => ({ t: 'ag', ini: minutos(fHora(a.inicio)), fim: minutos(fHora(a.fim)), a }))
      .concat((ext[dia] || []).filter(x => !x.diaTodo).map(x => ({ t: 'ext', ini: minutos(fHora(x.inicio)), fim: minutos(fHora(x.fim)), x })))
      .sort((p, q) => p.ini - q.ini);
    const abre = minutos(S.cfg.horaAbertura || '08:00'), fecha = minutos(S.cfg.horaFechamento || '20:00');
    const agora = new Date();
    const agoraMin = dia === hoje() ? Math.ceil((agora.getHours() * 60 + agora.getMinutes()) / 15) * 15 : (dia < hoje() ? 99999 : 0);
    const out = [];
    let cursor = Math.max(abre, agoraMin);
    const livre = (de, ate) => {
      ate = Math.min(ate, fecha);
      if (ate - de >= 30) out.push(`<button class="slot-free" data-hora="${hhmm(de)}"><span>${hhmm(de)} – ${hhmm(ate)}</span><b>${ico('plus')}Livre · agendar</b></button>`);
    };
    itens.forEach(it => {
      if (it.t === 'ag' && it.a.status === 'cancelado') { out.push(cardAg(it.a)); return; }
      livre(cursor, it.ini);
      cursor = Math.max(cursor, it.fim);
      out.push(it.t === 'ag' ? cardAg(it.a)
        : `<div class="ag-card ext"><div class="ag-time"><b>${hhmm(it.ini)}</b><span>${hhmm(it.fim)}</span></div><div class="ag-body"><div class="title">🔒 ${esc(it.x.titulo)}</div><div class="sub">Compromisso do seu Google Agenda</div></div></div>`);
    });
    livre(cursor, fecha);
    $('#agLista', el).innerHTML = out.length ? out.join('')
      : `<div class="empty"><div class="big">🌿</div>${dia < hoje() ? 'Nenhum atendimento neste dia.' : 'Agenda cheia ou fora do horário de funcionamento.'}</div>`;
  };

  const recarregar = () => render();
  $('#agLista', el).addEventListener('click', async e => {
    if (e.target.closest('[data-stop]')) return;
    const slot = e.target.closest('[data-hora]');
    if (slot) return formAgendamento({ data: S.agDia, hora: slot.dataset.hora }, recarregar);
    const fin = e.target.closest('[data-fin]');
    if (fin) return finalizarAtendimento(r.agendamentos.find(x => x.id === fin.dataset.fin), recarregar);
    const acao = e.target.closest('[data-acao]');
    if (acao) {
      return busy(acao, async () => {
        try { await call('agenda.status', { id: acao.dataset.id, status: acao.dataset.acao }); toast('Horário confirmado ✅'); recarregar(); } catch (err) { erroToast(err); }
      });
    }
    const card = e.target.closest('[data-ag]');
    if (card) detalheAgendamento(card.dataset.ag, recarregar);
  });

  const centralizar = (d, suave) => { const c = $(`.day-chip[data-dia="${d}"]`, el); if (c) c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: suave ? 'smooth' : 'auto' }); };
  const irPara = d => {
    S.agDia = d;
    const fora = modo === 'mes' ? d.slice(0, 7) !== mesAtual : (d < base || d > fimStrip);
    if (fora) return render();
    desenhar();
    if (modo === 'dia') centralizar(d, true);
    else { const lista = $('#agDiaInfo', el); if (lista && lista.getBoundingClientRect().top > window.innerHeight - 160) lista.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  const strip = $('#agStrip', el);
  if (strip) strip.addEventListener('click', e => { const c = e.target.closest('[data-dia]'); if (c) irPara(c.dataset.dia); });
  const grade = $('#agGrade', el);
  if (grade) grade.addEventListener('click', e => { const c = e.target.closest('[data-dia]'); if (c) irPara(c.dataset.dia); });
  $$('[data-mm]', el).forEach(b => b.addEventListener('click', () => {
    const ym = addMes(mesAtual, Number(b.dataset.mm));
    S.agDia = ym === hoje().slice(0, 7) ? hoje() : ym + '-01';
    render();
  }));
  $('#agHoje', el).addEventListener('click', () => irPara(hoje()));
  const pick = $('#agPick', el);
  if (pick) pick.addEventListener('change', e => { if (e.target.value) irPara(e.target.value); });
  $('#agCal', el).addEventListener('click', () => { S.agendaModo = 'calendario'; render(); });
  $$('#agModo button', el).forEach(b => b.addEventListener('click', () => {
    if (b.dataset.modo === modo) return;
    S.agModo = b.dataset.modo; store.set('crm_agmodo', S.agModo); render();
  }));
  $$('#agProf button', el).forEach(b => b.addEventListener('click', () => { S.filtroProf = b.dataset.p; $$('#agProf button', el).forEach(x => x.classList.toggle('active', x === b)); desenhar(); }));
  desenhar();
  if (modo === 'dia') centralizar(S.agDia, false);
}

async function moverEvento(info, toLocal) {
  const a = info.event.extendedProps.a;
  const ini = toLocal(info.event.start), fim = toLocal(info.event.end || info.event.start);
  const ok = await confirmar(`Remarcar <b>${esc(a.clienteNome)}</b> para <b>${diaSemana(ini)}, ${fData(ini)} às ${fHora(ini)}</b>?${a.telefone && S.cfg.waAtivo ? '<br><span class="muted tiny">Os lembretes automáticos serão reenviados para o novo horário.</span>' : ''}`, { ok: 'Remarcar' });
  if (!ok) return info.revert();
  try { await salvarAgendamento(payloadDe(a, { data: ini.slice(0, 10), hora: ini.slice(11, 16), duracao: durEntre(ini, fim), status: a.status === 'remarcar' ? 'agendado' : a.status })); toast('Horário remarcado 🗓️'); info.view.calendar.refetchEvents(); }
  catch (e) { info.revert(); if (e.message !== 'cancelado') erroToast(e); }
}
function payloadDe(a, extra) {
  return Object.assign({
    id: a.id, clienteId: a.clienteId, servicoIds: a.servicos.map(s => s.id), profissionalId: a.profissionalId,
    data: a.inicio.slice(0, 10), hora: fHora(a.inicio), duracao: durEntre(a.inicio, a.fim),
    valor: a.valor, desconto: a.desconto, sinal: a.sinal, local: a.local, observacoes: a.observacoes, status: a.status
  }, extra || {});
}
/** Salva tratando conflito de horário (pergunta se quer encaixar mesmo assim). */
async function salvarAgendamento(p) {
  try { return await call('agenda.salvar', p); }
  catch (e) {
    if (e.dados && e.dados.conflito) {
      const ok = await confirmar(esc(e.message), { ok: 'Agendar mesmo assim', titulo: 'Conflito de horário' });
      if (ok) return call('agenda.salvar', Object.assign({}, p, { forcar: true }));
      throw new Error('cancelado');
    }
    throw e;
  }
}

/* ------------------------- Formulário de agendamento ------------------------- */
function formAgendamento(pre, depois) {
  pre = pre || {};
  const editando = !!pre.id;
  const st = {
    clienteId: pre.clienteId || '', novaCliente: false,
    servicos: new Set(pre.servicoIds || []), valorManual: editando, duracaoManual: !!pre.duracao && !editando ? false : editando
  };
  const servAtivos = S.servicos.filter(s => s.ativo !== 'nao' || st.servicos.has(s.id));
  const cats = [...new Set(servAtivos.map(s => s.categoria))];
  const equipe = S.equipe.filter(p => p.ativo !== 'nao' || p.id === pre.profissionalId);
  const cliSel = id => S.clientes.find(c => c.id === id);
  const passo = (S.cfg.intervaloAgenda || 15) * 60;

  const m = modal({
    title: editando ? 'Editar agendamento' : 'Novo agendamento', wide: true,
    body: `<form id="fAg" autocomplete="off">
      <div class="section-title">Cliente</div>
      <div id="cliBox"></div>
      <div class="section-title">Serviços <span style="text-transform:none;letter-spacing:0;font-weight:500">· toque em quantos ela vai fazer</span></div>
      ${cats.map(cat => `<div class="tiny muted" style="margin:6px 0">${esc(cat)}</div><div class="chips" style="margin-bottom:8px">
        ${servAtivos.filter(s => s.categoria === cat).map(s => `<button type="button" class="chip ${st.servicos.has(s.id) ? 'on' : ''}" data-srv="${s.id}">
          <span class="dot" style="background:${esc(s.cor)}"></span><span>${esc(s.nome)}<br><span class="chip-sub">${brl(s.preco)} · ${fDur(s.duracao)}</span></span></button>`).join('')}</div>`).join('')
        || '<div class="alert warn">Cadastre seus serviços em <b>Serviços & Equipe</b>.</div>'}
      <div class="section-title">Quando</div>
      <div class="grid-3">
        <label class="field"><span>Data</span><input type="date" name="data" required value="${esc(pre.data || hoje())}"></label>
        <label class="field"><span>Horário</span><input type="time" name="hora" required step="${passo}" value="${esc(pre.hora || '')}"></label>
        <label class="field"><span>Duração (min)</span><input type="number" name="duracao" min="5" step="5" value="${esc(pre.duracao || '')}"></label>
      </div>
      <div class="grid-2">
        ${equipe.length ? `<label class="field"><span>Profissional</span><select name="profissionalId"><option value="">—</option>${opts(equipe.map(p => ({ v: p.id, l: p.nome })), pre.profissionalId || (equipe.length === 1 ? equipe[0].id : ''))}</select></label>` : ''}
        <label class="field"><span>Local</span><select name="local">${opts(S.cfg.locais || ['Studio'], pre.local || 'Studio')}</select></label>
        ${editando ? `<label class="field"><span>Status</span><select name="status">${opts(Object.keys(STATUS).map(k => ({ v: k, l: STATUS[k] })), pre.status)}</select></label>` : ''}
      </div>
      <div class="section-title">Valores</div>
      <div class="grid-3">
        <label class="field"><span>Valor (R$)</span><input name="valor" inputmode="decimal" value="${pre.valor != null ? esc(String(pre.valor).replace('.', ',')) : ''}"></label>
        <label class="field"><span>Desconto (R$)</span><input name="desconto" inputmode="decimal" value="${pre.desconto ? esc(String(pre.desconto).replace('.', ',')) : ''}"></label>
        <label class="field"><span>Sinal pago (R$)</span><input name="sinal" inputmode="decimal" value="${pre.sinal ? esc(String(pre.sinal).replace('.', ',')) : ''}"><small>${S.cfg.sinalRetido !== false ? 'Entra no caixa e fica com você se ela cancelar' : 'Lança no financeiro como reserva'}</small></label>
      </div>
      <div class="total-box"><span id="agResumo" class="muted"></span><b id="agTotal">R$ 0,00</b></div>
      <label class="field"><span>Observações</span><textarea name="observacoes" rows="2" placeholder="Ex.: noiva, levar kit de cílios, chegar 30 min antes…">${esc(pre.observacoes || '')}</textarea></label>
      ${!editando && S.cfg.waAtivo ? `<label class="switch"><input type="checkbox" name="enviarConfirmacao" ${S.cfg.waConfirmacao !== false ? 'checked' : ''}><span>Enviar confirmação no WhatsApp agora</span></label>` : ''}
      ${S.cfg.calendarAtivo ? `<div class="muted tiny">${ico('calendar')} Será ${editando ? 'atualizado' : 'criado'} automaticamente no seu Google Agenda.</div>` : ''}
    </form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="bSalvarAg">${ico('check')}${editando ? 'Salvar alterações' : 'Agendar'}</button>`
  });
  const f = $('#fAg', m.el);

  function renderCli() {
    const box = $('#cliBox', m.el);
    const c = cliSel(st.clienteId);
    if (st.novaCliente) {
      box.innerHTML = `<div class="grid-2"><label class="field"><span>Nome da nova cliente</span><input name="ncNome" placeholder="Nome e sobrenome"></label>
        <label class="field"><span>WhatsApp</span><input name="ncTel" type="tel" inputmode="tel" placeholder="(11) 98765-4321"></label></div>
        <button type="button" class="btn sm ghost" data-cliback>← Buscar cliente cadastrada</button>`;
      $('[data-cliback]', box).onclick = () => { st.novaCliente = false; renderCli(); };
      setTimeout(() => $('[name=ncNome]', box).focus(), 30);
    } else if (c) {
      box.innerHTML = `<div class="list-item" style="border:1px solid var(--border);border-radius:12px;padding:10px 12px">
        <div class="avatar">${esc(iniciais(c.nome))}</div><div class="grow"><div class="title">${esc(c.nome)}</div><div class="sub">${esc(foneFmt(c.telefone)) || 'sem telefone'}</div></div>
        <button type="button" class="btn sm ghost" data-clitrocar>Trocar</button></div>`;
      $('[data-clitrocar]', box).onclick = () => { st.clienteId = ''; renderCli(); };
    } else {
      box.innerHTML = `<div class="ac"><input id="cliBusca" placeholder="Digite o nome ou telefone da cliente…">
        <div id="cliRes" class="dropdown hidden"></div></div>
        <button type="button" class="btn sm ghost" style="margin-top:8px" data-clinova>${ico('userPlus')}Cadastrar nova cliente</button>`;
      const inp = $('#cliBusca', box), res = $('#cliRes', box);
      const busca = () => {
        const q = inp.value.trim().toLowerCase(), qd = q.replace(/\D/g, '');
        const lista = S.clientes.filter(c => !q || String(c.nome).toLowerCase().includes(q) || (qd.length >= 3 && String(c.telefone).includes(qd))).slice(0, 8);
        res.innerHTML = lista.map(c => `<div class="dropdown-item" data-id="${c.id}"><span>${esc(c.nome)}</span><span class="muted tiny">${esc(foneFmt(c.telefone))}</span></div>`).join('')
          + `<div class="dropdown-item" data-nova="1"><span>${ico('userPlus')} Cadastrar ${q ? '“' + esc(inp.value.trim()) + '”' : 'nova cliente'}</span></div>`;
        res.classList.remove('hidden');
      };
      inp.addEventListener('input', debounce(busca, 100));
      inp.addEventListener('focus', busca);
      inp.addEventListener('blur', () => setTimeout(() => res.classList.add('hidden'), 150));
      res.addEventListener('mousedown', e => {
        e.preventDefault();
        const it = e.target.closest('.dropdown-item'); if (!it) return;
        if (it.dataset.nova) { const nome = inp.value.trim(); st.novaCliente = true; renderCli(); if (nome && !/^\d/.test(nome)) $('[name=ncNome]', m.el).value = nome; }
        else { st.clienteId = it.dataset.id; renderCli(); }
      });
      $('[data-clinova]', box).onclick = () => { st.novaCliente = true; renderCli(); };
    }
  }
  function recalcular() {
    const sel = S.servicos.filter(s => st.servicos.has(s.id));
    const dur = sel.reduce((t, s) => t + num(s.duracao), 0);
    const val = sel.reduce((t, s) => t + num(s.preco), 0);
    if (!st.duracaoManual && dur) f.duracao.value = dur;
    if (!st.valorManual) f.valor.value = val ? String(val.toFixed(2)).replace('.', ',') : '';
    const total = num(f.valor.value) - num(f.desconto.value);
    const d = num(f.duracao.value) || dur;
    $('#agTotal', m.el).textContent = brl(total);
    const fimH = f.hora.value && d ? (() => { const [h, mi] = f.hora.value.split(':').map(Number); const t = h * 60 + mi + d; return pad(Math.floor(t / 60) % 24) + ':' + pad(t % 60); })() : '';
    $('#agResumo', m.el).textContent = (sel.length ? sel.length + ' serviço(s) · ' + fDur(d) : 'Selecione os serviços') + (fimH ? ' · termina às ' + fimH : '') + (num(f.sinal.value) ? ' · falta receber ' + brl(total - num(f.sinal.value)) : '');
  }
  $$('[data-srv]', m.el).forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.srv;
    if (st.servicos.has(id)) st.servicos.delete(id); else st.servicos.add(id);
    b.classList.toggle('on');
    st.valorManual = false; st.duracaoManual = false;
    recalcular();
  }));
  f.valor.addEventListener('input', () => { st.valorManual = true; recalcular(); });
  f.duracao.addEventListener('input', () => { st.duracaoManual = true; recalcular(); });
  ['desconto', 'sinal', 'hora'].forEach(n => f[n].addEventListener('input', recalcular));
  renderCli(); recalcular();

  $('#bSalvarAg', m.el).addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData(f);
    const p = Object.assign({}, d, { id: pre.id, clienteId: st.clienteId, servicoIds: [...st.servicos] });
    if (st.novaCliente) {
      if (!d.ncNome) return toast('Informe o nome da nova cliente.', 'err');
      p.clienteId = ''; p.novaCliente = { nome: d.ncNome, telefone: d.ncTel };
    }
    if (!p.clienteId && !p.novaCliente) return toast('Selecione a cliente.', 'err');
    if (!p.servicoIds.length) return toast('Selecione pelo menos um serviço.', 'err');
    if (!d.hora) return toast('Informe o horário.', 'err');
    p.valor = num(d.valor); p.desconto = num(d.desconto); p.sinal = num(d.sinal);
    try {
      const r = await salvarAgendamento(p);
      m.close();
      if (p.novaCliente) await recarregarCadastros();
      toast(editando ? 'Agendamento atualizado 💖' : 'Agendado com sucesso! 💖');
      if (r.aviso) setTimeout(() => toast(r.aviso, 'err'), 400);
      if (depois) depois(); else if (['agenda', 'dashboard', 'clientes'].includes(S.page)) render();
    } catch (err) { if (err.message !== 'cancelado') erroToast(err); }
  }));
}

/* ------------------------- Detalhe do agendamento ------------------------- */
async function detalheAgendamento(id, depois) {
  let a;
  try { a = await call('agenda.obter', { id }); } catch (e) { return erroToast(e); }
  const dur = durEntre(a.inicio, a.fim);
  const total = a.valor - (a.desconto || 0);
  const sync = !S.cfg.calendarAtivo ? '' : a.syncStatus === 'ok' ? '✅ No Google Agenda' : a.syncStatus === 'removido' ? 'Removido do Google Agenda' : a.syncStatus ? '⚠️ ' + a.syncStatus : '—';
  const cli = S.clientes.find(c => c.id === a.clienteId) || { nome: a.clienteNome, telefone: a.telefone };
  const lembr = [a.confirmEnviada && 'Confirmação ' + fDataHora(a.confirmEnviada), a.lembrete1Enviado && 'Lembrete 1: ' + (a.lembrete1Enviado.length > 12 ? fDataHora(a.lembrete1Enviado) : a.lembrete1Enviado), a.lembrete2Enviado && 'Lembrete 2: ' + (a.lembrete2Enviado.length > 12 ? fDataHora(a.lembrete2Enviado) : a.lembrete2Enviado)].filter(Boolean);
  const ativo = ['agendado', 'confirmado', 'remarcar'].includes(a.status);
  const m = modal({
    title: esc(a.clienteNome), drawer: true,
    body: `<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">${pill(a.status)}<span class="muted tiny">${esc(sync)}</span></div>
      <div class="total-box" style="background:var(--surface-2)"><div><div style="font-weight:700;font-size:16px;text-transform:capitalize">${diaSemana(a.inicio)}, ${fData(a.inicio)}</div>
        <div class="muted">${fHora(a.inicio)} – ${fHora(a.fim)} · ${fDur(dur)}</div></div><b style="color:var(--text)">${brl(total)}</b></div>
      <div class="info-grid">
        <div><div class="k">Serviços</div><div class="v">${esc(a.servicoNomes)}</div></div>
        <div><div class="k">Profissional</div><div class="v">${esc(a.profissionalNome || '—')}</div></div>
        <div><div class="k">Local</div><div class="v">${esc(a.local || 'Studio')}</div></div>
        <div><div class="k">WhatsApp</div><div class="v">${a.telefone ? `<a target="_blank" href="${waLink(a.telefone)}">${esc(foneFmt(a.telefone))}</a>` : '—'}</div></div>
        ${a.desconto ? `<div><div class="k">Desconto</div><div class="v">${brl(a.desconto)}</div></div>` : ''}
        ${a.sinal ? `<div><div class="k">Sinal pago</div><div class="v">${brl(a.sinal)} · falta ${brl(total - a.sinal)}</div></div>` : ''}
        ${a.formaPagamento ? `<div><div class="k">Pagamento</div><div class="v">${esc(a.formaPagamento)}</div></div>` : ''}
      </div>
      ${a.observacoes ? `<div class="section-title">Observações</div><p style="margin:0;white-space:pre-wrap">${esc(a.observacoes)}</p>` : ''}
      ${lembr.length ? `<div class="section-title">WhatsApp</div><div class="muted tiny">${lembr.map(esc).join('<br>')}</div>` : ''}
      <div class="section-title">Ações</div>
      <div class="actions-row">
        ${a.status !== 'confirmado' && ativo ? `<button class="btn sm" data-st="confirmado">${ico('check')}Confirmar</button>` : ''}
        ${a.status !== 'concluido' && a.status !== 'cancelado' ? `<button class="btn sm primary" data-finalizar>${ico('heart')}Finalizar atendimento</button>` : ''}
        ${ativo ? `<button class="btn sm" data-st="faltou">${ico('alert')}Faltou</button>` : ''}
        ${ativo ? `<button class="btn sm danger" data-st="cancelado">${ico('x')}Cancelar</button>` : ''}
        ${!ativo && a.status !== 'concluido' ? `<button class="btn sm" data-st="agendado">${ico('repeat')}Reativar</button>` : ''}
        ${a.status === 'concluido' ? `<button class="btn sm" data-st="confirmado">${ico('repeat')}Desfazer finalização</button>
          <button class="btn sm danger" data-st="cancelado">${ico('x')}Cancelar</button>` : ''}
      </div>
      <div class="actions-row" style="margin-top:8px">
        <button class="btn sm" data-editar>${ico('edit')}Editar / remarcar</button>
        ${a.telefone ? `<button class="btn sm wa" data-wa>${ico('send')}Mensagem</button>` : ''}
        <button class="btn sm ghost" data-cli="${a.clienteId}">${ico('user')}Ficha da cliente</button>
      </div>
      ${a.importado && isAdmin() ? `<div class="alert info" style="margin-top:14px">${ico('calendar')}<div>Veio do Google Agenda.
        <button class="btn sm" style="margin-top:8px" data-desfazer-imp>${ico('repeat')}Desfazer importação</button>
        <div class="tiny" style="margin-top:6px">Devolve o evento como era no Google e tira do CRM (o evento não é apagado).</div></div></div>` : ''}`,
    foot: `<button class="btn sm ghost danger left" data-excluir>${ico('trash')}Excluir</button><button class="btn" data-close>Fechar</button>`
  });
  const atualizar = () => { if (depois) depois(); else render(); };
  $$('[data-st]', m.el).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    const stt = b.dataset.st;
    let financeiro = '';
    if (stt === 'cancelado') { financeiro = await perguntarFinanceiro(a, 'cancelar'); if (!financeiro) return; }
    if (a.status === 'concluido' && stt === 'confirmado' && !(await confirmar('Desfazer a finalização? O pagamento deste atendimento sai do financeiro (o sinal, se houver, continua).', { ok: 'Desfazer' }))) return;
    try {
      await call('agenda.status', { id: a.id, status: stt, financeiro });
      m.close();
      toast(stt === 'cancelado' ? avisoFinanceiro(a, financeiro, 'Horário cancelado') : a.status === 'concluido' && stt === 'confirmado' ? 'Finalização desfeita' : 'Status: ' + STATUS[stt]);
      atualizar();
    } catch (e) { erroToast(e); }
  })));
  const fin = $('[data-finalizar]', m.el);
  if (fin) fin.addEventListener('click', () => { m.close(); finalizarAtendimento(a, atualizar); });
  $('[data-editar]', m.el).addEventListener('click', () => { m.close(); formAgendamento(payloadDe(a), depois); });
  const wa = $('[data-wa]', m.el);
  if (wa) wa.addEventListener('click', () => { m.close(); enviarMensagem(cli, a); });
  $('[data-cli]', m.el).addEventListener('click', () => { m.close(); fichaCliente(a.clienteId); });
  const desfazer = async () => {
    try { await call('agenda.desfazerImportacao', { id: a.id }); m.close(); toast('Importação desfeita · evento devolvido ao Google Agenda como era'); atualizar(); } catch (e) { erroToast(e); }
  };
  const bDesf = $('[data-desfazer-imp]', m.el);
  if (bDesf) bDesf.addEventListener('click', () => busy(bDesf, async () => {
    if (await confirmar('Devolver o evento ao Google Agenda como era antes e tirar este atendimento do CRM?', { ok: 'Desfazer importação' })) await desfazer();
  }));
  $('[data-excluir]', m.el).addEventListener('click', async () => {
    if (a.importado && isAdmin()) {
      const r = await escolher('Este atendimento veio do Google Agenda. <b>Excluir também apaga o evento do Google.</b> Se a ideia é só tirar do CRM, desfaça a importação.', [
        { v: 'desfazer', l: 'Só tirar do CRM', cls: 'primary' },
        { v: 'excluir', l: 'Apagar de tudo', cls: 'danger' }
      ], 'Excluir agendamento');
      if (!r) return;
      if (r === 'desfazer') return desfazer();
    }
    const financeiro = await perguntarFinanceiro(a, 'excluir');
    if (!financeiro) return;
    try {
      await call('agenda.excluir', { id: a.id, financeiro });
      m.close();
      toast(avisoFinanceiro(a, financeiro, 'Agendamento excluído'));
      atualizar();
    } catch (e) { erroToast(e); }
  });
}

function finalizarAtendimento(a, depois) {
  const formas = S.cfg.formasPagamento || ['Pix'];
  const m = modal({
    title: '💖 Finalizar atendimento',
    body: `<p class="muted" style="margin-top:0">${esc(a.clienteNome)} · ${esc(a.servicoNomes)}</p>
      <form id="fFin"><div class="grid-2">
        <label class="field"><span>Valor do atendimento (R$)</span><input name="valor" inputmode="decimal" value="${esc(String(a.valor).replace('.', ','))}"></label>
        <label class="field"><span>Desconto (R$)</span><input name="desconto" inputmode="decimal" value="${a.desconto ? esc(String(a.desconto).replace('.', ',')) : ''}"></label>
      </div>
      <label class="field"><span>Forma de pagamento</span><select name="forma">${opts(formas, a.formaPagamento || formas[0])}</select></label>
      <label class="switch"><input type="checkbox" name="pago" checked><span>Pagamento recebido agora</span></label>
      <div class="total-box"><span class="muted" id="finInfo"></span><b id="finTotal"></b></div></form>`,
    foot: `<button class="btn" data-close>Voltar</button><button class="btn primary" id="bFin">${ico('check')}Concluir e lançar no caixa</button>`
  });
  const f = $('#fFin', m.el);
  const calc = () => {
    const tot = num(f.valor.value) - num(f.desconto.value);
    $('#finTotal', m.el).textContent = brl(tot - (a.sinal || 0));
    $('#finInfo', m.el).textContent = a.sinal ? `Total ${brl(tot)} − sinal ${brl(a.sinal)} =` : 'Total a receber';
  };
  f.addEventListener('input', calc); calc();
  $('#bFin', m.el).addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData(f);
    try { await call('agenda.finalizar', { id: a.id, valor: num(d.valor), desconto: num(d.desconto), forma: d.forma, pago: d.pago }); m.close(); toast('Atendimento concluído e lançado no financeiro 💰'); depois && depois(); }
    catch (err) { erroToast(err); }
  }));
}

/* ------------------------- Enviar mensagem ------------------------- */
function enviarMensagem(cli, ag) {
  const tpls = S.cfg.templates || {};
  const opcoes = [{ v: '', l: 'Mensagem livre' }].concat(ag ? [{ v: 'confirmacao', l: 'Confirmação do horário' }, { v: 'lembrete1', l: 'Lembrete do horário' }] : [])
    .concat([{ v: 'reativacao', l: 'Saudade / reativação' }, { v: 'aniversario', l: 'Feliz aniversário' }]);
  const m = modal({
    title: 'Mensagem para ' + esc(primeiroNome(cli.nome)),
    body: `<label class="field"><span>Modelo</span><select id="mTpl">${opts(opcoes, ag ? 'lembrete1' : '')}</select></label>
      <label class="field"><span>Mensagem</span><textarea id="mTxt" rows="7"></textarea></label>
      <div class="muted tiny">Enviando para ${esc(foneFmt(cli.telefone))}</div>`,
    foot: `<a class="btn" id="mWaWeb" target="_blank">${ico('external')}Abrir no WhatsApp</a>
      ${S.cfg.waAtivo ? `<button class="btn wa" id="mEnviar">${ico('send')}Enviar automático</button>` : ''}`
  });
  const sel = $('#mTpl', m.el), txt = $('#mTxt', m.el), link = $('#mWaWeb', m.el);
  const upd = () => { link.href = waLink(cli.telefone, txt.value); };
  const aplicar = () => { txt.value = sel.value ? renderTpl(tpls[sel.value] || '', tplVars(cli, ag)) : ''; upd(); };
  sel.addEventListener('change', aplicar); txt.addEventListener('input', upd); aplicar();
  link.addEventListener('click', () => setTimeout(() => m.close(), 100));
  const env = $('#mEnviar', m.el);
  if (env) env.addEventListener('click', () => busy(env, async () => {
    if (!txt.value.trim()) return toast('Escreva a mensagem.', 'err');
    try { await call('wa.enviar', { clienteId: cli.id, agendamentoId: ag ? ag.id : '', mensagem: txt.value, template: sel.value }); m.close(); toast('Mensagem enviada pelo WhatsApp ✅'); }
    catch (err) { erroToast(err); }
  }));
}

/* ------------------------- Clientes ------------------------- */
PAGES.clientes = el => callRapido('clientes.listar', {}, lista => desenharClientes(el, lista), el);
function desenharClientes(el, lista) {
  const qAntes = ($('#cliQ', el) || {}).value || '';
  const mesAtual = hoje().slice(5, 7);
  const filtros = {
    todas: () => true,
    aniversario: c => c.nascimento && c.nascimento.slice(5, 7) === mesAtual,
    inativas: c => c.ultimaVisita && !c.proxima && (new Date() - new Date(c.ultimaVisita)) / 86400000 > (S.cfg.diasInativa || 60),
    agendadas: c => !!c.proxima,
    novas: c => c.criadoEm && c.criadoEm.slice(0, 7) === hoje().slice(0, 7)
  };
  el.innerHTML = `
    <div class="toolbar">
      <div class="search-global" style="display:flex"><span class="ico" data-ico="search"></span><input id="cliQ" type="search" placeholder="Buscar por nome, telefone ou tag…" style="width:280px"></div>
      <div class="seg" id="cliSeg">${[['todas', 'Todas'], ['agendadas', 'Com horário'], ['aniversario', 'Aniversariantes'], ['inativas', 'Para reativar'], ['novas', 'Novas']].map(([k, l]) => `<button data-f="${k}" class="${S.cliFiltro === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="spacer"></div>
      <button class="btn primary" id="bNovaCli">${ico('userPlus')}Nova cliente</button>
    </div>
    <div class="card" id="cliBody"></div>`;
  hydrateIcons(el);
  const body = $('#cliBody');
  const desenhar = () => {
    const q = $('#cliQ').value.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    const rows = lista.filter(filtros[S.cliFiltro]).filter(c => !q || String(c.nome).toLowerCase().includes(q) || String(c.tags).toLowerCase().includes(q) || (qd.length >= 3 && String(c.telefone).includes(qd)));
    if (isMobile()) {
      body.innerHTML = rows.length ? `<div class="m-list">${rows.map(c => `<div class="m-item" data-cli="${c.id}">
        <div class="avatar">${esc(iniciais(c.nome))}</div>
        <div class="grow"><div class="title">${esc(c.nome)}</div>
          <div class="sub">${c.visitas} visita(s)${c.ultimaVisita ? ' · última ' + fDataCurta(c.ultimaVisita) : ''}${c.tags ? ' · ' + esc(c.tags) : ''}</div>
          ${c.proxima ? `<div style="margin-top:5px"><span class="pill st-agendado">${fDataCurta(c.proxima)} às ${fHora(c.proxima)}</span></div>` : ''}</div>
        ${c.telefone ? `<a class="round-btn wa" href="${waLink(c.telefone)}" target="_blank" data-stop aria-label="WhatsApp">${ico('send')}</a>` : ''}</div>`).join('')}</div>`
        : `<div class="empty"><div class="big">🔍</div>Nenhuma cliente encontrada.</div>`;
      return;
    }
    body.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>Cliente</th><th>WhatsApp</th><th>Última visita</th><th class="num">Visitas</th>${isAdmin() ? '<th class="num">Total gasto</th>' : ''}<th>Próximo horário</th></tr></thead><tbody>`
      + (rows.length ? rows.map(c => `<tr class="click" data-cli="${c.id}">
      <td data-l="Cliente" class="main"><div style="display:flex;align-items:center;gap:10px"><div class="avatar" style="width:34px;height:34px;font-size:12px">${esc(iniciais(c.nome))}</div>
        <div style="text-align:left"><div style="font-weight:600">${esc(c.nome)}</div><div class="tiny muted">${[c.instagram].concat(String(c.tags || '').split(',')).map(t => String(t || '').trim()).filter(Boolean).map(esc).join(' · ')}</div></div></div></td>
      <td data-l="WhatsApp" class="nowrap">${c.telefone ? `<a href="${waLink(c.telefone)}" target="_blank" data-stop>${esc(foneFmt(c.telefone))}</a>` : '<span class="muted">—</span>'}</td>
      <td data-l="Última visita" class="hide-m">${c.ultimaVisita ? fData(c.ultimaVisita) : '<span class="muted">—</span>'}</td>
      <td data-l="Visitas" class="num hide-m">${c.visitas}</td>
      ${isAdmin() ? `<td data-l="Total gasto" class="num hide-m">${brl(c.totalGasto)}</td>` : ''}
      <td data-l="Próximo">${c.proxima ? `<span class="pill st-agendado">${fDataCurta(c.proxima)} ${fHora(c.proxima)}</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')
      : `<tr><td colspan="6"><div class="empty"><div class="big">🔍</div>Nenhuma cliente encontrada.</div></td></tr>`) + '</tbody></table></div>';
  };
  $('#cliQ').addEventListener('input', debounce(desenhar, 120));
  $$('#cliSeg button').forEach(b => b.addEventListener('click', () => { S.cliFiltro = b.dataset.f; $$('#cliSeg button').forEach(x => x.classList.toggle('active', x === b)); desenhar(); }));
  $('#cliQ').value = qAntes;
  $('#bNovaCli').addEventListener('click', () => formCliente({}));
  body.addEventListener('click', e => { if (e.target.closest('[data-stop]')) return; const tr = e.target.closest('[data-cli]'); if (tr) fichaCliente(tr.dataset.cli); });
  desenhar();
};

async function fichaCliente(id) {
  let c;
  try { c = await call('clientes.obter', { id }); } catch (e) { return erroToast(e); }
  const r = c.resumo;
  const proximo = c.historico.filter(h => ['agendado', 'confirmado', 'remarcar'].includes(h.status) && h.inicio >= hoje()).slice(-1)[0];
  const campo = (k, v) => v ? `<div><div class="k">${k}</div><div class="v">${esc(v)}</div></div>` : '';
  const m = modal({
    title: esc(c.nome), drawer: true,
    body: `<div class="stat-row" style="margin-bottom:14px">
        <div class="stat-mini"><b>${r.visitas}</b><span>visitas</span></div>
        <div class="stat-mini"><b>${isAdmin() ? brl(r.totalGasto) : r.faltas}</b><span>${isAdmin() ? 'total gasto' : 'faltas'}</span></div>
        <div class="stat-mini"><b>${isAdmin() ? brl(r.ticketMedio) : (r.ultimaVisita ? fDataCurta(r.ultimaVisita) : '—')}</b><span>${isAdmin() ? 'ticket médio' : 'última visita'}</span></div></div>
      ${proximo ? `<div class="alert info">${ico('calendar')}<div>Próximo horário: <b>${fData(proximo.inicio)} às ${fHora(proximo.inicio)}</b> · ${esc(proximo.servicoNomes)}</div></div>` : ''}
      ${c.alergias ? `<div class="alert warn">${ico('alert')}<div><b>Alergias / sensibilidades:</b> ${esc(c.alergias)}</div></div>` : ''}
      <div class="actions-row">
        <button class="btn sm primary" data-agendar>${ico('plus')}Agendar</button>
        ${c.telefone ? `<button class="btn sm wa" data-msg>${ico('send')}Mensagem</button>` : ''}
        <button class="btn sm" data-editar>${ico('edit')}Editar</button>
      </div>
      <div class="section-title">Contato</div>
      <div class="info-grid">
        ${campo('WhatsApp', foneFmt(c.telefone))}${campo('E-mail', c.email)}${campo('Instagram', c.instagram)}
        ${campo('Aniversário', c.nascimento ? fData(c.nascimento) : '')}${campo('Como conheceu', c.origem)}${campo('Tags', c.tags)}
      </div>
      ${(c.tipoPele || c.tomBase || c.sobrancelha || c.anamnese) ? `<div class="section-title">Ficha de beleza</div>
        <div class="info-grid">${campo('Tipo de pele', c.tipoPele)}${campo('Tom de base', c.tomBase)}${campo('Sobrancelha', c.sobrancelha)}</div>
        ${c.anamnese ? `<p style="white-space:pre-wrap;margin:12px 0 0">${esc(c.anamnese)}</p>` : ''}` : ''}
      ${c.observacoes ? `<div class="section-title">Observações</div><p style="white-space:pre-wrap;margin:0">${esc(c.observacoes)}</p>` : ''}
      <div class="section-title">Histórico (${c.historico.length})</div>
      ${c.historico.length ? `<div class="list">${c.historico.slice(0, 30).map(h => `<div class="list-item" data-ag="${h.id}" style="cursor:pointer">
        <div class="time-box"><b style="font-size:14px">${fDataCurta(h.inicio)}</b><span>${h.inicio.slice(0, 4)}</span></div>
        <div class="grow"><div class="title" style="font-weight:500">${esc(h.servicoNomes)}</div><div class="sub">${fHora(h.inicio)}${h.profissional ? ' · ' + esc(h.profissional) : ''}${isAdmin() ? ' · ' + brl(h.valor) : ''}</div></div>${pill(h.status)}</div>`).join('')}</div>`
        : '<div class="muted">Nenhum atendimento ainda.</div>'}
      ${c.mensagens.length ? `<div class="section-title">Mensagens recentes</div><div class="list">${c.mensagens.slice(0, 8).map(x => `<div class="list-item" style="align-items:flex-start">
        <div class="grow"><div class="sub">${fDataHora(x.data)} · ${esc(x.tipo)} ${x.direcao === 'recebida' ? '⬅️' : '➡️'}</div><div style="white-space:pre-wrap;font-size:13px">${esc(String(x.mensagem).slice(0, 220))}</div></div>${pill(x.status)}</div>`).join('')}</div>` : ''}`,
    foot: `${isAdmin() ? `<button class="btn sm ghost danger left" data-excluir>${ico('trash')}Excluir</button>` : ''}<button class="btn" data-close>Fechar</button>`
  });
  $('[data-agendar]', m.el).addEventListener('click', () => { m.close(); formAgendamento({ clienteId: c.id }); });
  $('[data-editar]', m.el).addEventListener('click', () => { m.close(); formCliente(c); });
  const msg = $('[data-msg]', m.el);
  if (msg) msg.addEventListener('click', () => { m.close(); enviarMensagem(c, null); });
  $$('[data-ag]', m.el).forEach(x => x.addEventListener('click', () => { m.close(); detalheAgendamento(x.dataset.ag); }));
  const ex = $('[data-excluir]', m.el);
  if (ex) ex.addEventListener('click', async () => {
    if (!(await confirmar(`Excluir <b>${esc(c.nome)}</b>? O histórico de atendimentos continua no financeiro.`, { ok: 'Excluir cliente', perigo: true }))) return;
    try { await call('clientes.excluir', { id: c.id }); m.close(); await recarregarCadastros(); toast('Cliente excluída'); render(); } catch (e) { erroToast(e); }
  });
}

function formCliente(c, depois) {
  c = c || {};
  const m = modal({
    title: c.id ? 'Editar cliente' : 'Nova cliente', wide: true,
    body: `<form id="fCli">
      <div class="grid-2">
        <label class="field"><span>Nome completo *</span><input name="nome" required value="${esc(c.nome || '')}"></label>
        <label class="field"><span>WhatsApp</span><input name="telefone" type="tel" inputmode="tel" placeholder="(11) 98765-4321" value="${esc(foneFmt(c.telefone || ''))}"></label>
        <label class="field"><span>Data de nascimento</span><input name="nascimento" type="date" value="${esc(c.nascimento || '')}"></label>
        <label class="field"><span>Instagram</span><input name="instagram" placeholder="@cliente" value="${esc(c.instagram || '')}"></label>
        <label class="field"><span>E-mail</span><input name="email" type="email" value="${esc(c.email || '')}"></label>
        <label class="field"><span>Como conheceu o studio</span><select name="origem"><option value="">—</option>${opts(['Instagram', 'Indicação', 'Google', 'WhatsApp', 'TikTok', 'Passou na frente', 'Evento', 'Outro'], c.origem)}</select></label>
      </div>
      <label class="field"><span>Tags</span><input name="tags" placeholder="noiva, VIP, madrinha…" value="${esc(c.tags || '')}"><small>Separe por vírgula</small></label>
      <div class="section-title">Ficha de beleza</div>
      <div class="grid-3">
        <label class="field"><span>Tipo de pele</span><select name="tipoPele"><option value="">—</option>${opts(['Normal', 'Seca', 'Oleosa', 'Mista', 'Sensível', 'Acneica', 'Madura'], c.tipoPele)}</select></label>
        <label class="field"><span>Tom de base</span><input name="tomBase" placeholder="Ex.: 220N / bege médio" value="${esc(c.tomBase || '')}"></label>
        <label class="field"><span>Sobrancelha</span><input name="sobrancelha" placeholder="Formato, cor da henna…" value="${esc(c.sobrancelha || '')}"></label>
      </div>
      <label class="field"><span>Alergias / sensibilidades</span><input name="alergias" placeholder="Ex.: alergia a cola de cílios, látex…" value="${esc(c.alergias || '')}"></label>
      <label class="field"><span>Anamnese / preferências</span><textarea name="anamnese" rows="3" placeholder="Produtos que prefere, estilo de make, cuidados…">${esc(c.anamnese || '')}</textarea></label>
      <label class="field"><span>Observações</span><textarea name="observacoes" rows="2">${esc(c.observacoes || '')}</textarea></label>
    </form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="bCli">${ico('check')}Salvar</button>`
  });
  const salvar = async (forcar) => {
    const d = formData($('#fCli', m.el));
    if (!d.nome.trim()) return toast('Informe o nome.', 'err');
    try {
      const r = await call('clientes.salvar', Object.assign(d, { id: c.id, forcar }));
      m.close(); await recarregarCadastros(); toast('Cliente salva 💖');
      if (depois) depois(r); else render();
    } catch (err) {
      if (err.dados && err.dados.duplicada && await confirmar(esc(err.message) + '<br>Salvar mesmo assim?', { ok: 'Salvar mesmo assim' })) return salvar(true);
      if (!(err.dados && err.dados.duplicada)) erroToast(err);
    }
  };
  $('#bCli', m.el).addEventListener('click', e => busy(e.currentTarget, () => salvar(false)));
}

/* ------------------------- Serviços & Equipe ------------------------- */
PAGES.servicos = async el => {
  await recarregarCadastros();
  const aba = S.abaServ || 'servicos';
  const cats = [...new Set(S.servicos.map(s => s.categoria))];
  el.innerHTML = `
    <div class="toolbar"><div class="seg" id="segServ"><button data-a="servicos" class="${aba === 'servicos' ? 'active' : ''}">Serviços (${S.servicos.filter(s => s.ativo !== 'nao').length})</button>
      <button data-a="equipe" class="${aba === 'equipe' ? 'active' : ''}">Equipe (${S.equipe.filter(s => s.ativo !== 'nao').length})</button></div>
      <div class="spacer"></div>
      <button class="btn primary" id="bNovo">${ico('plus')}${aba === 'servicos' ? 'Novo serviço' : 'Nova profissional'}</button></div>
    <div id="servBody"></div>`;
  const body = $('#servBody');
  if (aba === 'servicos') {
    body.innerHTML = cats.length ? cats.map(cat => `<div class="section-title">${esc(cat)}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-bottom:8px">
      ${S.servicos.filter(s => s.categoria === cat).map(s => `<div class="card card-pad" data-srv="${s.id}" style="cursor:pointer;${s.ativo === 'nao' ? 'opacity:.55' : ''}">
        <div style="display:flex;align-items:center;gap:10px"><span class="dot" style="background:${esc(s.cor)};width:12px;height:12px"></span><b style="flex:1">${esc(s.nome)}</b>${s.ativo === 'nao' ? '<span class="tag">inativo</span>' : ''}</div>
        <div style="display:flex;justify-content:space-between;margin-top:12px;align-items:flex-end">
          <div><div class="kpi-value" style="font-size:20px;margin:0">${brl(s.preco)}</div><div class="tiny muted">${fDur(s.duracao)}${s.custo ? ' · margem ' + Math.round((1 - s.custo / (s.preco || 1)) * 100) + '%' : ''}</div></div>
          <span class="icon-btn sm">${ico('edit')}</span></div></div>`).join('')}</div>`).join('')
      : '<div class="card empty"><div class="big">✨</div>Nenhum serviço cadastrado.</div>';
    $$('[data-srv]', body).forEach(x => x.addEventListener('click', () => formServico(S.servicos.find(s => s.id === x.dataset.srv))));
  } else {
    body.innerHTML = `<div class="card"><div class="card-body">${S.equipe.length ? `<div class="list">${S.equipe.map(p => `<div class="list-item" data-prof="${p.id}" style="cursor:pointer;${p.ativo === 'nao' ? 'opacity:.55' : ''}">
      <div class="avatar" style="background:${esc(p.cor)};color:${inkFor(p.cor)}">${esc(iniciais(p.nome))}</div>
      <div class="grow"><div class="title">${esc(p.nome)}</div><div class="sub">${esc(foneFmt(p.telefone)) || 'sem telefone'} · comissão ${p.comissao || 0}%</div></div>
      ${p.ativo === 'nao' ? '<span class="tag">inativa</span>' : ''}<span class="icon-btn sm">${ico('edit')}</span></div>`).join('')}</div>`
      : `<div class="empty"><div class="big">💄</div>Trabalha sozinha? Pode pular esta parte.<br>Cadastre profissionais para controlar a agenda e as comissões de cada uma.</div>`}</div></div>`;
    $$('[data-prof]', body).forEach(x => x.addEventListener('click', () => formProf(S.equipe.find(p => p.id === x.dataset.prof))));
  }
  $$('#segServ button').forEach(b => b.addEventListener('click', () => { S.abaServ = b.dataset.a; render(); }));
  $('#bNovo').addEventListener('click', () => aba === 'servicos' ? formServico({}) : formProf({}));
};
const CORES = ['#0f7f7c', '#9c8074', '#e06a3a', '#6a4ce2', '#257de0', '#c2457a', '#f2a600', '#5f6b6a'];
const coresPicker = (sel) => `<div class="chips">${CORES.map(c => `<label style="cursor:pointer"><input type="radio" name="cor" value="${c}" ${c === sel ? 'checked' : ''} style="display:none">
  <span class="dot" style="width:28px;height:28px;background:${c};outline:${c === sel ? '3px solid var(--text)' : 'none'};outline-offset:2px" data-cor="${c}"></span></label>`).join('')}</div>`;
function ligarCores(root) {
  $$('[data-cor]', root).forEach(d => d.addEventListener('click', () => { $$('[data-cor]', root).forEach(x => x.style.outline = 'none'); d.style.outline = '3px solid var(--text)'; }));
}
function formServico(s) {
  const m = modal({
    title: s.id ? 'Editar serviço' : 'Novo serviço',
    body: `<form id="fSrv"><label class="field"><span>Nome *</span><input name="nome" value="${esc(s.nome || '')}" placeholder="Ex.: Maquiagem social"></label>
      <div class="grid-2"><label class="field"><span>Categoria</span><select name="categoria">${opts(S.cfg.categoriasServico || [], s.categoria)}</select></label>
        <label class="field"><span>Duração (min)</span><input name="duracao" type="number" min="5" step="5" value="${esc(s.duracao || 60)}"></label>
        <label class="field"><span>Preço (R$)</span><input name="preco" inputmode="decimal" value="${s.preco != null ? esc(String(s.preco).replace('.', ',')) : ''}"></label>
        <label class="field"><span>Custo de material (R$)</span><input name="custo" inputmode="decimal" value="${s.custo ? esc(String(s.custo).replace('.', ',')) : ''}"><small>Opcional — calcula a margem</small></label></div>
      <label class="field"><span>Cor na agenda</span>${coresPicker(s.cor || CORES[0])}</label>
      <label class="field"><span>Descrição</span><textarea name="descricao" rows="2">${esc(s.descricao || '')}</textarea></label>
      ${s.id ? `<label class="switch"><input type="checkbox" name="ativoChk" ${s.ativo !== 'nao' ? 'checked' : ''}><span>Serviço ativo</span></label>` : ''}</form>`,
    foot: `${s.id ? `<button class="btn sm ghost danger left" data-del>${ico('trash')}Excluir</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" id="bSrv">Salvar</button>`
  });
  ligarCores(m.el);
  $('#bSrv', m.el).addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData($('#fSrv', m.el));
    d.ativo = d.ativoChk === false ? 'nao' : 'sim'; d.preco = num(d.preco); d.custo = num(d.custo); d.id = s.id;
    try { await call('servicos.salvar', d); m.close(); toast('Serviço salvo ✨'); render(); } catch (err) { erroToast(err); }
  }));
  const del = $('[data-del]', m.el);
  if (del) del.addEventListener('click', async () => {
    if (!(await confirmar('Excluir este serviço? Se já foi usado em agendamentos, ele será apenas desativado.', { ok: 'Excluir', perigo: true }))) return;
    try { const r = await call('servicos.excluir', { id: s.id }); m.close(); toast(r.desativado ? 'Serviço desativado (tem histórico)' : 'Serviço excluído'); render(); } catch (err) { erroToast(err); }
  });
}
function formProf(p) {
  const m = modal({
    title: p.id ? 'Editar profissional' : 'Nova profissional',
    body: `<form id="fProfF"><label class="field"><span>Nome *</span><input name="nome" value="${esc(p.nome || '')}"></label>
      <div class="grid-2"><label class="field"><span>WhatsApp</span><input name="telefone" type="tel" value="${esc(foneFmt(p.telefone || ''))}"></label>
      <label class="field"><span>Comissão (%)</span><input name="comissao" type="number" min="0" max="100" value="${esc(p.comissao || 0)}"></label></div>
      <label class="field"><span>Cor na agenda</span>${coresPicker(p.cor || CORES[1])}</label>
      ${p.id ? `<label class="switch"><input type="checkbox" name="ativoChk" ${p.ativo !== 'nao' ? 'checked' : ''}><span>Ativa</span></label>` : ''}</form>`,
    foot: `${p.id ? `<button class="btn sm ghost danger left" data-del>${ico('trash')}Excluir</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" id="bProf">Salvar</button>`
  });
  ligarCores(m.el);
  $('#bProf', m.el).addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData($('#fProfF', m.el)); d.ativo = d.ativoChk === false ? 'nao' : 'sim'; d.id = p.id;
    try { await call('equipe.salvar', d); m.close(); toast('Profissional salva 💄'); render(); } catch (err) { erroToast(err); }
  }));
  const del = $('[data-del]', m.el);
  if (del) del.addEventListener('click', async () => {
    if (!(await confirmar('Excluir esta profissional?', { ok: 'Excluir', perigo: true }))) return;
    try { const r = await call('equipe.excluir', { id: p.id }); m.close(); toast(r.desativado ? 'Profissional desativada (tem histórico)' : 'Profissional excluída'); render(); } catch (err) { erroToast(err); }
  });
}

/* ------------------------- Financeiro ------------------------- */
PAGES.financeiro = async el => {
  const ini = S.finMes + '-01', fim = fimMes(S.finMes);
  const r = await call('fin.listar', { inicio: ini, fim });
  const t = r.totais;
  const filtros = { todos: () => true, receita: l => l.tipo === 'receita', despesa: l => l.tipo === 'despesa', pendente: l => l.status === 'pendente' };
  const despCat = {};
  r.lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pago').forEach(l => { despCat[l.categoria] = (despCat[l.categoria] || 0) + l.valor; });
  const despItens = top6(Object.keys(despCat).map(k => ({ nome: k, valor: despCat[k] })).sort((a, b) => b.valor - a.valor));

  el.innerHTML = `
    <div class="toolbar">
      <div class="month-nav"><button class="icon-btn sm" data-m="-1">${ico('left')}</button><span>${mesLabel(S.finMes)}</span><button class="icon-btn sm" data-m="1">${ico('right')}</button></div>
      <div class="seg" id="finSeg">${[['todos', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas'], ['pendente', 'Pendentes']].map(([k, l]) => `<button data-f="${k}" class="${S.finFiltro === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="spacer"></div>
      <button class="btn" data-novo="despesa">${ico('down')}Despesa</button>
      <button class="btn primary" data-novo="receita">${ico('up')}Receita</button>
    </div>
    <div class="kpis">
      <div class="card kpi"><div class="kpi-label">${ico('up')}Receitas recebidas</div><div class="kpi-value pos">${brl(t.receitas)}</div></div>
      <div class="card kpi"><div class="kpi-label">${ico('down')}Despesas pagas</div><div class="kpi-value neg">${brl(t.despesas)}</div></div>
      <div class="card kpi hero"><div class="kpi-label">${ico('wallet')}Saldo do mês</div><div class="kpi-value">${brl(t.saldo)}</div><div class="kpi-foot">${t.receitas ? 'margem ' + Math.round(t.saldo / t.receitas * 100) + '%' : '—'}</div></div>
      <div class="card kpi"><div class="kpi-label">${ico('clock')}A receber</div><div class="kpi-value">${brl(t.aReceber)}</div></div>
      <div class="card kpi"><div class="kpi-label">${ico('receipt')}A pagar</div><div class="kpi-value">${brl(t.aPagar)}</div></div>
    </div>
    <div class="grid cols-12">
      <div class="card span-8"><div class="card-head"><h3>Lançamentos</h3><button class="btn sm ghost" id="bCsvFin">${ico('download')}CSV</button></div>
        <div id="finBody"></div></div>
      <div class="card span-4"><div class="card-head"><div><h3>Para onde foi o dinheiro</h3><div class="sub">Despesas pagas por categoria</div></div></div>
        <div class="card-body">${despItens.length ? `<div class="chart-box sm"><canvas id="chDesp"></canvas></div>${donutLegend(despItens)}` : '<div class="empty">Nenhuma despesa paga neste mês.</div>'}</div></div>
    </div>`;
  const body = $('#finBody');
  const desenhar = () => {
    const rows = r.lancamentos.filter(filtros[S.finFiltro]);
    const stDe = l => l.status === 'pago' ? 'pago' : l.atrasado ? 'atrasado' : 'pendente';
    const stLabel = (l, st) => st === 'pago' ? (l.tipo === 'receita' ? 'Recebido' : 'Pago') : st === 'atrasado' ? 'Atrasado' : 'Pendente';
    const dataDe = l => l.status === 'pendente' && l.vencimento ? l.vencimento : l.data;
    if (!rows.length) { body.innerHTML = `<div class="empty"><div class="big">🧾</div>Nenhum lançamento neste filtro.</div>`; return; }
    if (isMobile()) {
      let ultimo = '';
      body.innerHTML = '<div class="m-list">' + rows.map(l => {
        const st = stDe(l), d = dataDe(l);
        const cab = d !== ultimo ? `<div class="m-group">${diaSemana(d)}, ${fDataCurta(d)}</div>` : '';
        ultimo = d;
        return cab + `<div class="m-item" data-edit="${l.id}">
          <div class="m-ico ${l.tipo === 'receita' ? 'up' : 'down'}">${ico(l.tipo === 'receita' ? 'up' : 'down')}</div>
          <div class="grow"><div class="title">${esc(l.descricao || l.categoria)}</div><div class="sub">${esc(l.categoria)}${l.forma ? ' · ' + esc(l.forma) : ''}</div>${l.agAviso ? `<span class="tag" style="margin-top:4px;color:var(--warn)">⚠️ ${esc(l.agAviso)}</span>` : ''}</div>
          <div class="m-right"><div class="num ${l.tipo === 'receita' ? 'pos' : 'neg'}" style="font-weight:700">${l.tipo === 'receita' ? '+' : '−'} ${brl(l.valor)}</div>
            ${l.status === 'pendente' ? `<button class="btn sm" data-pagar="${l.id}">${l.tipo === 'receita' ? 'Recebi' : 'Paguei'}</button>` : pill(st, stLabel(l, st))}</div></div>`;
      }).join('') + '</div>';
      return;
    }
    body.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Descrição</th><th>Forma</th><th>Status</th><th class="num">Valor</th><th></th></tr></thead><tbody>` + rows.map(l => {
      const st = stDe(l), d = dataDe(l);
      return `<tr><td class="nowrap">${fDataCurta(d)}</td>
        <td class="desc"><div style="font-weight:600">${esc(l.descricao || l.categoria)}</div><div class="tiny muted">${esc(l.categoria)}${l.clienteNome ? ' · ' + esc(l.clienteNome) : ''}</div>${l.agAviso ? `<span class="tag" style="margin-top:4px;color:var(--warn)">⚠️ ${esc(l.agAviso)}</span>` : ''}</td>
        <td>${esc(l.forma || '—')}</td>
        <td>${pill(st, stLabel(l, st))}</td>
        <td class="num ${l.tipo === 'receita' ? 'pos' : 'neg'}" style="font-weight:700">${l.tipo === 'receita' ? '+' : '−'} ${brl(l.valor)}</td>
        <td class="nowrap right">${l.status === 'pendente' ? `<button class="btn sm" data-pagar="${l.id}">${ico('check')}${l.tipo === 'receita' ? 'Recebi' : 'Paguei'}</button>` : ''}
          <button class="icon-btn sm" data-edit="${l.id}" title="Editar">${ico('edit')}</button><button class="icon-btn sm" data-del="${l.id}" title="Excluir">${ico('trash')}</button></td></tr>`;
    }).join('') + '</tbody></table></div>';
  };
  desenhar();
  if (despItens.length) donutChart($('#chDesp'), despItens.map(x => x.nome), despItens.map(x => x.valor));
  $$('[data-m]', el).forEach(b => b.addEventListener('click', () => { S.finMes = addMes(S.finMes, Number(b.dataset.m)); render(); }));
  $$('#finSeg button').forEach(b => b.addEventListener('click', () => { S.finFiltro = b.dataset.f; $$('#finSeg button').forEach(x => x.classList.toggle('active', x === b)); desenhar(); }));
  $$('[data-novo]', el).forEach(b => b.addEventListener('click', () => formLancamento({ tipo: b.dataset.novo })));
  $('#bCsvFin').addEventListener('click', () => baixarCsv('financeiro-' + S.finMes + '.csv',
    [['Data', 'Tipo', 'Categoria', 'Descrição', 'Cliente', 'Forma', 'Status', 'Vencimento', 'Valor']].concat(
      r.lancamentos.map(l => [fData(l.data), l.tipo, l.categoria, l.descricao, l.clienteNome, l.forma, l.status, l.vencimento ? fData(l.vencimento) : '', String(l.valor).replace('.', ',')]))));
  body.addEventListener('click', async e => {
    const pg = e.target.closest('[data-pagar]'), ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
    if (pg) {
      const l = r.lancamentos.find(x => x.id === pg.dataset.pagar);
      busy(pg, async () => { try { await call('fin.pagar', { id: l.id, forma: l.forma || (S.cfg.formasPagamento || [])[0] }); toast('Marcado como pago ✅'); render(); } catch (err) { erroToast(err); } });
    } else if (ed) formLancamento(r.lancamentos.find(x => x.id === ed.dataset.edit));
    else if (dl) {
      if (!(await confirmar('Excluir este lançamento?', { ok: 'Excluir', perigo: true }))) return;
      try { await call('fin.excluir', { id: dl.dataset.del }); toast('Lançamento excluído'); render(); } catch (err) { erroToast(err); }
    }
  });
};
function formLancamento(l) {
  l = l || {};
  const tipo0 = l.tipo || 'receita';
  const cats = t => t === 'despesa' ? S.cfg.categoriasDespesa : S.cfg.categoriasReceita;
  const m = modal({
    title: l.id ? 'Editar lançamento' : (tipo0 === 'despesa' ? 'Nova despesa' : 'Nova receita'),
    body: `<form id="fLan">
      <div class="seg" style="margin-bottom:14px" id="segTipo"><button type="button" data-t="receita" class="${tipo0 === 'receita' ? 'active' : ''}">Receita</button><button type="button" data-t="despesa" class="${tipo0 === 'despesa' ? 'active' : ''}">Despesa</button></div>
      <input type="hidden" name="tipo" value="${tipo0}">
      <label class="field"><span>Descrição</span><input name="descricao" value="${esc(l.descricao || '')}" placeholder="Ex.: Kit de pincéis, aluguel de novembro…"></label>
      <div class="grid-2">
        <label class="field"><span>Valor (R$) *</span><input name="valor" inputmode="decimal" value="${l.valor ? esc(String(l.valor).replace('.', ',')) : ''}"></label>
        <label class="field"><span>Data</span><input type="date" name="data" value="${esc(l.data || hoje())}"></label>
        <label class="field"><span>Categoria</span><select name="categoria" id="lanCat">${opts(cats(tipo0) || [], l.categoria)}</select></label>
        <label class="field"><span>Forma de pagamento</span><select name="forma"><option value="">—</option>${opts(S.cfg.formasPagamento || [], l.forma)}</select></label>
        <label class="field"><span>Status</span><select name="status" id="lanSt">${opts([{ v: 'pago', l: 'Pago / recebido' }, { v: 'pendente', l: 'Pendente' }], l.status || 'pago')}</select></label>
        <label class="field" id="lanVenc"><span>Vencimento</span><input type="date" name="vencimento" value="${esc(l.vencimento || l.data || hoje())}"></label>
      </div>
      ${l.id ? '' : `<label class="field"><span>Repetir nos próximos meses</span><select name="repetir">${opts([{ v: 0, l: 'Não repetir' }, { v: 2, l: '+2 meses' }, { v: 5, l: '+5 meses' }, { v: 11, l: '+11 meses (1 ano)' }], 0)}</select><small>Ideal para aluguel, internet, MEI… (cria como pendentes)</small></label>`}
    </form>`,
    foot: `${l.id ? `<button class="btn sm ghost danger left" data-del>${ico('trash')}Excluir</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" id="bLan">Salvar</button>`
  });
  const f = $('#fLan', m.el);
  const del = $('[data-del]', m.el);
  if (del) del.addEventListener('click', async () => {
    if (!(await confirmar('Excluir este lançamento?', { ok: 'Excluir', perigo: true }))) return;
    try { await call('fin.excluir', { id: l.id }); m.close(); toast('Lançamento excluído'); if (S.page === 'financeiro') render(); } catch (err) { erroToast(err); }
  });
  const vis = () => { $('#lanVenc', m.el).style.display = f.status.value === 'pendente' ? '' : 'none'; };
  f.status.addEventListener('change', vis); vis();
  $$('#segTipo button', m.el).forEach(b => b.addEventListener('click', () => {
    f.tipo.value = b.dataset.t; $$('#segTipo button', m.el).forEach(x => x.classList.toggle('active', x === b));
    $('#lanCat', m.el).innerHTML = opts(cats(b.dataset.t) || []);
  }));
  $('#bLan', m.el).addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData(f); d.valor = num(d.valor); d.id = l.id;
    try { await call('fin.salvar', d); m.close(); toast('Lançamento salvo 💰'); if (S.page === 'financeiro') render(); } catch (err) { erroToast(err); }
  }));
}
function baixarCsv(nome, linhas) {
  const csv = '﻿' + linhas.map(r => r.map(c => { const s = String(c == null ? '' : c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ------------------------- Relatórios ------------------------- */
function periodo(p) {
  const h = hoje(), ym = h.slice(0, 7);
  switch (p) {
    case 'mes': return [ym + '-01', h];
    case 'anterior': { const a = addMes(ym, -1); return [a + '-01', fimMes(a)]; }
    case '3m': return [addMes(ym, -2) + '-01', h];
    case '6m': return [addMes(ym, -5) + '-01', h];
    case 'ano': return [h.slice(0, 4) + '-01-01', h];
    default: return [S.relIni || ym + '-01', S.relFim || h];
  }
}
PAGES.relatorios = async el => {
  const [ini, fim] = periodo(S.relPeriodo);
  S.relIni = ini; S.relFim = fim;
  const r = await call('relatorio', { inicio: ini, fim });
  const x = r.resumo;
  const barra = (pct, cor) => `<div class="bar-cell"><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, pct)}%;background:${cor || cssVar('--s1')}"></div></div><span class="tiny muted num" style="width:42px;text-align:right">${pct}%</span></div>`;
  const dreLinhas = (itens, sinal) => itens.map(i => `<tr><td style="padding-left:24px">${esc(i.nome)}</td><td class="num">${sinal}${brl(i.valor)}</td><td class="num muted">${i.pct}%</td></tr>`).join('');
  const catItens = top6(r.categorias);
  const semMax = Math.max(1, ...r.diasSemana);

  el.innerHTML = `
    <div class="toolbar">
      <div class="seg" id="relSeg">${[['mes', 'Este mês'], ['anterior', 'Mês passado'], ['3m', '3 meses'], ['6m', '6 meses'], ['ano', 'Este ano'], ['custom', 'Período']].map(([k, l]) => `<button data-p="${k}" class="${S.relPeriodo === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div id="relCustom" style="display:${S.relPeriodo === 'custom' ? 'flex' : 'none'};gap:8px;align-items:center">
        <input type="date" id="rIni" value="${ini}" style="width:auto"><span class="muted">até</span><input type="date" id="rFim" value="${fim}" style="width:auto"><button class="btn sm primary" id="rOk">Aplicar</button></div>
      <div class="spacer"></div>
      <button class="btn" id="bCsvRel">${ico('download')}Exportar</button>
      <button class="btn" onclick="window.print()">${ico('printer')}Imprimir</button>
    </div>
    <p class="muted" style="margin:-4px 0 16px">Período: <b>${fData(ini)}</b> a <b>${fData(fim)}</b> · receitas e despesas pelo que foi efetivamente pago (regime de caixa)</p>
    <div class="kpis">
      <div class="card kpi hero"><div class="kpi-label">${ico('wallet')}Lucro líquido</div><div class="kpi-value">${brl(x.lucro)}</div><div class="kpi-foot">margem ${x.margem}%</div></div>
      <div class="card kpi"><div class="kpi-label">${ico('up')}Receitas</div><div class="kpi-value">${brl(x.receitas)}</div><div class="kpi-foot">a receber ${brl(x.aReceber)}</div></div>
      <div class="card kpi"><div class="kpi-label">${ico('down')}Despesas</div><div class="kpi-value">${brl(x.despesas)}</div><div class="kpi-foot">a pagar ${brl(x.aPagar)}</div></div>
      <div class="card kpi"><div class="kpi-label">${ico('heart')}Atendimentos</div><div class="kpi-value">${x.atendimentos}</div><div class="kpi-foot">${x.clientesAtendidas} clientes · ${x.novasClientes} novas</div></div>
      <div class="card kpi"><div class="kpi-label">${ico('receipt')}Ticket médio</div><div class="kpi-value">${brl(x.ticketMedio)}</div><div class="kpi-foot">serviços: ${brl(x.faturamentoServicos)}</div></div>
      <div class="card kpi"><div class="kpi-label">${ico('alert')}Faltas</div><div class="kpi-value">${x.taxaFaltas}%</div><div class="kpi-foot">${x.faltas} faltas · ${x.cancelamentos} cancel.</div></div>
    </div>
    <div class="grid cols-12">
      <div class="card span-12"><div class="card-head"><div><h3>Fluxo de caixa</h3><div class="sub">Receitas e despesas ${r.agrupadoPorMes ? 'por mês' : 'por dia'}</div></div>
        <div class="legend"><span><i style="background:${cssVar('--s1')}"></i>Receitas</span><span><i style="background:${cssVar('--s2')}"></i>Despesas</span></div></div>
        <div class="card-body"><div class="chart-box"><canvas id="chFluxo"></canvas></div></div></div>

      <div class="card span-6"><div class="card-head"><div><h3>DRE simplificada</h3><div class="sub">Demonstração do resultado</div></div></div>
        <div class="table-wrap"><table class="tbl"><tbody>
          <tr><td><b>(+) Receitas</b></td><td class="num"><b>${brl(x.receitas)}</b></td><td class="num muted">100%</td></tr>
          ${dreLinhas(r.receitasPorCategoria, '')}
          <tr><td><b>(−) Despesas</b></td><td class="num"><b>${brl(x.despesas)}</b></td><td class="num muted">${x.receitas ? Math.round(x.despesas / x.receitas * 100) : 0}%</td></tr>
          ${dreLinhas(r.despesasPorCategoria, '')}
          ${x.comissoes ? `<tr><td class="muted">Comissões calculadas da equipe (informativo)</td><td class="num muted">${brl(x.comissoes)}</td><td></td></tr>` : ''}
        </tbody><tfoot><tr><td>(=) Resultado</td><td class="num ${x.lucro < 0 ? 'neg' : 'pos'}">${brl(x.lucro)}</td><td class="num">${x.margem}%</td></tr></tfoot></table></div></div>

      <div class="card span-6"><div class="card-head"><div><h3>Faturamento por categoria</h3><div class="sub">Atendimentos concluídos</div></div></div>
        <div class="card-body">${catItens.length ? `<div class="chart-box sm"><canvas id="chCat"></canvas></div>${donutLegend(catItens)}` : '<div class="empty">Sem atendimentos concluídos no período.</div>'}</div></div>

      <div class="card span-12"><div class="card-head"><div><h3>Serviços</h3><div class="sub">Quantidade, faturamento e ticket médio por serviço</div></div></div>
        <div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Serviço</th><th>Categoria</th><th class="num">Qtd.</th><th class="num">Faturamento</th><th class="num">Ticket</th><th>Participação</th></tr></thead><tbody>
        ${r.servicos.length ? r.servicos.map(s => `<tr><td data-l="Serviço"><b>${esc(s.nome)}</b></td><td data-l="Categoria">${esc(s.categoria)}</td><td data-l="Qtd." class="num">${s.qtd}</td><td data-l="Faturamento" class="num">${brl(s.valor)}</td><td data-l="Ticket" class="num">${brl(s.ticket)}</td><td data-l="Part.">${barra(s.pct)}</td></tr>`).join('')
          : '<tr><td colspan="6"><div class="empty">Sem atendimentos concluídos no período.</div></td></tr>'}</tbody></table></div></div>

      <div class="card span-6"><div class="card-head"><div><h3>Equipe e comissões</h3><div class="sub">Calculado sobre os atendimentos concluídos</div></div></div>
        <div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Profissional</th><th class="num">Atend.</th><th class="num">Faturamento</th><th class="num">Comissão</th></tr></thead><tbody>
        ${r.equipe.length ? r.equipe.map(e => `<tr><td data-l="Profissional">${esc(e.nome)}</td><td data-l="Atend." class="num">${e.qtd}</td><td data-l="Faturamento" class="num">${brl(e.valor)}</td><td data-l="Comissão" class="num">${brl(e.comissao)} <span class="muted tiny">(${e.comissaoPct}%)</span></td></tr>`).join('')
          : '<tr><td colspan="4"><div class="empty">Sem dados.</div></td></tr>'}</tbody></table></div></div>

      <div class="card span-6"><div class="card-head"><div><h3>Formas de pagamento</h3><div class="sub">Receitas recebidas</div></div></div>
        <div class="table-wrap"><table class="tbl"><tbody>
        ${r.formasPagamento.length ? r.formasPagamento.map(f => `<tr><td>${esc(f.nome)}</td><td class="num">${brl(f.valor)}</td><td style="width:45%">${barra(f.pct, cssVar('--s2'))}</td></tr>`).join('') : '<tr><td><div class="empty">Sem receitas.</div></td></tr>'}
        </tbody></table></div></div>

      <div class="card span-6"><div class="card-head"><div><h3>🏆 Clientes que mais investiram</h3><div class="sub">Top 10 do período</div></div></div>
        <div class="table-wrap"><table class="tbl"><tbody>
        ${r.topClientes.length ? r.topClientes.map((c, i) => `<tr><td class="muted num" style="width:30px">${i + 1}º</td><td><b>${esc(c.nome)}</b><div class="tiny muted">${c.qtd} atendimento(s)</div></td><td class="num">${brl(c.valor)}</td></tr>`).join('') : '<tr><td><div class="empty">Sem dados.</div></td></tr>'}
        </tbody></table></div></div>

      <div class="card span-6"><div class="card-head"><div><h3>Dias mais movimentados</h3><div class="sub">Atendimentos concluídos por dia da semana</div></div></div>
        <div class="card-body"><div class="chart-box sm"><canvas id="chSemana"></canvas></div>
        <div class="tiny muted" style="margin-top:8px">Dia mais forte: <b>${r.diasSemana.some(Boolean) ? DIAS[r.diasSemana.indexOf(semMax)] : '—'}</b>${r.horarios.length ? ' · horário de pico: <b>' + r.horarios.slice().sort((a, b) => b.qtd - a.qtd)[0].hora + '</b>' : ''}</div></div></div>
    </div>`;

  barChart($('#chFluxo'), r.timeline.map(t => t.rotulo), [
    { label: 'Receitas', data: r.timeline.map(t => t.receitas), backgroundColor: cssVar('--s1'), maxBarThickness: r.timeline.length > 20 ? 10 : 26 },
    { label: 'Despesas', data: r.timeline.map(t => t.despesas), backgroundColor: cssVar('--s2'), maxBarThickness: r.timeline.length > 20 ? 10 : 26 }
  ]);
  if (catItens.length) donutChart($('#chCat'), catItens.map(c => c.nome), catItens.map(c => c.valor));
  barChart($('#chSemana'), DIAS_ABREV, [{ label: 'Atendimentos', data: r.diasSemana, backgroundColor: cssVar('--s1') }], { money: false });

  $$('#relSeg button').forEach(b => b.addEventListener('click', () => {
    S.relPeriodo = b.dataset.p;
    if (b.dataset.p === 'custom') { $$('#relSeg button').forEach(x => x.classList.toggle('active', x === b)); $('#relCustom').style.display = 'flex'; return; }
    render();
  }));
  $('#rOk').addEventListener('click', () => { S.relIni = $('#rIni').value; S.relFim = $('#rFim').value; S.relPeriodo = 'custom'; render(); });
  $('#bCsvRel').addEventListener('click', () => {
    const L = [['Relatório', S.cfg.studioNome], ['Período', fData(ini) + ' a ' + fData(fim)], [],
      ['RESUMO'], ['Receitas', x.receitas], ['Despesas', x.despesas], ['Lucro', x.lucro], ['Margem %', x.margem], ['Atendimentos', x.atendimentos], ['Ticket médio', x.ticketMedio], [],
      ['RECEITAS POR CATEGORIA', 'Valor', '%']].concat(r.receitasPorCategoria.map(i => [i.nome, i.valor, i.pct]), [[], ['DESPESAS POR CATEGORIA', 'Valor', '%']],
      r.despesasPorCategoria.map(i => [i.nome, i.valor, i.pct]), [[], ['SERVIÇO', 'Categoria', 'Qtd', 'Faturamento', 'Ticket']],
      r.servicos.map(s => [s.nome, s.categoria, s.qtd, s.valor, s.ticket]), [[], ['PROFISSIONAL', 'Atendimentos', 'Faturamento', 'Comissão']],
      r.equipe.map(e => [e.nome, e.qtd, e.valor, e.comissao]), [[], ['FORMA DE PAGAMENTO', 'Valor', '%']], r.formasPagamento.map(f => [f.nome, f.valor, f.pct]),
      [[], ['CLIENTE', 'Atendimentos', 'Valor']], r.topClientes.map(c => [c.nome, c.qtd, c.valor]));
    baixarCsv('relatorio-' + ini + '-a-' + fim + '.csv', L.map(l => l.map(v => typeof v === 'number' ? String(v).replace('.', ',') : v)));
  });
};

/* ------------------------- WhatsApp ------------------------- */
const TPL_INFO = {
  confirmacao: ['Confirmação do agendamento', 'Enviada assim que você agenda'],
  lembrete1: ['Lembrete 1', 'Ex.: 24h antes — pede para responder 1 ou 2'],
  lembrete2: ['Lembrete 2', 'Ex.: 2h antes'],
  pos: ['Pós-atendimento', 'Agradecimento algumas horas depois'],
  aniversario: ['Aniversário', 'No dia do aniversário'],
  respostaConfirmado: ['Resposta: confirmou (1)', 'Quando a cliente responde 1'],
  respostaRemarcar: ['Resposta: remarcar (2)', 'Quando a cliente responde 2'],
  reativacao: ['Reativação', 'Usada manualmente para clientes sumidas']
};
const VARS = ['nome', 'nomeCompleto', 'servico', 'data', 'hora', 'diaSemana', 'profissional', 'valor', 'studio', 'endereco', 'instagram', 'pix'];
PAGES.whatsapp = async el => {
  const [w, logs] = await Promise.all([call('wa.config'), call('wa.logs', { limite: 60 })]);
  const s = w.segredos, wa = w.wa;
  const sel = S.tplSel || 'lembrete1';
  const exemplo = { nome: 'Ana', nomeCompleto: 'Ana Souza', servico: 'Maquiagem social + Penteado', data: '12/12', hora: '14:30', diaSemana: 'sábado',
    profissional: 'Júlia', valor: 'R$ 340,00', studio: S.cfg.studioNome, endereco: S.cfg.endereco || 'Rua das Flores, 123', instagram: S.cfg.instagram || '@seustudio', pix: S.cfg.pix || '' };
  const sec = (k, label, ph) => `<label class="field"><span>${label}</span><input name="${k}" type="password" autocomplete="off" placeholder="${s[k + 'Salvo'] ? 'Salvo: ' + s[k + 'Salvo'] + ' — deixe vazio para manter' : (ph || '')}"></label>`;
  el.innerHTML = `
    <div class="grid cols-12">
      <div class="card span-7"><div class="card-head"><div><h3>Conexão com o WhatsApp</h3><div class="sub">Escolha o serviço de API que você usa</div></div>
        ${s.provedor ? '<span class="pill st-confirmado">Configurado</span>' : '<span class="pill st-faltou">Não configurado</span>'}</div>
        <div class="card-body"><form id="fWaProv">
          <label class="field"><span>Provedor</span><select name="provedor" id="waProv">${opts([{ v: '', l: 'Selecione…' }, { v: 'zapi', l: 'Z-API (z-api.io)' }, { v: 'evolution', l: 'Evolution API' }, { v: 'meta', l: 'WhatsApp Cloud API (Meta oficial)' }, { v: 'webhook', l: 'Webhook genérico (n8n, Make…)' }], s.provedor)}</select></label>
          <div data-prov="zapi"><div class="grid-2"><label class="field"><span>ID da instância</span><input name="zapiInstancia" value="${esc(s.zapiInstancia)}"></label>${sec('zapiToken', 'Token da instância')}</div>
            ${sec('zapiClientToken', 'Client-Token (Segurança da conta)', 'Opcional — se ativado no painel Z-API')}</div>
          <div data-prov="evolution"><label class="field"><span>URL do servidor</span><input name="evoUrl" placeholder="https://evolution.seudominio.com" value="${esc(s.evoUrl)}"></label>
            <div class="grid-2"><label class="field"><span>Nome da instância</span><input name="evoInstancia" value="${esc(s.evoInstancia)}"></label>${sec('evoApiKey', 'API Key')}</div></div>
          <div data-prov="meta"><div class="alert warn">${ico('alert')}<div>A API oficial só permite iniciar conversa com <b>templates aprovados</b> pela Meta. Informe o nome de cada template (variáveis na ordem: {{1}} nome, {{2}} data, {{3}} hora, {{4}} serviço).</div></div>
            <div class="grid-2"><label class="field"><span>Phone number ID</span><input name="metaPhoneId" value="${esc(s.metaPhoneId)}"></label>${sec('metaToken', 'Token de acesso permanente')}</div>
            <label class="field"><span>Templates aprovados (JSON)</span><textarea name="metaTemplates" rows="3" placeholder='{"lembrete1":"lembrete_horario","confirmacao":"confirmacao_horario"}'>${esc(JSON.stringify(s.metaTemplates || {}))}</textarea></label></div>
          <div data-prov="webhook"><label class="field"><span>URL que recebe {phone, message}</span><input name="webhookUrl" value="${esc(s.webhookUrl)}"></label>${sec('webhookAuth', 'Header Authorization (opcional)')}</div>
          <div class="actions-row"><button type="button" class="btn primary" id="bSalvarProv">Salvar conexão</button></div>
        </form>
        <div class="section-title">Testar envio</div>
        <div style="display:flex;gap:8px"><input id="waTesteTel" type="tel" placeholder="Seu WhatsApp com DDD" value="${esc(foneFmt(S.cfg.telefone || ''))}"><button class="btn wa" id="bTeste">${ico('send')}Enviar teste</button></div>
        </div></div>

      <div class="card span-5"><div class="card-head"><div><h3>Automações</h3><div class="sub">Rodam sozinhas a cada 15 minutos</div></div>
        ${w.gatilhoAtivo ? '<span class="pill st-confirmado">Gatilho ativo</span>' : '<span class="pill st-faltou">Gatilho inativo</span>'}</div>
        <div class="card-body"><form id="fWaAuto">
          <label class="switch"><input type="checkbox" name="ativo" ${wa.ativo ? 'checked' : ''}><span><b>Ligar mensagens automáticas</b></span></label>
          <hr style="border:0;border-top:1px solid var(--border);margin:6px 0 14px">
          <label class="switch"><input type="checkbox" name="confirmacao" ${wa.confirmacao ? 'checked' : ''}><span>Confirmação ao agendar</span></label>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><label class="switch" style="flex:1;margin:0"><input type="checkbox" name="lembrete1" ${wa.lembrete1 ? 'checked' : ''}><span>Lembrete 1</span></label>
            <input name="lembrete1Horas" type="number" min="1" max="96" value="${wa.lembrete1Horas}" style="width:72px;height:36px"><span class="muted tiny" style="width:52px">h antes</span></div>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><label class="switch" style="flex:1;margin:0"><input type="checkbox" name="lembrete2" ${wa.lembrete2 ? 'checked' : ''}><span>Lembrete 2</span></label>
            <input name="lembrete2Horas" type="number" min="1" max="24" value="${wa.lembrete2Horas}" style="width:72px;height:36px"><span class="muted tiny" style="width:52px">h antes</span></div>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><label class="switch" style="flex:1;margin:0"><input type="checkbox" name="pos" ${wa.pos ? 'checked' : ''}><span>Pós-atendimento</span></label>
            <input name="posHoras" type="number" min="1" max="47" value="${wa.posHoras}" style="width:72px;height:36px"><span class="muted tiny" style="width:52px">h depois</span></div>
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><label class="switch" style="flex:1;margin:0"><input type="checkbox" name="aniversario" ${wa.aniversario ? 'checked' : ''}><span>Feliz aniversário</span></label>
            <input name="aniversarioHora" type="number" min="6" max="20" value="${wa.aniversarioHora}" style="width:72px;height:36px"><span class="muted tiny" style="width:52px">horas</span></div>
          <label class="switch"><input type="checkbox" name="respostasAuto" ${wa.respostasAuto ? 'checked' : ''}><span>Ler respostas (1 = confirma, 2 = remarcar)</span></label>
          <div style="display:flex;gap:8px;align-items:center" class="tiny muted">Não enviar entre <input name="silencioInicio" type="number" min="0" max="23" value="${wa.silencioInicio}" style="width:66px">h e <input name="silencioFim" type="number" min="0" max="23" value="${wa.silencioFim}" style="width:66px">h</div>
          <div class="actions-row" style="margin-top:14px"><button type="button" class="btn primary" id="bSalvarAuto">Salvar automações</button><button type="button" class="btn" id="bProcessar">${ico('refresh')}Rodar agora</button></div>
        </form></div></div>

      <div class="card span-7"><div class="card-head"><div><h3>Modelos de mensagem</h3><div class="sub">Clique numa variável para inserir</div></div>
        <select id="tplSel" style="width:auto">${opts(Object.keys(TPL_INFO).map(k => ({ v: k, l: TPL_INFO[k][0] })), sel)}</select></div>
        <div class="card-body"><div class="muted tiny" id="tplDesc" style="margin-bottom:8px"></div>
          <textarea id="tplTxt" rows="8"></textarea>
          <div class="chips" style="margin:10px 0 14px;gap:6px">${VARS.map(v => `<button type="button" class="var-chip" data-var="${v}">{${v}}</button>`).join('')}</div>
          <div class="wa-preview"><div class="wa-bubble" id="tplPrev"></div></div>
          <div class="actions-row" style="margin-top:14px"><button class="btn primary" id="bSalvarTpl">Salvar modelos</button><button class="btn ghost" id="bResetTpl">Restaurar padrão deste modelo</button></div>
        </div></div>

      <div class="card span-5"><div class="card-head"><div><h3>Receber respostas</h3><div class="sub">Para a cliente confirmar respondendo “1”</div></div></div>
        <div class="card-body"><p class="muted" style="margin-top:0">Cole este endereço no painel do seu provedor como <b>webhook de mensagens recebidas</b> (Z-API: “Ao receber”; Evolution: evento MESSAGES_UPSERT):</p>
          <div class="code" id="whUrl">${esc(w.webhookUrl)}</div>
          <button class="btn sm" style="margin-top:10px" id="bCopiarWh">Copiar endereço</button>
          <p class="tiny muted">Este link contém uma chave secreta. Não compartilhe publicamente.</p></div></div>

      <div class="card span-12"><div class="card-head"><div><h3>Histórico de mensagens</h3><div class="sub">Últimas 60</div></div></div>
        <div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Mensagem</th><th>Status</th></tr></thead><tbody>
        ${logs.length ? logs.map(l => `<tr><td data-l="Data" class="nowrap">${fDataHora(l.data)}</td><td data-l="Cliente">${esc(l.clienteNome || foneFmt(l.telefone))}</td><td data-l="Tipo">${esc(l.tipo)} ${l.direcao === 'recebida' ? '⬅️' : ''}</td>
          <td data-l="Mensagem" title="${esc(l.detalhe)}"><div style="max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.mensagem)}</div></td><td data-l="Status">${pill(l.status)}</td></tr>`).join('')
          : '<tr><td colspan="5"><div class="empty">Nenhuma mensagem ainda.</div></td></tr>'}</tbody></table></div></div>
    </div>`;

  const provSel = $('#waProv');
  const provVis = () => $$('[data-prov]').forEach(d => d.style.display = d.dataset.prov === provSel.value ? '' : 'none');
  provSel.addEventListener('change', provVis); provVis();
  $('#bSalvarProv').addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData($('#fWaProv'));
    if (d.provedor === 'meta') { try { d.metaTemplates = JSON.parse(d.metaTemplates || '{}'); } catch (err) { return toast('JSON de templates inválido.', 'err'); } }
    try { await call('wa.salvarConfig', { segredos: d }); toast('Conexão salva 🔐'); await recarregarCadastros(); render(); } catch (err) { erroToast(err); }
  }));
  $('#bTeste').addEventListener('click', e => busy(e.currentTarget, async () => {
    try { await call('wa.testar', { telefone: $('#waTesteTel').value }); toast('Mensagem de teste enviada! Confira seu WhatsApp ✅'); } catch (err) { erroToast(err); }
  }));
  $('#bSalvarAuto').addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData($('#fWaAuto'));
    try { await call('wa.salvarConfig', { wa: d }); toast('Automações salvas ⏰'); await recarregarCadastros(); render(); } catch (err) { erroToast(err); }
  }));
  $('#bProcessar').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const r = await call('wa.processar');
      if (r.inativo) toast('Ligue as automações e configure o provedor primeiro.', 'err');
      else if (r.silencio) toast('Agora é horário de silêncio — nada foi enviado.', 'err');
      else toast(`${r.enviadas} enviada(s) · ${r.erros} erro(s)`);
      if (r.enviadas) render();
    } catch (err) { erroToast(err); }
  }));
  // Templates
  const tpls = Object.assign({}, w.templates);
  const txt = $('#tplTxt'), tsel = $('#tplSel');
  const mostrar = () => { S.tplSel = tsel.value; txt.value = tpls[tsel.value] || ''; $('#tplDesc').textContent = TPL_INFO[tsel.value][1]; prev(); };
  const prev = () => { $('#tplPrev').textContent = renderTpl(txt.value, exemplo).replace(/\*(.+?)\*/g, '$1'); };
  tsel.addEventListener('change', mostrar);
  txt.addEventListener('input', () => { tpls[tsel.value] = txt.value; prev(); });
  $$('[data-var]').forEach(b => b.addEventListener('click', () => {
    const v = '{' + b.dataset.var + '}', i = txt.selectionStart || txt.value.length;
    txt.value = txt.value.slice(0, i) + v + txt.value.slice(txt.selectionEnd || i); tpls[tsel.value] = txt.value; txt.focus(); txt.selectionStart = txt.selectionEnd = i + v.length; prev();
  }));
  $('#bSalvarTpl').addEventListener('click', e => busy(e.currentTarget, async () => {
    try { await call('wa.salvarConfig', { templates: tpls }); toast('Modelos salvos 💬'); await recarregarCadastros(); } catch (err) { erroToast(err); }
  }));
  $('#bResetTpl').addEventListener('click', () => { tpls[tsel.value] = ''; txt.value = ''; prev(); toast('Salve para restaurar o texto padrão.'); });
  mostrar();
  $('#bCopiarWh').addEventListener('click', () => {
    const t = $('#whUrl').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copiado!')).catch(() => {
      const r = document.createRange(); r.selectNodeContents($('#whUrl')); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); toast('Selecionado — use Ctrl+C');
    });
  });
};

/* ------------------------- Configurações ------------------------- */
PAGES.config = async el => {
  const [full, usuarios] = await Promise.all([call('cfg.obter'), call('usuarios.listar')]);
  const c = full.cfg;
  const lista = arr => esc((arr || []).join('\n'));
  el.innerHTML = `
    <div class="grid cols-12">
      <div class="card span-6"><div class="card-head"><h3>Dados do studio</h3></div><div class="card-body"><form id="fStudio">
        <label class="field"><span>Nome do studio</span><input name="studioNome" value="${esc(c.studioNome)}"></label>
        <div class="grid-2"><label class="field"><span>Responsável</span><input name="responsavel" value="${esc(c.responsavel)}"></label>
        <label class="field"><span>WhatsApp do studio</span><input name="telefone" type="tel" value="${esc(c.telefone)}"></label></div>
        <label class="field"><span>Endereço</span><input name="endereco" value="${esc(c.endereco)}" placeholder="Rua, número – bairro, cidade"></label>
        <div class="grid-2"><label class="field"><span>Instagram</span><input name="instagram" value="${esc(c.instagram)}" placeholder="@seustudio"></label>
        <label class="field"><span>Chave Pix</span><input name="pix" value="${esc(c.pix)}"></label></div>
        <button type="button" class="btn primary" data-salvar="fStudio">Salvar</button></form></div></div>

      <div class="card span-6"><div class="card-head"><div><h3>Google Agenda</h3><div class="sub">Tudo que você marca no CRM vai para a agenda</div></div></div><div class="card-body">
        <div class="alert info">${ico('calendar')}<div>A ligação com o Google Agenda chega na <b>fase 3</b> da versão nova. Até lá, a agenda funciona normalmente aqui dentro do CRM.</div></div></div></div>

      <div class="card span-6"><div class="card-head"><h3>Agenda e funcionamento</h3></div><div class="card-body"><form id="fHor">
        <div class="grid-2"><label class="field"><span>Abre às</span><input type="time" name="horaAbertura" value="${esc(c.horaAbertura)}"></label>
        <label class="field"><span>Fecha às</span><input type="time" name="horaFechamento" value="${esc(c.horaFechamento)}"></label>
        <label class="field"><span>Intervalo da agenda (min)</span><select name="intervaloAgenda">${opts([{ v: 5, l: '5 min' }, { v: 10, l: '10 min' }, { v: 15, l: '15 min' }, { v: 30, l: '30 min' }], c.intervaloAgenda)}</select></label>
        <label class="field"><span>Cliente “sumida” após (dias)</span><input type="number" name="diasInativa" min="15" value="${esc(c.diasInativa)}"></label></div>
        <label class="switch"><input type="checkbox" name="sinalRetido" ${c.sinalRetido !== false ? 'checked' : ''}><span>O <b>sinal não é devolvido</b>: se a cliente cancelar ou faltar, ele fica no caixa</span></label>
        <button type="button" class="btn primary" data-salvar="fHor">Salvar</button></form></div></div>

      <div class="card span-6"><div class="card-head"><div><h3>Listas</h3><div class="sub">Uma opção por linha</div></div></div><div class="card-body"><form id="fListas">
        <div class="grid-2"><label class="field"><span>Categorias de serviço</span><textarea name="categoriasServico" rows="5">${lista(c.categoriasServico)}</textarea></label>
        <label class="field"><span>Formas de pagamento</span><textarea name="formasPagamento" rows="5">${lista(c.formasPagamento)}</textarea></label>
        <label class="field"><span>Categorias de receita</span><textarea name="categoriasReceita" rows="5">${lista(c.categoriasReceita)}</textarea></label>
        <label class="field"><span>Categorias de despesa</span><textarea name="categoriasDespesa" rows="5">${lista(c.categoriasDespesa)}</textarea></label></div>
        <label class="field"><span>Locais de atendimento</span><textarea name="locais" rows="3">${lista(c.locais)}</textarea></label>
        <button type="button" class="btn primary" data-salvar="fListas">Salvar</button></form></div></div>

      <div class="card span-7"><div class="card-head"><div><h3>Usuários do portal</h3><div class="sub">Equipe vê agenda e clientes; administradora vê tudo</div></div><button class="btn sm primary" id="bNovoUsr">${ico('userPlus')}Novo usuário</button></div>
        <div class="card-body"><div class="list">${usuarios.map(u => `<div class="list-item" data-usr="${u.id}" style="cursor:pointer">
          <div class="avatar">${esc(iniciais(u.nome))}</div><div class="grow"><div class="title">${esc(u.nome)} ${u.id === S.user.id ? '<span class="tag">você</span>' : ''}</div>
          <div class="sub">${esc(u.email)} · ${u.perfil === 'admin' ? 'Administradora' : 'Equipe'}${u.ultimoAcesso ? ' · último acesso ' + fDataHora(u.ultimoAcesso) : ''}</div></div>
          ${u.ativo === 'nao' ? '<span class="tag">bloqueado</span>' : ''}<span class="icon-btn sm">${ico('edit')}</span></div>`).join('')}</div></div></div>

      <div class="card span-5"><div class="card-head"><h3>Minha senha</h3></div><div class="card-body"><form id="fMinhaSenha">
        <label class="field"><span>Senha atual</span><input type="password" name="atual" autocomplete="current-password"></label>
        <label class="field"><span>Nova senha</span><input type="password" name="nova" autocomplete="new-password"><small>Mínimo 8 caracteres, com letras e números</small></label>
        <button type="button" class="btn primary" id="bMinhaSenha">${ico('lock')}Alterar senha</button></form>
        <div class="section-title">Seus dados</div>
        <p class="muted tiny" style="margin:0 0 10px">Tudo fica salvo no seu banco de dados do Supabase (servidor em São Paulo), com acesso protegido por login.</p>
        ${full.planilhaUrl ? `<a class="btn sm" target="_blank" href="${esc(full.planilhaUrl)}">${ico('external')}Abrir planilha de dados</a>` : ''}
        <p class="tiny muted">Versão ${esc(full.versao)}</p></div></div>
    </div>`;

  $$('[data-salvar]', el).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    const d = formData($('#' + b.dataset.salvar));
    const trocouAgenda = false;
    try {
      S.cfg = await call('cfg.salvar', d);
      $('#brandName').textContent = S.cfg.studioNome;
      if (trocouAgenda) { toast('Agenda conectada! ✅ Agora clique em “Reenviar horários futuros”.'); render(); }
      else toast('Configurações salvas ✨');
    } catch (err) { erroToast(err); }
  })));
  $('#bMinhaSenha').addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData($('#fMinhaSenha'));
    try { await alterarSenha(d.atual, d.nova, d.nova); $('#fMinhaSenha').reset(); toast('Senha alterada 🔐'); } catch (err) { erroToast(err); }
  }));
  $('#bNovoUsr').addEventListener('click', () => formUsuario({}));
  $$('[data-usr]', el).forEach(x => x.addEventListener('click', () => formUsuario(usuarios.find(u => u.id === x.dataset.usr))));
};
function formUsuario(u) {
  const m = modal({
    title: u.id ? 'Editar usuário' : 'Novo usuário',
    body: `<form id="fUsr"><label class="field"><span>Nome</span><input name="nome" value="${esc(u.nome || '')}"></label>
      <div class="grid-2"><label class="field"><span>E-mail (login)</span><input name="email" type="email" autocapitalize="none" spellcheck="false" value="${esc(u.email || '')}"></label>
      <label class="field"><span>Perfil</span><select name="perfil">${opts([{ v: 'equipe', l: 'Equipe (agenda e clientes)' }, { v: 'admin', l: 'Administradora (tudo)' }], u.perfil || 'equipe')}</select></label></div>
      <label class="field"><span>${u.id ? 'Nova senha (deixe vazio para manter)' : 'Senha provisória'}</span><input name="senha" type="password" autocomplete="new-password"><small>A pessoa troca no primeiro acesso.</small></label>
      ${u.id ? `<label class="switch"><input type="checkbox" name="ativoChk" ${u.ativo !== 'nao' ? 'checked' : ''}><span>Acesso liberado</span></label>` : ''}</form>`,
    foot: `${u.id && u.id !== S.user.id ? `<button class="btn sm ghost danger left" data-del>${ico('trash')}Excluir</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" id="bUsr">Salvar</button>`
  });
  $('#bUsr', m.el).addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData($('#fUsr', m.el)); d.id = u.id; d.ativo = d.ativoChk === false ? 'nao' : 'sim';
    try { await call('usuarios.salvar', d); m.close(); toast('Usuário salvo'); render(); } catch (err) { erroToast(err); }
  }));
  const del = $('[data-del]', m.el);
  if (del) del.addEventListener('click', async () => {
    if (!(await confirmar('Excluir este usuário?', { ok: 'Excluir', perigo: true }))) return;
    try { await call('usuarios.excluir', { id: u.id }); m.close(); toast('Usuário excluído'); render(); } catch (err) { erroToast(err); }
  });
}


/* ------------------------- Importar do Google Agenda ------------------------- */
async function importarGoogle() {
  const hj = hoje();
  const m = modal({
    title: 'Importar do Google Agenda', wide: true,
    body: `<div class="alert info">${ico('calendar')}<div>Traz para o CRM os horários que já estão no seu Google Agenda. <b>Nada é duplicado</b>: o mesmo evento passa a ser controlado pelo CRM (lembretes, financeiro, histórico da cliente).</div></div>
      <div class="chips" id="impPer" style="margin-bottom:12px">
        <button type="button" class="chip" data-per="-365,0">Último ano (histórico)</button>
        <button type="button" class="chip" data-per="ano">Este ano</button>
        <button type="button" class="chip on" data-per="-30,180">Próximos meses</button>
      </div>
      <div class="grid-3" style="align-items:end">
        <label class="field"><span>De</span><input type="date" id="impIni" value="${addDias(hj, -30)}"></label>
        <label class="field"><span>Até</span><input type="date" id="impFim" value="${addDias(hj, 180)}"></label>
        <div class="field"><button class="btn primary" id="impBuscar">${ico('search')}Buscar eventos</button></div>
      </div>
      <label class="switch"><input type="checkbox" id="impLancar" checked><span>Lançar no financeiro os atendimentos que <b>já passaram</b> (como recebidos)</span></label>
      <p class="muted tiny" style="margin:-6px 0 12px">Assim os gráficos de faturamento mostram o histórico. Os eventos antigos não são alterados no Google Agenda.</p>
      <div id="impLista"></div>`,
    foot: `<label class="switch left" style="margin:0"><input type="checkbox" id="impRenomear" checked><span class="tiny">Padronizar o título no Google Agenda</span></label>
      <button class="btn" data-close>Fechar</button><button class="btn primary" id="impOk" disabled>Importar</button>`
  });
  const lista = $('#impLista', m.el), btnOk = $('#impOk', m.el);
  let eventos = [];
  const clientesOrd = S.clientes.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const servAtivos = S.servicos.filter(s => s.ativo !== 'nao');
  const selecionados = () => $$('.imp-item', lista).filter(r => $('[data-sel]', r).checked);
  const contar = () => { const n = selecionados().length; btnOk.disabled = !n; btnOk.textContent = n ? `Importar ${n}` : 'Importar'; };

  const chipsServ = ev => ev.sel.map(id => { const s = S.servicos.find(x => x.id === id); return s ? `<span class="chip-mini"><span class="dot" style="background:${esc(s.cor)}"></span>${esc(s.nome)}<button type="button" data-rm="${id}" aria-label="Tirar">×</button></span>` : ''; }).join('')
    + `<select data-add><option value="">${ev.sel.length ? '+ outro serviço' : 'Escolha o serviço…'}</option>${servAtivos.filter(s => !ev.sel.includes(s.id)).map(s => `<option value="${s.id}">${esc(s.nome)} · ${brl(s.preco)}</option>`).join('')}</select>`;
  const valorPadrao = ev => { const t = ev.sel.reduce((v, id) => v + num((S.servicos.find(x => x.id === id) || {}).preco), 0); return t ? 'Valor (' + brl(t) + ')' : 'Valor'; };
  const redesenharServ = row => { const ev = eventos[Number(row.dataset.i)]; $('[data-srvs]', row).innerHTML = chipsServ(ev); $('[data-valor]', row).placeholder = valorPadrao(ev); };
  function linha(ev, i) {
    const passado = ev.fim.slice(0, 16) <= (hoje() + 'T' + pad(new Date().getHours()) + ':' + pad(new Date().getMinutes()));
    const cliOpts = `<option value="__novo" ${ev.clienteId ? '' : 'selected'}>+ Nova cliente</option>` +
      clientesOrd.map(c => `<option value="${c.id}" ${c.id === ev.clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
    ev.sel = (ev.servicoIds || []).slice();
    return `<div class="imp-item ${ev.provavel ? '' : 'off'}" data-i="${i}">
      <label class="imp-top"><input type="checkbox" data-sel ${ev.provavel ? 'checked' : ''} ${ev.recorrente ? 'disabled' : ''}>
        <div class="grow"><b style="text-transform:capitalize">${DIAS_ABREV[new Date(ev.inicio.slice(0, 10) + 'T12:00').getDay()]} ${fDataCurta(ev.inicio)} · ${fHora(ev.inicio)}–${fHora(ev.fim)}</b>
          <div class="muted" style="font-size:13px">${esc(ev.titulo || '(sem título)')}</div>
          ${ev.recorrente ? '<span class="tag">evento que se repete — importe pelo CRM</span>' : !ev.provavel ? '<span class="tag tag-pessoal">parece compromisso pessoal</span>' : ''}
          ${passado && !ev.recorrente ? '<span class="tag">já passou · entra como concluído</span>' : ''}</div></label>
      <div class="imp-campos">
        <select data-cli>${cliOpts}</select>
        <div class="imp-srvs" data-srvs>${chipsServ(ev)}</div>
        <input data-valor inputmode="decimal" placeholder="${valorPadrao(ev)}" value="${ev.valor != null ? esc(String(ev.valor).replace('.', ',')) : ''}">
        <div class="imp-novo ${ev.clienteId ? 'hidden' : ''}">
          <input data-nnome placeholder="Nome da nova cliente" value="${esc(ev.nomeNovo || '')}">
          <input data-ntel type="tel" inputmode="tel" placeholder="WhatsApp (opcional)" value="${esc(foneFmt(ev.telefone || ''))}">
        </div>
      </div></div>`;
  }

  $('#impBuscar', m.el).addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const r = await call('agenda.importarPrevia', { inicio: $('#impIni', m.el).value, fim: $('#impFim', m.el).value });
      eventos = r.eventos;
      if (!eventos.length) { lista.innerHTML = `<div class="empty"><div class="big">🗓️</div>Nenhum evento novo nesse período na agenda “${esc(r.agenda)}”.</div>`; contar(); return; }
      const prov = eventos.filter(x => x.provavel).length;
      lista.innerHTML = `<div class="imp-resumo"><span><b>${eventos.length}</b> evento(s) em “${esc(r.agenda)}” · <b>${prov}</b> parecem atendimentos</span>
          <span><button class="btn sm ghost" data-todos="1">Marcar todos</button><button class="btn sm ghost" data-todos="0">Desmarcar</button></span></div>
        <p class="muted tiny" style="margin:0 0 10px">Confira a cliente e o serviço de cada um. Os que não estiverem marcados ficam como compromisso pessoal. A mesma cliente em vários eventos é cadastrada uma vez só.</p>
        <div class="imp-massa"><span class="tiny muted">Serviço para os marcados que estão sem serviço:</span>
          <select id="impMassa"><option value="">Escolher…</option>${servAtivos.map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</select></div>`
        + eventos.map(linha).join('') + (r.total > eventos.length ? `<p class="muted tiny">Mostrando os primeiros ${eventos.length} de ${r.total}. Diminua o período para ver o resto.</p>` : '');
      contar();
    } catch (err) { erroToast(err); }
  }));

  $$('#impPer [data-per]', m.el).forEach(b => b.addEventListener('click', () => {
    $$('#impPer [data-per]', m.el).forEach(x => x.classList.toggle('on', x === b));
    if (b.dataset.per === 'ano') { $('#impIni', m.el).value = hj.slice(0, 4) + '-01-01'; $('#impFim', m.el).value = hj; }
    else { const [a, z] = b.dataset.per.split(',').map(Number); $('#impIni', m.el).value = addDias(hj, a); $('#impFim', m.el).value = addDias(hj, z); }
  }));
  lista.addEventListener('change', e => {
    if (e.target.id === 'impMassa' && e.target.value) {
      let n = 0;
      selecionados().forEach(r => { const ev = eventos[Number(r.dataset.i)]; if (!ev.sel.length) { ev.sel.push(e.target.value); redesenharServ(r); n++; } });
      toast(n ? `Serviço aplicado em ${n} evento(s)` : 'Todos os marcados já têm serviço');
      e.target.value = '';
      return;
    }
    const row = e.target.closest('.imp-item'); if (!row) return;
    if (e.target.matches('[data-sel]')) { row.classList.toggle('off', !e.target.checked); contar(); }
    if (e.target.matches('[data-cli]')) $('.imp-novo', row).classList.toggle('hidden', e.target.value !== '__novo');
    if (e.target.matches('[data-add]') && e.target.value) {
      eventos[Number(row.dataset.i)].sel.push(e.target.value);
      redesenharServ(row);
    }
  });
  lista.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { const row = rm.closest('.imp-item'); const ev = eventos[Number(row.dataset.i)]; ev.sel = ev.sel.filter(id => id !== rm.dataset.rm); redesenharServ(row); return; }
    const b = e.target.closest('[data-todos]'); if (!b) return;
    $$('.imp-item', lista).forEach(r => { const cb = $('[data-sel]', r); if (cb.disabled) return; cb.checked = b.dataset.todos === '1'; r.classList.toggle('off', !cb.checked); });
    contar();
  });

  btnOk.addEventListener('click', () => busy(btnOk, async () => {
    const itens = [];
    for (const r of selecionados()) {
      const ev = eventos[Number(r.dataset.i)];
      const cli = $('[data-cli]', r).value, valor = $('[data-valor]', r).value;
      if (!ev.sel.length) { r.scrollIntoView({ block: 'center' }); return toast('Escolha o serviço de “' + (ev.titulo || 'sem título') + '”.', 'err'); }
      const it = { eventId: ev.eventId, servicoIds: ev.sel.slice(), valor: valor === '' ? null : num(valor) };
      if (cli === '__novo') {
        const nome = $('[data-nnome]', r).value.trim();
        if (!nome) { r.scrollIntoView({ block: 'center' }); return toast('Digite o nome da cliente de “' + (ev.titulo || 'sem título') + '”.', 'err'); }
        it.novaCliente = { nome, telefone: $('[data-ntel]', r).value };
      } else it.clienteId = cli;
      itens.push(it);
    }
    const renomear = $('#impRenomear', m.el).checked, lancarPassados = $('#impLancar', m.el).checked;
    const tot = { importados: 0, clientesNovas: 0, erros: [] };
    for (let i = 0; i < itens.length; i += 20) {
      btnOk.innerHTML = `<span class="spinner sm"></span> ${Math.min(i + 20, itens.length)}/${itens.length}`;
      try {
        const r = await call('agenda.importar', { itens: itens.slice(i, i + 20), renomear, lancarPassados });
        tot.importados += r.importados; tot.clientesNovas += r.clientesNovas; tot.lancados = (tot.lancados || 0) + (r.lancados || 0); tot.erros = tot.erros.concat(r.erros);
      } catch (err) { erroToast(err); break; }
    }
    await recarregarCadastros();
    RC.limpar();
    m.close();
    toast(`${tot.importados} atendimento(s) importado(s)${tot.clientesNovas ? ` · ${tot.clientesNovas} cliente(s) nova(s)` : ''}${tot.lancados ? ` · ${tot.lancados} lançado(s) no financeiro` : ''} ✅`);
    if (tot.erros.length) setTimeout(() => toast(`${tot.erros.length} não foram importados: ${tot.erros.slice(0, 3).map(x => x.erro).join('; ')}`, 'err'), 600);
    render();
  }));
}

/* ------------------------- Início ------------------------- */
window.addEventListener('DOMContentLoaded', iniciar);
if (document.readyState !== 'loading') iniciar();
})();
