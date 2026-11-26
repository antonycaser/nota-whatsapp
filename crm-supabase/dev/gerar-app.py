"""
Gera o aplicativo da versão Supabase (crm-supabase/app/) a partir das telas
da versão atual (crm-studio/apps-script/). Troca só o que muda:
  - conversa com o servidor: função "api" do Supabase (em vez do google.script.run);
  - login com e-mail e senha do Supabase (fica salvo no aparelho, renova sozinho);
  - troca e recuperação de senha pelo Supabase;
  - usuários identificados pelo e-mail;
  - Google Agenda pelo botão "Conectar Google Agenda" (fase 3);
  - esconde o WhatsApp automático até a fase 4.

  python3 crm-supabase/dev/gerar-app.py
"""
import os, re, shutil

AQUI = os.path.dirname(os.path.abspath(__file__))
ORIG = os.path.join(AQUI, '..', '..', 'crm-studio', 'apps-script')
PORTAL = os.path.join(AQUI, '..', '..', 'crm-studio', 'portal')
SAIDA = os.path.join(AQUI, '..', 'app')
ler = lambda f: open(os.path.join(ORIG, f), encoding='utf-8').read()


def trocar(s, pares, nome):
    for a, b in pares:
        n = s.count(a)
        assert n == 1, f'{nome}: trecho encontrado {n}x (esperado 1): {a[:90]!r}'
        s = s.replace(a, b)
    return s


def sem_tag(s, tag):
    s = s.strip()
    assert s.startswith(f'<{tag}>') and s.endswith(f'</{tag}>'), tag
    return s[len(tag) + 2:-(len(tag) + 3)].strip() + '\n'


# ============================== app.js ==============================
js = sem_tag(ler('Scripts.html'), 'script')

# 1) servidor: função "api" do Supabase
ini = js.index('function rpc(fn, ...args) {')
fim = js.index('/* Guarda a última resposta')
js = js[:ini] + r"""const CFG_SB = window.CRM_CONFIG || {};
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
""" + js[fim:]

js = trocar(js, [
("""async function call(action, payload) {
  try { return await rpc('api', S.token, action, payload || {}); }
  catch (e) { if (e.auth) sessaoExpirada(e.message); throw e; }
}""",
"""async function call(action, payload) {
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
}"""),
], 'call')

# 2) login, sessão e senha
ini = js.index('/* Ponte com o portal (página do Netlify)')
fim = js.index('/* ------------------------- Navegação ------------------------- */')
js = js[:ini] + r"""function esquecerToken() {
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
""" + js[js.index('async function carregar() {'):js.index('function trocarSenhaObrigatoria() {')] + r"""/** Confere a senha atual e grava a nova no Supabase Auth. */
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

""" + js[fim:]

# 3) recursos das próximas fases (WhatsApp) escondidos
recurso = "(n.id !== 'whatsapp' || !S.cfg.recursos || S.cfg.recursos.whatsapp)"
js = trocar(js, [
("  const itens = NAV.filter(n => !n.admin || isAdmin());", f"  const itens = NAV.filter(n => (!n.admin || isAdmin()) && {recurso});"),
("  const itens = NAV.filter(n => (!n.admin || isAdmin()) && !['dashboard', 'agenda', 'clientes'].includes(n.id));",
 f"  const itens = NAV.filter(n => (!n.admin || isAdmin()) && {recurso} && !['dashboard', 'agenda', 'clientes'].includes(n.id));"),
("  if (!S.cfg.waAtivo && isAdmin()) alertas.push(", "  if (!S.cfg.waAtivo && isAdmin() && (!S.cfg.recursos || S.cfg.recursos.whatsapp)) alertas.push("),
], 'recursos')

# 4) Configurações: Google Agenda (conectar pela conta Google), senha e usuários por e-mail
ini = js.index('      <div class="card span-6"><div class="card-head"><div><h3>Google Agenda</h3>')
fim = js.index('      <div class="card span-6"><div class="card-head"><h3>Agenda e funcionamento</h3>')
js = js[:ini] + """      <div class="card span-6"><div class="card-head"><div><h3>Google Agenda</h3><div class="sub">O que você marca no CRM vai para a agenda — e o que muda lá volta para cá</div></div></div><div class="card-body" id="gBox"><div class="muted tiny">Carregando…</div></div></div>

""" + js[fim:]
ini = js.index("  const calSel = $('#calSel');")
fim = js.index("  $$('[data-salvar]', el).forEach(b => b.addEventListener('click', () => busy(b, async () => {")
js = js[:ini] + js[fim:]
js = trocar(js, [
("""    const trocouAgenda = b.dataset.salvar === 'fCal' && (d.calendarId === '__outra' ? d.calendarIdOutra.trim() : d.calendarId) !== c.calendarId;
    if (d.calendarId === '__outra') {
      d.calendarId = String(d.calendarIdOutra || '').trim();
      if (!d.calendarId) return toast('Digite o e-mail da outra conta.', 'err');
    }
    delete d.calendarIdOutra;
""", """    const trocouAgenda = false;
"""),
("""  $('#bImportar').addEventListener('click', () => importarGoogle());
  $('#bResync').addEventListener('click', e => busy(e.currentTarget, async () => {
    try { const r = await call('agenda.ressincronizar'); toast(`${r.sincronizados} horário(s) enviados ao Google Agenda${r.erros ? ' · ' + r.erros + ' erro(s)' : ''}`); } catch (err) { erroToast(err); }
  }));
""", """  montarGoogle();
"""),
("""    try { S.user = await call('auth.alterarSenha', d); $('#fMinhaSenha').reset(); toast('Senha alterada 🔐'); } catch (err) { erroToast(err); }""",
 """    try { await alterarSenha(d.atual, d.nova, d.nova); $('#fMinhaSenha').reset(); toast('Senha alterada 🔐'); } catch (err) { erroToast(err); }"""),
("""Tudo fica salvo numa planilha Google na sua conta — você pode abrir, filtrar e fazer backup quando quiser.""",
 """Tudo fica salvo no seu banco de dados do Supabase (servidor em São Paulo), com acesso protegido por login."""),
("""<div class="sub">@${esc(u.usuario)} · """, """<div class="sub">${esc(u.email)} · """),
("""<label class="field"><span>Usuário (login)</span><input name="usuario" autocapitalize="none" value="${esc(u.usuario || '')}"></label>""",
 """<label class="field"><span>E-mail (login)</span><input name="email" type="email" autocapitalize="none" spellcheck="false" value="${esc(u.email || '')}"></label>"""),
], 'config')

# 5) Google Agenda: cartão de conexão e retorno da autorização
js = js.replace("\nwindow.addEventListener('DOMContentLoaded', iniciar);", r"""
/* ---------- Google Agenda (conecta pela conta Google, sem digitar e-mail) ---------- */
const VOLTA_GOOGLE = (() => {
  const q = new URLSearchParams(location.search), g = q.get('google');
  if (!g) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  S.page = 'config';
  return { ok: g === 'ok', msg: q.get('msg') || '' };
})();
async function atualizarCfgGoogle() {
  try { await recarregarCadastros(); montarShell(); } catch (e) { /* ignora */ }
}
async function montarGoogle() {
  const box = $('#gBox');
  if (!box) return;
  if (VOLTA_GOOGLE && !VOLTA_GOOGLE.visto) {
    VOLTA_GOOGLE.visto = true;
    if (VOLTA_GOOGLE.ok) { toast('Google Agenda conectado! ✅'); atualizarCfgGoogle(); }
    else toast(VOLTA_GOOGLE.msg || 'Não foi possível conectar o Google Agenda.', 'err');
  }
  let st;
  try { st = await call('google.status'); } catch (e) { box.innerHTML = `<div class="alert warn">${ico('alert')}<div>${esc(e.message)}</div></div>`; return; }
  if (!st.configurado) {
    box.innerHTML = `<div class="alert warn">${ico('alert')}<div>Falta um passo no Supabase: em <b>Edge Functions → Secrets</b>, cadastre <b>GOOGLE_CLIENT_ID</b> e <b>GOOGLE_CLIENT_SECRET</b> (do Google Cloud). Depois volte aqui.</div></div>`;
    return;
  }
  if (!st.conectado) {
    box.innerHTML = `${st.erro ? `<div class="alert warn">${ico('alert')}<div>${esc(st.erro)}</div></div>` : ''}
      <p class="muted" style="margin:0 0 12px">Toque no botão, entre com a <b>conta Google da agenda do studio</b> e clique em <b>Permitir</b>. Não precisa digitar e-mail aqui.</p>
      <button type="button" class="btn primary" id="bGConectar">${ico('calendar')}Conectar Google Agenda</button>
      <p class="muted tiny" style="margin:10px 0 0">Se aparecer “O Google não verificou este app”, toque em <b>Avançado</b> → <b>Acessar</b> (o app é seu).</p>`;
    $('#bGConectar').addEventListener('click', e => busy(e.currentTarget, async () => {
      try { const r = await call('google.iniciar', { volta: location.origin + location.pathname }); location.href = r.url; } catch (err) { erroToast(err); }
    }));
    return;
  }
  box.innerHTML = `<div class="alert info">${ico('check')}<div>Conectado a <b>${esc(st.email || 'Google')}</b>${st.ultimaSync ? ` · última leitura do Google ${esc(fDataHora(st.ultimaSync))}` : ''}</div></div>
    <form id="fGoogle">
      <label class="switch"><input type="checkbox" name="ativo" ${st.ativo ? 'checked' : ''}><span>Sincronizar com o Google Agenda</span></label>
      <label class="field"><span>Agenda</span><select name="calendarId" id="gCalSel"><option value="${esc(st.calendarId)}">${esc(st.calendarNome || 'Carregando agendas…')}</option></select><small>Dica: crie no Google uma agenda só do studio e escolha aqui.</small></label>
      <label class="switch"><input type="checkbox" name="mostrarEventosGoogle" ${st.mostrarEventosGoogle ? 'checked' : ''}><span>Mostrar meus outros compromissos na agenda do CRM</span></label>
      <label class="field"><span>Alerta no celular (minutos antes)</span><input name="lembreteAgendaMin" type="number" min="0" value="${esc(st.lembreteAgendaMin)}"></label>
      <div class="actions-row"><button type="button" class="btn primary" id="bGSalvar">Salvar</button><button type="button" class="btn" id="bGSync">${ico('refresh')}Buscar mudanças agora</button></div>
      <div class="actions-row" style="margin-top:10px"><button type="button" class="btn" id="bImportar">${ico('download')}Importar eventos do Google</button><button type="button" class="btn" id="bResync">${ico('repeat')}Reenviar horários futuros</button></div>
      <div class="actions-row" style="margin-top:10px"><button type="button" class="btn sm ghost danger" id="bGDesc">${ico('x')}Desconectar</button></div>
    </form>
    <p class="muted tiny" style="margin:10px 0 0">Mudanças feitas direto no Google (remarcar ou apagar) chegam ao CRM sozinhas em até 5 minutos.</p>`;
  const sel = $('#gCalSel');
  call('google.calendarios').then(r => { sel.innerHTML = opts(r.lista.map(x => ({ v: x.id, l: x.nome })), st.calendarId); }).catch(erroToast);
  $('#bGSalvar').addEventListener('click', e => busy(e.currentTarget, async () => {
    const d = formData($('#fGoogle'));
    try {
      const r = await call('google.salvar', { ativo: !!d.ativo, mostrarEventosGoogle: !!d.mostrarEventosGoogle, lembreteAgendaMin: d.lembreteAgendaMin, calendarId: d.calendarId });
      await atualizarCfgGoogle();
      toast(r.trocouAgenda ? 'Agenda trocada ✅ Toque em “Reenviar horários futuros” para levar os horários para ela.' : 'Google Agenda salvo ✨');
      montarGoogle();
    } catch (err) { erroToast(err); }
  }));
  $('#bGSync').addEventListener('click', e => busy(e.currentTarget, async () => {
    try {
      const r = await call('google.sincronizar');
      toast(r.remarcados || r.cancelados ? `${r.remarcados} remarcado(s) e ${r.cancelados} cancelado(s) pelo Google` : 'Tudo em dia com o Google Agenda ✅');
      montarGoogle();
    } catch (err) { erroToast(err); }
  }));
  $('#bImportar').addEventListener('click', () => importarGoogle());
  $('#bResync').addEventListener('click', e => busy(e.currentTarget, async () => {
    try { const r = await call('agenda.ressincronizar'); toast(`${r.sincronizados} horário(s) enviados ao Google Agenda${r.erros ? ' · ' + r.erros + ' erro(s)' : ''}`); } catch (err) { erroToast(err); }
  }));
  $('#bGDesc').addEventListener('click', async () => {
    if (!confirm('Desconectar o Google Agenda? Os eventos que já estão lá continuam, mas o CRM para de atualizar.')) return;
    try { await call('google.desconectar'); await atualizarCfgGoogle(); toast('Google Agenda desconectado'); montarGoogle(); } catch (err) { erroToast(err); }
  });
}

window.addEventListener('DOMContentLoaded', iniciar);""")
assert 'async function montarGoogle()' in js, 'não achei o fim do app.js'

# ============================== index.html ==============================
html = ler('Index.html')
brand = sem_tag(ler('Brand.html'), 'style')
estilos = sem_tag(ler('Styles.html'), 'style')
html = trocar(html, [
("<title><?= studioNome ?> · CRM</title>", """<title>Lara Altoé · CRM</title>
  <meta name="theme-color" content="#f8f5f2">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Lara Altoé">
  <meta name="robots" content="noindex, nofollow">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" type="image/png" href="favicon.png">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">"""),
("  <base target=\"_top\">\n", ""),
("Entre com seu usuário e senha para acessar o portal.", "Entre com seu e-mail e senha para acessar o portal."),
("  <?!= include('Brand'); ?>\n  <?!= include('Styles'); ?>", '  <link rel="stylesheet" href="brand.css">\n  <link rel="stylesheet" href="styles.css">'),
("""        <label class="field"><span>Usuário</span>
          <input name="usuario" autocomplete="username" required autocapitalize="none" spellcheck="false" placeholder="admin">
        </label>""",
 """        <label class="field"><span>E-mail</span>
          <input name="email" type="email" autocomplete="username" required autocapitalize="none" spellcheck="false" placeholder="voce@email.com">
        </label>"""),
("""        <label class="switch"><input type="checkbox" name="lembrar" checked><span>Manter conectada neste aparelho</span></label>
""", ""),
("""Acesso protegido · desmarque em aparelhos de outras pessoas""", """Acesso protegido · <a href="#" id="esqueciSenha">Esqueci minha senha</a>"""),
("""  <?!= include('Scripts'); ?>""", """  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
  <script src="config.js"></script>
  <script src="app.js"></script>"""),
], 'index')
html = html.replace('<?= studioNome ?>', 'Lara Altoé Makeup &amp; Beauty')
assert '<?' not in html, 'sobrou marcação do Apps Script no index.html'

# ============================== gravar ==============================
os.makedirs(SAIDA, exist_ok=True)
open(os.path.join(SAIDA, 'index.html'), 'w', encoding='utf-8').write(html)
open(os.path.join(SAIDA, 'app.js'), 'w', encoding='utf-8').write('/* GERADO por crm-supabase/dev/gerar-app.py a partir de crm-studio/apps-script/Scripts.html */\n' + js)
open(os.path.join(SAIDA, 'styles.css'), 'w', encoding='utf-8').write(estilos)
open(os.path.join(SAIDA, 'brand.css'), 'w', encoding='utf-8').write(brand)
for f in ['favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.webmanifest']:
    shutil.copy(os.path.join(PORTAL, f), os.path.join(SAIDA, f))
shutil.copy(os.path.join(AQUI, '..', 'paginas', 'privacidade.html'), os.path.join(SAIDA, 'privacidade.html'))
cfg = os.path.join(SAIDA, 'config.js')
if not os.path.exists(cfg):
    open(cfg, 'w').write("window.CRM_CONFIG = { url: 'https://SEU-PROJETO.supabase.co', chave: 'sb_publishable_...' };\n")
print('app/ gerado:', ', '.join(sorted(os.listdir(SAIDA))))
