/* ============================================================
   APP.JS — Portal Jaime Barbosa (AUNADS AGENCIA)
   Firebase modular SDK v10 vía CDN. No requiere build step.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const fbApp = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

let ROLE = null;        // 'agency' | 'client'
let CURRENT_EMAIL = null;

/* ============================================================
   CACHÉ EN MEMORIA — evita releer todo Firestore cada vez que
   cambias de sección o agregas algo. Se llena la primera vez que
   se visita cada sección en la sesión, y se actualiza al instante
   en cada acción (sin esperar una vuelta al servidor).
   Nota: si la otra persona agrega algo desde su propia sesión,
   tú lo ves al recargar la página, no en vivo.
   ============================================================ */
const CACHE = {};
async function ensure(name){
  if(!CACHE[name]){
    const snap = await getDocs(collection(db,name));
    CACHE[name] = snap.docs.map(d=>({id:d.id, ...d.data()}));
  }
  return CACHE[name];
}
function cacheSet(name,id,data){
  CACHE[name] = CACHE[name] || [];
  const arr = CACHE[name];
  const i = arr.findIndex(x=>x.id===id);
  const item = {id, ...data};
  if(i>-1) arr[i]=item; else arr.push(item);
  return item;
}
function cachePatch(name,id,patch){
  const arr = CACHE[name] || [];
  const i = arr.findIndex(x=>x.id===id);
  if(i>-1) arr[i] = {...arr[i], ...patch};
}
function cacheRemove(name,id){
  const arr = CACHE[name] || [];
  const i = arr.findIndex(x=>x.id===id);
  if(i>-1) arr.splice(i,1);
}

/* ---------------- helpers ---------------- */
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];
const fmt = n => {
  const num = Number(n);
  if(isNaN(num)) return (n==null?'':String(n));
  return new Intl.NumberFormat('es-CO').format(Math.round(num));
};
const money = (n,c='USD') => {
  const symbols = {USD:'$', COP:'$', EUR:'€'};
  return (symbols[c]||'') + fmt(n) + ' ' + c;
};
const isAgency = () => ROLE === 'agency';
const monthLabel = (id) => {
  const [y,m] = (id||'').split('-');
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return names[parseInt(m,10)-1] + ' ' + y;
};
const dateLabel = (d) => {
  if(!d) return '';
  const dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'});
};
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const checkIcon = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const sortDesc = (arr,key) => [...arr].sort((a,b)=> String(b[key]||'').localeCompare(String(a[key]||'')));
const sortAsc  = (arr,key) => [...arr].sort((a,b)=> String(a[key]||'').localeCompare(String(b[key]||'')));

function toast(msg, isError){
  let t = $('#toast');
  if(!t){
    t = document.createElement('div'); t.id='toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#fff;color:#000;font-weight:600;padding:12px 22px;border-radius:100px;font-size:12.5px;z-index:200;transition:opacity .3s ease,transform .3s ease';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = isError ? '#ff3b3b' : '#fff';
  t.style.color = isError ? '#fff' : '#000';
  t.style.opacity = '1';
  clearTimeout(t._h);
  t._h = setTimeout(()=>{ t.style.opacity='0'; }, 3200);
}

function guard(fn){
  return async function(main, ...args){
    try{ await fn(main, ...args); }
    catch(ex){
      console.error(ex);
      main.innerHTML = `<div class="empty" style="border-color:rgba(255,59,59,.4);color:#ff8a8a">
        Ocurrió un error cargando esta sección.<br><span class="mono" style="font-size:11px;opacity:.8">${esc((ex && ex.message) || ex)}</span>
      </div>`;
    }
  };
}

/* ---------------- AUTH ---------------- */
$('#login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass = $('#login-password').value;
  const btn = $('#login-btn'); const err = $('#login-error');
  err.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…';
  try{ await signInWithEmailAndPassword(auth, email, pass); }
  catch(ex){ err.style.color = 'var(--red)'; err.textContent = 'Correo o contraseña incorrectos.'; }
  finally{ btn.disabled = false; btn.textContent = 'Entrar'; }
});
$('#logout-btn').addEventListener('click', ()=> signOut(auth));
$('#forgot-link').addEventListener('click', async (e)=>{
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const err = $('#login-error');
  if(!email){ err.textContent = 'Escribe tu correo arriba primero, y luego dale clic aquí.'; return; }
  const allowed = [...(window.AGENCY_EMAILS||[]), ...(window.CLIENT_EMAILS||[])].map(x=>x.toLowerCase());
  if(!allowed.includes(email.toLowerCase())){ err.textContent = 'Ese correo no tiene acceso al portal.'; return; }
  try{
    await sendPasswordResetEmail(auth, email);
    err.style.color = 'var(--yellow)';
    err.textContent = 'Listo, revisa tu correo (' + email + ') para crear tu contraseña.';
  }catch(ex){ err.style.color = 'var(--red)'; err.textContent = 'No pudimos enviar el correo. Verifica que el usuario ya exista en Firebase.'; }
});
onAuthStateChanged(auth, async (user)=>{
  if(!user){
    ROLE = null; CURRENT_EMAIL = null;
    $('#app-view').classList.add('hidden');
    $('#login-view').classList.remove('hidden');
    return;
  }
  const email = (user.email||'').toLowerCase();
  const agencyList = (window.AGENCY_EMAILS||[]).map(x=>x.toLowerCase());
  const clientList = (window.CLIENT_EMAILS||[]).map(x=>x.toLowerCase());
  if(agencyList.includes(email)) ROLE = 'agency';
  else if(clientList.includes(email)) ROLE = 'client';
  else { $('#login-error').textContent = 'Este correo no tiene acceso al portal.'; await signOut(auth); return; }
  CURRENT_EMAIL = email;
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#sb-user-name').textContent = isAgency() ? (window.AGENCY_NAME||'Agencia') : (window.CLIENT_NAME||'Cliente');
  renderView('resumen');
});

/* ---------------- NAV ---------------- */
$$('.sb-link').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.sb-link').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderView(btn.dataset.view);
  });
});
function renderView(view){
  const main = $('#main');
  main.innerHTML = '<div class="spin"></div>';
  const renderers = { resumen: renderResumen, metricas: renderMetricas, pagos: renderPagos, tareas: renderTareas, ventas: renderVentas };
  (renderers[view] || renderResumen)(main);
}

/* ============================================================
   MÉTRICAS — plataformas fijas (TikTok / Instagram / YouTube)
   + plataformas personalizadas + Ventas & Publicidad automática
   (con opción de sobrescribir manualmente)
   ============================================================ */
const ICONS = {
  tiktok: '<svg viewBox="0 0 24 24" fill="none"><path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" fill="currentColor"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" stroke="none"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="M10.5 9.5v5l4.5-2.5-4.5-2.5z" fill="#000"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4h6v6M20 4l-9 9M6 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>'
};

const PLATFORM_DEFS = {
  tiktok: {
    label: 'TikTok', icon: ICONS.tiktok, url: 'https://www.tiktok.com/@jaimebarbosa___',
    fields: [
      {key:'followersTotal', label:'Seguidores totales'}, {key:'followersNew', label:'Seguidores nuevos'},
      {key:'videoViews', label:'Vistas de video'}, {key:'profileViews', label:'Vistas del perfil'},
      {key:'likes', label:'Me gusta'}, {key:'comments', label:'Comentarios'},
      {key:'shares', label:'Compartidos'}, {key:'videosPosted', label:'Videos publicados'}
    ], engagementOn: 'videoViews'
  },
  instagram: {
    label: 'Instagram', icon: ICONS.instagram, url: 'https://www.instagram.com/jaimebarbosa___/',
    fields: [
      {key:'followersTotal', label:'Seguidores totales'}, {key:'followersNew', label:'Seguidores nuevos'},
      {key:'reach', label:'Alcance'}, {key:'views', label:'Visualizaciones'},
      {key:'likes', label:'Me gusta'}, {key:'comments', label:'Comentarios'},
      {key:'saves', label:'Guardados'}, {key:'shares', label:'Compartidos'},
      {key:'postsPublished', label:'Publicaciones / Reels'}
    ], engagementOn: 'views'
  },
  youtube: {
    label: 'YouTube', icon: ICONS.youtube, url: 'https://www.youtube.com/@jaimebarbosa19/videos',
    fields: [
      {key:'subsTotal', label:'Suscriptores totales'}, {key:'subsNew', label:'Suscriptores nuevos'},
      {key:'views', label:'Vistas'}, {key:'likes', label:'Me gusta'},
      {key:'comments', label:'Comentarios'}, {key:'videosPosted', label:'Videos publicados'}
    ], engagementOn: 'views'
  }
};

function engagementRate(vals, def){
  const base = Number(vals[def.engagementOn]);
  if(!base) return null;
  const eng = ['likes','comments','shares','saves'].reduce((a,k)=> a + (Number(vals[k])||0), 0);
  return (eng/base*100).toFixed(2) + '%';
}
function platformStatCard(label, value){
  return `<div class="card stat-card"><div class="label">${esc(label)}</div><div class="value">${value==null||value===''?'—':fmt(value)}</div></div>`;
}

/* ---------------- Ventas & Publicidad ---------------- */
async function computeVentasPublicidad(monthId, override){
  if(override && (override.facturacion!=null || override.inversionAds!=null)){
    const facturacion = override.facturacion!=null ? override.facturacion : 0;
    const inversionAds = override.inversionAds!=null ? override.inversionAds : 0;
    return {facturacion, inversionAds, roas: inversionAds>0 ? facturacion/inversionAds : null, manual:true};
  }
  const [sales, payments] = await Promise.all([ensure('sales'), ensure('payments')]);
  const inMonth = (dateStr) => (dateStr||'').slice(0,7) === monthId;
  const facturacion = sales.filter(s=>inMonth(s.date) && (s.currency||'USD')==='USD').reduce((a,s)=>a+Number(s.totalAmount||0),0);
  const inversionAds = payments.filter(p=>p.category==='Publicidad' && inMonth(p.date) && (p.currency||'USD')==='USD').reduce((a,p)=>a+Number(p.amount||0),0);
  const roas = inversionAds > 0 ? (facturacion/inversionAds) : null;
  return {facturacion, inversionAds, roas, manual:false};
}

/* ============================================================
   RESUMEN — dashboard general
   ============================================================ */
const renderResumen = guard(async function(main){
  main.innerHTML = `<div class="main-head"><div><div class="eyebrow">Panel general</div><h1>Resumen</h1></div></div>`;
  const months = sortDesc(await ensure('metrics'), 'month');

  if(months.length === 0){
    main.innerHTML += `<div class="empty">Todavía no hay métricas cargadas.${isAgency()?' Ve a "Métricas mensuales" para agregar el primer mes.':''}</div>`;
  } else {
    const latest = months[0];
    main.innerHTML += `<div class="section-title"><span>Último mes cargado — ${monthLabel(latest.id)}</span><span class="line"></span></div>`;
    Object.entries(PLATFORM_DEFS).forEach(([key,def])=>{
      const vals = latest[key];
      if(!vals) return;
      main.innerHTML += `
        <div style="display:flex;align-items:center;gap:8px;margin:18px 0 10px">
          <span style="color:var(--yellow);display:flex;width:15px;height:15px">${def.icon}</span>
          <div style="font-size:13px;font-weight:700">${def.label}</div>
        </div>
        <div class="grid-4">${def.fields.slice(0,4).map(f=>platformStatCard(f.label, vals[f.key])).join('')}</div>
      `;
    });
    if(latest.customPlatforms && latest.customPlatforms.length){
      latest.customPlatforms.forEach(p=>{
        main.innerHTML += `
          <div style="font-size:13px;font-weight:700;margin:18px 0 10px">${esc(p.name)}</div>
          <div class="grid-4">${(p.metrics||[]).map(m=>platformStatCard(m.label,m.value)).join('')}</div>
        `;
      });
    }
    const vp = await computeVentasPublicidad(latest.id, latest.salesOverride);
    main.innerHTML += `
      <div style="font-size:13px;font-weight:700;margin:18px 0 10px">Ventas &amp; Publicidad</div>
      <div class="grid-3">
        <div class="card stat-card"><div class="label">Facturación</div><div class="value">${money(vp.facturacion)}</div></div>
        <div class="card stat-card"><div class="label">Inversión ADS</div><div class="value">${money(vp.inversionAds)}</div></div>
        <div class="card stat-card"><div class="label">ROAS</div><div class="value">${vp.roas!=null?vp.roas.toFixed(2)+'x':'—'}</div></div>
      </div>
    `;
  }

  // ---- Ventas: totales generales (USD) ----
  const sales = await ensure('sales');
  const salesUSD = sales.filter(s=>(s.currency||'USD')==='USD');
  let totalVendido = 0, totalPendiente = 0;
  salesUSD.forEach(s=>{
    totalVendido += Number(s.totalAmount||0);
    const paid = s.installments ? (s.installmentsList||[]).filter(i=>i.paid).reduce((a,i)=>a+Number(i.amount||0),0) : Number(s.totalAmount||0);
    totalPendiente += Math.max(0, Number(s.totalAmount||0) - paid);
  });

  // ---- Pagos: total del mes calendario actual, por moneda ----
  const payments = await ensure('payments');
  const nowMonth = new Date().toISOString().slice(0,7);
  const gastosMes = {};
  payments.filter(p=>(p.date||'').slice(0,7)===nowMonth).forEach(p=>{
    gastosMes[p.currency] = (gastosMes[p.currency]||0) + Number(p.amount||0);
  });
  const gastosMesStr = Object.keys(gastosMes).length
    ? Object.entries(gastosMes).map(([c,v])=>money(v,c)).join(' · ')
    : money(0);

  const tasks = await ensure('tasks');
  const pendientes = tasks.filter(t=>!t.done).length;

  main.innerHTML += `
    <div class="section-title"><span>Estado general</span><span class="line"></span></div>
    <div class="grid-4">
      <div class="card stat-card"><div class="label">Pendientes abiertos</div><div class="value">${pendientes}</div></div>
      <div class="card stat-card"><div class="label">Total vendido (USD)</div><div class="value">${money(totalVendido)}</div></div>
      <div class="card stat-card"><div class="label">Por cobrar (USD)</div><div class="value">${money(totalPendiente)}</div></div>
      <div class="card stat-card"><div class="label">Gastos este mes</div><div class="value" style="font-size:15px">${gastosMesStr}</div></div>
    </div>
  `;
});

/* ============================================================
   MÉTRICAS MENSUALES
   ============================================================ */
const renderMetricas = guard(async function(main, selectedMonth){
  const months = sortDesc(await ensure('metrics'), 'month');
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Histórico</div><h1>Métricas mensuales</h1></div>
      <div class="head-actions">
        ${months.length ? `<div class="month-select"><select id="month-picker"></select></div>` : ''}
        ${isAgency() ? `<button class="btn" id="add-month-btn">+ Agregar mes</button>` : ''}
      </div>
    </div>
    <div id="metrics-body"></div>
  `;
  if(isAgency()) $('#add-month-btn').addEventListener('click', ()=>openAddMonthModal());
  if(months.length === 0){
    $('#metrics-body').innerHTML = `<div class="empty">Aún no hay ningún mes cargado.</div>`;
    return;
  }
  const picker = $('#month-picker');
  picker.innerHTML = months.map(m=>`<option value="${m.id}">${monthLabel(m.id)}</option>`).join('');
  const month = selectedMonth && months.find(m=>m.id===selectedMonth) ? selectedMonth : months[0].id;
  picker.value = month;
  picker.addEventListener('change', ()=> renderMonthDetail(picker.value));
  await renderMonthDetail(month);
});

async function renderMonthDetail(monthId){
  const body = $('#metrics-body');
  body.innerHTML = '<div class="spin"></div>';
  const months = await ensure('metrics');
  const d = months.find(m=>m.id===monthId) || {};

  let html = '';
  Object.entries(PLATFORM_DEFS).forEach(([key,def])=>{
    const vals = d[key] || {};
    const eng = engagementRate(vals, def);
    html += `
      <div class="section-title" style="align-items:center">
        <span style="color:var(--yellow);display:flex;width:14px;height:14px">${def.icon}</span>
        <span>${def.label}</span><span class="line"></span>
        <a href="${def.url}" target="_blank" rel="noopener" class="btn-icon" title="Abrir perfil">${ICONS.external}</a>
      </div>
      <div class="grid-4">
        ${def.fields.map(f=>platformStatCard(f.label, vals[f.key])).join('')}
        ${eng ? `<div class="card stat-card"><div class="label">Tasa de interacción</div><div class="value">${eng}</div></div>` : ''}
      </div>
    `;
  });

  (d.customPlatforms||[]).forEach(p=>{
    html += `
      <div class="section-title"><span>${esc(p.name)}</span><span class="line"></span></div>
      <div class="grid-4">${(p.metrics||[]).map(m=>platformStatCard(m.label,m.value)).join('') || '<div class="empty">Sin métricas.</div>'}</div>
    `;
  });

  const vp = await computeVentasPublicidad(monthId, d.salesOverride);
  html += `
    <div class="section-title"><span>Ventas &amp; Publicidad</span><span class="line"></span></div>
    <div class="grid-3">
      <div class="card stat-card"><div class="label">Facturación</div><div class="value">${money(vp.facturacion)}</div>
        <div class="mono muted" style="font-size:10.5px;margin-top:8px">${vp.manual?'Valor manual':'Suma automática de "Ventas" este mes'}</div></div>
      <div class="card stat-card"><div class="label">Inversión ADS</div><div class="value">${money(vp.inversionAds)}</div>
        <div class="mono muted" style="font-size:10.5px;margin-top:8px">${vp.manual?'Valor manual':'Suma de "Pagos" categoría Publicidad'}</div></div>
      <div class="card stat-card"><div class="label">ROAS</div><div class="value">${vp.roas!=null?vp.roas.toFixed(2)+'x':'—'}</div>
        <div class="mono muted" style="font-size:10.5px;margin-top:8px">Facturación ÷ Inversión ADS</div></div>
    </div>
  `;
  body.innerHTML = html;

  if(isAgency()){
    body.innerHTML += `<div style="margin-top:30px;display:flex;gap:10px">
      <button class="btn-ghost" id="edit-month-btn">Editar este mes</button>
      <button class="btn-danger" id="del-month-btn">Eliminar este mes</button>
    </div>`;
    $('#edit-month-btn').addEventListener('click', ()=> openAddMonthModal(monthId, d));
    $('#del-month-btn').addEventListener('click', async ()=>{
      if(!confirm('¿Eliminar los datos de ' + monthLabel(monthId) + '? Esta acción no se puede deshacer.')) return;
      await deleteDoc(doc(db,'metrics',monthId));
      cacheRemove('metrics', monthId);
      toast('Mes eliminado');
      renderMetricas($('#main'));
    });
  }
}

/* ---------------- Agregar / editar mes ---------------- */
let customDraft = [];

function platformFormHTML(key, def, vals){
  vals = vals || {};
  return `<div class="platform-block">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span style="color:var(--yellow);display:flex;width:16px;height:16px">${def.icon}</span>
      <div style="font-weight:700;font-size:13.5px">${def.label}</div>
    </div>
    <div class="grid-2">
      ${def.fields.map(f=>`
        <div class="field" style="margin-bottom:10px">
          <label>${f.label}</label>
          <input type="text" data-plat="${key}" data-key="${f.key}" value="${esc(vals[f.key]??'')}">
        </div>`).join('')}
    </div>
  </div>`;
}

function customPlatformHTML(p, pi){
  return `<div class="platform-block">
    <div class="platform-block-head">
      <input type="text" placeholder="Nombre de la red (ej: Threads, Kick)" data-custom-name="${pi}" value="${esc(p.name)}">
      <button type="button" class="mini-x" data-del-custom-plat="${pi}">&times;</button>
    </div>
    ${(p.metrics||[]).map((m,mi)=>`
      <div class="metric-row" style="grid-template-columns:1.4fr 1fr auto">
        <input type="text" placeholder="Etiqueta" data-custom-plat="${pi}" data-custom-metric="${mi}" data-custom-field="label" value="${esc(m.label)}">
        <input type="text" placeholder="Valor" data-custom-plat="${pi}" data-custom-metric="${mi}" data-custom-field="value" value="${esc(m.value)}">
        <button type="button" class="mini-x" data-del-custom-metric="${pi}:${mi}">&times;</button>
      </div>
    `).join('')}
    <button type="button" class="mini-add" data-add-custom-metric="${pi}">+ Agregar métrica</button>
  </div>`;
}
function renderCustomBuilder(){
  const wrap = $('#custom-platforms-builder');
  if(!wrap) return;
  wrap.innerHTML = customDraft.map((p,pi)=>customPlatformHTML(p,pi)).join('') ||
    '<div class="empty" style="padding:20px;font-size:12px">Sin plataformas adicionales.</div>';
}

function openAddMonthModal(editMonthId, existingData){
  const now = new Date();
  const defaultId = editMonthId || (now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0'));
  const data = existingData || {};
  customDraft = data.customPlatforms ? JSON.parse(JSON.stringify(data.customPlatforms)) : [];
  const ov = data.salesOverride || {};

  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>${editMonthId ? 'Editar mes' : 'Agregar mes'}</h3>
    <div class="modal-tabs">
      <button type="button" class="modal-tab active" data-tab="form">Formulario</button>
      <button type="button" class="modal-tab" data-tab="paste">Pegar datos</button>
    </div>

    <div id="tab-form">
      <div class="field"><label>Mes (AAAA-MM)</label><input type="text" id="f-month" value="${defaultId}" pattern="\\d{4}-\\d{2}" required></div>
      <div id="platforms-form">
        ${Object.entries(PLATFORM_DEFS).map(([key,def])=>platformFormHTML(key,def,data[key])).join('')}
      </div>

      <div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin:22px 0 12px;font-family:var(--mono)">Otras plataformas (opcional)</div>
      <div id="custom-platforms-builder"></div>
      <button type="button" class="mini-add" id="add-custom-plat-btn">+ Agregar otra red</button>

      <div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin:22px 0 12px;font-family:var(--mono)">Ventas &amp; Publicidad (opcional)</div>
      <div class="platform-block">
        <div class="muted" style="font-size:11.5px;margin-bottom:12px;line-height:1.5">Por defecto se calculan solas a partir de "Ventas" y "Pagos". Solo llena esto si quieres sobrescribir el valor de este mes a mano.</div>
        <div class="grid-2">
          <div class="field"><label>Facturación manual (USD)</label><input type="text" id="f-fact-manual" value="${esc(ov.facturacion??'')}"></div>
          <div class="field"><label>Inversión ADS manual (USD)</label><input type="text" id="f-ads-manual" value="${esc(ov.inversionAds??'')}"></div>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn" id="save-month-btn">Guardar mes</button>
        <button type="button" class="btn-ghost" id="cancel-month">Cancelar</button>
      </div>
    </div>

    <div id="tab-paste" class="hidden paste-box">
      <div class="paste-hint">Pega aquí el bloque de datos en formato JSON (te lo genero yo cuando me pasas el informe en el chat). Al cargarlo, se pre-llena el formulario para que lo revises antes de guardar.</div>
      <textarea id="paste-textarea" placeholder='{"month":"2026-07","tiktok":{"followersTotal":1200,"videoViews":26900},"instagram":{},"youtube":{}}'></textarea>
      <button type="button" class="btn" id="load-paste-btn" style="width:100%;margin-top:14px">Cargar datos</button>
    </div>
  `);

  renderCustomBuilder();
  const modal = $('#modal-box');
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-month').addEventListener('click', closeModal);

  $$('.modal-tab', modal).forEach(tabBtn=>{
    tabBtn.addEventListener('click', ()=>{
      $$('.modal-tab', modal).forEach(b=>b.classList.remove('active'));
      tabBtn.classList.add('active');
      $('#tab-form').classList.toggle('hidden', tabBtn.dataset.tab !== 'form');
      $('#tab-paste').classList.toggle('hidden', tabBtn.dataset.tab !== 'paste');
    });
  });

  $('#load-paste-btn').addEventListener('click', ()=>{
    try{
      const parsed = JSON.parse($('#paste-textarea').value);
      if(parsed.month) $('#f-month').value = parsed.month;
      $$('#platforms-form input').forEach(inp=>{
        const platData = parsed[inp.dataset.plat];
        if(platData && platData[inp.dataset.key]!=null) inp.value = platData[inp.dataset.key];
      });
      if(parsed.customPlatforms) customDraft = parsed.customPlatforms;
      renderCustomBuilder();
      $$('.modal-tab', modal)[0].click();
      toast('Datos cargados — revísalos antes de guardar');
    }catch(ex){
      toast('JSON inválido: ' + ex.message, true);
    }
  });

  $('#add-custom-plat-btn').addEventListener('click', ()=>{
    customDraft.push({name:'', metrics:[{label:'',value:''}]});
    renderCustomBuilder();
  });
  $('#custom-platforms-builder').addEventListener('input', (e)=>{
    const t = e.target;
    if(t.dataset.customName!=null) customDraft[parseInt(t.dataset.customName)].name = t.value;
    else if(t.dataset.customPlat!=null && t.dataset.customMetric!=null){
      customDraft[parseInt(t.dataset.customPlat)].metrics[parseInt(t.dataset.customMetric)][t.dataset.customField] = t.value;
    }
  });
  $('#custom-platforms-builder').addEventListener('click', (e)=>{
    const t = e.target;
    if(t.dataset.addCustomMetric!=null){ customDraft[parseInt(t.dataset.addCustomMetric)].metrics.push({label:'',value:''}); renderCustomBuilder(); }
    else if(t.dataset.delCustomPlat!=null){ customDraft.splice(parseInt(t.dataset.delCustomPlat),1); renderCustomBuilder(); }
    else if(t.dataset.delCustomMetric){ const [pi,mi]=t.dataset.delCustomMetric.split(':').map(Number); customDraft[pi].metrics.splice(mi,1); renderCustomBuilder(); }
  });

  $('#save-month-btn').addEventListener('click', async ()=>{
    const monthId = $('#f-month').value.trim();
    if(!/^\d{4}-\d{2}$/.test(monthId)){ toast('Formato de mes inválido, usa AAAA-MM', true); return; }

    const payload = { month: monthId, updatedAt: new Date().toISOString(), updatedBy: CURRENT_EMAIL };
    Object.keys(PLATFORM_DEFS).forEach(key=>{ payload[key] = {}; });
    $$('#platforms-form input').forEach(inp=>{
      const raw = inp.value.trim();
      if(raw === '') return;
      const num = parseFloat(raw.replace(/[.,](?=\d{3})/g,'').replace(',','.'));
      payload[inp.dataset.plat][inp.dataset.key] = (!isNaN(num) && /^[\d.,]+$/.test(raw)) ? num : raw;
    });
    payload.customPlatforms = customDraft
      .filter(p=>p.name && p.name.trim())
      .map(p=>({ name:p.name.trim(), metrics:(p.metrics||[]).filter(m=>m.label&&m.label.trim()).map(m=>{
        const num = parseFloat(String(m.value).replace(/[.,](?=\d{3})/g,'').replace(',','.'));
        return {label:m.label.trim(), value:(!isNaN(num) && /^[\d.,]+$/.test(String(m.value).trim())) ? num : m.value};
      })}));

    const factManual = $('#f-fact-manual').value.trim();
    const adsManual = $('#f-ads-manual').value.trim();
    if(factManual !== '' || adsManual !== ''){
      payload.salesOverride = {
        facturacion: factManual!=='' ? parseFloat(factManual.replace(/,/g,'')) : null,
        inversionAds: adsManual!=='' ? parseFloat(adsManual.replace(/,/g,'')) : null
      };
    }

    const btn = $('#save-month-btn'); btn.disabled = true; btn.textContent = 'Guardando…';
    try{
      await setDoc(doc(db,'metrics',monthId), payload);
      cacheSet('metrics', monthId, payload);
      toast('Mes guardado');
      closeModal();
      renderMetricas($('#main'), monthId);
    }catch(ex){
      toast('Error guardando: ' + ex.message, true);
    }finally{
      btn.disabled = false; btn.textContent = 'Guardar mes';
    }
  });
}

/* Comprime una imagen en el navegador y la devuelve como data URL (base64) */
async function compressImage(file, maxDim=1400, quality=0.72){
  const dataUrl = await new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve,reject)=>{
    const im = new Image();
    im.onload = ()=> resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  let w = img.width, h = img.height;
  if(w > maxDim || h > maxDim){
    const scale = maxDim / Math.max(w,h);
    w = Math.round(w*scale); h = Math.round(h*scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  let q = quality, out = canvas.toDataURL('image/jpeg', q), tries = 0;
  while(out.length > 850*1024 && tries < 6){
    q = Math.max(q - 0.12, 0.3); tries++;
    out = canvas.toDataURL('image/jpeg', q);
  }
  if(out.length > 950*1024) throw new Error('La imagen sigue siendo muy pesada, intenta con una de menor resolución.');
  return out;
}
function openLightbox(src){
  $('#imglightbox-img').src = src;
  $('#imglightbox-bg').classList.add('open');
}
$('#imglightbox-bg').addEventListener('click', ()=> $('#imglightbox-bg').classList.remove('open'));

/* ============================================================
   PAGOS
   ============================================================ */
const CATEGORIES = ['Herramientas','Agencia','Publicidad','Otro'];
const CURRENCIES = ['USD','COP','EUR'];
let payFilter = 'Todos';

const renderPagos = guard(async function(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Gastos</div><h1>Pagos</h1></div>
      <button class="btn" id="add-payment-btn">+ Agregar pago</button>
    </div>
    <div class="grid-3" id="pagos-totales" style="margin-bottom:22px"></div>
    <div class="filter-pills" id="pagos-filtros">
      ${['Todos',...CATEGORIES].map(c=>`<button data-cat="${c}" class="${c===payFilter?'active':''}">${c}</button>`).join('')}
    </div>
    <div class="pay-grid" id="pagos-list"></div>
  `;
  $('#add-payment-btn').addEventListener('click', ()=>openAddPaymentModal());
  $$('#pagos-filtros button').forEach(b=>b.addEventListener('click', ()=>{
    payFilter = b.dataset.cat;
    $$('#pagos-filtros button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    renderPaymentsList();
  }));
  await ensure('payments');
  renderPaymentsList();
});

function renderPaymentsList(){
  const all = CACHE.payments || [];
  const totals = {};
  all.forEach(p=>{ totals[p.currency] = (totals[p.currency]||0) + Number(p.amount||0); });
  $('#pagos-totales').innerHTML = CURRENCIES.map(c=>`
    <div class="card stat-card"><div class="label">Total ${c}</div><div class="value">${money(totals[c]||0, c)}</div></div>
  `).join('');

  const docs = payFilter === 'Todos' ? all : all.filter(p=>p.category === payFilter);
  const sorted = sortDesc(docs, 'date');
  const list = $('#pagos-list');
  if(sorted.length === 0){ list.innerHTML = '<div class="empty" style="grid-column:1/-1">Sin pagos en esta categoría.</div>'; return; }
  list.innerHTML = sorted.map(p=>`<div class="pay-card">
      <div class="pay-card-top">
        <div>
          <div class="rtitle">${esc(p.name)}</div>
          <div class="rsub">${dateLabel(p.date)}</div>
        </div>
        <span class="rtag ${p.category==='Herramientas'?'tool':p.category==='Publicidad'?'ads':''}">${esc(p.category)}</span>
      </div>
      <div class="pay-card-foot">
        <div class="ramount">${money(p.amount, p.currency)}</div>
        <div style="display:flex;align-items:center;gap:8px">
          ${p.receiptUrl ? `<img src="${p.receiptUrl}" class="pay-thumb" data-lightbox="${p.id}">` : ''}
          <button class="btn-edit" data-edit="${p.id}">Editar</button>
          <button class="btn-danger" data-del="${p.id}" style="padding:6px 10px;font-size:10px">&times;</button>
        </div>
      </div>
    </div>`).join('');
  $$('[data-lightbox]', list).forEach(img=>img.addEventListener('click', ()=> openLightbox(img.src)));
  $$('[data-edit]', list).forEach(btn=>btn.addEventListener('click', ()=>{
    const item = all.find(x=>x.id===btn.dataset.edit);
    openAddPaymentModal(item);
  }));
  $$('[data-del]', list).forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('¿Eliminar este pago?')) return;
    await deleteDoc(doc(db,'payments',btn.dataset.del));
    cacheRemove('payments', btn.dataset.del);
    renderPaymentsList();
  }));
}

function openAddPaymentModal(existing){
  const isEdit = !!existing;
  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>${isEdit?'Editar pago':'Agregar pago'}</h3>
    <form id="payment-form">
      <div class="field"><label>Categoría</label>
        <div class="pillgroup" id="p-cat-group">${CATEGORIES.map(c=>`<button type="button" data-val="${c}" class="${c===(existing?existing.category:CATEGORIES[0])?'active':''}">${c}</button>`).join('')}</div>
      </div>
      <div class="field"><label>Nombre</label><input type="text" id="p-name" required value="${esc(existing?existing.name:'')}" placeholder="Ej: Notion, CapCut Pro, Meta Ads"></div>
      <div class="grid-2">
        <div class="field"><label>Monto</label><input type="number" step="0.01" id="p-amount" required value="${existing?existing.amount:''}"></div>
        <div class="field"><label>Moneda</label>
          <div class="pillgroup" id="p-cur-group">${CURRENCIES.map(c=>`<button type="button" data-val="${c}" class="${c===(existing?existing.currency:CURRENCIES[0])?'active':''}">${c}</button>`).join('')}</div>
        </div>
      </div>
      <div class="field"><label>Fecha</label><input type="date" id="p-date" required value="${existing?existing.date:new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Foto del recibo (opcional)</label><input type="file" id="p-receipt" accept="image/*">
        ${existing&&existing.receiptUrl?'<div class="mono muted" style="font-size:11px;margin-top:6px">Ya tiene una foto — sube otra para reemplazarla, o deja vacío para conservarla.</div>':''}
      </div>
      <div class="modal-actions">
        <button type="submit" class="btn" id="p-submit-btn">${isEdit?'Guardar cambios':'Guardar'}</button>
        <button type="button" class="btn-ghost" id="cancel-payment">Cancelar</button>
      </div>
    </form>
  `);
  let selCat = existing?existing.category:CATEGORIES[0], selCur = existing?existing.currency:CURRENCIES[0];
  $$('#p-cat-group button').forEach(b=>b.addEventListener('click', ()=>{
    $$('#p-cat-group button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selCat = b.dataset.val;
  }));
  $$('#p-cur-group button').forEach(b=>b.addEventListener('click', ()=>{
    $$('#p-cur-group button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selCur = b.dataset.val;
  }));
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-payment').addEventListener('click', closeModal);
  $('#payment-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = $('#p-submit-btn'); btn.disabled = true; btn.textContent = 'Guardando…';
    try{
      const data = {
        category: selCat, name: $('#p-name').value.trim(),
        amount: Number($('#p-amount').value||0), currency: selCur,
        date: $('#p-date').value
      };
      const file = $('#p-receipt').files[0];
      if(file) data.receiptUrl = await compressImage(file);

      if(isEdit){
        await updateDoc(doc(db,'payments',existing.id), data);
        cachePatch('payments', existing.id, data);
        toast('Pago actualizado');
      } else {
        data.createdBy = CURRENT_EMAIL; data.createdAt = new Date().toISOString();
        const ref = await addDoc(collection(db,'payments'), data);
        cacheSet('payments', ref.id, data);
        toast('Pago agregado');
      }
      closeModal();
      renderPaymentsList();
    }catch(ex){
      toast(ex.message || 'Error guardando el pago', true);
    }finally{
      btn.disabled = false; btn.textContent = isEdit?'Guardar cambios':'Guardar';
    }
  });
}

/* ============================================================
   PENDIENTES — tablero kanban con agregado rápido
   ============================================================ */
const renderTareas = guard(async function(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Seguimiento</div><h1>Pendientes</h1></div>
      <button class="btn" id="add-list-btn">+ Nueva lista</button>
    </div>
    <div id="lists-container" class="kanban"></div>
  `;
  $('#add-list-btn').addEventListener('click', openAddListModal);
  await Promise.all([ensure('tasklists'), ensure('tasks')]);
  renderKanban();
});

function renderKanban(){
  const container = $('#lists-container');
  if(!container) return;
  const lists = sortAsc(CACHE.tasklists || [], 'createdAt');
  const tasks = CACHE.tasks || [];
  if(lists.length === 0){ container.innerHTML = '<div class="empty" style="width:100%">Aún no hay listas. Crea una con "+ Nueva lista".</div>'; return; }

  container.innerHTML = lists.map(l=>{
    const items = sortAsc(tasks.filter(t=>t.listId === l.id), 'createdAt');
    const pending = items.filter(t=>!t.done);
    const done = items.filter(t=>t.done);
    return `
      <div class="kanban-col" data-list="${l.id}">
        <div class="kanban-col-head">
          <div class="kanban-col-title">${esc(l.title)}</div>
          <div class="kanban-col-count">${pending.length}</div>
        </div>
        <div class="kanban-col-body">
          ${[...pending, ...done].map(t=>taskRowHTML(t)).join('') || '<div class="empty" style="padding:20px;font-size:11.5px">Sin pendientes todavía.</div>'}
        </div>
        <div class="quickadd">
          <input type="text" placeholder="Agregar pendiente y Enter…" data-quickadd="${l.id}">
          <button type="button" data-quickadd-btn="${l.id}">+</button>
        </div>
        <div class="kanban-col-foot" style="margin-top:8px">
          <button class="btn-danger" data-dellist="${l.id}" style="flex:1">Eliminar lista</button>
        </div>
      </div>
    `;
  }).join('') + `<button class="kanban-addcol" id="add-list-btn-2">+ Nueva lista</button>`;

  function taskRowHTML(t){
    return `<div class="list-row task-row" style="padding:11px 12px;border-radius:12px" data-task="${t.id}">
      <div class="task-check ${t.done?'done':''}" data-check="${t.id}">${checkIcon}</div>
      <div class="task-title ${t.done?'done':''}" style="font-size:13px" data-tasktitle="${t.id}">${esc(t.title)}</div>
      <button class="btn-danger" data-deltask="${t.id}" style="padding:5px 10px;font-size:10px">&times;</button>
    </div>`;
  }

  const btn2 = $('#add-list-btn-2');
  if(btn2) btn2.addEventListener('click', openAddListModal);

  // quick add (Enter o botón +) — sin cerrar nada, se queda ahí para seguir agregando
  $$('[data-quickadd]', container).forEach(input=>{
    const listId = input.dataset.quickadd;
    const submit = async ()=>{
      const title = input.value.trim();
      if(!title) return;
      input.value = ''; input.focus();
      const tempData = { listId, title, done:false, createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString() };
      try{
        const ref = await addDoc(collection(db,'tasks'), tempData);
        cacheSet('tasks', ref.id, tempData);
        renderKanban();
        $(`[data-quickadd="${listId}"]`).focus();
      }catch(ex){ toast('Error agregando pendiente', true); }
    };
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); } });
  });
  $$('[data-quickadd-btn]', container).forEach(btn=>btn.addEventListener('click', ()=>{
    $(`[data-quickadd="${btn.dataset.quickaddBtn}"]`).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
  }));

  // click en la fila = marcar hecho (más intuitivo que solo el círculo pequeño)
  $$('.task-row', container).forEach(row=>{
    row.addEventListener('click', async (e)=>{
      if(e.target.closest('[data-deltask]') || e.target.closest('[data-tasktitle]')) return;
      const id = row.dataset.task;
      const item = (CACHE.tasks||[]).find(t=>t.id===id);
      const nowDone = !item.done;
      cachePatch('tasks', id, {done: nowDone, doneAt: nowDone?new Date().toISOString():null});
      renderKanban();
      try{ await updateDoc(doc(db,'tasks',id), { done: nowDone, doneAt: nowDone ? new Date().toISOString() : null }); }
      catch(ex){ toast('Error actualizando', true); }
    });
  });

  // doble clic en el título = editar en línea
  $$('[data-tasktitle]', container).forEach(titleEl=>{
    titleEl.addEventListener('dblclick', (e)=>{
      e.stopPropagation();
      const id = titleEl.dataset.tasktitle;
      const current = titleEl.textContent;
      const input = document.createElement('input');
      input.type = 'text'; input.value = current;
      input.style.cssText = 'flex:1;background:var(--panel2);border:1px solid var(--yellow);border-radius:6px;padding:4px 7px;font-size:13px;color:#fff';
      titleEl.replaceWith(input);
      input.focus(); input.select();
      const save = async ()=>{
        const val = input.value.trim() || current;
        cachePatch('tasks', id, {title: val});
        renderKanban();
        try{ await updateDoc(doc(db,'tasks',id), {title: val}); }catch(ex){ toast('Error guardando', true); }
      };
      input.addEventListener('keydown', (e2)=>{ if(e2.key==='Enter') input.blur(); if(e2.key==='Escape'){ input.value=current; input.blur(); } });
      input.addEventListener('blur', save, {once:true});
    });
  });

  $$('[data-deltask]', container).forEach(btn=>btn.addEventListener('click', async (e)=>{
    e.stopPropagation();
    if(!confirm('¿Eliminar este pendiente?')) return;
    const id = btn.dataset.deltask;
    cacheRemove('tasks', id);
    renderKanban();
    try{ await deleteDoc(doc(db,'tasks',id)); }catch(ex){ toast('Error eliminando', true); }
  }));
  $$('[data-dellist]', container).forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('¿Eliminar esta lista y todos sus pendientes?')) return;
    const listId = btn.dataset.dellist;
    const toRemove = (CACHE.tasks||[]).filter(t=>t.listId===listId);
    for(const t of toRemove){ await deleteDoc(doc(db,'tasks',t.id)); cacheRemove('tasks', t.id); }
    await deleteDoc(doc(db,'tasklists',listId));
    cacheRemove('tasklists', listId);
    renderKanban();
  }));
}

function openAddListModal(){
  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>Nueva lista</h3>
    <form id="list-form">
      <div class="field"><label>Título de la lista</label><input type="text" id="l-title" required placeholder="Ej: Contenido, Publicidad, Producción"></div>
      <div class="modal-actions">
        <button type="submit" class="btn">Crear lista</button>
        <button type="button" class="btn-ghost" id="cancel-list">Cancelar</button>
      </div>
    </form>
  `);
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-list').addEventListener('click', closeModal);
  $('#list-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const data = { title: $('#l-title').value.trim(), createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString() };
    const ref = await addDoc(collection(db,'tasklists'), data);
    cacheSet('tasklists', ref.id, data);
    toast('Lista creada');
    closeModal();
    renderKanban();
  });
}

/* ============================================================
   VENTAS — mentorías / cursos vendidos por Jaime
   ============================================================ */
const DEFAULT_CATS = ['Mentoría','Curso'];
let saleFilter = 'Todas';

function saleAmounts(s){
  const paid = s.installments ? (s.installmentsList||[]).filter(i=>i.paid).reduce((a,i)=>a+Number(i.amount||0),0) : Number(s.totalAmount||0);
  const pending = Math.max(0, Number(s.totalAmount||0) - paid);
  return {paid, pending};
}

const renderVentas = guard(async function(main){
  await ensure('sales');
  const cats = ['Todas', ...new Set([...DEFAULT_CATS, ...(CACHE.sales||[]).map(s=>s.category)])];
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Ingresos</div><h1>Ventas</h1></div>
      <button class="btn" id="add-sale-btn">+ Registrar venta</button>
    </div>
    <div class="filter-pills" id="sale-filtros">
      ${cats.map(c=>`<button data-cat="${c}" class="${c===saleFilter?'active':''}">${c}</button>`).join('')}
    </div>
    <div class="list" id="sales-list"></div>
  `;
  $('#add-sale-btn').addEventListener('click', ()=>openAddSaleModal());
  $$('#sale-filtros button').forEach(b=>b.addEventListener('click', ()=>{
    saleFilter = b.dataset.cat;
    $$('#sale-filtros button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    renderSalesList();
  }));
  renderSalesList();
});

function renderSalesList(){
  const all = sortDesc(CACHE.sales || [], 'date');
  const docs = saleFilter === 'Todas' ? all : all.filter(s=>s.category === saleFilter);
  const list = $('#sales-list');
  if(docs.length === 0){ list.innerHTML = '<div class="empty">Sin ventas en esta categoría.</div>'; return; }

  list.innerHTML = docs.map(s=>{
    const {paid, pending} = saleAmounts(s);
    const pct = s.totalAmount ? Math.min(100, (paid/s.totalAmount)*100) : 100;
    return `<div class="sale-card" data-sale="${s.id}">
      <div class="sale-head">
        <div>
          <div class="sale-client">${esc(s.clientName)}</div>
          <div class="sale-product">${dateLabel(s.date)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="sale-badge">${esc(s.category)}</span>
          <button class="btn-edit" data-editsale="${s.id}">Editar</button>
          <button class="btn-danger" data-delsale="${s.id}" style="padding:6px 10px;font-size:10px">&times;</button>
        </div>
      </div>
      <div class="sale-nums">
        <div class="sale-num"><div class="l">Total</div><div class="v">${money(s.totalAmount, s.currency)}</div></div>
        <div class="sale-num"><div class="l">Pagado</div><div class="v" style="color:var(--green)">${money(paid, s.currency)}</div></div>
        <div class="sale-num"><div class="l">Pendiente</div><div class="v" style="color:${pending>0?'var(--yellow)':'var(--muted)'}">${money(pending, s.currency)}</div></div>
      </div>
      ${s.installments ? `
        <div class="sale-progress">
          <div class="sale-progress-track"><div class="sale-progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="inst-list">
          ${(s.installmentsList||[]).map((inst,ii)=>`
            <div class="inst-row">
              <div class="inst-check ${inst.paid?'done':''}" data-instcheck="${s.id}:${ii}">${checkIcon}</div>
              <div class="inst-label">Cuota ${ii+1}</div>
              <div class="inst-amt ${inst.paid?'done':''}">${money(inst.amount, s.currency)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>`;
  }).join('');

  $$('[data-instcheck]', list).forEach(chk=>chk.addEventListener('click', async ()=>{
    const [saleId, idx] = chk.dataset.instcheck.split(':');
    const s = (CACHE.sales||[]).find(x=>x.id===saleId);
    const instList = JSON.parse(JSON.stringify(s.installmentsList||[]));
    instList[idx].paid = !instList[idx].paid;
    instList[idx].paidDate = instList[idx].paid ? new Date().toISOString() : null;
    cachePatch('sales', saleId, {installmentsList: instList});
    renderSalesList();
    try{ await updateDoc(doc(db,'sales',saleId), {installmentsList: instList}); }
    catch(ex){ toast('Error actualizando cuota', true); }
  }));
  $$('[data-editsale]', list).forEach(btn=>btn.addEventListener('click', ()=>{
    openAddSaleModal((CACHE.sales||[]).find(x=>x.id===btn.dataset.editsale));
  }));
  $$('[data-delsale]', list).forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('¿Eliminar esta venta?')) return;
    await deleteDoc(doc(db,'sales',btn.dataset.delsale));
    cacheRemove('sales', btn.dataset.delsale);
    renderSalesList();
  }));
}

function installmentFieldsHTML(list){
  return (list||[]).map((inst,ii)=>`
    <div class="metric-row" style="grid-template-columns:1fr 1fr auto">
      <div style="font-size:12px;color:var(--muted);align-self:center">Cuota ${ii+1}</div>
      <input type="number" step="0.01" placeholder="Monto" data-inst-amount="${ii}" value="${inst.amount??''}">
      <button type="button" class="mini-x" data-del-inst="${ii}">&times;</button>
    </div>
  `).join('');
}

function openAddSaleModal(existing){
  const isEdit = !!existing;
  let draftCats = [...DEFAULT_CATS, ...new Set((CACHE.sales||[]).map(s=>s.category))].filter((v,i,a)=>a.indexOf(v)===i);
  let selCat = existing ? existing.category : DEFAULT_CATS[0];
  let selCur = existing ? existing.currency : CURRENCIES[0];
  let hasInst = existing ? !!existing.installments : false;
  let instDraft = existing && existing.installmentsList ? JSON.parse(JSON.stringify(existing.installmentsList)) : [];
  const isCustomCat = !DEFAULT_CATS.includes(selCat);

  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>${isEdit?'Editar venta':'Registrar venta'}</h3>
    <form id="sale-form">
      <div class="field"><label>Categoría</label>
        <div class="pillgroup" id="s-cat-group">
          ${DEFAULT_CATS.map(c=>`<button type="button" data-val="${c}" class="${c===selCat?'active':''}">${c}</button>`).join('')}
          <button type="button" data-val="__otro__" class="${isCustomCat?'active':''}">Otro</button>
        </div>
        <input type="text" id="s-cat-custom" placeholder="Nombre de la categoría" style="margin-top:8px" class="${isCustomCat?'':'hidden'}" value="${isCustomCat?esc(selCat):''}">
      </div>
      <div class="field"><label>Nombre del cliente</label><input type="text" id="s-client" required value="${existing?esc(existing.clientName):''}"></div>
      <div class="grid-2">
        <div class="field"><label>Monto total</label><input type="number" step="0.01" id="s-amount" required value="${existing?existing.totalAmount:''}"></div>
        <div class="field"><label>Moneda</label>
          <div class="pillgroup" id="s-cur-group">${CURRENCIES.map(c=>`<button type="button" data-val="${c}" class="${c===selCur?'active':''}">${c}</button>`).join('')}</div>
        </div>
      </div>
      <div class="field"><label>Fecha de venta</label><input type="date" id="s-date" required value="${existing?existing.date:new Date().toISOString().slice(0,10)}"></div>

      <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);cursor:pointer;margin-bottom:16px">
        <input type="checkbox" id="s-installments" ${hasInst?'checked':''}> ¿Está pagando en cuotas?
      </label>
      <div id="s-installments-fields" class="${hasInst?'':'hidden'}">
        <div id="inst-builder">${installmentFieldsHTML(instDraft)}</div>
        <button type="button" class="mini-add" id="add-inst-btn">+ Agregar cuota</button>
      </div>

      <div class="modal-actions">
        <button type="submit" class="btn">${isEdit?'Guardar cambios':'Guardar venta'}</button>
        <button type="button" class="btn-ghost" id="cancel-sale">Cancelar</button>
      </div>
    </form>
  `);

  $$('#s-cat-group button').forEach(b=>b.addEventListener('click', ()=>{
    $$('#s-cat-group button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    if(b.dataset.val==='__otro__'){ selCat='__otro__'; $('#s-cat-custom').classList.remove('hidden'); $('#s-cat-custom').focus(); }
    else { selCat = b.dataset.val; $('#s-cat-custom').classList.add('hidden'); }
  }));
  $$('#s-cur-group button').forEach(b=>b.addEventListener('click', ()=>{
    $$('#s-cur-group button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selCur = b.dataset.val;
  }));
  $('#s-installments').addEventListener('change', (e)=>{
    hasInst = e.target.checked;
    $('#s-installments-fields').classList.toggle('hidden', !hasInst);
    if(hasInst && instDraft.length===0){ instDraft.push({amount:'', paid:false}); $('#inst-builder').innerHTML = installmentFieldsHTML(instDraft); }
  });
  $('#add-inst-btn').addEventListener('click', ()=>{
    instDraft.push({amount:'', paid:false});
    $('#inst-builder').innerHTML = installmentFieldsHTML(instDraft);
  });
  $('#inst-builder').addEventListener('input', (e)=>{
    if(e.target.dataset.instAmount!=null) instDraft[parseInt(e.target.dataset.instAmount)].amount = e.target.value;
  });
  $('#inst-builder').addEventListener('click', (e)=>{
    if(e.target.dataset.delInst!=null){ instDraft.splice(parseInt(e.target.dataset.delInst),1); $('#inst-builder').innerHTML = installmentFieldsHTML(instDraft); }
  });

  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-sale').addEventListener('click', closeModal);
  $('#sale-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const finalCat = selCat==='__otro__' ? $('#s-cat-custom').value.trim() : selCat;
    if(!finalCat){ toast('Ponle un nombre a la categoría', true); return; }

    const data = {
      category: finalCat,
      clientName: $('#s-client').value.trim(),
      totalAmount: Number($('#s-amount').value||0),
      currency: selCur,
      date: $('#s-date').value,
      installments: hasInst
    };
    if(hasInst){
      data.installmentsList = instDraft.filter(i=>i.amount!=='').map(i=>({
        amount: Number(i.amount||0), paid: !!i.paid, paidDate: i.paidDate||null
      }));
    } else {
      data.installmentsList = null;
    }

    try{
      if(isEdit){
        await updateDoc(doc(db,'sales',existing.id), data);
        cachePatch('sales', existing.id, data);
        toast('Venta actualizada');
      } else {
        data.createdBy = CURRENT_EMAIL; data.createdAt = new Date().toISOString();
        const ref = await addDoc(collection(db,'sales'), data);
        cacheSet('sales', ref.id, data);
        toast('Venta registrada');
      }
      closeModal();
      renderVentas($('#main'));
    }catch(ex){
      toast('Error guardando: ' + ex.message, true);
    }
  });
}

/* ============================================================
   MODAL GENÉRICO
   ============================================================ */
function openModal(html){
  $('#modal-box').innerHTML = html;
  $('#modal-bg').classList.add('open');
}
function closeModal(){ $('#modal-bg').classList.remove('open'); $('#modal-box').innerHTML=''; }
$('#modal-bg').addEventListener('click', (e)=>{ if(e.target.id==='modal-bg') closeModal(); });

/* ============================================================
   MODAL DE VIDEO (TikTok / Instagram)
   ============================================================ */
(function(){
  const bg = $('#vmodal-bg'), box = $('#vmodal-box'), content = $('#vmodal-content'), closeBtn = $('#vmodal-close');
  function open(platform, id){
    if(!id) return;
    box.className = 'vmodal-box ' + (platform === 'tiktok' ? 'tt' : 'ig');
    if(platform === 'tiktok'){
      content.innerHTML = `<iframe src="https://www.tiktok.com/embed/v2/${id}" allow="encrypted-media;" allowfullscreen></iframe>`;
    } else {
      const permalink = 'https://www.instagram.com/reel/' + id + '/';
      content.innerHTML = `<blockquote class="instagram-media" data-instgrm-permalink="${permalink}" data-instgrm-version="14" style="margin:0;width:100%;"><a href="${permalink}"></a></blockquote>`;
      const process = () => { if(window.instgrm) window.instgrm.Embeds.process(); };
      if(window.instgrm) process();
      else { let tries=0; const w = setInterval(()=>{ tries++; if(window.instgrm){process();clearInterval(w);} if(tries>40) clearInterval(w); },250); }
    }
    bg.classList.add('open');
  }
  function close(){ bg.classList.remove('open'); content.innerHTML=''; }
  document.addEventListener('click', (e)=>{
    const thumb = e.target.closest('.vthumb');
    if(thumb){ open(thumb.dataset.platform, thumb.dataset.id); return; }
    if(e.target === bg) close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });
})();
