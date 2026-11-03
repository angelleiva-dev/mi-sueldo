/* Mi Sueldo — control de sueldo, gastos, presupuesto y metas.
   Todo se guarda en el dispositivo (localStorage). Sin servidores. */
'use strict';

const STORE_KEY = 'mi-sueldo:v1';
const GROUPS = {
  necesidades: { name: 'Necesidades', color: 'var(--g-nec)', hint: 'Arriendo, súper, cuentas, transporte, salud, deudas' },
  deseos: { name: 'Deseos', color: 'var(--g-des)', hint: 'Salidas, delivery, ropa, suscripciones, gustos' },
  ahorro: { name: 'Ahorro', color: 'var(--g-aho)', hint: 'Fondo de emergencia, metas, inversión' },
};
const METHODS = ['Débito', 'Crédito', 'Efectivo', 'Transferencia'];
const PALETTE = ['#0f766e', '#7c3aed', '#2563eb', '#ea580c', '#db2777', '#ca8a04', '#16a34a', '#0891b2', '#9333ea', '#dc2626', '#64748b', '#65a30d'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function defaultState() {
  const c = (name, icon, type, group = null, budget = 0) => ({ id: uid(), name, icon, type, group, budget });
  return {
    version: 1,
    settings: { name: '', expectedSalary: 0, payday: 1, currency: 'CLP', rule: { necesidades: 50, deseos: 30, ahorro: 20 } },
    categories: [
      c('Sueldo', '💼', 'ingreso'),
      c('Bonos / horas extra', '⭐', 'ingreso'),
      c('Emprendimiento', '🛍️', 'ingreso'),
      c('Otros ingresos', '💰', 'ingreso'),
      c('Arriendo / dividendo', '🏠', 'gasto', 'necesidades'),
      c('Supermercado', '🛒', 'gasto', 'necesidades'),
      c('Cuentas básicas', '💡', 'gasto', 'necesidades'),
      c('Internet y celular', '📱', 'gasto', 'necesidades'),
      c('Transporte', '🚌', 'gasto', 'necesidades'),
      c('Salud', '🩺', 'gasto', 'necesidades'),
      c('Educación', '📚', 'gasto', 'necesidades'),
      c('Deudas / créditos', '💳', 'gasto', 'necesidades'),
      c('Comida fuera', '🍔', 'gasto', 'deseos'),
      c('Entretención', '🎬', 'gasto', 'deseos'),
      c('Ropa', '👕', 'gasto', 'deseos'),
      c('Suscripciones', '📺', 'gasto', 'deseos'),
      c('Compras varias', '🛍️', 'gasto', 'deseos'),
      c('Regalos', '🎁', 'gasto', 'deseos'),
      c('Ahorro / inversión', '🐷', 'gasto', 'ahorro'),
      c('Fondo de emergencia', '🛟', 'gasto', 'ahorro'),
    ],
    tx: [],
    fixed: [],
    goals: [],
  };
}

/* ---------- Estado y almacenamiento ---------- */
let S = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return defaultState();
}
function migrate(s) {
  const d = defaultState();
  s.settings = Object.assign({}, d.settings, s.settings || {});
  s.settings.rule = Object.assign({}, d.settings.rule, s.settings.rule || {});
  ['categories', 'tx', 'fixed', 'goals'].forEach(k => { if (!Array.isArray(s[k])) s[k] = d[k]; });
  return s;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { toast('No se pudo guardar: almacenamiento lleno'); }
}

/* ---------- Utilidades ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function money(n, sign = false) {
  const cur = S.settings.currency || 'CLP';
  const dec = cur === 'CLP' ? 0 : 2;
  let s;
  try { s = new Intl.NumberFormat('es-CL', { style: 'currency', currency: cur, maximumFractionDigits: dec, minimumFractionDigits: dec }).format(Math.abs(n)); }
  catch { s = '$' + Math.abs(n).toLocaleString('es-CL'); }
  if (n < 0) return '−' + s;
  return (sign && n > 0 ? '+' : '') + s;
}
function parseAmount(v) {
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  if ((S.settings.currency || 'CLP') === 'CLP') return Math.round(Number(s.replace(/[.,]/g, '')) || 0);
  // Monedas con decimales: la última coma o punto es el separador decimal
  const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (last > -1 && s.length - last <= 3) s = s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1);
  else s = s.replace(/[.,]/g, '');
  return Math.round((Number(s) || 0) * 100) / 100;
}
function fmtInput(el) {
  if ((S.settings.currency || 'CLP') !== 'CLP') return;
  const n = parseAmount(el.value);
  el.value = n ? n.toLocaleString('es-CL') : '';
}
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const catById = id => S.categories.find(c => c.id === id) || { name: 'Sin categoría', icon: '❔', type: 'gasto', group: null };
const sum = arr => arr.reduce((a, b) => a + b, 0);

/* ---------- Periodos (según día de pago) ---------- */
let periodOffset = 0;
function periodFor(offset = 0) {
  const P = Math.min(28, Math.max(1, Number(S.settings.payday) || 1));
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();
  if (now.getDate() < P) m -= 1;
  m += offset;
  const start = new Date(y, m, P);
  const end = new Date(y, m + 1, P - 1);
  return { start: iso(start), end: iso(end), startD: start, endD: end, P };
}
function periodLabel(p) {
  if (p.P === 1) { const t = p.startD.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); return { main: t.charAt(0).toUpperCase() + t.slice(1), sub: '' }; }
  const f = d => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  return { main: `${f(p.startD)} – ${f(p.endD)}`, sub: `Periodo de sueldo ${p.endD.getFullYear()}` };
}
const shortLabel = p => p.P === 1 ? p.startD.toLocaleDateString('es-CL', { month: 'short' }) : p.endD.toLocaleDateString('es-CL', { month: 'short' });
const inPeriod = (t, p) => t.date >= p.start && t.date <= p.end;
const txIn = p => S.tx.filter(t => inPeriod(t, p));

function summary(p) {
  const tx = txIn(p);
  const ingresos = sum(tx.filter(t => t.type === 'ingreso').map(t => t.amount));
  const gastos = sum(tx.filter(t => t.type === 'gasto').map(t => t.amount));
  const byGroup = { necesidades: 0, deseos: 0, ahorro: 0, otros: 0 };
  const byCat = {};
  tx.filter(t => t.type === 'gasto').forEach(t => {
    const c = catById(t.catId);
    byGroup[c.group || 'otros'] += t.amount;
    byCat[t.catId] = (byCat[t.catId] || 0) + t.amount;
  });
  const ahorro = byGroup.ahorro;
  const consumo = gastos - ahorro; // gastos sin contar lo que apartas para ahorro
  const base = Math.max(ingresos, Number(S.settings.expectedSalary) || 0);
  const pendFixed = S.fixed.filter(f => !fixedPaid(f, p));
  const pendFixedTotal = sum(pendFixed.map(f => f.amount));
  return { tx, ingresos, gastos, ahorro, consumo, byGroup, byCat, base, pendFixed, pendFixedTotal };
}
const fixedPaid = (f, p) => S.tx.some(t => t.fixedId === f.id && inPeriod(t, p));

/* ---------- UI general ---------- */
let tab = 'inicio';
function render() {
  const p = periodFor(periodOffset);
  const l = periodLabel(p);
  $('#periodLabel').textContent = l.main;
  $('#periodSub').textContent = periodOffset === 0 ? (l.sub ? l.sub + ' · actual' : 'Periodo actual') : l.sub;
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const v = $('#view');
  v.innerHTML = ({ inicio: viewInicio, movimientos: viewMovimientos, presupuesto: viewPresupuesto, metas: viewMetas, ajustes: viewAjustes })[tab](p);
  bindView(p);
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
}
function openSheet(html, onBind) {
  const s = $('#sheet');
  s.innerHTML = '<div class="grab"></div>' + html;
  s.hidden = false; $('#sheetBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  onBind && onBind(s);
}
function closeSheet() {
  $('#sheet').hidden = true; $('#sheetBackdrop').hidden = true;
  document.body.style.overflow = '';
}

/* ---------- Vista: Inicio ---------- */
function viewInicio(p) {
  const s = summary(p);
  const isCurrent = periodOffset === 0;
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const daysLeft = isCurrent ? Math.max(1, Math.round((p.endD - todayD) / 864e5) + 1) : 0;
  const plannedSaving = s.base * (S.settings.rule.ahorro / 100);
  const savingLeft = Math.max(0, plannedSaving - s.ahorro);
  const disponible = s.base - s.gastos - s.pendFixedTotal - savingLeft;
  const perDay = isCurrent ? Math.max(0, disponible) / daysLeft : 0;
  const saldo = s.ingresos - s.gastos;

  let alerts = '';
  if (!S.settings.expectedSalary && !s.ingresos) alerts += `<div class="tip">👋 Para empezar, registra tu <b>sueldo</b> con el botón <b>+</b> (tipo Ingreso) o configura tu sueldo líquido en <b>Ajustes</b>. Así calculo cuánto puedes gastar.</div>`;
  const overCats = S.categories.filter(c => c.type === 'gasto' && c.group !== 'ahorro' && c.budget > 0 && (s.byCat[c.id] || 0) > c.budget);
  if (overCats.length) alerts += `<div class="alert">⚠️ Te pasaste del presupuesto en: <b>${overCats.map(c => esc(c.name)).join(', ')}</b></div>`;
  if (s.base && disponible < 0) alerts += `<div class="alert">⚠️ Con tus gastos, pagos fijos pendientes y ahorro planeado, este periodo queda en <b>${money(disponible)}</b>.</div>`;

  const hero = `
    <section class="card hero">
      <div class="label">${isCurrent ? 'Puedes gastar hoy' : 'Saldo del periodo'}</div>
      <div class="big">${isCurrent ? money(perDay) : money(saldo)}</div>
      <div class="sub">
        ${isCurrent ? `<span class="pill">Disponible: ${money(disponible)}</span><span class="pill">${daysLeft} día${daysLeft === 1 ? '' : 's'} restantes</span>` : `<span class="pill">Ahorrado: ${money(s.ahorro)}</span>`}
      </div>
    </section>`;

  const stats = `
    <div class="stats" style="margin-bottom:12px">
      <div class="stat"><div class="k">Ingresos</div><div class="v in">${money(s.ingresos)}</div></div>
      <div class="stat"><div class="k">Gastos</div><div class="v out">${money(s.consumo)}</div></div>
      <div class="stat"><div class="k">Ahorrado</div><div class="v" style="color:var(--g-aho)">${money(s.ahorro)}</div></div>
    </div>`;

  const rule = S.settings.rule;
  const groupsHtml = Object.entries(GROUPS).map(([k, g]) => {
    const plan = s.base * rule[k] / 100;
    const spent = s.byGroup[k];
    const pct = plan ? Math.min(100, spent / plan * 100) : 0;
    const cls = k !== 'ahorro' && spent > plan && plan ? 'over' : (k !== 'ahorro' && pct > 85 ? 'warn' : '');
    const rest = plan - spent;
    return `<div class="group-row">
      <div class="row between"><div class="row"><span class="dot" style="background:${g.color}"></span><b>${g.name}</b> <span class="muted small">${rule[k]}%</span></div>
      <span class="small nowrap">${money(spent)} / ${money(plan)}</span></div>
      <div class="bar ${cls}"><i style="width:${pct}%;background:${g.color}"></i></div>
      <div class="small muted" style="margin-top:4px">${k === 'ahorro' ? (rest > 0 ? `Te falta apartar ${money(rest)}` : '¡Meta de ahorro cumplida! 🎉') : (rest >= 0 ? `Quedan ${money(rest)}` : `Excedido por ${money(-rest)}`)}</div>
    </div>`;
  }).join('');
  const distrib = `<section class="card"><h2>Distribución del sueldo <small>regla ${rule.necesidades}/${rule.deseos}/${rule.ahorro}</small></h2>
    ${s.base ? groupsHtml : '<p class="muted small">Registra un ingreso o define tu sueldo líquido en Ajustes para ver la distribución.</p>'}
    ${s.byGroup.otros ? `<p class="small muted">Gastos sin grupo: ${money(s.byGroup.otros)}</p>` : ''}</section>`;

  const fixedHtml = S.fixed.length ? `<section class="card"><h2>Pagos fijos <small>${s.pendFixed.length ? `${s.pendFixed.length} pendiente${s.pendFixed.length > 1 ? 's' : ''} · ${money(s.pendFixedTotal)}` : 'todos pagados ✅'}</small></h2>
    <ul class="list">${S.fixed.slice().sort((a, b) => a.day - b.day).map(f => {
      const paid = fixedPaid(f, p); const c = catById(f.catId);
      return `<li><div class="emoji">${c.icon}</div><div class="grow"><div class="li-title">${esc(f.name)}</div><div class="li-sub">Día ${f.day} · ${money(f.amount)}</div></div>
        ${paid ? '<span class="badge ok">Pagado</span>' : `<button class="btn small" data-payfixed="${f.id}">Pagar</button>`}</li>`;
    }).join('')}</ul></section>` : '';

  const donut = donutCard(s);
  const recent = s.tx.slice().sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created).slice(0, 6);
  const recentHtml = `<section class="card"><h2>Últimos movimientos <button class="btn ghost small" data-goto="movimientos">Ver todos</button></h2>
    ${recent.length ? `<ul class="list">${recent.map(txItem).join('')}</ul>` : '<div class="empty"><b>🧾</b>Aún no hay movimientos en este periodo.<br>Toca <b>+</b> para registrar uno.</div>'}</section>`;

  return alerts + hero + stats + distrib + fixedHtml + donut + historyCard() + recentHtml;
}

function donutCard(s) {
  const entries = Object.entries(s.byCat).map(([id, v]) => ({ c: catById(id), v })).sort((a, b) => b.v - a.v);
  if (!entries.length) return '';
  const total = sum(entries.map(e => e.v));
  const top = entries.slice(0, 7);
  if (entries.length > 7) top.push({ c: { name: 'Otros', icon: '•' }, v: sum(entries.slice(7).map(e => e.v)) });
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = top.map((e, i) => {
    const len = e.v / total * C;
    const a = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"/>`;
    acc += len; return a;
  }).join('');
  return `<section class="card"><h2>¿En qué se va mi plata?</h2><div class="donut-wrap">
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Gastos por categoría">${arcs}
      <text x="70" y="66" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">Total</text>
      <text x="70" y="82" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">${esc(money(total))}</text></svg>
    <ul class="legend">${top.map((e, i) => `<li><span class="dot" style="background:${PALETTE[i % PALETTE.length]}"></span><span class="grow">${e.c.icon} ${esc(e.c.name)}</span><b>${Math.round(e.v / total * 100)}%</b></li>`).join('')}</ul>
  </div></section>`;
}

function historyCard() {
  const cols = [];
  for (let o = periodOffset - 5; o <= periodOffset; o++) {
    const p = periodFor(o); const s = summary(p);
    cols.push({ label: shortLabel(p), inc: s.ingresos, out: s.consumo, sav: s.ahorro, cur: o === periodOffset });
  }
  const max = Math.max(1, ...cols.map(c => Math.max(c.inc, c.out)));
  if (!cols.some(c => c.inc || c.out)) return '';
  return `<section class="card"><h2>Últimos 6 periodos <small><span class="dot" style="background:var(--in)"></span> ingresos <span class="dot" style="background:var(--out)"></span> gastos</small></h2>
    <div class="hist">${cols.map(c => `<div class="col"><div class="bars">
      <i style="height:${c.inc / max * 100}%;background:var(--in)" title="Ingresos ${money(c.inc)}"></i>
      <i style="height:${c.out / max * 100}%;background:var(--out)" title="Gastos ${money(c.out)}"></i></div>
      <small style="${c.cur ? 'font-weight:700;color:var(--text)' : ''}">${c.label.replace('.', '')}</small></div>`).join('')}</div>
    <p class="small muted" style="margin:8px 0 0">Promedio de gasto: <b>${money(sum(cols.map(c => c.out)) / cols.filter(c => c.inc || c.out).length || 0)}</b> por periodo</p></section>`;
}

function txItem(t) {
  const c = catById(t.catId);
  const goal = t.goalId ? S.goals.find(g => g.id === t.goalId) : null;
  const sub = [new Date(fromIso(t.date)).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }), t.method, goal ? '🎯 ' + goal.name : '', t.note].filter(Boolean).map(esc).join(' · ');
  return `<li class="tap" data-edit="${t.id}"><div class="emoji ${t.type === 'ingreso' ? 'in' : 'out'}">${c.icon}</div>
    <div class="grow"><div class="li-title">${esc(c.name)}</div><div class="li-sub">${sub}</div></div>
    <div class="amount ${t.type === 'ingreso' ? 'in' : 'out'}">${t.type === 'ingreso' ? '+' : '−'}${money(t.amount)}</div></li>`;
}

/* ---------- Vista: Movimientos ---------- */
let filt = { q: '', type: 'todos' };
function viewMovimientos(p) {
  const s = summary(p);
  let tx = s.tx.slice();
  if (filt.type !== 'todos') tx = tx.filter(t => t.type === filt.type);
  if (filt.q) {
    const q = filt.q.toLowerCase();
    tx = tx.filter(t => (catById(t.catId).name + ' ' + (t.note || '') + ' ' + (t.method || '')).toLowerCase().includes(q));
  }
  tx.sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const byDay = {};
  tx.forEach(t => (byDay[t.date] = byDay[t.date] || []).push(t));
  const tot = sum(tx.map(t => t.type === 'ingreso' ? t.amount : -t.amount));
  return `
    <div class="filters">
      <input type="search" id="q" placeholder="Buscar por categoría, nota…" value="${esc(filt.q)}">
      <select id="ftype"><option value="todos">Todos</option><option value="gasto" ${filt.type === 'gasto' ? 'selected' : ''}>Gastos</option><option value="ingreso" ${filt.type === 'ingreso' ? 'selected' : ''}>Ingresos</option></select>
    </div>
    <p class="small muted" style="margin:4px 4px 0">${tx.length} movimiento${tx.length === 1 ? '' : 's'} · balance ${money(tot, true)}</p>
    ${tx.length ? Object.entries(byDay).map(([d, list]) => `
      <div class="day-head"><span>${fromIso(d).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</span><span>${money(sum(list.map(t => t.type === 'ingreso' ? t.amount : -t.amount)), true)}</span></div>
      <section class="card" style="padding:4px 12px"><ul class="list">${list.map(txItem).join('')}</ul></section>`).join('')
      : '<div class="card empty"><b>🔎</b>No hay movimientos que coincidan.</div>'}`;
}

/* ---------- Vista: Presupuesto ---------- */
function viewPresupuesto(p) {
  const s = summary(p);
  const rule = S.settings.rule;
  const gastoCats = S.categories.filter(c => c.type === 'gasto');
  const groupBlocks = [...Object.keys(GROUPS), null].map(k => {
    const cats = gastoCats.filter(c => (c.group || null) === k);
    if (!cats.length) return '';
    const g = k ? GROUPS[k] : { name: 'Sin grupo', color: 'var(--muted)' };
    const target = k ? s.base * rule[k] / 100 : 0;
    const assigned = sum(cats.map(c => c.budget || 0));
    return `<section class="card"><h2><span class="row"><span class="dot" style="background:${g.color}"></span>${g.name}</span>
      <small>${k ? `asignado ${money(assigned)} de ${money(target)}` : ''}</small></h2>
      ${k && s.base ? `<div class="bar ${assigned > target ? 'over' : ''}" style="margin-bottom:6px"><i style="width:${Math.min(100, target ? assigned / target * 100 : 0)}%;background:${g.color}"></i></div>
        <p class="small muted" style="margin:0 0 6px">${assigned > target ? `Asignaste ${money(assigned - target)} más de lo que recomienda tu regla.` : `Sin asignar: ${money(target - assigned)}`}</p>` : ''}
      <ul class="list">${cats.map(c => {
        const spent = s.byCat[c.id] || 0;
        const pct = c.budget ? spent / c.budget * 100 : 0;
        return `<li style="flex-wrap:wrap"><div class="emoji">${c.icon}</div>
          <div class="grow"><div class="li-title">${esc(c.name)}</div><div class="li-sub">Gastado ${money(spent)}${c.budget ? ` · ${spent <= c.budget ? 'quedan ' + money(c.budget - spent) : 'excedido ' + money(spent - c.budget)}` : ''}</div></div>
          <input class="inline-num" inputmode="numeric" data-budget="${c.id}" value="${c.budget ? Number(c.budget).toLocaleString('es-CL') : ''}" placeholder="Tope">
          ${c.budget ? `<div class="bar ${pct > 100 ? 'over' : pct > 85 ? 'warn' : ''}" style="width:100%;height:6px"><i style="width:${Math.min(100, pct)}%"></i></div>` : ''}</li>`;
      }).join('')}</ul></section>`;
  }).join('');

  const fixed = `<section class="card"><h2>Pagos fijos mensuales <button class="btn small secondary" id="addFixed">+ Agregar</button></h2>
    <p class="small muted" style="margin-top:0">Arriendo, plan del celular, créditos, suscripciones… Se descuentan de tu disponible hasta que los marques como pagados.</p>
    ${S.fixed.length ? `<ul class="list">${S.fixed.slice().sort((a, b) => a.day - b.day).map(f => {
      const c = catById(f.catId);
      return `<li class="tap" data-editfixed="${f.id}"><div class="emoji">${c.icon}</div><div class="grow"><div class="li-title">${esc(f.name)}</div><div class="li-sub">Día ${f.day} · ${esc(c.name)}</div></div>
        <div class="amount">${money(f.amount)}</div></li>`;
    }).join('')}</ul><p class="small" style="margin-bottom:0">Total fijos: <b>${money(sum(S.fixed.map(f => f.amount)))}</b>${s.base ? ` (${Math.round(sum(S.fixed.map(f => f.amount)) / s.base * 100)}% del sueldo)` : ''}</p>` : '<div class="empty" style="padding:10px">Aún no agregas pagos fijos.</div>'}
  </section>`;

  return `<div class="tip">💡 Base del cálculo: <b>${money(s.base)}</b> ${s.ingresos >= (S.settings.expectedSalary || 0) ? '(ingresos registrados en el periodo)' : '(sueldo líquido de Ajustes)'}.
    Define un <b>tope</b> por categoría; la app te avisa cuando te acerques o te pases. ${s.base ? '<button class="btn small secondary" id="autoBudget" style="margin-top:8px">Sugerir topes automáticamente</button>' : ''}</div>` + fixed + groupBlocks;
}

/* ---------- Vista: Metas ---------- */
function goalSaved(g) {
  return sum(S.tx.filter(t => t.goalId === g.id).map(t => t.type === 'gasto' ? t.amount : -t.amount));
}
function viewMetas() {
  const items = S.goals.map(g => {
    const saved = goalSaved(g);
    const pct = g.target ? Math.min(100, saved / g.target * 100) : 0;
    let extra = '';
    if (g.deadline && saved < g.target) {
      const now = new Date(); const dl = fromIso(g.deadline);
      const months = Math.max(1, (dl.getFullYear() - now.getFullYear()) * 12 + dl.getMonth() - now.getMonth());
      extra = `Para llegar al ${dl.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })} debes apartar <b>${money((g.target - saved) / months)}</b> al mes.`;
    } else if (saved >= g.target && g.target) extra = '¡Meta lograda! 🎉';
    return `<section class="card"><h2><span>${esc(g.icon || '🎯')} ${esc(g.name)}</span><button class="btn ghost small" data-editgoal="${g.id}">Editar</button></h2>
      <div class="row between small"><span><b>${money(saved)}</b> de ${money(g.target)}</span><span>${Math.round(pct)}%</span></div>
      <div class="bar" style="margin:6px 0 8px"><i style="width:${pct}%;background:var(--g-aho)"></i></div>
      ${extra ? `<p class="small muted" style="margin:0 0 10px">${extra}</p>` : ''}
      <div class="btns"><button class="btn small" data-contrib="${g.id}">+ Aportar</button><button class="btn small secondary" data-withdraw="${g.id}">Retirar</button></div></section>`;
  }).join('');
  const total = sum(S.goals.map(goalSaved));
  return `<div class="tip">🐷 Los aportes se registran como gasto del grupo <b>Ahorro</b>, así cuentan en tu regla ${S.settings.rule.necesidades}/${S.settings.rule.deseos}/${S.settings.rule.ahorro}. Total ahorrado en metas: <b>${money(total)}</b></div>
    ${items || '<div class="card empty"><b>🎯</b>Crea tu primera meta: fondo de emergencia, vacaciones, un notebook…</div>'}
    <button class="btn block" id="addGoal">+ Nueva meta</button>`;
}

/* ---------- Vista: Ajustes ---------- */
function viewAjustes() {
  const st = S.settings;
  const cats = t => S.categories.filter(c => c.type === t).map(c => `<li class="tap" data-editcat="${c.id}"><div class="emoji">${c.icon}</div><div class="grow"><div class="li-title">${esc(c.name)}</div><div class="li-sub">${c.group ? GROUPS[c.group].name : (t === 'ingreso' ? 'Ingreso' : 'Sin grupo')}</div></div><span class="muted">›</span></li>`).join('');
  return `
  <section class="card"><h2>Mi sueldo</h2>
    <label class="f"><span>Sueldo líquido mensual (lo que te llega)</span><input id="sExpected" inputmode="numeric" value="${st.expectedSalary ? Number(st.expectedSalary).toLocaleString('es-CL') : ''}" placeholder="Ej: 850.000"></label>
    <div class="two">
      <label class="f"><span>Día de pago</span><select id="sPayday">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${st.payday == i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      <label class="f"><span>Moneda</span><select id="sCurrency">${['CLP', 'USD', 'EUR', 'ARS', 'PEN', 'COP', 'MXN', 'UYU', 'BOB'].map(c => `<option ${st.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    </div>
    <p class="small muted" style="margin-top:-4px">El periodo va desde tu día de pago hasta el día anterior del mes siguiente. Si te pagan a fin de mes, usa por ejemplo 28 o 25.</p>
  </section>
  <section class="card"><h2>Regla de distribución <small id="ruleSum"></small></h2>
    <p class="small muted" style="margin-top:0">Porcentaje del sueldo para cada grupo. La regla clásica es 50/30/20.</p>
    <div class="three">
      ${Object.entries(GROUPS).map(([k, g]) => `<label class="f"><span><span class="dot" style="background:${g.color}"></span> ${g.name} %</span><input type="number" min="0" max="100" data-rule="${k}" value="${st.rule[k]}"></label>`).join('')}
    </div>
    <div class="btns"><button class="btn small secondary" data-preset="50,30,20">50/30/20</button><button class="btn small secondary" data-preset="60,20,20">60/20/20</button><button class="btn small secondary" data-preset="70,20,10">70/20/10</button><button class="btn small secondary" data-preset="50,20,30">50/20/30</button></div>
  </section>
  <section class="card"><h2>Categorías de gasto <button class="btn small secondary" data-newcat="gasto">+ Nueva</button></h2><ul class="list">${cats('gasto')}</ul></section>
  <section class="card"><h2>Categorías de ingreso <button class="btn small secondary" data-newcat="ingreso">+ Nueva</button></h2><ul class="list">${cats('ingreso')}</ul></section>
  <section class="card"><h2>Respaldo de datos</h2>
    <p class="small muted" style="margin-top:0">Tus datos se guardan <b>solo en este dispositivo</b> (${S.tx.length} movimientos). Descarga un respaldo de vez en cuando; con él puedes pasar tus datos a otro teléfono o computador.</p>
    <div class="btns"><button class="btn small" id="exportJson">⬇️ Respaldo (.json)</button><button class="btn small secondary" id="exportCsv">📊 Exportar Excel (.csv)</button>
      <label class="btn small secondary" style="display:inline-block">⬆️ Restaurar<input type="file" id="importJson" accept=".json,application/json" hidden></label></div>
    <hr><button class="btn small danger" id="wipe">Borrar todos los datos</button>
  </section>
  <p class="center small muted">Mi Sueldo · funciona sin internet · v1.0</p>`;
}

/* ---------- Bindings ---------- */
function bindView(p) {
  const v = $('#view');
  v.onclick = e => {
    const el = e.target.closest('[data-edit],[data-goto],[data-payfixed],[data-editfixed],[data-contrib],[data-withdraw],[data-editgoal],[data-editcat],[data-newcat],[data-preset]');
    if (!el) return;
    const d = el.dataset;
    if (d.edit) openTxForm(S.tx.find(t => t.id === d.edit));
    else if (d.goto) { tab = d.goto; render(); scrollTo(0, 0); }
    else if (d.payfixed) payFixed(S.fixed.find(f => f.id === d.payfixed), p);
    else if (d.editfixed) openFixedForm(S.fixed.find(f => f.id === d.editfixed));
    else if (d.contrib) openGoalMove(S.goals.find(g => g.id === d.contrib), 'gasto');
    else if (d.withdraw) openGoalMove(S.goals.find(g => g.id === d.withdraw), 'ingreso');
    else if (d.editgoal) openGoalForm(S.goals.find(g => g.id === d.editgoal));
    else if (d.editcat) openCatForm(S.categories.find(c => c.id === d.editcat));
    else if (d.newcat) openCatForm(null, d.newcat);
    else if (d.preset) {
      const [a, b, c] = d.preset.split(',').map(Number);
      S.settings.rule = { necesidades: a, deseos: b, ahorro: c }; save(); render(); toast('Regla actualizada');
    }
  };
  if (tab === 'movimientos') {
    $('#q').oninput = e => { filt.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); };
    $('#ftype').onchange = e => { filt.type = e.target.value; render(); };
  }
  if (tab === 'presupuesto') {
    $$('[data-budget]').forEach(inp => {
      inp.oninput = () => fmtInput(inp);
      inp.onchange = () => { const c = S.categories.find(x => x.id === inp.dataset.budget); c.budget = parseAmount(inp.value); save(); render(); };
    });
    $('#addFixed').onclick = () => openFixedForm(null);
    const ab = $('#autoBudget'); if (ab) ab.onclick = () => autoBudget(p);
  }
  if (tab === 'metas') $('#addGoal').onclick = () => openGoalForm(null);
  if (tab === 'ajustes') bindAjustes();
}

function bindAjustes() {
  const ex = $('#sExpected');
  ex.oninput = () => fmtInput(ex);
  ex.onchange = () => { S.settings.expectedSalary = parseAmount(ex.value); save(); toast('Sueldo guardado'); };
  $('#sPayday').onchange = e => { S.settings.payday = Number(e.target.value); periodOffset = 0; save(); render(); toast('Día de pago actualizado'); };
  $('#sCurrency').onchange = e => { S.settings.currency = e.target.value; save(); render(); };
  const showSum = () => { const t = sum(Object.values(S.settings.rule).map(Number)); $('#ruleSum').innerHTML = t === 100 ? 'suma 100% ✅' : `<span style="color:var(--danger)">suma ${t}% (debe ser 100%)</span>`; };
  $$('[data-rule]').forEach(inp => inp.onchange = () => { S.settings.rule[inp.dataset.rule] = Math.max(0, Math.min(100, Number(inp.value) || 0)); save(); showSum(); });
  showSum();
  $('#exportJson').onclick = exportJson;
  $('#exportCsv').onclick = exportCsv;
  $('#importJson').onchange = importJson;
  $('#wipe').onclick = () => {
    if (!confirm('¿Borrar TODOS tus datos de este dispositivo? Esto no se puede deshacer. Te recomiendo descargar un respaldo antes.')) return;
    if (!confirm('¿Seguro? Última confirmación.')) return;
    S = defaultState(); save(); periodOffset = 0; tab = 'inicio'; render(); toast('Datos borrados');
  };
}

/* ---------- Formulario de movimiento ---------- */
let lastMethod = localStorage.getItem('mi-sueldo:method') || 'Débito';
function openTxForm(t, preset = {}) {
  const editing = !!t;
  const st = {
    type: t?.type || preset.type || 'gasto',
    catId: t?.catId || preset.catId || null,
    method: t?.method || lastMethod,
  };
  const draw = () => {
    const cats = S.categories.filter(c => c.type === st.type);
    if (!cats.find(c => c.id === st.catId)) st.catId = null;
    return `
    <h3>${editing ? 'Editar movimiento' : 'Nuevo movimiento'} <button class="btn ghost small" data-close>Cerrar</button></h3>
    <div class="seg"><button data-type="gasto" class="${st.type === 'gasto' ? 'on out' : ''}">− Gasto</button><button data-type="ingreso" class="${st.type === 'ingreso' ? 'on in' : ''}">+ Ingreso</button></div>
    <input class="amount-input" id="fAmount" inputmode="${S.settings.currency === 'CLP' ? 'numeric' : 'decimal'}" placeholder="$0" autocomplete="off" value="${t ? (S.settings.currency === 'CLP' ? t.amount.toLocaleString('es-CL') : t.amount) : ''}">
    <p class="small muted" style="margin:6px 0 8px">Categoría</p>
    <div class="chips">${cats.map(c => `<button class="chip ${st.catId === c.id ? 'on' : ''}" data-cat="${c.id}"><b>${c.icon}</b>${esc(c.name)}</button>`).join('')}</div>
    <div class="two">
      <label class="f"><span>Fecha</span><input type="date" id="fDate" value="${t?.date || today()}"></label>
      <label class="f"><span>Medio de pago</span><select id="fMethod">${METHODS.map(m => `<option ${st.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    </div>
    <label class="f"><span>Nota (opcional)</span><input id="fNote" placeholder="Ej: almuerzo con el equipo" value="${esc(t?.note || '')}"></label>
    <button class="btn block" id="fSave">${editing ? 'Guardar cambios' : 'Registrar'}</button>
    ${editing ? '<button class="btn danger block" id="fDel" style="margin-top:8px">Eliminar</button>' : ''}`;
  };
  const bind = s => {
    const amt = $('#fAmount', s);
    amt.oninput = () => { const pos = amt.value.length - amt.selectionStart; fmtInput(amt); const np = Math.max(0, amt.value.length - pos); amt.setSelectionRange(np, np); };
    $$('[data-type]', s).forEach(b => b.onclick = () => {
      const k = { a: amt.value, d: $('#fDate', s).value, n: $('#fNote', s).value, m: $('#fMethod', s).value };
      st.type = b.dataset.type; st.method = k.m;
      s.innerHTML = '<div class="grab"></div>' + draw(); bind(s);
      $('#fAmount', s).value = k.a; $('#fDate', s).value = k.d; $('#fNote', s).value = k.n;
    });
    $$('[data-cat]', s).forEach(b => b.onclick = () => { st.catId = b.dataset.cat; $$('[data-cat]', s).forEach(x => x.classList.toggle('on', x === b)); });
    $('[data-close]', s).onclick = closeSheet;
    $('#fSave', s).onclick = () => {
      const amount = parseAmount(amt.value);
      if (!(amount > 0)) { toast('Ingresa un monto'); amt.focus(); return; }
      if (!st.catId) { toast('Elige una categoría'); return; }
      const data = { type: st.type, amount, catId: st.catId, date: $('#fDate', s).value || today(), method: $('#fMethod', s).value, note: $('#fNote', s).value.trim() };
      lastMethod = data.method; localStorage.setItem('mi-sueldo:method', lastMethod);
      if (editing) Object.assign(t, data);
      else S.tx.push(Object.assign({ id: uid(), created: Date.now() }, data, preset.extra || {}));
      save(); closeSheet(); render();
      toast(editing ? 'Cambios guardados' : (data.type === 'gasto' ? 'Gasto registrado' : 'Ingreso registrado'));
      checkBudgetAlert(data);
    };
    const del = $('#fDel', s);
    if (del) del.onclick = () => { if (confirm('¿Eliminar este movimiento?')) { S.tx = S.tx.filter(x => x !== t); save(); closeSheet(); render(); toast('Movimiento eliminado'); } };
    if (!editing) setTimeout(() => amt.focus(), 250);
  };
  openSheet(draw(), bind);
}

function checkBudgetAlert(data) {
  if (data.type !== 'gasto') return;
  const c = catById(data.catId);
  if (!c.budget || c.group === 'ahorro') return;
  const p = periodFor(0);
  if (!(data.date >= p.start && data.date <= p.end)) return;
  const spent = sum(txIn(p).filter(t => t.catId === c.id && t.type === 'gasto').map(t => t.amount));
  if (spent > c.budget) setTimeout(() => toast(`⚠️ Te pasaste del tope de ${c.name} por ${money(spent - c.budget)}`), 2300);
  else if (spent > c.budget * 0.85) setTimeout(() => toast(`Ojo: llevas ${Math.round(spent / c.budget * 100)}% del tope de ${c.name}`), 2300);
}

/* ---------- Pagos fijos ---------- */
function payFixed(f, p) {
  let date = today();
  if (!(date >= p.start && date <= p.end)) date = p.start;
  openTxForm(null, { type: 'gasto', catId: f.catId, extra: { fixedId: f.id } });
  const s = $('#sheet');
  $('#fAmount', s).value = S.settings.currency === 'CLP' ? f.amount.toLocaleString('es-CL') : f.amount;
  $('#fNote', s).value = f.name;
  $('#fDate', s).value = date;
}
function openFixedForm(f) {
  const cats = S.categories.filter(c => c.type === 'gasto');
  openSheet(`<h3>${f ? 'Editar pago fijo' : 'Nuevo pago fijo'} <button class="btn ghost small" data-close>Cerrar</button></h3>
    <label class="f"><span>Nombre</span><input id="xName" placeholder="Ej: Arriendo, Plan celular" value="${esc(f?.name || '')}"></label>
    <div class="two"><label class="f"><span>Monto</span><input id="xAmount" inputmode="numeric" value="${f ? f.amount.toLocaleString('es-CL') : ''}"></label>
    <label class="f"><span>Día del mes</span><input id="xDay" type="number" min="1" max="31" value="${f?.day || 5}"></label></div>
    <label class="f"><span>Categoría</span><select id="xCat">${cats.map(c => `<option value="${c.id}" ${f?.catId === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select></label>
    <button class="btn block" id="xSave">Guardar</button>
    ${f ? '<button class="btn danger block" id="xDel" style="margin-top:8px">Eliminar</button>' : ''}`, s => {
    $('[data-close]', s).onclick = closeSheet;
    const a = $('#xAmount', s); a.oninput = () => fmtInput(a);
    $('#xSave', s).onclick = () => {
      const data = { name: $('#xName', s).value.trim(), amount: parseAmount(a.value), day: Math.min(31, Math.max(1, Number($('#xDay', s).value) || 1)), catId: $('#xCat', s).value };
      if (!data.name || !data.amount) { toast('Completa nombre y monto'); return; }
      if (f) Object.assign(f, data); else S.fixed.push(Object.assign({ id: uid() }, data));
      save(); closeSheet(); render(); toast('Pago fijo guardado');
    };
    const d = $('#xDel', s); if (d) d.onclick = () => { if (confirm('¿Eliminar este pago fijo? (los pagos ya registrados se mantienen)')) { S.fixed = S.fixed.filter(x => x !== f); save(); closeSheet(); render(); } };
  });
}
function autoBudget(p) {
  if (!confirm('Esto reparte el monto de cada grupo entre sus categorías según tu historial de gastos (o en partes iguales si no hay historial). Se reemplazan los topes actuales. ¿Continuar?')) return;
  const s = summary(p);
  // historial: últimos 3 periodos
  const hist = {};
  for (let o = -3; o <= -1; o++) Object.entries(summary(periodFor(periodOffset + o)).byCat).forEach(([k, v]) => (hist[k] = (hist[k] || 0) + v));
  const fixedByCat = {};
  S.fixed.forEach(f => (fixedByCat[f.catId] = (fixedByCat[f.catId] || 0) + f.amount));
  Object.keys(GROUPS).forEach(k => {
    const cats = S.categories.filter(c => c.type === 'gasto' && c.group === k);
    if (!cats.length) return;
    const target = s.base * S.settings.rule[k] / 100;
    const fixedSum = sum(cats.map(c => fixedByCat[c.id] || 0));
    const rest = Math.max(0, target - fixedSum);
    const weights = cats.map(c => hist[c.id] || 0);
    const W = sum(weights);
    cats.forEach((c, i) => {
      const share = W ? rest * weights[i] / W : rest / cats.length;
      const raw = (fixedByCat[c.id] || 0) + share;
      c.budget = S.settings.currency === 'CLP' ? Math.round(raw / 1000) * 1000 : Math.round(raw);
    });
  });
  save(); render(); toast('Topes sugeridos aplicados');
}

/* ---------- Metas ---------- */
function openGoalForm(g) {
  openSheet(`<h3>${g ? 'Editar meta' : 'Nueva meta de ahorro'} <button class="btn ghost small" data-close>Cerrar</button></h3>
    <div class="row"><label class="f" style="width:80px"><span>Ícono</span><input id="gIcon" value="${esc(g?.icon || '🎯')}" maxlength="4" style="text-align:center"></label>
    <label class="f grow"><span>Nombre</span><input id="gName" placeholder="Ej: Fondo de emergencia" value="${esc(g?.name || '')}"></label></div>
    <div class="two"><label class="f"><span>Monto objetivo</span><input id="gTarget" inputmode="numeric" value="${g ? g.target.toLocaleString('es-CL') : ''}"></label>
    <label class="f"><span>Fecha límite (opcional)</span><input id="gDeadline" type="date" value="${g?.deadline || ''}"></label></div>
    <p class="small muted" style="margin-top:-4px">Tip: un buen fondo de emergencia cubre de 3 a 6 meses de tus gastos.</p>
    <button class="btn block" id="gSave">Guardar</button>
    ${g ? '<button class="btn danger block" id="gDel" style="margin-top:8px">Eliminar meta</button>' : ''}`, s => {
    $('[data-close]', s).onclick = closeSheet;
    const tg = $('#gTarget', s); tg.oninput = () => fmtInput(tg);
    $('#gSave', s).onclick = () => {
      const data = { icon: $('#gIcon', s).value.trim() || '🎯', name: $('#gName', s).value.trim(), target: parseAmount(tg.value), deadline: $('#gDeadline', s).value };
      if (!data.name || !data.target) { toast('Completa nombre y monto'); return; }
      if (g) Object.assign(g, data); else S.goals.push(Object.assign({ id: uid() }, data));
      save(); closeSheet(); render(); toast('Meta guardada');
    };
    const d = $('#gDel', s); if (d) d.onclick = () => { if (confirm('¿Eliminar la meta? Los movimientos registrados se mantienen.')) { S.goals = S.goals.filter(x => x !== g); S.tx.forEach(t => { if (t.goalId === g.id) delete t.goalId; }); save(); closeSheet(); render(); } };
  });
}
function openGoalMove(g, type) {
  let cat = S.categories.find(c => c.type === type && (type === 'gasto' ? c.group === 'ahorro' : /otros/i.test(c.name)))
    || S.categories.find(c => c.type === type);
  openTxForm(null, { type, catId: cat?.id, extra: { goalId: g.id } });
  $('#fNote', $('#sheet')).value = (type === 'gasto' ? 'Aporte a ' : 'Retiro de ') + g.name;
}

/* ---------- Categorías ---------- */
function openCatForm(c, type) {
  type = c?.type || type;
  const used = c ? S.tx.filter(t => t.catId === c.id).length : 0;
  openSheet(`<h3>${c ? 'Editar categoría' : 'Nueva categoría'} <button class="btn ghost small" data-close>Cerrar</button></h3>
    <div class="row"><label class="f" style="width:80px"><span>Ícono</span><input id="cIcon" value="${esc(c?.icon || '🏷️')}" maxlength="4" style="text-align:center"></label>
    <label class="f grow"><span>Nombre</span><input id="cName" value="${esc(c?.name || '')}"></label></div>
    ${type === 'gasto' ? `<label class="f"><span>Grupo</span><select id="cGroup">${Object.entries(GROUPS).map(([k, g]) => `<option value="${k}" ${c?.group === k ? 'selected' : ''}>${g.name} — ${g.hint}</option>`).join('')}</select></label>` : ''}
    <button class="btn block" id="cSave">Guardar</button>
    ${c ? `<button class="btn danger block" id="cDel" style="margin-top:8px">Eliminar${used ? ` (${used} movimientos)` : ''}</button>` : ''}`, s => {
    $('[data-close]', s).onclick = closeSheet;
    $('#cSave', s).onclick = () => {
      const name = $('#cName', s).value.trim(); if (!name) { toast('Escribe un nombre'); return; }
      const data = { name, icon: $('#cIcon', s).value.trim() || '🏷️', type, group: type === 'gasto' ? $('#cGroup', s).value : null };
      if (c) Object.assign(c, data); else S.categories.push(Object.assign({ id: uid(), budget: 0 }, data));
      save(); closeSheet(); render(); toast('Categoría guardada');
    };
    const d = $('#cDel', s); if (d) d.onclick = () => {
      if (used && !confirm(`Esta categoría tiene ${used} movimientos. Quedarán como "Sin categoría". ¿Eliminar igual?`)) return;
      if (!used && !confirm('¿Eliminar categoría?')) return;
      S.categories = S.categories.filter(x => x !== c); save(); closeSheet(); render();
    };
  });
}

/* ---------- Respaldo ---------- */
function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportJson() {
  download(`mi-sueldo-respaldo-${today()}.json`, JSON.stringify(S, null, 2), 'application/json');
  localStorage.setItem('mi-sueldo:lastBackup', today());
  toast('Respaldo descargado');
}
function exportCsv() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Fecha', 'Tipo', 'Categoría', 'Grupo', 'Monto', 'Medio de pago', 'Nota', 'Meta'].map(q).join(';')];
  S.tx.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
    const c = catById(t.catId); const g = S.goals.find(x => x.id === t.goalId);
    rows.push([t.date, t.type, c.name, c.group ? GROUPS[c.group].name : '', (t.type === 'gasto' ? -t.amount : t.amount), t.method, t.note, g?.name].map(q).join(';'));
  });
  download(`mi-sueldo-movimientos-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}
function importJson(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || !Array.isArray(data.tx) || !Array.isArray(data.categories)) throw new Error('formato');
      if (!confirm(`El respaldo tiene ${data.tx.length} movimientos. Reemplazará los datos actuales de este dispositivo. ¿Continuar?`)) return;
      S = migrate(data); save(); periodOffset = 0; tab = 'inicio'; render(); toast('Datos restaurados ✅');
    } catch { toast('Archivo no válido'); }
  };
  r.readAsText(file);
  e.target.value = '';
}

/* ---------- Arranque ---------- */
$('#prevPeriod').onclick = () => { periodOffset--; render(); };
$('#nextPeriod').onclick = () => { periodOffset++; render(); };
$('#periodLabel').onclick = () => { periodOffset = 0; render(); };
$('#fab').onclick = () => openTxForm(null);
$('#sheetBackdrop').onclick = closeSheet;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
$$('.tabbar button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); scrollTo(0, 0); });

// Atajos desde el ícono de la app (?nuevo=gasto / ?nuevo=ingreso)
const params = new URLSearchParams(location.search);
render();
if (params.get('nuevo')) { openTxForm(null, { type: params.get('nuevo') === 'ingreso' ? 'ingreso' : 'gasto' }); history.replaceState(null, '', location.pathname); }

// Recordatorio de respaldo cada 30 días
(() => {
  const lb = localStorage.getItem('mi-sueldo:lastBackup');
  if (S.tx.length > 20 && (!lb || (Date.now() - fromIso(lb)) > 30 * 864e5)) setTimeout(() => toast('💾 Recuerda descargar un respaldo en Ajustes'), 1500);
})();

// Pedir almacenamiento persistente para que el navegador no borre los datos
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
