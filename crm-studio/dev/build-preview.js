/**
 * Gera dev/preview.html — o portal rodando 100% no navegador com dados de
 * demonstração (sem Google). Útil para ver/ajustar o visual.
 *   node crm-studio/dev/build-preview.js
 * Login do preview: admin / demo1234
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'apps-script');
const rd = f => fs.readFileSync(path.join(SRC, f), 'utf8');

const gs = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort().map(rd).join('\n;\n');
const mock = fs.readFileSync(path.join(__dirname, 'gas-mock.js'), 'utf8');
const seed = fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8');
const shim = `
window.google = { script: { run: (function make(ok, fail) {
  const base = { withSuccessHandler: f => make(f, fail), withFailureHandler: f => make(ok, f) };
  return new Proxy(base, { get(t, k) {
    if (k in t) return t[k];
    return (...args) => setTimeout(() => {
      try { const r = window[k](...args); ok && ok(r); } catch (e) { fail && fail(e); }
    }, 150);
  } });
})() } };
try { seedDemo(); } catch (e) { console.error('seed', e); }
`;
const end = (s, tag) => s.split('</' + tag + '>').join('<\\/' + tag + '>');
let html = rd('Index.html')
  .replace(/<\?= studioNome \?>/g, 'Lara Altoé Makeup & Beauty')
  .replace("<?!= include('Brand'); ?>", () => rd('Brand.html'))
  .replace("<?!= include('Styles'); ?>", () => rd('Styles.html'))
  .replace("<?!= include('Scripts'); ?>", () =>
    '<script>window.__NO_FAKE_DATE = true;\n' + end(mock, 'script') + '\n' + end(gs, 'script') + '\n' + end(seed, 'script') + '\n' + shim + '</script>\n' + rd('Scripts.html'));
html = html.replace('<body>', '<body>\n<div style="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:999;background:#241b26;color:#fff;font:12px sans-serif;padding:4px 12px;border-radius:0 0 10px 10px;opacity:.85">PREVIEW com dados fictícios · login: admin / demo1234</div>');
const out = path.join(__dirname, 'preview.html');
fs.writeFileSync(out, html);
console.log('Gerado: ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');
