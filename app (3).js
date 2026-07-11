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
  deleteDoc, query, orderBy, limit, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const fbApp = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

let ROLE = null;        // 'agency' | 'client'
let CURRENT_EMAIL = null;
let MONTHS_CACHE = [];  // lista de meses (ids) ya cargados desde Firestore, más reciente primero

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
const playIcon = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>';
const checkIcon = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
   + Ventas & Publicidad calculada automática desde sales/payments
   ============================================================ */
const ICONS = {
  tiktok: '<svg viewBox="0 0 24 24" fill="none"><path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" fill="currentColor"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" stroke="none"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="M10.5 9.5v5l4.5-2.5-4.5-2.5z" fill="#000"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4h6v6M20 4l-9 9M6 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const PLATFORM_DEFS = {
  tiktok: {
    label: 'TikTok', icon: ICONS.tiktok, url: 'https://www.tiktok.com/@jaimebarbosa___',
    fields: [
      {key:'followersTotal', label:'Seguidores totales'},
      {key:'followersNew', label:'Seguidores nuevos'},
      {key:'videoViews', label:'Vistas de video'},
      {key:'profileViews', label:'Vistas del perfil'},
      {key:'likes', label:'Me gusta'},
      {key:'comments', label:'Comentarios'},
      {key:'shares', label:'Compartidos'},
      {key:'videosPosted', label:'Videos publicados'}
    ],
    engagementOn: 'videoViews'
  },
  instagram: {
    label: 'Instagram', icon: ICONS.instagram, url: 'https://www.instagram.com/jaimebarbosa___/',
    fields: [
      {key:'followersTotal', label:'Seguidores totales'},
      {key:'followersNew', label:'Seguidores nuevos'},
      {key:'reach', label:'Alcance'},
      {key:'views', label:'Visualizaciones'},
      {key:'likes', label:'Me gusta'},
      {key:'comments', label:'Comentarios'},
      {key:'saves', label:'Guardados'},
      {key:'shares', label:'Compartidos'},
      {key:'postsPublished', label:'Publicaciones / Reels'}
    ],
    engagementOn: 'views'
  },
  youtube: {
    label: 'YouTube', icon: ICONS.youtube, url: 'https://www.youtube.com/@jaimebarbosa19/videos',
    fields: [
      {key:'subsTotal', label:'Suscriptores totales'},
      {key:'subsNew', label:'Suscriptores nuevos'},
      {key:'views', label:'Vistas'},
      {key:'likes', label:'Me gusta'},
      {key:'comments', label:'Comentarios'},
      {key:'videosPosted', label:'Videos publicados'}
    ],
    engagementOn: 'views'
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

/* ---------------- Ventas & Publicidad (100% automático) ---------------- */
async function computeVentasPublicidad(monthId){
  const [salesSnap, paymentsSnap] = await Promise.all([
    getDocs(collection(db,'sales')),
    getDocs(collection(db,'payments'))
  ]);
  const inMonth = (dateStr) => (dateStr||'').slice(0,7) === monthId;

  // Nota: solo se suman registros en USD (si tienes ventas/pagos en COP o EUR,
  // no se incluyen aquí para no mezclar monedas distintas en un solo total).
  const facturacion = salesSnap.docs
    .filter(d=>inMonth(d.data().date) && (d.data().currency||'USD')==='USD')
    .reduce((a,d)=>a+Number(d.data().totalAmount||0),0);

  const inversionAds = paymentsSnap.docs
    .filter(d=>d.data().category==='Publicidad' && inMonth(d.data().date) && (d.data().currency||'USD')==='USD')
    .reduce((a,d)=>a+Number(d.data().amount||0),0);

  const roas = inversionAds > 0 ? (facturacion/inversionAds) : null;
  return {facturacion, inversionAds, roas};
}

/* ============================================================
   RESUMEN
   ============================================================ */
const renderResumen = guard(async function(main){
  const monthsSnap = await getDocs(query(collection(db,'metrics'), orderBy('month','desc'), limit(2)));
  const months = monthsSnap.docs;
  main.innerHTML = `<div class="main-head"><div><div class="eyebrow">Panel general</div><h1>Resumen</h1></div></div>`;

  if(months.length === 0){
    main.innerHTML += `<div class="empty">Todavía no hay métricas cargadas.${isAgency()?' Ve a "Métricas mensuales" para agregar el primer mes.':''}</div>`;
  } else {
    const latest = months[0].data();
    main.innerHTML += `<div class="section-title"><span>Último mes cargado — ${monthLabel(months[0].id)}</span><span class="line"></span></div>`;
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
    const vp = await computeVentasPublicidad(months[0].id);
    main.innerHTML += `
      <div style="font-size:13px;font-weight:700;margin:18px 0 10px">Ventas &amp; Publicidad</div>
      <div class="grid-3">
        <div class="card stat-card"><div class="label">Facturación</div><div class="value">${money(vp.facturacion)}</div></div>
        <div class="card stat-card"><div class="label">Inversión ADS</div><div class="value">${money(vp.inversionAds)}</div></div>
        <div class="card stat-card"><div class="label">ROAS</div><div class="value">${vp.roas!=null?vp.roas.toFixed(2)+'x':'—'}</div></div>
      </div>
    `;
  }

  const [tasksSnap, salesSnap] = await Promise.all([
    getDocs(query(collection(db,'tasks'), where('done','==', false))),
    getDocs(collection(db,'sales'))
  ]);
  main.innerHTML += `
    <div class="section-title"><span>Estado general</span><span class="line"></span></div>
    <div class="grid-3">
      <div class="card stat-card"><div class="label">Tareas pendientes</div><div class="value">${tasksSnap.size}</div></div>
      <div class="card stat-card"><div class="label">Ventas registradas</div><div class="value">${salesSnap.size}</div></div>
    </div>
  `;
});

/* ============================================================
   MÉTRICAS MENSUALES
   ============================================================ */
async function loadMonthIds(){
  const snap = await getDocs(query(collection(db,'metrics'), orderBy('month','desc')));
  MONTHS_CACHE = snap.docs.map(d=>d.id);
  return MONTHS_CACHE;
}

const renderMetricas = guard(async function(main, selectedMonth){
  const months = await loadMonthIds();
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
  picker.innerHTML = months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');
  const month = selectedMonth && months.includes(selectedMonth) ? selectedMonth : months[0];
  picker.value = month;
  picker.addEventListener('change', ()=> renderMonthDetail(picker.value));
  await renderMonthDetail(month);
});

async function renderMonthDetail(monthId){
  const body = $('#metrics-body');
  body.innerHTML = '<div class="spin"></div>';
  try{
    const snap = await getDoc(doc(db,'metrics',monthId));
    const d = snap.exists() ? snap.data() : {};

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

    const vp = await computeVentasPublicidad(monthId);
    html += `
      <div class="section-title"><span>Ventas &amp; Publicidad</span><span class="line"></span></div>
      <div class="grid-3">
        <div class="card stat-card"><div class="label">Facturación</div><div class="value">${money(vp.facturacion)}</div>
          <div class="mono muted" style="font-size:10.5px;margin-top:8px">Suma automática de "Ventas" este mes</div></div>
        <div class="card stat-card"><div class="label">Inversión ADS</div><div class="value">${money(vp.inversionAds)}</div>
          <div class="mono muted" style="font-size:10.5px;margin-top:8px">Suma de "Pagos" categoría Publicidad</div></div>
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
        toast('Mes eliminado');
        renderMetricas($('#main'));
      });
    }
  }catch(ex){
    console.error(ex);
    body.innerHTML = `<div class="empty" style="border-color:rgba(255,59,59,.4);color:#ff8a8a">Error cargando el mes.<br><span class="mono" style="font-size:11px">${esc(ex.message||ex)}</span></div>`;
  }
}

/* ---------------- Agregar / editar mes: formulario fijo + pegar JSON ---------------- */
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

function openAddMonthModal(editMonthId, existingData){
  const now = new Date();
  const defaultId = editMonthId || (now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0'));
  const data = existingData || {};

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
      $$('.modal-tab', modal)[0].click();
      toast('Datos cargados — revísalos antes de guardar');
    }catch(ex){
      toast('JSON inválido: ' + ex.message, true);
    }
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

    const btn = $('#save-month-btn'); btn.disabled = true; btn.textContent = 'Guardando…';
    try{
      await setDoc(doc(db,'metrics',monthId), payload);
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


/* Comprime una imagen en el navegador y la devuelve como data URL (base64),
   para guardarla directo en Firestore sin necesidad de ningún servicio externo. */
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

/* lightbox simple para ver fotos de recibos */
function openLightbox(src){
  $('#imglightbox-img').src = src;
  $('#imglightbox-bg').classList.add('open');
}
$('#imglightbox-bg').addEventListener('click', ()=> $('#imglightbox-bg').classList.remove('open'));

/* ============================================================
   PAGOS — herramientas / agencia. Ambos roles ven y agregan.
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
  $('#add-payment-btn').addEventListener('click', openAddPaymentModal);
  $$('#pagos-filtros button').forEach(b=>b.addEventListener('click', ()=>{
    payFilter = b.dataset.cat;
    $$('#pagos-filtros button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    loadPayments();
  }));
  await loadPayments();
});

async function loadPayments(){
  const snap = await getDocs(query(collection(db,'payments'), orderBy('date','desc')));
  const totals = {};
  snap.docs.forEach(d=>{
    const p = d.data();
    totals[p.currency] = (totals[p.currency]||0) + Number(p.amount||0);
  });
  $('#pagos-totales').innerHTML = CURRENCIES.map(c=>`
    <div class="card stat-card"><div class="label">Total ${c}</div><div class="value">${money(totals[c]||0, c)}</div></div>
  `).join('');

  const docs = payFilter === 'Todos' ? snap.docs : snap.docs.filter(d=>d.data().category === payFilter);
  const list = $('#pagos-list');
  if(docs.length === 0){ list.innerHTML = '<div class="empty" style="grid-column:1/-1">Sin pagos en esta categoría.</div>'; return; }
  list.innerHTML = docs.map(d=>{
    const p = d.data();
    return `<div class="pay-card">
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
          ${p.receiptUrl ? `<img src="${p.receiptUrl}" class="pay-thumb" data-lightbox="${d.id}">` : ''}
          <button class="btn-danger" data-del="${d.id}" style="padding:6px 10px;font-size:10px">&times;</button>
        </div>
      </div>
    </div>`;
  }).join('');
  $$('[data-lightbox]', list).forEach(img=>img.addEventListener('click', ()=> openLightbox(img.src)));
  $$('[data-del]', list).forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('¿Eliminar este pago?')) return;
    await deleteDoc(doc(db,'payments',btn.dataset.del));
    loadPayments();
  }));
}

function openAddPaymentModal(){
  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>Agregar pago</h3>
    <form id="payment-form">
      <div class="field"><label>Categoría</label>
        <div class="pillgroup" id="p-cat-group">${CATEGORIES.map((c,i)=>`<button type="button" data-val="${c}" class="${i===0?'active':''}">${c}</button>`).join('')}</div>
      </div>
      <div class="field"><label>Nombre</label><input type="text" id="p-name" required placeholder="Ej: Notion, CapCut Pro, Meta Ads"></div>
      <div class="grid-2">
        <div class="field"><label>Monto</label><input type="number" step="0.01" id="p-amount" required></div>
        <div class="field"><label>Moneda</label>
          <div class="pillgroup" id="p-cur-group">${CURRENCIES.map((c,i)=>`<button type="button" data-val="${c}" class="${i===0?'active':''}">${c}</button>`).join('')}</div>
        </div>
      </div>
      <div class="field"><label>Fecha</label><input type="date" id="p-date" required value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Foto del recibo (opcional)</label><input type="file" id="p-receipt" accept="image/*"></div>
      <div class="modal-actions">
        <button type="submit" class="btn" id="p-submit-btn">Guardar</button>
        <button type="button" class="btn-ghost" id="cancel-payment">Cancelar</button>
      </div>
    </form>
  `);
  let selCat = CATEGORIES[0], selCur = CURRENCIES[0];
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
        date: $('#p-date').value, createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString()
      };
      const file = $('#p-receipt').files[0];
      if(file) data.receiptUrl = await compressImage(file);
      await addDoc(collection(db,'payments'), data);
      toast('Pago agregado');
      closeModal();
      loadPayments();
    }catch(ex){
      toast(ex.message || 'Error guardando el pago', true);
    }finally{
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  });
}

/* ============================================================
   TAREAS — organizadas por listas
   ============================================================ */
const renderTareas = guard(async function(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Seguimiento</div><h1>Tareas</h1></div>
      <button class="btn" id="add-list-btn">+ Nueva lista</button>
    </div>
    <div id="lists-container" class="kanban"></div>
  `;
  $('#add-list-btn').addEventListener('click', openAddListModal);
  await loadTaskLists();
});

async function loadTaskLists(){
  const container = $('#lists-container');
  const [listsSnap, tasksSnap] = await Promise.all([
    getDocs(query(collection(db,'tasklists'), orderBy('createdAt','asc'))),
    getDocs(query(collection(db,'tasks'), orderBy('createdAt','desc')))
  ]);
  if(listsSnap.empty){ container.innerHTML = '<div class="empty" style="width:100%">Aún no hay listas. Crea una con "+ Nueva lista".</div>'; return; }

  container.innerHTML = listsSnap.docs.map(l=>{
    const list = l.data();
    const items = tasksSnap.docs.filter(t=>t.data().listId === l.id);
    const pending = items.filter(t=>!t.data().done);
    const done = items.filter(t=>t.data().done);
    return `
      <div class="kanban-col" data-list="${l.id}">
        <div class="kanban-col-head">
          <div class="kanban-col-title">${esc(list.title)}</div>
          <div class="kanban-col-count">${pending.length}</div>
        </div>
        <div class="kanban-col-body">
          ${[...pending, ...done].map(t=>taskRow(t)).join('') || '<div class="empty" style="padding:20px;font-size:11.5px">Sin tareas todavía.</div>'}
        </div>
        <div class="kanban-col-foot">
          <button class="btn-ghost" data-addtask="${l.id}">+ Tarea</button>
          <button class="btn-danger" data-dellist="${l.id}">Eliminar</button>
        </div>
      </div>
    `;
  }).join('') + `<button class="kanban-addcol" id="add-list-btn-2">+ Nueva lista</button>`;

  function taskRow(d){
    const t = d.data();
    return `<div class="list-row task-row" style="padding:11px 12px;border-radius:12px">
      <div class="task-check ${t.done?'done':''}" data-id="${d.id}" data-done="${!!t.done}">${checkIcon}</div>
      <div class="task-title ${t.done?'done':''}" style="font-size:13px">${esc(t.title)}</div>
      <button class="btn-danger" data-deltask="${d.id}" style="padding:5px 10px;font-size:10px">&times;</button>
    </div>`;
  }

  const btn2 = $('#add-list-btn-2');
  if(btn2) btn2.addEventListener('click', openAddListModal);
  $$('.task-check', container).forEach(box=>box.addEventListener('click', async ()=>{
    const nowDone = box.dataset.done !== 'true';
    await updateDoc(doc(db,'tasks',box.dataset.id), { done: nowDone, doneAt: nowDone ? new Date().toISOString() : null });
    loadTaskLists();
  }));
  $$('[data-deltask]', container).forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('¿Eliminar esta tarea?')) return;
    await deleteDoc(doc(db,'tasks',btn.dataset.deltask));
    loadTaskLists();
  }));
  $$('[data-addtask]', container).forEach(btn=>btn.addEventListener('click', ()=> openAddTaskModal(btn.dataset.addtask)));
  $$('[data-dellist]', container).forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('¿Eliminar esta lista y todas sus tareas?')) return;
    const listId = btn.dataset.dellist;
    const tSnap = await getDocs(query(collection(db,'tasks'), where('listId','==',listId)));
    await Promise.all(tSnap.docs.map(d=>deleteDoc(doc(db,'tasks',d.id))));
    await deleteDoc(doc(db,'tasklists',listId));
    loadTaskLists();
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
    await addDoc(collection(db,'tasklists'), { title: $('#l-title').value.trim(), createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString() });
    toast('Lista creada');
    closeModal();
    loadTaskLists();
  });
}
function openAddTaskModal(listId){
  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>Nueva tarea</h3>
    <form id="task-form">
      <div class="field"><label>Título</label><input type="text" id="t-title" required placeholder="Ej: Subir video de la semana"></div>
      <div class="modal-actions">
        <button type="submit" class="btn">Agregar</button>
        <button type="button" class="btn-ghost" id="cancel-task">Cancelar</button>
      </div>
    </form>
  `);
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-task').addEventListener('click', closeModal);
  $('#task-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    await addDoc(collection(db,'tasks'), { listId, title: $('#t-title').value.trim(), done:false, createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString() });
    toast('Tarea agregada');
    closeModal();
    loadTaskLists();
  });
}

/* ============================================================
   VENTAS — mentorías / cursos vendidos por Jaime
   ============================================================ */
const PRODUCT_TYPES = ['Mentoría','Curso','Otro'];

const renderVentas = guard(async function(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Ingresos</div><h1>Ventas</h1></div>
      <button class="btn" id="add-sale-btn">+ Registrar venta</button>
    </div>
    <div class="list" id="sales-list"></div>
  `;
  $('#add-sale-btn').addEventListener('click', openAddSaleModal);
  await loadSales();
});

async function loadSales(){
  const snap = await getDocs(query(collection(db,'sales'), orderBy('date','desc')));
  const list = $('#sales-list');
  if(snap.empty){ list.innerHTML = '<div class="empty">Aún no hay ventas registradas.</div>'; return; }
  list.innerHTML = snap.docs.map(d=>{
    const s = d.data();
    const paid = s.installments ? (s.totalAmount/s.totalInstallments)*s.paidInstallments : s.totalAmount;
    const pending = s.totalAmount - paid;
    const pct = s.totalAmount ? Math.min(100, (paid/s.totalAmount)*100) : 100;
    return `<div class="sale-card">
      <div class="sale-head">
        <div>
          <div class="sale-client">${esc(s.clientName)}</div>
          <div class="sale-product">${esc(s.productName)} · ${dateLabel(s.date)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="sale-badge">${esc(s.productType)}</span>
          <button class="btn-danger" data-del="${d.id}" style="padding:6px 10px;font-size:10px">&times;</button>
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
          <div class="sale-progress-label">${s.paidInstallments} de ${s.totalInstallments} cuotas pagadas</div>
        </div>` : ''}
    </div>`;
  }).join('');
  $$('[data-del]', list).forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('¿Eliminar esta venta?')) return;
    await deleteDoc(doc(db,'sales',btn.dataset.del));
    loadSales();
  }));
}

function openAddSaleModal(){
  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>Registrar venta</h3>
    <form id="sale-form">
      <div class="field"><label>Tipo de producto</label>
        <div class="pillgroup" id="s-type-group">${PRODUCT_TYPES.map((c,i)=>`<button type="button" data-val="${c}" class="${i===0?'active':''}">${c}</button>`).join('')}</div>
      </div>
      <div class="field"><label>Nombre del producto</label><input type="text" id="s-product" required placeholder="Ej: Mentoría Trading Avanzado"></div>
      <div class="field"><label>Nombre del cliente</label><input type="text" id="s-client" required></div>
      <div class="grid-2">
        <div class="field"><label>Monto total</label><input type="number" step="0.01" id="s-amount" required></div>
        <div class="field"><label>Moneda</label>
          <div class="pillgroup" id="s-cur-group">${CURRENCIES.map((c,i)=>`<button type="button" data-val="${c}" class="${i===0?'active':''}">${c}</button>`).join('')}</div>
        </div>
      </div>
      <div class="field"><label>Fecha de venta</label><input type="date" id="s-date" required value="${new Date().toISOString().slice(0,10)}"></div>

      <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);cursor:pointer;margin-bottom:16px">
        <input type="checkbox" id="s-installments"> ¿Está pagando en cuotas?
      </label>
      <div id="s-installments-fields" class="grid-2 hidden">
        <div class="field"><label>Cuotas totales</label><input type="number" id="s-total-inst" min="1"></div>
        <div class="field"><label>Cuotas pagadas</label><input type="number" id="s-paid-inst" min="0" value="0"></div>
      </div>

      <div class="modal-actions">
        <button type="submit" class="btn">Guardar venta</button>
        <button type="button" class="btn-ghost" id="cancel-sale">Cancelar</button>
      </div>
    </form>
  `);
  let selType = PRODUCT_TYPES[0], selCur = CURRENCIES[0];
  $$('#s-type-group button').forEach(b=>b.addEventListener('click', ()=>{
    $$('#s-type-group button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selType = b.dataset.val;
  }));
  $$('#s-cur-group button').forEach(b=>b.addEventListener('click', ()=>{
    $$('#s-cur-group button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selCur = b.dataset.val;
  }));
  $('#s-installments').addEventListener('change', (e)=>{
    $('#s-installments-fields').classList.toggle('hidden', !e.target.checked);
  });
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-sale').addEventListener('click', closeModal);
  $('#sale-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const hasInst = $('#s-installments').checked;
    const totalInst = hasInst ? Number($('#s-total-inst').value||1) : null;
    const paidInst = hasInst ? Number($('#s-paid-inst').value||0) : null;
    if(hasInst && paidInst > totalInst){ toast('Las cuotas pagadas no pueden ser más que el total', true); return; }
    await addDoc(collection(db,'sales'), {
      productType: selType,
      productName: $('#s-product').value.trim(),
      clientName: $('#s-client').value.trim(),
      totalAmount: Number($('#s-amount').value||0),
      currency: selCur,
      date: $('#s-date').value,
      installments: hasInst,
      totalInstallments: totalInst,
      paidInstallments: paidInst,
      createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString()
    });
    toast('Venta registrada');
    closeModal();
    loadSales();
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
