// =====================================================================
//  Teste de ponta a ponta: o APLICATIVO (app/) no navegador, falando com as
//  REGRAS REAIS do servidor (logica.ts) sobre um POSTGRES REAL.
//  Só o login do Supabase é simulado.
//    LIBS=/pasta/com/libs pg_virtualenv -v 16 node --experimental-strip-types e2e.ts
//  (LIBS: chart.umd.js, index.global.min.js, pt-br.global.min.js, supabase.js;
//   sem LIBS, baixa das CDNs)
// =====================================================================
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { executar } from '../supabase/functions/api/logica.ts';
import { criarBanco } from './pg-adaptador.ts';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const APP = fileURLToPath(new URL('../app/index.html', import.meta.url));
const SHOTS = process.env.SHOTS || '';
const LIBS = process.env.LIBS || '';
const URL_SB = /cagvmdztxchypulfshla\.supabase\.co|SEU-PROJETO\.supabase\.co/;

const { db, auth, sql, cli } = await criarBanco();
const adminId = await auth.criar('lara@exemplo.com', 'x');
await sql(`insert into public.perfis (id, nome, perfil) values ($1, 'Lara Altoé', 'admin')`, [adminId]);
const SENHA = 'Senha1234';

const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sessao = () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: adminId, exp, role: 'authenticated' })}.x`,
    token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r' + Date.now(),
    user: { id: adminId, aud: 'authenticated', role: 'authenticated', email: 'lara@exemplo.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  };
};
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const LIB_MAP: Record<string, string> = {
  'chart.js@4.4.1': 'chart.umd.js', 'fullcalendar@6.1.15/index': 'index.global.min.js',
  'locales/pt-br': 'pt-br.global.min.js', 'supabase-js@2.45.4': 'supabase.js'
};
let chamadas = 0;

async function rotear(page: any) {
  await page.route('**/*', async (route: any) => {
    const req = route.request(), u = req.url();
    if (u.startsWith('file:')) return route.continue();
    const lib = Object.keys(LIB_MAP).find((k) => u.includes(k));
    if (lib && LIBS) return route.fulfill({ path: LIBS + '/' + LIB_MAP[lib], contentType: 'application/javascript' });
    if (lib) return route.continue();
    if (!URL_SB.test(u)) return route.abort();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const json = (status: number, body: any) => route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (u.includes('/auth/v1/token')) {
      const body = JSON.parse(req.postData() || '{}');
      if (u.includes('grant_type=refresh_token')) return json(200, sessao());
      if (body.email === 'lara@exemplo.com' && body.password === SENHA) return json(200, sessao());
      return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (u.includes('/auth/v1/logout')) return route.fulfill({ status: 204, headers: CORS });
    if (u.includes('/auth/v1/user')) return json(200, sessao().user);
    if (u.includes('/functions/v1/api')) {
      chamadas++;
      const auth0 = req.headers()['authorization'] || '';
      if (!auth0.startsWith('Bearer ')) return json(401, { msg: 'Missing authorization header' });
      const { action, payload } = JSON.parse(req.postData() || '{}');
      const sess = { id: adminId, nome: 'Lara Altoé', perfil: 'admin', email: 'lara@exemplo.com', trocarSenha: false };
      return json(200, await executar(action, payload, { db, auth, sess, memo: {} }));
    }
    return json(404, { msg: 'rota não simulada: ' + u });
  });
}

const erros: string[] = [];
let passos = 0;
const passo = (msg: string, ok: boolean) => { passos++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) erros.push(msg); };

const browser = await chromium.launch();
async function cenario(nome: string, opts: any, fn: (p: any) => Promise<void>) {
  console.log('\n' + nome);
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e: any) => erros.push(nome + ': ' + e.message));
  page.on('console', (m: any) => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g|status of 400/.test(m.text())) erros.push(nome + ' console: ' + m.text()); });
  await rotear(page);
  await page.goto('file://' + APP);
  await fn(page);
  await ctx.close();
}
const shot = async (p: any, n: string) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png` }); };

await cenario('Celular (iPhone)', { ...devices['iPhone 13'] }, async (p) => {
  await p.waitForSelector('#loginForm', { state: 'visible' });
  passo('tela de login pede e-mail', await p.isVisible('#loginForm [name=email]'));
  await shot(p, 'sb-login');
  await p.fill('[name=email]', 'lara@exemplo.com'); await p.fill('[name=senha]', 'errada'); await p.click('#loginBtn');
  await p.waitForTimeout(600);
  passo('senha errada mostra "E-mail ou senha incorretos"', /incorretos/.test(await p.textContent('#loginErro')));
  await p.fill('[name=senha]', SENHA); await p.click('#loginBtn');
  await p.waitForSelector('#shell:not(.hidden)', { timeout: 10000 });
  await p.waitForTimeout(800);
  passo('entrou e abriu o painel', await p.isVisible('.kpis'));
  passo('menu não mostra WhatsApp (fase 4)', !(await p.$('[data-nav=whatsapp]')));

  // nova cliente pelo atalho
  await p.click('.quick [data-q=cli]'); await p.waitForTimeout(300);
  await p.fill('#fCli [name=nome]', 'Fernanda Gomes'); await p.fill('#fCli [name=telefone]', '11 98617-2835');
  await p.click('#bCli'); await p.waitForTimeout(1200);
  const nCli = (await sql('select count(*) from public.clientes')).rows[0].count;
  passo('cliente gravada no Postgres', Number(nCli) === 1);

  // agendamento com 2 serviços para hoje
  await p.click('.bottom-nav .fab'); await p.waitForTimeout(400);
  await p.fill('#cliBusca', 'fern'); await p.waitForTimeout(300);
  await p.dispatchEvent('#cliRes .dropdown-item[data-id]', 'mousedown');
  const chips = await p.$$('[data-srv]');
  await chips[0].click(); await chips[6].click();
  await p.fill('[name=hora]', '17:00');
  await shot(p, 'sb-novo');
  await p.click('#bSalvarAg'); await p.waitForTimeout(1500);
  const ag = (await sql('select servico_nomes, valor, status from public.agendamentos')).rows[0];
  passo('agendamento gravado com 2 serviços: ' + (ag && ag.servico_nomes), !!ag && ag.servico_nomes.includes(' + '));

  // finaliza pelo painel
  await p.click('.bottom-nav [data-nav=dashboard]'); await p.waitForTimeout(1500);
  await p.click('#page .list-item[data-ag]'); await p.waitForTimeout(900);
  await p.click('.overlay [data-finalizar]'); await p.waitForTimeout(400);
  await p.click('#bFin'); await p.waitForTimeout(2000);
  const fin = (await sql(`select sum(valor) s from public.financeiro where tipo='receita' and status='pago'`)).rows[0].s;
  passo('finalizar lançou R$ ' + fin + ' no caixa', Number(fin) === Number(ag.valor));
  await p.waitForTimeout(1200);
  const kpi = (await p.textContent('.kpi.hero .kpi-value')).trim();
  passo('faturamento do painel mostra ' + kpi, kpi.replace(/\D/g, '').startsWith(String(Math.round(Number(fin)))));
  await shot(p, 'sb-painel');

  // agenda (dia e mês), clientes, financeiro, relatórios, configurações
  await p.click('.bottom-nav [data-nav=agenda]'); await p.waitForTimeout(1500);
  passo('agenda do dia mostra o atendimento', (await p.$$('.ag-card[data-ag]')).length >= 1);
  if (await p.$('#agModo [data-modo=mes]')) { await p.click('#agModo [data-modo=mes]'); await p.waitForTimeout(1500); }
  passo('agenda do mês abre', (await p.$$('.mes-cel')).length === 42);
  await shot(p, 'sb-agenda');
  await p.click('.bottom-nav [data-nav=clientes]'); await p.waitForTimeout(1500);
  passo('clientes mostra 1 visita (view do banco)', /1 visita/.test(await p.textContent('#cliBody')));
  for (const pg of ['financeiro', 'relatorios', 'config']) {
    await p.click('[data-action=mais]'); await p.waitForTimeout(300); await p.click(`[data-ir=${pg}]`); await p.waitForTimeout(1800);
    passo(`${pg} abre sem erro`, !(await p.$('#page .empty .big:text("😕")')));
  }
  passo('configurações avisam que o Google Agenda é a fase 3', /fase 3/.test(await p.textContent('#page')));
  passo('usuários listados pelo e-mail', /lara@exemplo\.com/.test(await p.textContent('#page')));
  await shot(p, 'sb-config');

  // continua logada depois de fechar e abrir
  await p.reload(); await p.waitForTimeout(2500);
  passo('ao reabrir, continua logada (sem pedir senha)', await p.isVisible('#shell') && !(await p.isVisible('#login')));
  // sair
  await p.click('[data-action=mais]'); await p.waitForTimeout(300); await p.click('[data-t=sair]'); await p.waitForTimeout(800);
  passo('sair volta para o login', await p.isVisible('#loginForm'));
  await p.reload(); await p.waitForTimeout(1500);
  passo('depois de sair, reabrir pede login', await p.isVisible('#loginForm'));
});

await cenario('Computador', { viewport: { width: 1440, height: 900 } }, async (p) => {
  await p.waitForSelector('#loginForm', { state: 'visible' });
  await p.fill('[name=email]', 'lara@exemplo.com'); await p.fill('[name=senha]', SENHA); await p.click('#loginBtn');
  await p.waitForSelector('#shell:not(.hidden)', { timeout: 10000 }); await p.waitForTimeout(1500);
  passo('painel no computador', await p.isVisible('.kpis'));
  await p.click('[data-nav=agenda]'); await p.waitForTimeout(2000);
  passo('calendário (FullCalendar) mostra o atendimento', (await p.$$('.fc-event.ag-ev')).length >= 1);
  await shot(p, 'sb-desk-agenda');
  await p.click('[data-nav=relatorios]'); await p.waitForTimeout(2000);
  passo('relatórios com gráfico', (await p.$$('canvas')).length >= 2);
  await shot(p, 'sb-desk-relatorios');
});

await browser.close();
await cli.end();
console.log(`\n${passos - erros.filter((e) => !e.includes(':')).length} de ${passos} passos ok · ${chamadas} chamadas à função "api"`);
if (erros.length) { console.log('PROBLEMAS:\n - ' + erros.join('\n - ')); process.exit(1); }
console.log('TUDO OK ✅');
