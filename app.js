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
const fmt = n => new Intl.NumberFormat('es-CO').format(Math.round(Number(n)||0));
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

/* Envuelve cada render de sección: si algo falla, se ve el error en
   pantalla en vez de quedarse cargando para siempre. */
function guard(fn){
  return async function(main, ...args){
    try{
      await fn(main, ...args);
    }catch(ex){
      console.error(ex);
      main.innerHTML = `<div class="empty" style="border-color:rgba(255,59,59,.4);color:#ff8a8a">
        Ocurrió un error cargando esta sección.<br><span class="mono" style="font-size:11px;opacity:.8">${(ex && ex.message) || ex}</span>
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
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(ex){
    err.style.color = 'var(--red)';
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
  const main = $('#main');
  main.innerHTML = '<div class="spin"></div>';
  const renderers = {
    resumen: renderResumen, metricas: renderMetricas, pagos: renderPagos,
    tareas: renderTareas, ideas: renderIdeas
  };
  (renderers[view] || renderResumen)(main);
}

/* ============================================================
   RESUMEN
   ============================================================ */
const renderResumen = guard(async function(main){
  const monthsSnap = await getDocs(query(collection(db,'metrics'), orderBy('month','desc'), limit(2)));
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

  // conteos rápidos
  const [tasksSnap, ideasSnap] = await Promise.all([
    getDocs(query(collection(db,'tasks'), where('done','==', false))),
    getDocs(collection(db,'ideas'))
  ]);

  main.innerHTML += `
    <div class="section-title">Estado general</div>
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
});

async function renderMonthDetail(monthId){
  const body = $('#metrics-body');
  body.innerHTML = '<div class="spin"></div>';
  try{
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
  }catch(ex){
    console.error(ex);
    body.innerHTML = `<div class="empty" style="border-color:rgba(255,59,59,.4);color:#ff8a8a">Error cargando el mes.<br><span class="mono" style="font-size:11px">${ex.message||ex}</span></div>`;
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
      month: monthId,
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
        <div class="rtitle">${p.name}</div>
        <div class="rsub">${dateLabel(p.date)} · agregado por ${p.createdBy||'—'}</div>
      </div>
      <span class="rtag ${p.category==='Herramientas'?'tool':p.category==='Agencia'?'ads':''}">${p.category}</span>
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
        <select id="p-cat">${CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Nombre</label><input type="text" id="p-name" required placeholder="Ej: Notion, CapCut Pro, Meta Ads"></div>
      <div class="grid-2">
        <div class="field"><label>Monto</label><input type="number" step="0.01" id="p-amount" required></div>
        <div class="field"><label>Moneda</label>
          <select id="p-currency">${CURRENCIES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>Fecha</label><input type="date" id="p-date" required value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="modal-actions">
        <button type="submit" class="btn">Guardar</button>
        <button type="button" class="btn-ghost" id="cancel-payment">Cancelar</button>
      </div>
    </form>
  `);
  $('#modal-close').addEventListener('click', closeModal);
  $('#cancel-payment').addEventListener('click', closeModal);
  $('#payment-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    await addDoc(collection(db,'payments'), {
      category: $('#p-cat').value,
      name: $('#p-name').value.trim(),
      amount: Number($('#p-amount').value||0),
      currency: $('#p-currency').value,
      date: $('#p-date').value,
      createdBy: CURRENT_EMAIL,
      createdAt: new Date().toISOString()
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

  if(listsSnap.empty){
    container.innerHTML = '<div class="empty">Aún no hay listas. Crea una con "+ Nueva lista".</div>';
    return;
  }

  container.innerHTML = listsSnap.docs.map(l=>{
    const list = l.data();
    const items = tasksSnap.docs.filter(t=>t.data().listId === l.id);
    const pending = items.filter(t=>!t.data().done);
    const done = items.filter(t=>t.data().done);
    return `
      <div class="card" data-list="${l.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-weight:700">${list.title}</div>
          <div style="display:flex;gap:8px">
            <button class="btn-ghost" data-addtask="${l.id}" style="padding:6px 12px;font-size:12px">+ Tarea</button>
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
      <div class="task-title ${t.done?'done':''}">${t.title}</div>
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
    const tasksSnap = await getDocs(query(collection(db,'tasks'), where('listId','==',listId)));
    await Promise.all(tasksSnap.docs.map(d=>deleteDoc(doc(db,'tasks',d.id))));
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
    await addDoc(collection(db,'tasklists'), {
      title: $('#l-title').value.trim(), createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString()
    });
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
    await addDoc(collection(db,'tasks'), {
      listId, title: $('#t-title').value.trim(), done:false,
      createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString()
    });
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
        <div style="font-weight:700;font-size:15px">${i.title}</div>
        <button class="btn-danger" data-del="${d.id}" style="flex:0 0 auto">Eliminar</button>
      </div>
      ${i.description ? `<div class="muted" style="font-size:13.5px;margin-top:8px;line-height:1.5">${i.description}</div>` : ''}
      <div class="mono muted" style="font-size:11px;margin-top:12px">${i.createdBy||'—'} · ${dateLabel(i.createdAt)}</div>
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
    await addDoc(collection(db,'ideas'), {
      title: $('#i-title').value.trim(),
      description: $('#i-desc').value.trim(),
      createdBy: CURRENT_EMAIL, createdAt: new Date().toISOString()
    });
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
   MODAL DE VIDEO (TikTok / Instagram) — usado en Métricas mensuales
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
