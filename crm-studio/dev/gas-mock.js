/**
 * Simulador mínimo dos serviços do Google Apps Script — usado só para
 * testar o CRM fora do Google (Node e navegador). Não vai para o Apps Script.
 */
(function (G) {
  'use strict';
  const MOCK = G.__MOCK = { logs: [], fetches: [], events: {}, convertDates: false, nowOffsetMs: 0, fetchResponder: null };
  const pad = n => String(n).padStart(2, '0');

  /* ---------- Utilities ---------- */
  function formatDate(d, tz, fmt) {
    d = new Date(d.getTime());
    const map = { yyyy: d.getFullYear(), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()), HH: pad(d.getHours()),
      mm: pad(d.getMinutes()), ss: pad(d.getSeconds()), u: d.getDay() === 0 ? 7 : d.getDay() };
    let out = '', i = 0;
    while (i < fmt.length) {
      if (fmt[i] === "'") { const j = fmt.indexOf("'", i + 1); out += fmt.slice(i + 1, j); i = j + 1; continue; }
      const tok = ['yyyy', 'MM', 'dd', 'HH', 'mm', 'ss', 'u'].find(t => fmt.startsWith(t, i));
      if (tok) { out += map[tok]; i += tok.length; } else { out += fmt[i]; i++; }
    }
    return out;
  }
  function parseDate(s) {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) throw new Error('parseDate inválido: ' + s);
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }
  function fakeDigest(str) {
    const out = [];
    let h1 = 0x811c9dc5, h2 = 0x12345678;
    for (let r = 0; r < 8; r++) {
      for (let i = 0; i < str.length; i++) {
        h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 + str.charCodeAt(i) + r, 2246822519) >>> 0;
      }
      out.push((h1 >>> 24) & 255, (h1 >>> 16) & 255, (h2 >>> 8) & 255, h2 & 255);
    }
    return out;
  }
  const nodeCrypto = (typeof require === 'function') ? (() => { try { return require('crypto'); } catch (e) { return null; } })() : null;
  G.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    getUuid: () => (G.crypto && G.crypto.randomUUID) ? G.crypto.randomUUID()
      : (nodeCrypto ? nodeCrypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => ((Math.random() * 16) | 0).toString(16))),
    computeDigest: (alg, str) => nodeCrypto ? Array.from(nodeCrypto.createHash('sha256').update(str, 'utf8').digest()) : fakeDigest(str),
    base64Encode: bytes => {
      if (typeof Buffer !== 'undefined') return Buffer.from(bytes.map(b => b & 255)).toString('base64');
      return btoa(String.fromCharCode.apply(null, bytes.map(b => b & 255)));
    },
    formatDate, parseDate: (s, tz, fmt) => parseDate(s), sleep: () => {}
  };

  /* ---------- Relógio (permite "viajar no tempo" nos testes) ---------- */
  const RealDate = G.Date;
  if (!RealDate.__mocked && !G.__NO_FAKE_DATE) {
    const FakeDate = function (...a) {
      if (!(this instanceof FakeDate)) return new RealDate(RealDate.now() + MOCK.nowOffsetMs).toString();
      return a.length ? new RealDate(...a) : new RealDate(RealDate.now() + MOCK.nowOffsetMs);
    };
    FakeDate.prototype = RealDate.prototype;
    FakeDate.now = () => RealDate.now() + MOCK.nowOffsetMs;
    FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC; FakeDate.__mocked = true;
    Object.defineProperty(FakeDate, Symbol.hasInstance, { value: v => v instanceof RealDate });
    G.Date = FakeDate;
  }

  /* ---------- Planilhas ---------- */
  const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
  const conv = v => (MOCK.convertDates && typeof v === 'string' && ISO.test(v)) ? (v.length === 10 ? parseDate(v) : new RealDate(v)) : v;
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sh.data[this.r - 1 + i] || [];
        const o = [];
        for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined ? '' : v); }
        out.push(o);
      }
      return out;
    }
    setValues(v) {
      v.forEach((row, i) => {
        const ri = this.r - 1 + i;
        while (this.sh.data.length <= ri) this.sh.data.push([]);
        row.forEach((x, j) => { this.sh.data[ri][this.c - 1 + j] = ri === 0 ? x : conv(x); });
      });
      return this;
    }
    setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; }
    getName() { return this.name; }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
    getLastRow() { return this.data.length; }
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
    getMaxRows() { return 1000; }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    appendRow(row) { this.data.push(row.map(conv)); return this; }
    deleteRow(r) { this.data.splice(r - 1, 1); }
    setFrozenRows() {}
  }
  class Spreadsheet {
    constructor(name) { this.name = name; this.id = 'ss_' + Math.random().toString(36).slice(2); this.sheets = [new Sheet('Página1')]; }
    getId() { return this.id; } getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
    getSpreadsheetTimeZone() { return 'America/Sao_Paulo'; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
    getSheets() { return this.sheets.slice(); }
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  }
  const BOOKS = {};
  G.SpreadsheetApp = {
    create: n => { const s = new Spreadsheet(n); BOOKS[s.id] = s; return s; },
    openById: id => { if (!BOOKS[id]) throw new Error('not found'); return BOOKS[id]; },
    getActiveSpreadsheet: () => null
  };
  MOCK.books = BOOKS;

  /* ---------- Propriedades / cache / lock ---------- */
  const props = {};
  G.PropertiesService = { getScriptProperties: () => ({
    getProperty: k => props[k] === undefined ? null : props[k], setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; },
    getKeys: () => Object.keys(props)
  }) };
  const cache = {};
  G.CacheService = { getScriptCache: () => ({
    get: k => cache[k] === undefined ? null : cache[k], put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; }
  }) };
  G.LockService = { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) };
  MOCK.props = props; MOCK.cache = cache;

  G.Session = {
    getScriptTimeZone: () => 'America/Sao_Paulo',
    getActiveUser: () => ({ getEmail: () => MOCK.activeEmail === undefined ? 'dona@studio.com' : MOCK.activeEmail }),
    getEffectiveUser: () => ({ getEmail: () => 'dona@studio.com' })
  };
  G.Logger = { log: m => { MOCK.logs.push(String(m)); } };

  /* ---------- Agenda ---------- */
  let evSeq = 0;
  class Ev {
    constructor(cal, t, s, e, o) { Object.assign(this, { cal, id: 'ev' + (++evSeq) + '@google.com', title: t, start: s, end: e, desc: (o || {}).description, loc: (o || {}).location, color: '', allDay: false }); }
    getId() { return this.id; } getTitle() { return this.title; } setTitle(t) { this.title = t; return this; }
    setTime(s, e) { this.start = s; this.end = e; return this; } setDescription(d) { this.desc = d; return this; }
    setLocation(l) { this.loc = l; return this; } setColor(c) { this.color = c; return this; }
    getStartTime() { return this.start; } getEndTime() { return this.end; } isAllDayEvent() { return this.allDay; }
    removeAllReminders() {} addPopupReminder() {}
    deleteEvent() { delete MOCK.events[this.id]; }
  }
  function makeCal(id, nome, { primaria = false, minha = true, soLeitura = false } = {}) {
    const c = {
      getId: () => id, getName: () => nome, isMyPrimaryCalendar: () => primaria, isOwnedByMe: () => minha,
      createEvent: (t, s, e, o) => { if (soLeitura) throw new Error('You do not have permission to create events'); const ev = new Ev(c, t, s, e, o); MOCK.events[ev.id] = ev; return ev; },
      getEventById: eid => (MOCK.events[eid] && MOCK.events[eid].cal === c) ? MOCK.events[eid] : null,
      getEvents: (s, e) => Object.values(MOCK.events).filter(ev => ev.cal === c && ev.start < e && ev.end > s)
    };
    return c;
  }
  const cal = makeCal('dona@studio.com', 'Agenda principal', { primaria: true });
  const inscritas = [cal, makeCal('pt.brazilian#holiday@group.v.calendar.google.com', 'Feriados no Brasil', { minha: false, soLeitura: true })];
  MOCK.compartilhadas = {}; // agendas de outras contas que foram compartilhadas (id -> opções)
  MOCK.addExterno = (t, s, e) => { const ev = cal.createEvent(t, s, e); return ev; };
  MOCK.calendario = id => inscritas.find(c => c.getId() === id) || null;
  G.CalendarApp = {
    getDefaultCalendar: () => cal,
    getCalendarById: id => (id === 'primary' ? cal : inscritas.find(c => c.getId() === id) || null),
    getAllOwnedCalendars: () => inscritas.filter(c => c.isOwnedByMe()),
    getAllCalendars: () => inscritas.slice(),
    subscribeToCalendar: id => {
      const o = MOCK.compartilhadas[id];
      if (!o) throw new Error('Calendar not found or no access: ' + id);
      const c = makeCal(id, o.nome || id, { minha: false, soLeitura: !!o.soLeitura });
      inscritas.push(c);
      return c;
    },
    EventColor: { PALE_BLUE: '1', PALE_GREEN: '2', MAUVE: '3', PALE_RED: '4', YELLOW: '5', ORANGE: '6', CYAN: '7', GRAY: '8', BLUE: '9', GREEN: '10', RED: '11' }
  };

  /* ---------- Rede ---------- */
  G.UrlFetchApp = { fetch: (url, opts) => {
    MOCK.fetches.push({ url, opts });
    const r = MOCK.fetchResponder ? MOCK.fetchResponder(url, opts) : { code: 200, body: '{"messageId":"m' + MOCK.fetches.length + '"}' };
    return { getResponseCode: () => r.code, getContentText: () => r.body };
  } };

  /* ---------- Gatilhos / serviços web ---------- */
  const triggers = [];
  G.ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: fn => ({ timeBased: () => ({ everyMinutes: n => ({ create: () => { const t = { fn, n, getHandlerFunction: () => fn }; triggers.push(t); return t; } }) }) }),
    getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/DEMO/exec' })
  };
  G.ContentService = { MimeType: { TEXT: 'text' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) };
  G.HtmlService = { XFrameOptionsMode: { DEFAULT: 'DEFAULT' } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
