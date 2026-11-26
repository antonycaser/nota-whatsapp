// =====================================================================
//  CRM Lara Altoé — função "google" do Supabase
//  1) GET  ?code=...&state=...  → volta da autorização do Google (botão
//     "Conectar Google Agenda"); guarda a conexão e devolve para o app.
//  2) POST com x-cron-secret    → chamada automática a cada 5 minutos
//     (05_google.sql): traz para o CRM o que mudou no Google Agenda.
//  IMPORTANTE: no painel, deixe "Verify JWT" DESLIGADO nesta função
//  (o Google não manda login do CRM). A segurança é o "state" de uso único
//  e o segredo do agendador, guardado só no banco.
// =====================================================================
import { googleCallback, gPull } from '../_shared/logica.ts';
import { db, auth, googleDeps } from '../_shared/adaptador.ts';

const sistema = { id: '', nome: 'Sistema', perfil: 'admin', email: '', trocarSenha: false };
const texto = (msg: string, status = 200) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ctx = { db, auth, sess: sistema, memo: {}, google: googleDeps };
  try {
    if (req.method === 'GET' && (url.searchParams.has('code') || url.searchParams.has('error'))) {
      const destino = await googleCallback(Object.fromEntries(url.searchParams), ctx);
      if (!/^https?:\/\//.test(destino)) return texto('Não encontrei o endereço do aplicativo. Volte ao CRM e toque em "Conectar Google Agenda" de novo.', 400);
      return new Response(null, { status: 302, headers: { Location: destino } });
    }
    if (req.method === 'POST') {
      const segredo = req.headers.get('x-cron-secret') || '';
      const salvo = (await db.sel('config', { eq: { chave: 'cron' } }))[0];
      const certo = salvo && salvo.valor && salvo.valor.segredo;
      if (!segredo || !certo || segredo !== certo) return texto('não autorizado', 401);
      const r = await gPull(ctx);
      return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'Content-Type': 'application/json' } });
    }
    return texto('Função do Google Agenda do CRM no ar ✅');
  } catch (e) {
    console.error(e);
    return texto('Erro: ' + ((e as Error).message || String(e)), 500);
  }
});
