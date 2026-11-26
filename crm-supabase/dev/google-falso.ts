// =====================================================================
//  Google de mentira (OAuth + Calendar v3): só o que o CRM usa, com as
//  mesmas respostas do Google de verdade (ids, syncToken, 404/410, etc.).
//  Usado por teste.ts e e2e.ts.
// =====================================================================
import type { Linha } from '../supabase/functions/_shared/logica.ts';

export const google: Linha = { eventos: new Map<string, Linha>(), seq: 0, fora: false, revogado: false, revogados: 0, n: 0 };
const b64u = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
const resp = (status: number, corpo?: any) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const comFuso = (t: Linha) => (t && t.dateTime && !/[+-]\d\d:\d\d$|Z$/.test(t.dateTime) ? { ...t, dateTime: t.dateTime + '-03:00' } : t);
export function gCriar(e: Linha, cal = 'primary') {
  const id = 'ev' + (++google.n);
  const ev = { status: 'confirmed', ...e, start: comFuso(e.start), end: comFuso(e.end), id, cal, seq: ++google.seq };
  google.eventos.set(id, ev);
  return ev;
}
export function gMexer(id: string, patch: Linha) {
  const ev = google.eventos.get(id);
  Object.assign(ev, patch, { seq: ++google.seq });
  if (patch.start) ev.start = comFuso(patch.start);
  if (patch.end) ev.end = comFuso(patch.end);
}
export const gEv = (id: string) => google.eventos.get(id);
const limpo = (e: Linha) => { const { cal, seq, ...r } = e; return r; };
const quando = (t: Linha) => Date.parse(t.dateTime || t.date + 'T00:00:00-03:00');
export const G = {
  clientId: 'cliente-teste', clientSecret: 'segredo-teste', redirectUri: 'https://x.supabase.co/functions/v1/google',
  fetch: async (url: string, o: any = {}) => {
    const u = new URL(url), metodo = o.method || 'GET';
    if (google.fora && u.host === 'www.googleapis.com') return resp(503, { error: { message: 'Backend Error' } });
    if (u.href === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(o.body);
      if (p.get('client_secret') !== 'segredo-teste') return resp(401, { error: 'invalid_client' });
      if (p.get('grant_type') === 'authorization_code') {
        return resp(200, { access_token: 'at-' + p.get('code'), refresh_token: 'rt-' + p.get('code'), expires_in: 3599,
          id_token: b64u({ alg: 'none' }) + '.' + b64u({ email: 'lara.agenda@gmail.com' }) + '.x' });
      }
      if (google.revogado) return resp(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      return resp(200, { access_token: 'at-novo', expires_in: 3599 });
    }
    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/revoke') { google.revogados++; return resp(200, {}); }
    if (!/^Bearer at-/.test((o.headers || {}).Authorization || '')) return resp(401, { error: { message: 'Invalid Credentials' } });
    const caminho = decodeURIComponent(u.pathname.replace('/calendar/v3', ''));
    if (caminho === '/users/me/calendarList') {
      return resp(200, { items: [{ id: 'lara.agenda@gmail.com', summary: 'Lara', primary: true }, { id: 'studio@group.calendar.google.com', summary: 'Studio' }] });
    }
    const m = caminho.match(/^\/calendars\/([^/]+)\/events(?:\/(.+))?$/);
    if (!m) return resp(404, { error: { message: 'Not Found' } });
    const cal = m[1] === 'lara.agenda@gmail.com' ? 'primary' : m[1], id = m[2];
    const corpo = o.body ? JSON.parse(o.body) : {};
    if (id) {
      const ev = google.eventos.get(id);
      if (!ev || ev.cal !== cal) return resp(404, { error: { message: 'Not Found' } });
      if (metodo === 'GET') return resp(200, limpo(ev));
      if (ev.status === 'cancelled') return resp(410, { error: { message: 'Resource has been deleted' } });
      if (metodo === 'DELETE') { gMexer(id, { status: 'cancelled' }); return resp(204); }
      if (metodo === 'PATCH') { gMexer(id, corpo); return resp(200, limpo(ev)); }
    }
    if (metodo === 'POST') return resp(200, limpo(gCriar(corpo, cal)));
    // listar
    const doCal = [...google.eventos.values()].filter((e) => e.cal === cal);
    const st = u.searchParams.get('syncToken');
    if (st !== null) {
      return resp(200, { items: doCal.filter((e) => e.seq > Number(st)).map(limpo), nextSyncToken: String(google.seq) });
    }
    if (u.searchParams.get('timeMin')) {
      const ini = Date.parse(u.searchParams.get('timeMin')!), fim = Date.parse(u.searchParams.get('timeMax')!);
      const itens = doCal.filter((e) => e.status !== 'cancelled' && quando(e.start) <= fim && quando(e.end) > ini).sort((a, b) => quando(a.start) - quando(b.start));
      return resp(200, { items: itens.map(limpo) });
    }
    return resp(200, { items: doCal.map((e) => ({ id: e.id })), nextSyncToken: String(google.seq) });
  }
};
