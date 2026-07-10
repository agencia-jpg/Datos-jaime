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
let CURRENT_VIEW = 'resumen';
let MONTHS_CACHE = [];  // lista de meses (ids) ya cargados desde Firestore, más reciente primero

/* ---------------- helpers ---------------- */
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];
const fmt = n => new Intl.NumberFormat('es-CO').format(Math.round(Number(n)||0));
const money = (n,c='USD') => '$' + fmt(n) + ' ' + c;
const isAgency = () => ROLE === 'agency';
const monthLabel = (id) => {
  const [y,m] = id.split('-');
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return names[parseInt(m,10)-1] + ' ' + y;
};
const dateLabel = (d) => {
  if(!d) return '';
  const dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'});
};
const playIcon = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>';
const checkIcon = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function toast(msg, isError){
  let t = $('#toast');
  if(!t){
    t = document.createElement('div'); t.id='toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#111;border:1px solid rgba(255,255,255,.3);padding:12px 20px;border-radius:8px;font-size:13px;z-index:200;transition:opacity .3s ease';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.borderColor = isError ? 'rgba(255,59,59,.5)' : 'rgba(255,224,0,.5)';
  t.style.opacity = '1';
  clearTimeout(t._h);
  t._h = setTimeout(()=>{ t.style.opacity='0'; }, 3200);
}

/* Comprime una imagen en el navegador y la devuelve como data URL (base64),
   para guardarla directo en Firestore sin necesidad de ningún servicio externo.
   Firestore permite máx. ~1MB por documento, así que apuntamos a quedar bien
   por debajo de eso. */
async function compressImage(file, maxDim=1600, quality=0.75){
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
  while(out.length > 900*1024 && tries < 6){
    q = Math.max(q - 0.12, 0.3); tries++;
    out = canvas.toDataURL('image/jpeg', q);
  }
  if(out.length > 1000*1024){
    throw new Error('La imagen sigue siendo muy pesada incluso comprimida. Intenta con una foto de menor resolución.');
  }
  return out;
}

/* ---------------- AUTH ---------------- */
$('#login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass = $('#login-password').value;
  const btn = $('#login-btn'); const err = $('#login-error');
  err.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…';
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(ex){
    err.textContent = 'Correo o contraseña incorrectos.';
  }finally{
    btn.disabled = false; btn.textContent = 'Entrar';
  }
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
  }catch(ex){
    err.style.color = 'var(--red)';
    err.textContent = 'No pudimos enviar el correo. Verifica que el usuario ya exista en Firebase.';
  }
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
  else {
    $('#login-error').textContent = 'Este correo no tiene acceso al portal.';
    await signOut(auth);
    return;
  }
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
  CURRENT_VIEW = view;
  const main = $('#main');
  main.innerHTML = '<div class="spin"></div>';
  const renderers = {
    resumen: renderResumen, metricas: renderMetricas, costos: renderCostos,
    contratos: renderContratos, cuentas: renderCuentas, pagos: renderPagos, tareas: renderTareas
  };
  (renderers[view] || renderResumen)(main);
}

/* ============================================================
   RESUMEN
   ============================================================ */
async function renderResumen(main){
  const monthsSnap = await getDocs(query(collection(db,'metrics'), orderBy('__name__','desc'), limit(2)));
  const months = monthsSnap.docs;
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Panel general</div><h1>Resumen</h1></div>
    </div>
  `;

  if(months.length === 0){
    main.innerHTML += `<div class="empty">Todavía no hay métricas cargadas.${isAgency()?' Ve a "Métricas mensuales" para agregar el primer mes.':''}</div>`;
  } else {
    const latest = months[0].data();
    const prev = months[1] ? months[1].data() : null;
    const s = latest.summary || {};
    const ps = prev ? (prev.summary||{}) : null;

    const delta = (cur, prevVal) => {
      if(ps == null || prevVal == null || prevVal === 0) return '';
      const pct = ((cur - prevVal) / Math.abs(prevVal)) * 100;
      const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
      const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
      return `<div class="delta ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}% vs mes anterior</div>`;
    };

    const cells = [
      ['Reproducciones TikTok', s.tiktokViews, ps?ps.tiktokViews:null],
      ['Seguidores TikTok', s.tiktokFollowers, ps?ps.tiktokFollowers:null],
      ['Reproducciones Instagram', s.igViews, ps?ps.igViews:null],
      ['Seguidores Instagram', s.igFollowers, ps?ps.igFollowers:null],
      ['Mentorías vendidas', s.mentorshipsSold, ps?ps.mentorshipsSold:null],
      ['Facturación (' + (s.currency||'USD') + ')', s.revenue, ps?ps.revenue:null],
    ];
    main.innerHTML += `
      <div class="section-title">Último mes cargado — ${monthLabel(months[0].id)}</div>
      <div class="grid-3">
        ${cells.map(([l,v,p])=>`
          <div class="card stat-card">
            <div class="label">${l}</div>
            <div class="value">${fmt(v||0)}</div>
            ${delta(v||0,p)}
          </div>`).join('')}
      </div>
    `;
  }

  // conteos rápidos: tareas pendientes, costos del mes, contratos
  const [tasksSnap, costsSnap, contractsSnap] = await Promise.all([
    getDocs(query(collection(db,'tasks'), where('done','==', false))),
    getDocs(collection(db,'costs')),
    getDocs(collection(db,'contracts'))
  ]);
  const now = new Date();
  const thisMonthCosts = costsSnap.docs.filter(d=>{
    const dt = d.data().date ? new Date(d.data().date) : null;
    return dt && dt.getFullYear()===now.getFullYear() && dt.getMonth()===now.getMonth();
  }).reduce((a,d)=>a + Number(d.data().amount||0), 0);

  main.innerHTML += `
    <div class="section-title">Estado general</div>
    <div class="grid-3">
      <div class="card stat-card"><div class="label">Tareas pendientes</div><div class="value">${tasksSnap.size}</div></div>
      <div class="card stat-card"><div class="label">Gasto este mes (ADS + tools)</div><div class="value">${money(thisMonthCosts)}</div></div>
      <div class="card stat-card"><div class="label">Contratos archivados</div><div class="value">${contractsSnap.size}</div></div>
    </div>
  `;
}

/* ============================================================
   MÉTRICAS MENSUALES
   ============================================================ */
async function loadMonthIds(){
  const snap = await getDocs(query(collection(db,'metrics'), orderBy('__name__','desc')));
  MONTHS_CACHE = snap.docs.map(d=>d.id);
  return MONTHS_CACHE;
}

async function renderMetricas(main, selectedMonth){
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
  if(isAgency()) $('#add-month-btn').addEventListener('click', openAddMonthModal);

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
}

async function renderMonthDetail(monthId){
  const body = $('#metrics-body');
  body.innerHTML = '<div class="spin"></div>';
  const snap = await getDoc(doc(db,'metrics',monthId));
  if(!snap.exists()){ body.innerHTML = '<div class="empty">No se encontró ese mes.</div>'; return; }
  const d = snap.data();
  const T = d.tiktok||{}, IG = d.instagram||{}, S = d.sales||{};

  body.innerHTML = `
    <div class="section-title">TikTok</div>
    <div class="grid-4">
      ${statTicket('Vistas del video', T.videoViews)}
      ${statTicket('Vistas del perfil', T.profileViews)}
      ${statTicket('Me gusta', T.likes)}
      ${statTicket('Seguidores netos', T.netFollowers)}
    </div>
    ${(T.topVideos&&T.topVideos.length) ? `
      <div class="section-title">Videos más vistos (TikTok)</div>
      <div class="video-thumbs" id="tt-thumbs"></div>` : ''}

    <div class="section-title">Instagram</div>
    <div class="grid-2">
      <div class="card"><div class="label mono muted" style="font-size:11px;text-transform:uppercase;margin-bottom:8px">Perfil</div>
        <div style="font-weight:600">@${IG.handle||'—'}</div>
        <div class="muted" style="font-size:13px;margin-top:3px">${IG.bio||''}</div>
        <div class="mono muted" style="font-size:12px;margin-top:8px">${fmt(IG.followers)} seguidores · ${fmt(IG.posts)} publicaciones</div>
      </div>
      ${statTicket('Visualizaciones', {value:IG.views})}
    </div>
    ${(IG.topVideos&&IG.topVideos.length) ? `
      <div class="section-title">Publicaciones más vistas (Instagram)</div>
      <div class="video-thumbs" id="ig-thumbs"></div>` : ''}

    <div class="section-title">Ventas</div>
    <div class="grid-4">
      ${statTicket('Inversión ADS', {value:S.adsInvestment}, S.currency)}
      ${statTicket('Mentorías', {value:S.mentorships}, S.currency)}
      ${statTicket('Low ticket', {value:S.lowTicket}, S.currency)}
      ${statTicket('Cash Collect', {value:S.cashCollect}, S.currency)}
    </div>

    ${isAgency() ? `<div style="margin-top:30px"><button class="btn-danger" id="del-month-btn">Eliminar este mes</button></div>` : ''}
  `;

  if(T.topVideos && T.topVideos.length){
    $('#tt-thumbs').innerHTML = T.topVideos.map((v,i)=>`
      <div class="vthumb" data-platform="tiktok" data-id="${v.id||''}">
        ${v.thumb?`<img src="${v.thumb}" alt="">`:''}
        <div class="vidx">0${i+1}</div>
        <div class="vplay"><span>${playIcon}</span></div>
        <div class="vviews"><span>${fmt(v.views)}</span><span>TikTok</span></div>
      </div>`).join('');
  }
  if(IG.topVideos && IG.topVideos.length){
    $('#ig-thumbs').innerHTML = IG.topVideos.map((v,i)=>`
      <div class="vthumb" data-platform="instagram" data-id="${v.shortcode||''}">
        ${v.thumb?`<img src="${v.thumb}" alt="">`:''}
        <div class="vidx">0${i+1}</div>
        <div class="vplay"><span>${playIcon}</span></div>
        <div class="vviews"><span>${v.views}</span><span>Reel</span></div>
      </div>`).join('');
  }

  if(isAgency()){
    const delBtn = $('#del-month-btn');
    if(delBtn) delBtn.addEventListener('click', async ()=>{
      if(!confirm('¿Eliminar los datos de ' + monthLabel(monthId) + '? Esta acción no se puede deshacer.')) return;
      await deleteDoc(doc(db,'metrics',monthId));
      toast('Mes eliminado');
      renderMetricas($('#main'));
    });
  }
}

function statTicket(label, obj, currency){
  if(!obj) obj = {};
  const val = currency ? money(obj.value||0, currency) : fmt(obj.value||0);
  return `<div class="card stat-card">
    <div class="label">${label}</div>
    <div class="value">${val}</div>
    ${obj.delta ? `<div class="delta up">↑ ${obj.delta}${obj.pct?` (${obj.pct})`:''}</div>` : ''}
    ${obj.note ? `<div class="mono muted" style="font-size:11px;margin-top:6px">${obj.note}</div>` : ''}
  </div>`;
}

function openAddMonthModal(){
  const now = new Date();
  const defaultId = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>Agregar mes</h3>
    <form id="month-form">
      <div class="field"><label>Mes (AAAA-MM)</label><input type="text" id="f-month" value="${defaultId}" pattern="\\d{4}-\\d{2}" required></div>

      <div class="section-title" style="margin-top:20px">TikTok</div>
      <div class="grid-2">
        <div class="field"><label>Vistas del video</label><input type="number" id="f-tt-views" required></div>
        <div class="field"><label>Vistas del perfil</label><input type="number" id="f-tt-profile"></div>
        <div class="field"><label>Me gusta</label><input type="number" id="f-tt-likes"></div>
        <div class="field"><label>Seguidores netos</label><input type="number" id="f-tt-net"></div>
      </div>

      <div class="section-title">Instagram</div>
      <div class="grid-2">
        <div class="field"><label>Usuario (sin @)</label><input type="text" id="f-ig-handle"></div>
        <div class="field"><label>Seguidores</label><input type="number" id="f-ig-followers"></div>
        <div class="field"><label>Publicaciones</label><input type="number" id="f-ig-posts"></div>
        <div class="field"><label>Visualizaciones</label><input type="number" id="f-ig-views"></div>
      </div>
      <div class="field"><label>Bio</label><input type="text" id="f-ig-bio"></div>

      <div class="section-title">Ventas (USD)</div>
      <div class="grid-2">
        <div class="field"><label>Inversión ADS</label><input type="number" id="f-ads" value="0"></div>
        <div class="field"><label>Mentorías</label><input type="number" id="f-mentor" value="0"></div>
        <div class="field"><label>Low ticket</label><input type="number" id="f-low" value="0"></div>
        <div class="field"><label>Cash Collect</label><input type="number" id="f-cash" value="0"></div>
      </div>

      <div class="modal-actions">
        <button type="submit" class="btn">Guardar mes</button>
        <button type="button" class="btn-ghost" id="cancel-month">Cancelar</button>
      </div>
    </form>
  `);
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-month').addEventListener('click', closeModal);
  $('#month-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const monthId = $('#f-month').value.trim();
    if(!/^\d{4}-\d{2}$/.test(monthId)){ toast('Formato de mes inválido, usa AAAA-MM', true); return; }

    const revenue = Number($('#f-mentor').value||0) + Number($('#f-low').value||0) + Number($('#f-cash').value||0);
    const data = {
      tiktok: {
        videoViews: {value:Number($('#f-tt-views').value||0)},
        profileViews: {value:Number($('#f-tt-profile').value||0)},
        likes: {value:Number($('#f-tt-likes').value||0)},
        netFollowers: {value:Number($('#f-tt-net').value||0)},
        topVideos: []
      },
      instagram: {
        handle: $('#f-ig-handle').value.trim(),
        bio: $('#f-ig-bio').value.trim(),
        followers: Number($('#f-ig-followers').value||0),
        posts: Number($('#f-ig-posts').value||0),
        views: Number($('#f-ig-views').value||0),
        topVideos: []
      },
      sales: {
        adsInvestment: Number($('#f-ads').value||0),
        mentorships: Number($('#f-mentor').value||0),
        lowTicket: Number($('#f-low').value||0),
        cashCollect: Number($('#f-cash').value||0),
        currency: 'USD'
      },
      summary: {
        tiktokViews: Number($('#f-tt-views').value||0),
        tiktokFollowers: Number($('#f-tt-net').value||0),
        igViews: Number($('#f-ig-views').value||0),
        igFollowers: Number($('#f-ig-followers').value||0),
        mentorshipsSold: 0,
        revenue,
        currency: 'USD'
      },
      updatedAt: new Date().toISOString(),
      updatedBy: CURRENT_EMAIL
    };
    await setDoc(doc(db,'metrics',monthId), data);
    toast('Mes guardado');
    closeModal();
    renderMetricas($('#main'), monthId);
  });
}

/* ============================================================
   COSTOS & PUBLICIDAD
   ============================================================ */
async function renderCostos(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Inversión</div><h1>Costos &amp; Publicidad</h1></div>
      <div class="head-actions">
        <div class="month-select"><select id="cost-filter">
          <option value="all">Todo</option>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
          <option value="month" selected>Este mes</option>
        </select></div>
        ${isAgency() ? `<button class="btn" id="add-cost-btn">+ Agregar costo</button>` : ''}
      </div>
    </div>
    <div class="card" style="margin-bottom:20px"><div class="label mono muted" style="font-size:11px;text-transform:uppercase">Total filtrado</div>
      <div class="value mono" id="cost-total" style="font-size:26px;font-weight:700;margin-top:8px">—</div></div>
    <div class="list" id="cost-list"></div>
  `;
  if(isAgency()) $('#add-cost-btn').addEventListener('click', openAddCostModal);
  $('#cost-filter').addEventListener('change', loadCosts);
  await loadCosts();
}

async function loadCosts(){
  const snap = await getDocs(query(collection(db,'costs'), orderBy('date','desc')));
  const filter = $('#cost-filter').value;
  const now = new Date();
  let docs = snap.docs;
  if(filter !== 'all'){
    docs = docs.filter(d=>{
      const dt = new Date(d.data().date);
      if(filter === 'month') return dt.getFullYear()===now.getFullYear() && dt.getMonth()===now.getMonth();
      const days = parseInt(filter,10);
      return (now - dt) <= days*24*60*60*1000;
    });
  }
  const total = docs.reduce((a,d)=>a+Number(d.data().amount||0),0);
  $('#cost-total').textContent = money(total);

  const list = $('#cost-list');
  if(docs.length === 0){ list.innerHTML = '<div class="empty">Sin registros en este periodo.</div>'; return; }
  list.innerHTML = docs.map(d=>{
    const c = d.data();
    return `<div class="list-row">
      <div class="rmain">
        <div class="rtitle">${c.name}</div>
        <div class="rsub">${dateLabel(c.date)} ${c.note?'· '+c.note:''}</div>
      </div>
      <span class="rtag ${c.category}">${c.category==='ads'?'ADS':'Herramienta'}</span>
      <div class="ramount">${money(c.amount, c.currency||'USD')}</div>
      ${isAgency() ? `<div class="ractions"><button class="btn-danger" data-del="${d.id}">Eliminar</button></div>` : ''}
    </div>`;
  }).join('');

  if(isAgency()){
    $$('[data-del]', list).forEach(btn=>btn.addEventListener('click', async ()=>{
      if(!confirm('¿Eliminar este registro?')) return;
      await deleteDoc(doc(db,'costs',btn.dataset.del));
      loadCosts();
    }));
  }
}

function openAddCostModal(){
  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>Agregar costo</h3>
    <form id="cost-form">
      <div class="field"><label>Categoría</label>
        <select id="c-cat"><option value="ads">Inversión en ADS</option><option value="tool">Herramienta / plataforma</option></select>
      </div>
      <div class="field"><label>Nombre</label><input type="text" id="c-name" required placeholder="Ej: Meta Ads, Notion, CapCut Pro"></div>
      <div class="grid-2">
        <div class="field"><label>Monto (USD)</label><input type="number" step="0.01" id="c-amount" required></div>
        <div class="field"><label>Fecha</label><input type="date" id="c-date" required value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="field"><label>Nota (opcional)</label><input type="text" id="c-note"></div>
      <div class="modal-actions">
        <button type="submit" class="btn">Guardar</button>
        <button type="button" class="btn-ghost" id="cancel-cost">Cancelar</button>
      </div>
    </form>
  `);
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-cost').addEventListener('click', closeModal);
  $('#cost-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    await addDoc(collection(db,'costs'), {
      category: $('#c-cat').value,
      name: $('#c-name').value.trim(),
      amount: Number($('#c-amount').value||0),
      currency: 'USD',
      date: $('#c-date').value,
      note: $('#c-note').value.trim(),
      createdBy: CURRENT_EMAIL,
      createdAt: new Date().toISOString()
    });
    toast('Costo agregado');
    closeModal();
    loadCosts();
  });
}

/* ============================================================
   CONTRATOS
   ============================================================ */
async function renderContratos(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Documentos</div><h1>Contratos</h1></div>
      ${isAgency() ? `<button class="btn" id="add-contract-btn">+ Subir contrato</button>` : ''}
    </div>
    <div class="list" id="contract-list"></div>
  `;
  if(isAgency()) $('#add-contract-btn').addEventListener('click', ()=>openFileModal({
    title:'Subir contrato (foto/captura)', collectionName:'contracts',
    extraFields:[{id:'title',label:'Título del documento',type:'text',placeholder:'Ej: Contrato de mentoría 2026'}]
  }, loadContracts));
  await loadContracts();
}
async function loadContracts(){
  const snap = await getDocs(query(collection(db,'contracts'), orderBy('uploadedAt','desc')));
  const list = $('#contract-list');
  if(snap.empty){ list.innerHTML = '<div class="empty">Aún no hay contratos subidos.</div>'; return; }
  list.innerHTML = snap.docs.map(d=>{
    const c = d.data();
    return `<div class="list-row">
      <div class="rmain">
        <div class="rtitle">${c.title||c.fileName}</div>
        <div class="rsub">${dateLabel(c.uploadedAt)}</div>
      </div>
      <a class="file-link" href="${c.fileUrl}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v13M6 11l6 6 6-6M4 21h16" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Ver / Descargar</a>
      ${isAgency() ? `<div class="ractions"><button class="btn-danger" data-del="${d.id}">Eliminar</button></div>` : ''}
    </div>`;
  }).join('');
  if(isAgency()){
    $$('[data-del]', list).forEach(btn=>btn.addEventListener('click', async ()=>{
      if(!confirm('¿Eliminar este contrato?')) return;
      await deleteDoc(doc(db,'contracts',btn.dataset.del));
      loadContracts();
    }));
  }
}

/* ============================================================
   CUENTAS DE COBRO
   ============================================================ */
async function renderCuentas(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Facturación</div><h1>Cuentas de cobro</h1></div>
      ${isAgency() ? `<button class="btn" id="add-invoice-btn">+ Subir cuenta de cobro</button>` : ''}
    </div>
    <div class="list" id="invoice-list"></div>
  `;
  if(isAgency()) $('#add-invoice-btn').addEventListener('click', ()=>openFileModal({
    title:'Subir cuenta de cobro (foto/captura)', collectionName:'invoices',
    extraFields:[{id:'month',label:'Mes que corresponde (AAAA-MM)',type:'text',placeholder:'2026-07'}]
  }, loadInvoices));
  await loadInvoices();
}
async function loadInvoices(){
  const snap = await getDocs(query(collection(db,'invoices'), orderBy('uploadedAt','desc')));
  const list = $('#invoice-list');
  if(snap.empty){ list.innerHTML = '<div class="empty">Aún no hay cuentas de cobro subidas.</div>'; return; }
  list.innerHTML = snap.docs.map(d=>{
    const c = d.data();
    return `<div class="list-row">
      <div class="rmain">
        <div class="rtitle">${c.month ? monthLabel(c.month) : c.fileName}</div>
        <div class="rsub">${dateLabel(c.uploadedAt)}</div>
      </div>
      <a class="file-link" href="${c.fileUrl}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v13M6 11l6 6 6-6M4 21h16" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Ver / Descargar</a>
      ${isAgency() ? `<div class="ractions"><button class="btn-danger" data-del="${d.id}">Eliminar</button></div>` : ''}
    </div>`;
  }).join('');
  if(isAgency()){
    $$('[data-del]', list).forEach(btn=>btn.addEventListener('click', async ()=>{
      if(!confirm('¿Eliminar esta cuenta de cobro?')) return;
      await deleteDoc(doc(db,'invoices',btn.dataset.del));
      loadInvoices();
    }));
  }
}

/* ============================================================
   PAGOS (comprobantes) — ambos roles pueden subir
   ============================================================ */
async function renderPagos(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Comprobantes</div><h1>Pagos</h1></div>
      <button class="btn" id="add-payment-btn">+ Subir comprobante</button>
    </div>
    <div class="list" id="payment-list"></div>
  `;
  $('#add-payment-btn').addEventListener('click', ()=>openFileModal({
    title:'Subir comprobante de pago', collectionName:'payments',
    extraFields:[
      {id:'month',label:'Mes que corresponde (AAAA-MM)',type:'text',placeholder:'2026-07'},
      {id:'amount',label:'Monto (USD, opcional)',type:'number',placeholder:'11000'}
    ]
  }, loadPayments));
  await loadPayments();
}
async function loadPayments(){
  const snap = await getDocs(query(collection(db,'payments'), orderBy('uploadedAt','desc')));
  const list = $('#payment-list');
  if(snap.empty){ list.innerHTML = '<div class="empty">Aún no hay comprobantes subidos.</div>'; return; }
  list.innerHTML = snap.docs.map(d=>{
    const c = d.data();
    return `<div class="list-row">
      <div class="rmain">
        <div class="rtitle">${c.month ? monthLabel(c.month) : c.fileName}${c.amount?' · '+money(c.amount):''}</div>
        <div class="rsub">Subido por ${c.uploadedBy||'—'} · ${dateLabel(c.uploadedAt)}</div>
      </div>
      <a class="file-link" href="${c.fileUrl}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v13M6 11l6 6 6-6M4 21h16" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Ver</a>
      <div class="ractions"><button class="btn-danger" data-del="${d.id}">Eliminar</button></div>
    </div>`;
  }).join('');
  $$('[data-del]', list).forEach(btn=>btn.addEventListener('click', async ()=>{
    if(!confirm('¿Eliminar este comprobante?')) return;
    await deleteDoc(doc(db,'payments',btn.dataset.del));
    loadPayments();
  }));
}

/* ---------------- modal genérico de subida de archivo ---------------- */
function openFileModal({title, collectionName, extraFields}, onDone){
  openModal(`
    <span class="modal-close" id="modal-close">&times;</span>
    <h3>${title}</h3>
    <form id="file-form">
      ${extraFields.map(f=>`
        <div class="field"><label>${f.label}</label>
          <input type="${f.type}" id="ff-${f.id}" placeholder="${f.placeholder||''}">
        </div>`).join('')}
      <div class="field"><label>Foto o captura</label><input type="file" id="ff-file" accept="image/*" required></div>
      <div class="modal-actions">
        <button type="submit" class="btn" id="file-submit-btn">Subir</button>
        <button type="button" class="btn-ghost" id="cancel-file">Cancelar</button>
      </div>
    </form>
  `);
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-file').addEventListener('click', closeModal);
  $('#file-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fileInput = $('#ff-file');
    const file = fileInput.files[0];
    if(!file){ toast('Selecciona una foto o captura', true); return; }
    const btn = $('#file-submit-btn'); btn.disabled = true; btn.textContent = 'Subiendo…';
    try{
      const dataUrl = await compressImage(file);
      const data = { fileUrl: dataUrl, fileName: file.name, uploadedBy: CURRENT_EMAIL, uploadedAt: new Date().toISOString() };
      extraFields.forEach(f=>{
        const el = $('#ff-'+f.id);
        if(el && el.value) data[f.id] = f.type === 'number' ? Number(el.value) : el.value.trim();
      });
      await addDoc(collection(db, collectionName), data);
      toast('Archivo subido');
      closeModal();
      onDone();
    }catch(ex){
      toast(ex.message || 'Error al subir el archivo', true);
    }finally{
      btn.disabled = false; btn.textContent = 'Subir';
    }
  });
}

/* ============================================================
   TAREAS
   ============================================================ */
async function renderTareas(main){
  main.innerHTML = `
    <div class="main-head">
      <div><div class="eyebrow">Seguimiento</div><h1>Tareas</h1></div>
      ${isAgency() ? `<button class="btn" id="add-task-btn">+ Nueva tarea</button>` : ''}
    </div>
    <div class="section-title">Pendientes</div>
    <div class="list" id="tasks-pending"></div>
    <div class="section-title">Completadas</div>
    <div class="list" id="tasks-done"></div>
  `;
  if(isAgency()) $('#add-task-btn').addEventListener('click', openAddTaskModal);
  await loadTasks();
}
async function loadTasks(){
  const snap = await getDocs(query(collection(db,'tasks'), orderBy('createdAt','desc')));
  const pending = [], done = [];
  snap.docs.forEach(d => (d.data().done ? done : pending).push(d));

  const row = (d) => {
    const t = d.data();
    return `<div class="list-row task-row">
      <div class="task-check ${t.done?'done':''}" data-id="${d.id}" data-done="${!!t.done}">${checkIcon}</div>
      <div class="task-title ${t.done?'done':''}">${t.title}</div>
      <div class="task-meta">${dateLabel(t.createdAt)}</div>
      ${isAgency() ? `<button class="btn-danger" data-del="${d.id}">Eliminar</button>` : ''}
    </div>`;
  };

  $('#tasks-pending').innerHTML = pending.length ? pending.map(row).join('') : '<div class="empty">Sin tareas pendientes 🎉</div>';
  $('#tasks-done').innerHTML = done.length ? done.map(row).join('') : '<div class="empty">Nada completado todavía.</div>';

  $$('.task-check').forEach(box=>box.addEventListener('click', async ()=>{
    const nowDone = box.dataset.done !== 'true';
    await updateDoc(doc(db,'tasks',box.dataset.id), { done: nowDone, doneAt: nowDone ? new Date().toISOString() : null });
    loadTasks();
  }));
  if(isAgency()){
    $$('#tasks-pending [data-del], #tasks-done [data-del]').forEach(btn=>btn.addEventListener('click', async ()=>{
      if(!confirm('¿Eliminar esta tarea?')) return;
      await deleteDoc(doc(db,'tasks',btn.dataset.del));
      loadTasks();
    }));
  }
}
function openAddTaskModal(){
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
    await addDoc(collection(db,'tasks'), {
      title: $('#t-title').value.trim(), done:false,
      createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString()
    });
    toast('Tarea agregada');
    closeModal();
    loadTasks();
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
      content.innerHTML = `<div style="padding:60px 20px;text-align:center;color:#888;font-family:monospace;font-size:12px">Cargando reel…</div>`;
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
