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
  const renderers = { resumen: renderResumen, metricas: renderMetricas, pagos: renderPagos, tareas: renderTareas, ideas: renderIdeas };
  (renderers[view] || renderResumen)(main);
}

/* ============================================================
   MÉTRICAS — helpers genéricos para plataformas flexibles
   ============================================================ */
function genericStatCard(label, m){
  m = m || {};
  const displayVal = typeof m.value === 'number' ? fmt(m.value) : (m.value ?? '—');
  return `<div class="card stat-card">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(displayVal)}</div>
    ${m.delta ? `<div class="delta up">↑ ${esc(m.delta)}${m.pct?` (${esc(m.pct)})`:''}</div>` : ''}
  </div>`;
}
function findMetric(platform, label){
  if(!platform || !platform.metrics) return null;
  return platform.metrics.find(m=>m.label===label) || null;
}
function findPlatform(doc, name){
  if(!doc || !doc.platforms) return null;
  return doc.platforms.find(p=>p.name===name) || null;
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
    const prev = months[1] ? months[1].data() : null;
    const plats = latest.platforms || [];

    main.innerHTML += `<div class="section-title"><span>Último mes cargado — ${monthLabel(months[0].id)}</span><span class="line"></span></div>`;
    plats.forEach(p=>{
      const prevP = prev ? findPlatform(prev, p.name) : null;
      main.innerHTML += `
        <div style="font-size:13px;font-weight:700;margin:18px 0 10px">${esc(p.name)}</div>
        <div class="grid-3">
          ${(p.metrics||[]).map(m=>{
            const enriched = {...m};
            if(!enriched.delta && prevP){
              const pm = findMetric(prevP, m.label);
              if(pm && typeof pm.value === 'number' && typeof m.value === 'number' && pm.value !== 0){
                const pct = ((m.value - pm.value)/Math.abs(pm.value))*100;
                enriched.delta = (pct>=0?'+':'') + pct.toFixed(1) + '%';
                enriched.pct = 'vs mes anterior';
              }
            }
            return genericStatCard(m.label, enriched);
          }).join('')}
        </div>
      `;
    });
  }

  const [tasksSnap, ideasSnap] = await Promise.all([
    getDocs(query(collection(db,'tasks'), where('done','==', false))),
    getDocs(collection(db,'ideas'))
  ]);
  main.innerHTML += `
    <div class="section-title"><span>Estado general</span><span class="line"></span></div>
    <div class="grid-3">
      <div class="card stat-card"><div class="label">Tareas pendientes</div><div class="value">${tasksSnap.size}</div></div>
      <div class="card stat-card"><div class="label">Ideas guardadas</div><div class="value">${ideasSnap.size}</div></div>
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
    if(!snap.exists()){ body.innerHTML = '<div class="empty">No se encontró ese mes.</div>'; return; }
    const d = snap.data();
    const plats = d.platforms || [];

    if(plats.length === 0){
      body.innerHTML = '<div class="empty">Este mes no tiene plataformas cargadas.</div>';
      return;
    }

    body.innerHTML = plats.map(p=>`
      <div class="section-title"><span>${esc(p.name)}</span><span class="line"></span></div>
      <div class="grid-4">${(p.metrics||[]).map(m=>genericStatCard(m.label,m)).join('') || '<div class="empty">Sin métricas.</div>'}</div>
      ${(p.videos&&p.videos.length) ? `
        <div style="font-size:11px;color:var(--muted);margin:16px 0 10px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.1em">Videos</div>
        <div class="video-thumbs">${p.videos.map((v,i)=>`
          <div class="vthumb" data-platform="${v.type}" data-id="${v.id||''}">
            ${v.thumb?`<img src="${esc(v.thumb)}" alt="">`:''}
            <div class="vidx">0${i+1}</div>
            <div class="vplay"><span>${playIcon}</span></div>
            <div class="vviews"><span>${fmt(v.views)}</span><span>${v.type==='tiktok'?'TikTok':'Reel'}</span></div>
          </div>`).join('')}</div>` : ''}
    `).join('');

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

/* ---------------- Agregar / editar mes: formulario dinámico + pegar JSON ---------------- */
let draftPlatforms = [];

function newMetric(){ return {label:'', value:'', delta:'', pct:''}; }
function newVideo(){ return {type:'tiktok', views:'', id:'', thumb:''}; }
function newPlatform(){ return {name:'', metrics:[newMetric()], videos:[]}; }

function metricRowHTML(m,pi,mi){
  return `<div class="metric-row">
    <input type="text" placeholder="Etiqueta" data-field="label" data-plat="${pi}" data-metric="${mi}" value="${esc(m.label)}">
    <input type="text" placeholder="Valor" data-field="value" data-plat="${pi}" data-metric="${mi}" value="${esc(m.value)}">
    <input type="text" placeholder="Delta" data-field="delta" data-plat="${pi}" data-metric="${mi}" value="${esc(m.delta)}">
    <input type="text" placeholder="%" data-field="pct" data-plat="${pi}" data-metric="${mi}" value="${esc(m.pct)}">
    <button type="button" class="mini-x" data-del-metric="${pi}:${mi}">&times;</button>
  </div>`;
}
function videoRowHTML(v,pi,vi){
  return `<div class="metric-row" style="grid-template-columns:.9fr 1fr 1.3fr 1.3fr auto">
    <select data-field="type" data-plat="${pi}" data-video="${vi}">
      <option value="tiktok" ${v.type==='tiktok'?'selected':''}>TikTok</option>
      <option value="instagram" ${v.type==='instagram'?'selected':''}>Instagram</option>
    </select>
    <input type="text" placeholder="Vistas" data-field="views" data-plat="${pi}" data-video="${vi}" value="${esc(v.views)}">
    <input type="text" placeholder="ID / shortcode" data-field="id" data-plat="${pi}" data-video="${vi}" value="${esc(v.id)}">
    <input type="text" placeholder="assets/thumbs/..." data-field="thumb" data-plat="${pi}" data-video="${vi}" value="${esc(v.thumb)}">
    <button type="button" class="mini-x" data-del-video="${pi}:${vi}">&times;</button>
  </div>`;
}
function platformBlockHTML(p,pi){
  const hasVideos = p.videos && p.videos.length > 0;
  return `<div class="platform-block">
    <div class="platform-block-head">
      <input type="text" placeholder="Nombre de la plataforma (ej: TikTok, Meta Ads)" data-field="name" data-plat="${pi}" value="${esc(p.name)}">
      <button type="button" class="mini-x" data-del-platform="${pi}">&times;</button>
    </div>
    <div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;font-family:var(--mono)">Métricas</div>
    ${p.metrics.map((m,mi)=>metricRowHTML(m,pi,mi)).join('')}
    <button type="button" class="mini-add" data-add-metric="${pi}">+ Agregar métrica</button>
    <div style="margin-top:14px">
      <label style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--muted);cursor:pointer">
        <input type="checkbox" data-field="hasVideos" data-plat="${pi}" ${hasVideos?'checked':''}> Tiene videos con link (TikTok/Instagram)
      </label>
      <div data-videos-wrap="${pi}" class="${hasVideos?'':'hidden'}" style="margin-top:10px">
        ${(p.videos||[]).map((v,vi)=>videoRowHTML(v,pi,vi)).join('')}
        <button type="button" class="mini-add" data-add-video="${pi}">+ Agregar video</button>
      </div>
    </div>
  </div>`;
}
function renderPlatformsBuilder(){
  const wrap = $('#platforms-builder');
  if(!wrap) return;
  wrap.innerHTML = draftPlatforms.map((p,pi)=>platformBlockHTML(p,pi)).join('') ||
    '<div class="empty" style="padding:26px">Aún no has agregado ninguna plataforma.</div>';
}

function openAddMonthModal(editMonthId, existingData){
  const now = new Date();
  const defaultId = editMonthId || (now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0'));
  draftPlatforms = existingData && existingData.platforms
    ? JSON.parse(JSON.stringify(existingData.platforms)).map(p=>({...p, metrics:p.metrics||[], videos:p.videos||[]}))
    : [newPlatform()];

  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>${editMonthId ? 'Editar mes' : 'Agregar mes'}</h3>
    <div class="modal-tabs">
      <button type="button" class="modal-tab active" data-tab="form">Formulario</button>
      <button type="button" class="modal-tab" data-tab="paste">Pegar datos</button>
    </div>

    <div id="tab-form">
      <div class="field"><label>Mes (AAAA-MM)</label><input type="text" id="f-month" value="${defaultId}" pattern="\\d{4}-\\d{2}" required></div>
      <div style="font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin:22px 0 12px;font-family:var(--mono)">Plataformas</div>
      <div id="platforms-builder"></div>
      <button type="button" class="mini-add" id="add-platform-btn" style="margin-top:6px">+ Agregar plataforma</button>
      <div class="modal-actions">
        <button type="button" class="btn" id="save-month-btn">Guardar mes</button>
        <button type="button" class="btn-ghost" id="cancel-month">Cancelar</button>
      </div>
    </div>

    <div id="tab-paste" class="hidden paste-box">
      <div class="paste-hint">Pega aquí el bloque de datos en formato JSON (te lo genero yo cuando me pasas el informe en el chat). Al cargarlo, podrás revisarlo en la pestaña "Formulario" antes de guardar.</div>
      <textarea id="paste-textarea" placeholder='{"month":"2026-07","platforms":[{"name":"TikTok","metrics":[{"label":"Vistas del video","value":26900,"delta":"+24.8K","pct":"1180%"}]}]}'></textarea>
      <button type="button" class="btn" id="load-paste-btn" style="width:100%;margin-top:14px">Cargar datos</button>
    </div>
  `);

  renderPlatformsBuilder();

  const modal = $('#modal-box');
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-month').addEventListener('click', closeModal);

  // tabs
  $$('.modal-tab', modal).forEach(tabBtn=>{
    tabBtn.addEventListener('click', ()=>{
      $$('.modal-tab', modal).forEach(b=>b.classList.remove('active'));
      tabBtn.classList.add('active');
      $('#tab-form').classList.toggle('hidden', tabBtn.dataset.tab !== 'form');
      $('#tab-paste').classList.toggle('hidden', tabBtn.dataset.tab !== 'paste');
    });
  });

  // pegar datos
  $('#load-paste-btn').addEventListener('click', ()=>{
    try{
      const parsed = JSON.parse($('#paste-textarea').value);
      if(parsed.month) $('#f-month').value = parsed.month;
      draftPlatforms = (parsed.platforms||[]).map(p=>({
        name: p.name||'',
        metrics: (p.metrics||[]).map(m=>({label:m.label||'', value:(m.value??''), delta:m.delta||'', pct:m.pct||''})),
        videos: (p.videos||[]).map(v=>({type:v.type||'tiktok', views:(v.views??''), id:v.id||'', thumb:v.thumb||''}))
      }));
      if(draftPlatforms.length===0) draftPlatforms = [newPlatform()];
      renderPlatformsBuilder();
      $$('.modal-tab', modal)[0].click();
      toast('Datos cargados — revísalos antes de guardar');
    }catch(ex){
      toast('JSON inválido: ' + ex.message, true);
    }
  });

  // agregar plataforma
  $('#add-platform-btn').addEventListener('click', ()=>{
    draftPlatforms.push(newPlatform());
    renderPlatformsBuilder();
  });

  // edición en vivo (inputs de texto, sin re-render para no perder el foco)
  $('#platforms-builder').addEventListener('input', (e)=>{
    const t = e.target;
    const pi = t.dataset.plat!=null ? parseInt(t.dataset.plat) : null;
    if(pi==null) return;
    const mi = t.dataset.metric!=null ? parseInt(t.dataset.metric) : null;
    const vi = t.dataset.video!=null ? parseInt(t.dataset.video) : null;
    const field = t.dataset.field;
    if(mi!=null) draftPlatforms[pi].metrics[mi][field] = t.value;
    else if(vi!=null) draftPlatforms[pi].videos[vi][field] = t.value;
    else if(field==='name') draftPlatforms[pi].name = t.value;
  });

  // clicks: checkbox de videos, selects de tipo de video, agregar/quitar filas
  $('#platforms-builder').addEventListener('change', (e)=>{
    const t = e.target;
    if(t.dataset.field==='hasVideos'){
      const pi = parseInt(t.dataset.plat);
      if(t.checked && draftPlatforms[pi].videos.length===0) draftPlatforms[pi].videos.push(newVideo());
      if(!t.checked) draftPlatforms[pi].videos = [];
      renderPlatformsBuilder();
    } else if(t.dataset.field==='type'){
      const pi = parseInt(t.dataset.plat), vi = parseInt(t.dataset.video);
      draftPlatforms[pi].videos[vi].type = t.value;
    }
  });

  $('#platforms-builder').addEventListener('click', (e)=>{
    const t = e.target;
    if(t.dataset.addMetric!=null){ draftPlatforms[parseInt(t.dataset.addMetric)].metrics.push(newMetric()); renderPlatformsBuilder(); }
    else if(t.dataset.addVideo!=null){ draftPlatforms[parseInt(t.dataset.addVideo)].videos.push(newVideo()); renderPlatformsBuilder(); }
    else if(t.dataset.delPlatform!=null){ draftPlatforms.splice(parseInt(t.dataset.delPlatform),1); renderPlatformsBuilder(); }
    else if(t.dataset.delMetric){ const [pi,mi] = t.dataset.delMetric.split(':').map(Number); draftPlatforms[pi].metrics.splice(mi,1); renderPlatformsBuilder(); }
    else if(t.dataset.delVideo){ const [pi,vi] = t.dataset.delVideo.split(':').map(Number); draftPlatforms[pi].videos.splice(vi,1); renderPlatformsBuilder(); }
  });

  // guardar
  $('#save-month-btn').addEventListener('click', async ()=>{
    const monthId = $('#f-month').value.trim();
    if(!/^\d{4}-\d{2}$/.test(monthId)){ toast('Formato de mes inválido, usa AAAA-MM', true); return; }

    const cleanPlatforms = draftPlatforms
      .filter(p=>p.name && p.name.trim())
      .map(p=>({
        name: p.name.trim(),
        metrics: (p.metrics||[]).filter(m=>m.label && m.label.trim()).map(m=>{
          const num = parseFloat(String(m.value).replace(/[.,](?=\d{3})/g,'').replace(',','.'));
          return {
            label: m.label.trim(),
            value: (m.value!=='' && !isNaN(num) && /^[\d.,]+$/.test(String(m.value).trim())) ? num : m.value,
            delta: m.delta || null,
            pct: m.pct || null
          };
        }),
        videos: (p.videos||[]).filter(v=>v.id && String(v.id).trim()).map(v=>{
          const num = parseFloat(String(v.views).replace(/[.,](?=\d{3})/g,'').replace(',','.'));
          return {
            type: v.type || 'tiktok',
            id: String(v.id).trim(),
            views: (!isNaN(num) && /^[\d.,]+$/.test(String(v.views).trim())) ? num : v.views,
            thumb: v.thumb || null
          };
        })
      }));

    if(cleanPlatforms.length === 0){ toast('Agrega al menos una plataforma con nombre', true); return; }

    const btn = $('#save-month-btn'); btn.disabled = true; btn.textContent = 'Guardando…';
    try{
      await setDoc(doc(db,'metrics',monthId), {
        month: monthId, platforms: cleanPlatforms,
        updatedAt: new Date().toISOString(), updatedBy: CURRENT_EMAIL
      });
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

/* ============================================================
   PAGOS — herramientas / agencia. Ambos roles ven y agregan.
   ============================================================ */
const CATEGORIES = ['Herramientas','Agencia','Otro'];
const CURRENCIES = ['USD','COP','EUR'];

const renderPagos = guard(async function(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Gastos</div><h1>Pagos</h1></div>
      <button class="btn" id="add-payment-btn">+ Agregar pago</button>
    </div>
    <div class="grid-3" id="pagos-totales" style="margin-bottom:22px"></div>
    <div class="list" id="pagos-list"></div>
  `;
  $('#add-payment-btn').addEventListener('click', openAddPaymentModal);
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

  const list = $('#pagos-list');
  if(snap.empty){ list.innerHTML = '<div class="empty">Aún no hay pagos registrados.</div>'; return; }
  list.innerHTML = snap.docs.map(d=>{
    const p = d.data();
    return `<div class="list-row">
      <div class="rmain">
        <div class="rtitle">${esc(p.name)}</div>
        <div class="rsub">${dateLabel(p.date)} · agregado por ${esc(p.createdBy||'—')}</div>
      </div>
      <span class="rtag ${p.category==='Herramientas'?'tool':p.category==='Agencia'?'ads':''}">${esc(p.category)}</span>
      <div class="ramount">${money(p.amount, p.currency)}</div>
      <div class="ractions"><button class="btn-danger" data-del="${d.id}">Eliminar</button></div>
    </div>`;
  }).join('');
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
      <div class="modal-actions">
        <button type="submit" class="btn">Guardar</button>
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
    await addDoc(collection(db,'payments'), {
      category: selCat, name: $('#p-name').value.trim(),
      amount: Number($('#p-amount').value||0), currency: selCur,
      date: $('#p-date').value, createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString()
    });
    toast('Pago agregado');
    closeModal();
    loadPayments();
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
    <div id="lists-container" class="list"></div>
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
  if(listsSnap.empty){ container.innerHTML = '<div class="empty">Aún no hay listas. Crea una con "+ Nueva lista".</div>'; return; }

  container.innerHTML = listsSnap.docs.map(l=>{
    const list = l.data();
    const items = tasksSnap.docs.filter(t=>t.data().listId === l.id);
    const pending = items.filter(t=>!t.data().done);
    const done = items.filter(t=>t.data().done);
    return `
      <div class="card" data-list="${l.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-weight:700">${esc(list.title)}</div>
          <div style="display:flex;gap:8px">
            <button class="btn-ghost" data-addtask="${l.id}" style="padding:8px 14px;font-size:11px">+ Tarea</button>
            <button class="btn-danger" data-dellist="${l.id}">Eliminar lista</button>
          </div>
        </div>
        <div class="list" data-tasks="${l.id}">
          ${[...pending, ...done].map(t=>taskRow(t)).join('') || '<div class="empty" style="padding:20px">Sin tareas todavía.</div>'}
        </div>
      </div>
    `;
  }).join('');

  function taskRow(d){
    const t = d.data();
    return `<div class="list-row task-row">
      <div class="task-check ${t.done?'done':''}" data-id="${d.id}" data-done="${!!t.done}">${checkIcon}</div>
      <div class="task-title ${t.done?'done':''}">${esc(t.title)}</div>
      <button class="btn-danger" data-deltask="${d.id}">Eliminar</button>
    </div>`;
  }

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
   IDEAS
   ============================================================ */
const renderIdeas = guard(async function(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Brainstorm</div><h1>Ideas</h1></div>
      <button class="btn" id="add-idea-btn">+ Nueva idea</button>
    </div>
    <div class="list" id="ideas-list"></div>
  `;
  $('#add-idea-btn').addEventListener('click', openAddIdeaModal);
  await loadIdeas();
});
async function loadIdeas(){
  const snap = await getDocs(query(collection(db,'ideas'), orderBy('createdAt','desc')));
  const list = $('#ideas-list');
  if(snap.empty){ list.innerHTML = '<div class="empty">Aún no hay ideas guardadas.</div>'; return; }
  list.innerHTML = snap.docs.map(d=>{
    const i = d.data();
    return `<div class="card" style="text-align:left">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="font-weight:700;font-size:15px">${esc(i.title)}</div>
        <button class="btn-danger" data-del="${d.id}" style="flex:0 0 auto">Eliminar</button>
      </div>
      ${i.description ? `<div class="muted" style="font-size:13.5px;margin-top:8px;line-height:1.5">${esc(i.description)}</div>` : ''}
      <div class="mono muted" style="font-size:11px;margin-top:12px">${esc(i.createdBy||'—')} · ${dateLabel(i.createdAt)}</div>
    </div>`;
  }).join('');
  $$('[data-del]', list).forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('¿Eliminar esta idea?')) return;
    await deleteDoc(doc(db,'ideas',btn.dataset.del));
    loadIdeas();
  }));
}
function openAddIdeaModal(){
  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>Nueva idea</h3>
    <form id="idea-form">
      <div class="field"><label>Título</label><input type="text" id="i-title" required placeholder="Ej: Serie de shorts sobre gestión de riesgo"></div>
      <div class="field"><label>Descripción (opcional)</label><textarea id="i-desc" placeholder="Detalles, referencias, por qué podría funcionar..."></textarea></div>
      <div class="modal-actions">
        <button type="submit" class="btn">Guardar idea</button>
        <button type="button" class="btn-ghost" id="cancel-idea">Cancelar</button>
      </div>
    </form>
  `);
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-idea').addEventListener('click', closeModal);
  $('#idea-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    await addDoc(collection(db,'ideas'), { title: $('#i-title').value.trim(), description: $('#i-desc').value.trim(), createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString() });
    toast('Idea guardada');
    closeModal();
    loadIdeas();
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
