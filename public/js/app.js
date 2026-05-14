// ═══════════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════
const App = {
  currentUser: null,
  currentView: 'home',
  currentTournamentId: null,
  tournaments: [],
  prizes: [],
  timers: {}, // { id: intervalId }
  expiredRounds: new Set(),
};

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
  await fetchCurrentUser();
  renderHeader();
  await loadTournaments();
  await resolveRoute(location.pathname);
}

// ═══════════════════════════════════════════════════════════════
// ROUTING — History API
// Esquema de URLs:
//   /                        → home
//   /tournament/:id          → torneo (org o espectador según sesión)
//   /lobby/:id               → lobby del organizador
//   /profile/:userId         → perfil de usuario
//   /create                  → crear torneo
// ═══════════════════════════════════════════════════════════════

async function resolveRoute(pathname) {
  const segments = pathname.replace(/^\//, '').split('/');
  const [section, id] = segments;

  if (!section || section === '') {
    _showView('home');
    loadTournaments();
    return;
  }

  if (section === 'create') {
    if (!App.currentUser) { showLoginModal(); navigate('home'); return; }
    App.prizes = [];
    document.getElementById('prizes-list').innerHTML = '';
    _showView('create');
    history.replaceState({ view: 'create' }, '', '/create');
    return;
  }

  if (section === 'login' || section === 'register') {
    _showView('home');
    loadTournaments();
    if (section === 'login') showLoginModal();
    else showRegisterModal();
    history.replaceState({ view: 'home', modal: section }, '', '/' + section);
    return;
  }

  if (section === 'profile' && id) {
    try {
      const data = await api('/auth/profile/' + id);
      renderProfileView(data);
      _showView('profile');
    } catch {
      toast('Perfil no encontrado', 'error');
      navigate('home');
    }
    return;
  }

  if ((section === 'tournament' || section === 'lobby' || section === 'organizer') && id) {
    App.currentTournamentId = id;
    try {
      const t = await api('/api/tournaments/' + id);
      _updateTournamentCache(t);
      const isOrg = App.currentUser && t.organizerId === App.currentUser.id;
      if (t.status === 'lobby' && isOrg) {
        renderLobby(t); _showView('lobby');
      } else if (isOrg) {
        renderOrganizerView(t); _showView('organizer');
      } else {
        renderSpectatorView(t); _showView('spectator');
      }
    } catch {
      toast('Torneo no encontrado', 'error');
      navigate('home');
    }
    return;
  }

  navigate('home');
}

// _showView: cambia la vista visible sin tocar history
// Usado internamente por resolveRoute (que ya gestionó history antes de llamarla)
function _showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) { el.classList.add('active', 'fade-in'); setTimeout(() => el.classList.remove('fade-in'), 400); }
  App.currentView = view;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Botón atrás / adelante del navegador
window.addEventListener('popstate', () => resolveRoute(location.pathname));

// ═══════════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════════
async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
async function fetchCurrentUser() {
  try { const r = await api('/auth/me'); App.currentUser = r.user; } catch { App.currentUser = null; }
}

function renderHeader() {
  const el = document.getElementById('header-auth');
  if (App.currentUser) {
    const slug = profileSlug(App.currentUser);
    el.innerHTML = `
      <a class="nav-link" href="${profileHref(slug)}" onclick="profileLinkClick(event,'${jsAttr(slug)}')" style="display:flex;align-items:center;gap:0.4rem;">
        <div class="player-avatar" style="width:26px;height:26px;font-size:0.6rem;">${initials(App.currentUser.displayName)}</div>
        <span style="font-size:0.85rem;">${escHtml(App.currentUser.displayName)}</span>
        ${App.currentUser.role === 'organizer' ? '<span class="badge badge-gold">ORG</span>' : ''}
      </a>
      <button class="btn btn-ghost btn-sm" onclick="logout()">Salir</button>
    `;
  } else {
    el.innerHTML = `
      <a class="btn btn-ghost btn-sm" href="/login" onclick="authLinkClick(event,'login')">Iniciar Sesión</a>
      <a class="btn btn-outline btn-sm" href="/register" onclick="authLinkClick(event,'register')">Registrarse</a>
    `;
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  App.currentUser = null;
  renderHeader();
  await loadTournaments();
  navigate('home');
  toast('Sesión cerrada', 'info');
}

// Copia un link absoluto al clipboard y muestra confirmación
function copyLink(path) {
  const url = location.origin + path;
  navigator.clipboard.writeText(url).then(() => {
    toast('Link copiado: ' + url, 'success');
  }).catch(() => {
    // Fallback para entornos sin clipboard API
    prompt('Copia este link:', url);
  });
}

function profileSlug(user) {
  return user?.profileSlug || user?.username || user?.id || user;
}

function extractProfileRef(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, location.origin);
    const parts = url.pathname.split('/').filter(Boolean);
    const profileIndex = parts.indexOf('profile');
    if (profileIndex !== -1 && parts[profileIndex + 1]) return decodeURIComponent(parts[profileIndex + 1]);
  } catch {}
  return raw.replace(/^@/, '').replace(/^\/?profile\//, '').trim();
}

function pathSegment(value) {
  return encodeURIComponent(String(value ?? ''));
}

function profileHref(userOrSlug) {
  return '/profile/' + pathSegment(profileSlug(userOrSlug));
}

function tournamentHref(id) {
  return '/tournament/' + pathSegment(id);
}

function anonymousBadge(item) {
  return item?.isAnonymous ? '<span class="badge badge-gray">Anonimo</span>' : '';
}

function jsAttr(value) {
  return escHtml(String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029'));
}

// ═══════════════════════════════════════════════════════════════
// NAVEGACIÓN SPA
// ═══════════════════════════════════════════════════════════════
function navigate(view, id) {
  // Calcular la URL canónica para cada vista
  const urlMap = {
    home:      '/',
    create:    '/create',
    lobby:     id ? '/lobby/' + id : '/lobby',
    organizer: id ? '/organizer/' + id : '/organizer',
    spectator: id ? '/tournament/' + id : '/tournament',
    profile:   id ? '/profile/' + id : '/profile',
  };
  const url = urlMap[view] || '/';
  history.pushState({ view, id }, '', url);

  // Actualizar título de la pestaña
  const titles = {
    home: 'TCG Tournament',
    create: 'Crear Torneo - TCG Tournament',
    lobby: 'Lobby - TCG Tournament',
    organizer: 'Organizar - TCG Tournament',
    spectator: 'Torneo - TCG Tournament',
    profile: 'Perfil - TCG Tournament',
  };
  document.title = titles[view] || 'TCG Tournament';

  _showView(view);
  if (id) App.currentTournamentId = id;
  if (view === 'home') loadTournaments();
}

function isPlainLeftClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function navigateLink(event, view, id = null) {
  if (!isPlainLeftClick(event)) return;
  event.preventDefault();
  navigate(view, id);
}

function profileLinkClick(event, userId) {
  if (!isPlainLeftClick(event)) return;
  event.preventDefault();
  openProfile(userId);
}

function tournamentLinkClick(event, tournamentId) {
  if (!isPlainLeftClick(event)) return;
  event.preventDefault();
  openTournament(tournamentId);
}

function createLinkClick(event) {
  if (!isPlainLeftClick(event)) return;
  event.preventDefault();
  handleCreateTournament();
}

function authLinkClick(event, modal) {
  if (!isPlainLeftClick(event)) return;
  event.preventDefault();
  if (modal === 'register') showRegisterModal();
  else showLoginModal();
}

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ═══════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════
function showModal(html) {
  document.getElementById('modal-container').innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
      <div class="modal" onclick="event.stopPropagation()">${html}</div>
    </div>`;
}
function closeModal() { document.getElementById('modal-container').innerHTML = ''; }

// ═══════════════════════════════════════════════════════════════
// AUTH MODALS
// ═══════════════════════════════════════════════════════════════
function showLoginModal() {
  showModal(`
    <div style="text-align:center;margin-bottom:1.5rem;">
      <div style="font-size:2rem;margin-bottom:0.5rem;">♦</div>
      <h2 style="font-size:1.3rem;margin:0 0 0.25rem;font-weight:700;">Iniciar Sesión</h2>
      <p style="color:var(--text-muted);font-size:0.85rem;margin:0;">Prueba: <code style="color:var(--accent)">admin_store</code> / <code style="color:var(--accent)">1234</code></p>
    </div>
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <input id="login-user" class="input" type="text" placeholder="Usuario" />
      <input id="login-pass" class="input" type="password" placeholder="Contraseña" onkeydown="if(event.key==='Enter')doLogin()" />
      <button class="btn btn-primary" style="width:100%;" onclick="doLogin()">Entrar</button>
      <p style="text-align:center;color:var(--text-muted);font-size:0.85rem;margin:0;">
        ¿Sin cuenta? <a onclick="closeModal();showRegisterModal();" style="color:var(--accent);cursor:pointer;">Regístrate</a>
      </p>
    </div>`);
}

async function doLogin() {
  const username = document.getElementById('login-user')?.value?.trim();
  const password = document.getElementById('login-pass')?.value;
  if (!username || !password) { toast('Completa los campos', 'error'); return; }
  try {
    const r = await api('/auth/login', { method: 'POST', body: { username, password } });
    App.currentUser = r.user; renderHeader(); closeModal();
    toast('¡Bienvenido, ' + r.user.displayName + '!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function showRegisterModal() {
  showModal(`
    <div style="text-align:center;margin-bottom:1.5rem;">
      <div style="font-size:2rem;margin-bottom:0.5rem;">♦</div>
      <h2 style="font-size:1.3rem;margin:0;font-weight:700;">Crear Cuenta</h2>
    </div>
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <input id="reg-name" class="input" type="text" placeholder="Nombre en pantalla" />
      <input id="reg-user" class="input" type="text" placeholder="Nombre de usuario (único)" />
      <input id="reg-email" class="input" type="email" placeholder="Email (opcional)" />
      <input id="reg-pass" class="input" type="password" placeholder="Contraseña" />
      <button class="btn btn-primary" style="width:100%;" onclick="doRegister()">Registrarse</button>
    </div>`);
}

async function doRegister() {
  const displayName = document.getElementById('reg-name')?.value?.trim();
  const username    = document.getElementById('reg-user')?.value?.trim();
  const email       = document.getElementById('reg-email')?.value?.trim();
  const password    = document.getElementById('reg-pass')?.value;
  if (!displayName || !username || !password) { toast('Completa nombre, usuario y contraseña', 'error'); return; }
  try {
    const r = await api('/auth/register', { method: 'POST', body: { displayName, username, email, password } });
    App.currentUser = r.user; renderHeader(); closeModal();
    toast('¡Bienvenido, ' + r.user.displayName + '!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════
async function loadTournaments() {
  try { App.tournaments = await api('/api/tournaments'); renderTournamentsList(App.tournaments); } catch(e) { console.error(e); }
}

function filterTournaments(q) {
  renderTournamentsList(App.tournaments.filter(t => t.name.toLowerCase().includes(q.toLowerCase())));
}

function renderTournamentsList(list) {
  const c = document.getElementById('tournaments-list');
  if (!list.length) {
    c.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-hint);">
      <div style="font-size:3rem;margin-bottom:1rem;">♦</div>
      <p>No hay torneos todavía.</p>
      <a class="btn btn-outline" href="/create" onclick="createLinkClick(event)" style="margin-top:1rem;">Crear el primero</a>
    </div>`; return;
  }
  const statusMap = { lobby:{l:'Lobby',b:'badge-gray'}, active:{l:'En curso',b:'badge-green'}, review:{l:'Revision',b:'badge-orange'}, finished:{l:'Finalizado',b:'badge-purple'} };
  const visMap = { public:'🌐', approval:'⏳', private:'🔒' };
  c.innerHTML = list.map(t => {
    const s = statusMap[t.status] || statusMap.lobby;
    const isOrg = App.currentUser && t.organizerId === App.currentUser.id;
    return `<a class="card tournament-card" href="${tournamentHref(t.id)}" onclick="tournamentLinkClick(event,'${jsAttr(t.id)}')" style="cursor:pointer;transition:border-color 0.2s,transform 0.15s;display:block;text-decoration:none;color:inherit;"
         onmouseenter="this.style.borderColor='var(--border-glow)';this.style.transform='translateY(-2px)'"
         onmouseleave="this.style.borderColor='var(--border)';this.style.transform=''">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;margin-bottom:0.75rem;">
        <h3 style="font-family:'Cinzel',serif;font-size:0.95rem;font-weight:600;margin:0;flex:1;line-height:1.3;">${escHtml(t.name)}</h3>
        <span class="badge ${s.b}">${s.l}</span>
      </div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:0.75rem;font-size:0.82rem;color:var(--text-muted);">
        <span>👤 ${t.players.length} jug.</span>
        <span>🔄 ${t.currentRound}/${t.totalRounds} rondas</span>
        <span title="Visibilidad">${visMap[t.visibility] || '🌐'}</span>
        ${t.isRanked ? '<span class="badge badge-gold">⭐ Rankeado</span>' : ''}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:0.78rem;color:var(--text-hint);">por ${escHtml(t.organizerName)}</span>
        ${isOrg ? '<span class="badge badge-purple">Tu torneo</span>' : ''}
      </div>
    </a>`;
  }).join('');
}

async function openTournament(id) {
  App.currentTournamentId = id;
  try {
    const t = await api('/api/tournaments/' + id);
    _updateTournamentCache(t);
    const isOrg = App.currentUser && t.organizerId === App.currentUser.id;
    if (t.status === 'lobby' && isOrg) { renderLobby(t); navigate('lobby', id); }
    else if (isOrg) { renderOrganizerView(t); navigate('organizer', id); }
    else { renderSpectatorView(t); navigate('spectator', id); }
  } catch(e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// CREATE TOURNAMENT
// ═══════════════════════════════════════════════════════════════
function handleCreateTournament() {
  if (!App.currentUser) { toast('Debes iniciar sesión para crear un torneo', 'error'); showLoginModal(); return; }
  App.prizes = [];
  document.getElementById('prizes-list').innerHTML = '';
  navigate('create', null);
}

function addPrize(type) {
  const pid = 'prize-' + Date.now();
  App.prizes.push({ id: pid, type, value: '', imageUrl: '' });
  const c = document.getElementById('prizes-list');
  const el = document.createElement('div');
  el.className = 'card-elevated'; el.id = pid;
  el.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem;';
  el.innerHTML = type === 'text'
    ? `<div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">Premio</span>
        <button type="button" class="btn btn-danger btn-icon btn-sm" onclick="removePrize('${pid}')">✕</button>
       </div>
       <input class="input" type="text" placeholder="Describe el premio" oninput="updatePrize('${pid}','value',this.value)" />`
    : `<div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">🃏 Carta como Premio</span>
        <button type="button" class="btn btn-danger btn-icon btn-sm" onclick="removePrize('${pid}')">✕</button>
       </div>
       <input class="input" type="text" placeholder="Nombre de la carta" oninput="updatePrize('${pid}','value',this.value)" />
       <input class="input" type="url" placeholder="URL de imagen (opcional)" oninput="updatePrize('${pid}','imageUrl',this.value)" />`;
  c.appendChild(el);
}

function removePrize(id) { App.prizes = App.prizes.filter(p => p.id !== id); document.getElementById(id)?.remove(); }
function updatePrize(id, key, val) { const p = App.prizes.find(p => p.id === id); if (p) p[key] = val; }

async function submitCreateTournament(e) {
  e.preventDefault();
  const name       = document.getElementById('t-name').value.trim();
  const totalRounds = parseInt(document.getElementById('t-rounds').value);
  const roundDuration = parseInt(document.getElementById('t-duration').value);
  const visibility = document.getElementById('t-visibility').value;
  const pairingMethod = document.getElementById('t-pairing').value;
  if (!name) { toast('Ingresa el nombre del torneo', 'error'); return; }
  const prizes = App.prizes.map(({ type, value, imageUrl }) => ({ type, value, imageUrl }));
  try {
    const t = await api('/api/tournaments', { method: 'POST', body: { name, totalRounds, roundDuration, prizes, visibility, pairingMethod } });
    App.tournaments.unshift(t);
    toast('Torneo "' + t.name + '" creado', 'success');
    renderLobby(t); navigate('lobby', t.id);
  } catch(e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// LOBBY
// ═══════════════════════════════════════════════════════════════
function renderLobby(t) {
  const pairingLabel = { snake: 'Snake', random: 'Todo random', balanced: 'Balanceado' };
  const visLabel = { public: '🌐 Público', approval: '⏳ Con aprobación', private: '🔒 Privado' };
  document.getElementById('lobby-header').innerHTML = `
    <div class="card card-accent-left">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
        <div>
          <h2 style="font-size:1.3rem;font-weight:700;margin:0 0 0.4rem;">${escHtml(t.name)}</h2>
          <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;font-size:0.85rem;color:var(--text-muted);">
            <span>🔄 ${t.totalRounds} rondas · ${durationLabel(t.roundDuration)}</span>
            <span>${visLabel[t.visibility] || '🌐 Público'}</span>
            <span>Min. ${t.minimumPlayers || (t.isRanked ? 8 : 2)} jugadores</span>
            <span>${pairingLabel[t.pairingMethod] || 'Snake'}</span>
            ${t.isRanked ? '<span class="badge badge-gold">Oficial</span>' : '<span class="badge badge-gray">Normal</span>'}
          </div>
        </div>
        <span class="badge badge-gray">Lobby</span>
      </div>
      ${t.prizes.length ? `<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);">
        <span class="section-title">Premios</span>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">${t.prizes.map(p => `<div class="prize-card">
          ${p.imageUrl ? `<img src="${escHtml(p.imageUrl)}" style="width:28px;height:38px;object-fit:cover;border-radius:3px;" onerror="this.style.display='none'" />` : '🃏'}
          <span style="font-size:0.88rem;">${escHtml(p.value)}</span>
        </div>`).join('')}</div>
      </div>` : ''}
    </div>`;
  renderLobbyRequests(t);
  renderLobbyPlayers(t);
  renderLobbyPlayerSuggestions(t);
}

function renderLobbyRequests(t) {
  const pending = (t.joinRequests || []).filter(r => r.status === 'pending' && (r.type || 'join') === 'join');
  const el = document.getElementById('lobby-requests');
  if (!pending.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="margin-bottom:1rem;">
      <span class="section-title" style="color:var(--warning);">⏳ Solicitudes pendientes (${pending.length})</span>
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        ${pending.map(r => `
          <div class="card-elevated" style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1rem;">
            <div class="player-avatar">${initials(r.displayName)}</div>
            <span style="flex:1;font-weight:600;">${escHtml(r.displayName)}</span>
            <button class="btn btn-success btn-sm" onclick="handleJoinRequest('${t.id}','${r.userId}','accept')">Aceptar</button>
            <button class="btn btn-danger btn-sm" onclick="handleJoinRequest('${t.id}','${r.userId}','reject')">Rechazar</button>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderLobbyPlayers(t) {
  document.getElementById('lobby-player-count').textContent = t.players.length;
  const c = document.getElementById('lobby-players');
  if (!t.players.length) {
    c.innerHTML = `<div class="card-elevated" style="text-align:center;padding:2rem;color:var(--text-hint);">Busca y agrega jugadores arriba.</div>`;
  } else {
    c.innerHTML = t.players.map((p, i) => `
      <div class="card-elevated" style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1rem;">
        <span style="font-family:'Cinzel',serif;font-size:0.78rem;color:var(--text-hint);min-width:1.5rem;">#${i+1}</span>
        <div class="player-avatar">${initials(p.displayName)}</div>
        <span style="flex:1;font-weight:600;">${escHtml(p.displayName)}</span>
        ${anonymousBadge(p)}
        <button class="btn btn-danger btn-sm" onclick="removePlayerFromLobby('${jsAttr(p.userId)}')">Quitar</button>
      </div>`).join('');
  }
  document.getElementById('btn-start-tournament').disabled = t.players.length < (t.minimumPlayers || (t.isRanked ? 8 : 2));
}

async function renderLobbyPlayerSuggestions(t) {
  const el = document.getElementById('lobby-player-suggestions');
  if (!el) return;
  el.innerHTML = '<div class="card-elevated" style="padding:0.8rem;color:var(--text-hint);font-size:0.9rem;">Cargando jugadores frecuentes...</div>';
  try {
    const suggestions = await api('/api/tournaments/' + t.id + '/player-suggestions');
    if (!suggestions.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <span class="section-title">Jugadores recientes y frecuentes</span>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        ${suggestions.map(s => `
          <button type="button" class="btn btn-ghost btn-sm" style="display:flex;align-items:center;gap:0.45rem;"
                  onclick="addPlayerSuggestionToLobby('${s.isAnonymous ? 'anonymous' : 'user'}','${jsAttr(s.userId)}','${jsAttr(s.anonymousName || s.displayName)}')">
            <span>${escHtml(s.displayName)}</span>
            ${anonymousBadge(s)}
            <span style="font-size:0.72rem;color:var(--text-muted);">${s.tournamentsPlayed} torneos</span>
          </button>`).join('')}
      </div>`;
  } catch {
    el.innerHTML = '';
  }
}

// Player search in lobby
let _psTimeout;
function handlePlayerSearch(q) {
  clearTimeout(_psTimeout);
  if (q.length < 2) { hidePlayerSearch(); return; }
  _psTimeout = setTimeout(() => doSearchPlayers(q), 300);
}

async function doSearchPlayers(q) {
  try {
    const [results, t] = await Promise.all([
      api('/api/users/search?q=' + encodeURIComponent(q)),
      api('/api/tournaments/' + App.currentTournamentId),
    ]);
    const enrolled = t.players.map(p => p.userId);
    const dd = document.getElementById('player-search-dropdown');
    if (!results.length) {
      dd.innerHTML = `<div class="search-dropdown-empty">Sin resultados para "${escHtml(q)}"</div>`;
    } else {
      dd.innerHTML = results.map(u => {
        const already = enrolled.includes(u.id);
        return `<div class="search-dropdown-item" onclick="${already ? '' : `addPlayerToLobby('${u.id}')`}" style="${already ? 'opacity:0.5;cursor:default;' : ''}">
          <div class="player-avatar" style="width:28px;height:28px;font-size:0.6rem;">${initials(u.displayName)}</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.9rem;">${escHtml(u.displayName)}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);">@${escHtml(u.username)}</div>
          </div>
          ${already ? '<span class="badge badge-gray">Ya inscrito</span>' : '<span style="font-size:0.78rem;color:var(--accent);">+ Agregar</span>'}
        </div>`;
      }).join('');
    }
    dd.style.display = 'block';
  } catch {}
}

function hidePlayerSearch() { document.getElementById('player-search-dropdown').style.display = 'none'; }

async function addPlayerToLobby(userId, displayName) {
  try {
    let t = await api('/api/tournaments/' + App.currentTournamentId + '/players', { method: 'POST', body: { userId } });
    const wasInvite = !!t.invited;
    if (t.requested) t = await api('/api/tournaments/' + App.currentTournamentId);
    _updateTournamentCache(t);
    renderLobbyRequests(t); renderLobbyPlayers(t);
    renderLobbyPlayerSuggestions(t);
    document.getElementById('player-search').value = ''; hidePlayerSearch();
    toast(wasInvite ? 'Invitacion enviada' : (displayName || 'Jugador') + ' agregado', wasInvite ? 'info' : 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function addAnonymousPlayerToLobby(name = null) {
  const input = document.getElementById('anonymous-player-name');
  const anonymousName = (name || input?.value || '').trim();
  if (!anonymousName) { toast('Ingresa un nombre anonimo', 'error'); return; }
  try {
    const t = await api('/api/tournaments/' + App.currentTournamentId + '/players', { method: 'POST', body: { anonymousName } });
    _updateTournamentCache(t);
    renderLobbyRequests(t); renderLobbyPlayers(t); renderLobbyPlayerSuggestions(t);
    if (input && !name) input.value = '';
    toast('Jugador anonimo agregado', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function addPlayerSuggestionToLobby(kind, userId, anonymousName) {
  if (kind === 'anonymous') return addAnonymousPlayerToLobby(anonymousName);
  return addPlayerToLobby(userId, anonymousName);
}

async function addPlayerToLobbyByProfileLink() {
  const input = document.getElementById('player-profile-link');
  const profileRef = extractProfileRef(input?.value);
  if (!profileRef) { toast('Pega un link de perfil o username', 'error'); return; }
  await addPlayerToLobby(profileRef, profileRef);
  if (input) input.value = '';
}

async function removePlayerFromLobby(userId) {
  try {
    const t = await api('/api/tournaments/' + App.currentTournamentId + '/players/' + encodeURIComponent(userId), { method: 'DELETE' });
    _updateTournamentCache(t); renderLobbyPlayers(t); renderLobbyPlayerSuggestions(t);
  } catch(e) { toast(e.message, 'error'); }
}

async function handleJoinRequest(tournamentId, userId, action) {
  try {
    const t = await api('/api/tournaments/' + tournamentId + '/join-requests/' + userId, { method: 'PATCH', body: { action } });
    _updateTournamentCache(t); renderLobbyRequests(t); renderLobbyPlayers(t);
    toast(action === 'accept' ? 'Jugador aceptado' : 'Solicitud rechazada', action === 'accept' ? 'success' : 'info');
  } catch(e) { toast(e.message, 'error'); }
}

async function startTournament() {
  try {
    const t = await api('/api/tournaments/' + App.currentTournamentId + '/start', { method: 'POST' });
    _updateTournamentCache(t);
    toast('¡Torneo iniciado! Configura las mesas y luego inicia la ronda.', 'success');
    renderOrganizerView(t); navigate('organizer', t.id);
  } catch(e) { toast(e.message, 'error'); }
}

async function updatePairingMethod(tid, pairingMethod) {
  try {
    const t = await api('/api/tournaments/' + tid + '/settings', { method: 'PATCH', body: { pairingMethod } });
    _updateTournamentCache(t);
    if (App.currentTournamentId === tid) renderOrganizerView(t);
    toast('Metodo actualizado', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function addTable(tid, rid) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/tables', { method: 'POST' });
    _updateTournamentCache(t);
    renderOrganizerView(t);
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteTable(tid, rid, tableId) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/tables/' + tableId, { method: 'DELETE' });
    _updateTournamentCache(t);
    renderOrganizerView(t);
  } catch(e) { toast(e.message, 'error'); }
}

async function shufflePlayers(tid, rid) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/tables/shuffle', { method: 'POST' });
    _updateTournamentCache(t);
    renderOrganizerView(t);
  } catch(e) { toast(e.message, 'error'); }
}

async function updateRoundDuration(tid, rid, value) {
  const roundDuration = Math.max(0, parseInt(value, 10) || 0);
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/time', {
      method: 'PATCH',
      body: { timeLimitMinutes: roundDuration },
    });
    _updateTournamentCache(t);
    renderOrganizerView(t);
    toast(roundDuration === 0 ? 'Ronda sin limite de tiempo' : 'Tiempo de ronda actualizado', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function adjustRoundTime(tid, rid, deltaMinutes) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/time', {
      method: 'PATCH',
      body: { deltaMinutes },
    });
    _updateTournamentCache(t);
    renderOrganizerView(t);
  } catch(e) { toast(e.message, 'error'); }
}

async function pauseRound(tid, rid) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/pause', { method: 'POST' });
    _updateTournamentCache(t);
    renderOrganizerView(t);
    toast('Ronda pausada', 'info');
  } catch(e) { toast(e.message, 'error'); }
}

async function resumeRound(tid, rid) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/resume', { method: 'POST' });
    _updateTournamentCache(t);
    renderOrganizerView(t);
    toast('Ronda reanudada', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function toggleRoundEditing(tid, rid, unlocked) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/editing', {
      method: 'PATCH',
      body: { unlocked },
    });
    _updateTournamentCache(t);
    renderOrganizerView(t);
    toast(unlocked ? 'Edicion de mesas desbloqueada' : 'Edicion de mesas bloqueada', unlocked ? 'info' : 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function finalizeTournamentResults(tid) {
  try {
    const t = await api('/api/tournaments/' + tid + '/finalize-results', { method: 'POST' });
    _updateTournamentCache(t);
    renderOrganizerView(t);
    toast('Resultados del torneo publicados', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

function pairingLabel(method) {
  return ({ snake: 'Snake', random: 'Random', balanced: 'Balanceado' })[method || 'snake'] || 'Snake';
}

function repartitionLabel(method) {
  return 'Repartir: ' + pairingLabel(method);
}

function durationLabel(minutes) {
  const value = Math.max(0, parseInt(minutes, 10) || 0);
  return value === 0 ? 'Sin limite' : value + ' min';
}

function statusMeta(status) {
  return ({
    lobby: { label: 'Lobby', badge: 'badge-gray' },
    active: { label: 'En Curso', badge: 'badge-green' },
    review: { label: 'Revision final', badge: 'badge-orange' },
    finished: { label: 'Finalizado', badge: 'badge-purple' },
  })[status] || { label: status || 'Lobby', badge: 'badge-gray' };
}

function roundPhaseMeta(t, round) {
  if (t.status === 'lobby') return { key: 'lobby', label: 'Lobby', note: 'Inscripcion y ajustes iniciales' };
  if (t.status === 'finished') return { key: 'finished', label: 'Resultados del torneo', note: 'Resultados publicados' };
  if (t.status === 'review') return { key: 'review', label: 'Revision final', note: 'Revisa la ultima ronda antes de publicar' };
  if (!round) return { key: 'lobby', label: 'Sin ronda', note: 'Esperando configuracion' };
  if (round.status === 'pending') return { key: 'pending', label: 'Preparacion', note: 'Puedes ajustar mesas y tiempo' };
  if (round.status === 'active') return { key: 'active', label: round.pausedAt ? 'Ronda pausada' : 'En ronda', note: round.tableEditingUnlocked ? 'Mesas desbloqueadas manualmente' : 'Mesas bloqueadas para evitar cambios por error' };
  return { key: 'finished', label: 'Ronda finalizada', note: 'Resultados de ronda disponibles' };
}

function renderPhaseStrip(t, round) {
  const current = roundPhaseMeta(t, round).key;
  const phases = [
    { key: 'lobby', label: 'Lobby' },
    { key: 'pending', label: 'Preparacion' },
    { key: 'active', label: 'En ronda' },
    { key: 'finished', label: 'Finalizado' },
  ];
  return `<div class="phase-strip">
    ${phases.map(phase => `<span class="phase-step ${phase.key === current || (current === 'review' && phase.key === 'finished') ? 'active' : ''} phase-${phase.key}">${phase.label}</span>`).join('')}
  </div>`;
}

function roundLimitMinutes(t, round) {
  const value = round?.timeLimitMinutes ?? t.roundDuration ?? 0;
  return Math.max(0, parseInt(value, 10) || 0);
}

function roundElapsedMs(round, at = Date.now()) {
  if (!round?.startTime) return 0;
  const pausedMs = round.totalPausedMs || 0;
  const currentPause = round.pausedAt ? Math.max(0, at - round.pausedAt) : 0;
  return Math.max(0, at - round.startTime - pausedMs - currentPause);
}

function canEditTables(round) {
  return round?.status === 'pending' || (round?.status === 'active' && round.tableEditingUnlocked);
}

function renderRoundTimeControls(t, round) {
  if (!round || round.status === 'finished') return '';
  const limit = roundLimitMinutes(t, round);
  if (round.status === 'pending') {
    return `<div class="round-time-controls">
      <label>
        <span>Tiempo max.</span>
        <input class="input" type="number" min="0" max="240" value="${limit}" onchange="updateRoundDuration('${t.id}','${round.id}',this.value)" />
      </label>
      <span class="time-note">${limit === 0 ? 'Sin limite de tiempo' : limit + ' min por ronda'}</span>
    </div>`;
  }

  return `<div class="round-time-controls">
    <span class="time-note">${limit === 0 ? 'Sin limite de tiempo' : 'Limite: ' + limit + ' min'}</span>
    <button class="btn btn-ghost btn-sm" onclick="adjustRoundTime('${t.id}','${round.id}',-5)">-5 min</button>
    <button class="btn btn-ghost btn-sm" onclick="adjustRoundTime('${t.id}','${round.id}',5)">+5 min</button>
  </div>`;
}

function renderFinalResults(t, editable = false) {
  const finishedRounds = t.rounds.filter(r => r.status === 'finished');
  const organizerRef = t.organizerUsername || t.organizerId;
  return `
    <div style="max-width:980px;margin:0 auto;">
      <a class="btn btn-ghost btn-sm" href="/" onclick="navigateLink(event,'home')" style="margin-bottom:1.5rem;">Inicio</a>
      <div class="card card-accent-gold" style="margin-bottom:1.5rem;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
          <div>
            <span class="badge badge-purple" style="margin-bottom:0.75rem;">Resultados finales</span>
            <h1 style="font-size:1.6rem;font-weight:700;margin:0 0 0.45rem;">${escHtml(t.name)}</h1>
            <a class="organizer-link" href="${profileHref(organizerRef)}" onclick="profileLinkClick(event,'${jsAttr(organizerRef)}')">Organizado por ${escHtml(t.organizerName)}</a>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;color:var(--text-muted);font-size:0.88rem;">
              <span>${t.players.length} jugadores</span>
              <span>${finishedRounds.length}/${t.totalRounds} rondas</span>
              <span>${t.isRanked ? 'Torneo oficial' : 'Torneo normal'}</span>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="copyLink('${jsAttr(tournamentHref(t.id))}')">Copiar link</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:1.5rem;align-items:start;" class="two-col">
        <div class="card">
          <span class="section-title">Tabla final</span>
          ${renderStandings(t.players, t.id, false, t.rounds)}
        </div>
        <div style="display:flex;flex-direction:column;gap:1rem;">
          ${t.isRanked ? `<div class="card">
            <span class="section-title">Puntos ganados/perdidos</span>
            ${(t.rankingDeltas || []).length ? (t.rankingDeltas || []).map(delta => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:0.45rem 0;border-bottom:1px solid var(--border);">
                <span style="font-weight:600;">#${delta.rank} ${escHtml((t.players.find(p => p.userId === delta.userId) || {}).displayName || delta.displayName || delta.userId)}</span>
                ${anonymousBadge(delta)}
                <span class="badge ${delta.points >= 0 ? 'badge-green' : 'badge-red'}">${delta.points >= 0 ? '+' : ''}${delta.points} pts</span>
              </div>`).join('') : '<p style="color:var(--text-hint);font-size:0.9rem;">Puntos pendientes hasta publicar resultados.</p>'}
          </div>` : ''}
          ${t.prizes.length ? `<div class="card">
            <span class="section-title">Premios</span>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              ${t.prizes.map(p => `<div class="prize-card">
                ${p.imageUrl ? `<img src="${escHtml(p.imageUrl)}" style="width:28px;height:38px;object-fit:cover;border-radius:3px;" onerror="this.style.display='none'" />` : ''}
                <span>${escHtml(p.value)}</span>
              </div>`).join('')}
            </div>
          </div>` : ''}
        </div>
      </div>
      ${finishedRounds.length ? `<div style="margin-top:1.5rem;">
        <span class="section-title">Rondas</span>
        ${renderRoundHistory(t, editable)}
      </div>` : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// VISTA ORGANIZADOR
// ═══════════════════════════════════════════════════════════════
function renderOrganizerView(t) {
  stopAllTimers();
  if (t.status === 'finished') {
    document.getElementById('organizer-content').innerHTML = renderFinalResults(t, true);
    return;
  }

  const currentRound = t.rounds.find(r => r.status === 'active' || r.status === 'pending') || t.rounds[t.rounds.length - 1];
  const isReview = t.status === 'review';
  const meta = statusMeta(t.status);
  const phase = roundPhaseMeta(t, currentRound);
  const editableTables = canEditTables(currentRound);
  const historyRounds = isReview && currentRound
    ? t.rounds.filter(r => r.status === 'finished' && r.id !== currentRound.id)
    : t.rounds.filter(r => r.status === 'finished');

  document.getElementById('organizer-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:1.5rem;">

      <!-- ENCABEZADO -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
        <div>
          <a class="btn btn-ghost btn-sm" href="/" onclick="navigateLink(event,'home')" style="margin-bottom:0.75rem;">← Inicio</a>
          <h1 style="font-size:1.5rem;font-weight:700;margin:0 0 0.4rem;">${escHtml(t.name)}</h1>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
            <span class="badge ${meta.badge}">${meta.label}</span>
            <span class="badge badge-purple">${phase.label}</span>
            ${t.isRanked ? '<span class="badge badge-gold">⭐ Rankeado</span>' : ''}
            <span style="font-size:0.85rem;color:var(--text-muted);">Ronda ${t.currentRound} / ${t.totalRounds}</span>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
          ${isReview ? `
            <button class="btn btn-primary btn-sm" onclick="finalizeTournamentResults('${t.id}')">
              Proceder a resultados del torneo
            </button>` : ''}
          ${!isReview && currentRound?.status === 'active' ? `
            ${currentRound.pausedAt ? `
              <button class="btn btn-success btn-sm" onclick="resumeRound('${t.id}','${currentRound.id}')">Reanudar ronda</button>` : `
              <button class="btn btn-ghost btn-sm" onclick="pauseRound('${t.id}','${currentRound.id}')">Pausar ronda</button>`}
            <button class="btn btn-warning btn-sm" onclick="openFinishRoundModal('${t.id}','${currentRound.id}')">
              Terminar Ronda
            </button>
            <button class="btn ${currentRound.tableEditingUnlocked ? 'btn-warning' : 'btn-ghost'} btn-sm" onclick="toggleRoundEditing('${t.id}','${currentRound.id}',${!currentRound.tableEditingUnlocked})">
              ${currentRound.tableEditingUnlocked ? 'Bloquear mesas' : 'Desbloquear mesas'}
            </button>` : ''}
          ${!isReview && currentRound?.status === 'pending' ? `
            <button class="btn btn-success" onclick="activateRound('${t.id}','${currentRound.id}')">
              ▶ Iniciar Ronda ${currentRound.number}
            </button>` : ''}
          ${!isReview && currentRound && editableTables ? `
            <button class="btn btn-outline btn-sm" onclick="addTable('${t.id}','${currentRound.id}')">+ Mesa</button>
            <button class="btn btn-outline btn-sm" onclick="shufflePlayers('${t.id}','${currentRound.id}')">${repartitionLabel(t.pairingMethod)}</button>` : ''}
          ${!isReview ? `<select class="input" style="width:auto;padding:0.35rem 0.6rem;font-size:0.8rem;" onchange="updatePairingMethod('${t.id}',this.value)">
            <option value="snake" ${(t.pairingMethod||'snake')==='snake'?'selected':''}>Snake</option>
            <option value="random" ${t.pairingMethod==='random'?'selected':''}>Random</option>
            <option value="balanced" ${t.pairingMethod==='balanced'?'selected':''}>Balanceado</option>
          </select>` : ''}
          <a class="btn btn-ghost btn-sm" href="${profileHref(t.organizerUsername || t.organizerId)}" onclick="profileLinkClick(event,'${jsAttr(t.organizerUsername || t.organizerId)}')">Ver perfil</a>
          <button class="btn btn-ghost btn-sm" onclick="refreshTournament()">↻</button>
        </div>
      </div>

      <div class="phase-card phase-${phase.key}">
        <div>
          <span class="section-title" style="margin:0 0 0.4rem;padding:0;border:none;">Fase actual</span>
          <div style="font-family:'Cinzel',serif;font-size:1.15rem;font-weight:700;">${phase.label}</div>
          <div style="color:var(--text-muted);font-size:0.9rem;margin-top:0.2rem;">${phase.note}</div>
        </div>
        ${renderPhaseStrip(t, currentRound)}
      </div>

      <!-- TIMER RONDA -->
      ${currentRound?.status === 'active' && currentRound.startTime ? `
        <div class="card" style="display:flex;align-items:center;gap:1.5rem;padding:1rem 1.5rem;flex-wrap:wrap;">
          <div>
            <div style="font-size:0.72rem;color:var(--text-hint);letter-spacing:0.1em;margin-bottom:0.25rem;">TIEMPO RESTANTE</div>
            <span id="round-timer-${currentRound.id}" class="timer-display"></span>
          </div>
          <div>
            <div style="font-size:0.72rem;color:var(--text-hint);letter-spacing:0.1em;margin-bottom:0.25rem;">TRANSCURRIDO</div>
            <span id="round-elapsed-${currentRound.id}" class="stopwatch-display"></span>
          </div>
          <div style="flex:1;display:flex;justify-content:flex-end;gap:0.75rem;align-items:center;flex-wrap:wrap;">
            ${currentRound.pausedAt ? '<span class="badge badge-orange">Pausada</span>' : ''}
            ${renderRoundTimeControls(t, currentRound)}
            <span style="font-family:'Cinzel',serif;font-size:0.85rem;color:var(--text-muted);">Ronda ${currentRound.number} de ${t.totalRounds}</span>
          </div>
        </div>` : ''}

      <!-- GRID: MESAS + STANDINGS -->
      <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:1.5rem;align-items:start;" class="two-col">

        <!-- MESAS -->
        <div>
          <span class="section-title">
            ${currentRound ? 'Ronda ' + currentRound.number + ' — ' + (currentRound.status === 'pending' ? 'Preparación (ajusta mesas antes de iniciar)' : currentRound.status === 'active' ? 'En curso' : 'Finalizada') : 'Sin ronda activa'}
          </span>
          ${currentRound?.status === 'pending' ? renderRoundTimeControls(t, currentRound) : ''}
          <div id="org-tables-container" style="display:flex;flex-direction:column;gap:1rem;">
            ${currentRound ? renderOrgTables(t, currentRound) : '<p style="color:var(--text-hint);">No hay rondas activas.</p>'}
          </div>
          ${historyRounds.length ? `
            <div style="margin-top:2rem;">
              <span class="section-title">Historial de Rondas</span>
              ${renderRoundHistory({ ...t, rounds: historyRounds }, true)}
            </div>` : ''}
        </div>

        <!-- STANDINGS + PREMIOS -->
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <div class="card" id="standings-card">
            <span class="section-title">Tabla de Posiciones</span>
            ${renderStandings(t.players, t.id, false, t.rounds)}
          </div>
          <div class="card">
            <span class="section-title">Panel de Jugadores</span>
            ${renderPlayerControlPanel(t)}
          </div>
          ${t.prizes.length ? `
            <div class="card">
              <span class="section-title">Premios</span>
              <div style="display:flex;flex-direction:column;gap:0.5rem;">
                ${t.prizes.map(p => `<div class="prize-card">
                  ${p.imageUrl ? `<img src="${escHtml(p.imageUrl)}" style="width:28px;height:38px;object-fit:cover;border-radius:3px;" onerror="this.style.display='none'" />` : '🃏'}
                  <span style="font-size:0.88rem;">${escHtml(p.value)}</span>
                </div>`).join('')}
              </div>
            </div>` : ''}
        </div>
      </div>
    </div>`;

  // Arrancar timers si hay ronda activa
  if (currentRound?.status === 'active' && currentRound.startTime) {
    startCountdown('round-timer-' + currentRound.id, currentRound, t, true);
    startStopwatch('round-elapsed-' + currentRound.id, currentRound);
    for (const tbl of currentRound.tables) {
      if (tbl.startTime && tbl.status !== 'finished') {
        startStopwatch('sw-' + tbl.id, currentRound, tbl.startTime);
      }
    }
  }
}

function renderOrgTables(t, round) {
  if (!round.tables.length) return '<p style="color:var(--text-hint);">Sin mesas configuradas.</p>';
  const tablesEditable = canEditTables(round);
  const disqualifiedIds = new Set((t.players || []).filter(p => p.eliminatedFromTournament).map(p => p.userId));
  return round.tables.map(table => {
    const isBench = table.type === 'bench' || table.id === 'bench';
    const finished = table.status === 'finished';
    const resultBadge = finished && !isBench ? (
      table.result === 'winner' ? `<span class="badge badge-gold">🏆 ${escHtml(table.winner?.displayName || '?')}</span>` :
      table.result === 'draw'   ? `<span class="badge badge-orange">⚖ Empate</span>` :
      `<span class="badge badge-gray">Sin ganador</span>`
    ) : '';
    return `
    <div class="table-pod ${finished ? 'pod-finished' : ''} ${isBench ? 'bench-pod' : ''}" id="pod-${table.id}">
      <div class="table-pod-header">
        <h3>${isBench ? 'Banca' : 'Mesa ' + table.id.replace('t','')}</h3>
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
          ${resultBadge}
          ${tablesEditable && !finished ? '<span style="font-size:0.72rem;color:var(--text-hint);letter-spacing:0.05em;">arrastra</span>' : ''}
          ${!isBench && !finished && round.status === 'active' && table.startTime ? `<span id="sw-${table.id}" class="stopwatch-display"></span>` : ''}
          ${!isBench && !finished && round.status === 'active' ? `
            <button class="btn btn-outline btn-sm" onclick="openFinishTableModal('${t.id}','${round.id}','${table.id}')">
              Terminar Mesa
            </button>` : ''}
          ${!isBench && finished ? `
            <button class="btn btn-outline btn-sm" onclick="openFinishTableModal('${t.id}','${round.id}','${table.id}','revise')">
              Corregir
            </button>` : ''}
          ${!isBench && !finished && tablesEditable ? `
            <button class="btn btn-danger btn-sm" onclick="deleteTable('${t.id}','${round.id}','${table.id}')">Eliminar Mesa</button>` : ''}
        </div>
      </div>
      ${table.players.map((p,pi) => `
        <div class="player-row ${p.eliminated ? 'eliminated' : ''} ${disqualifiedIds.has(p.userId) ? 'disqualified' : ''}"
             id="pr-${table.id}-${p.userId}"
             ${tablesEditable && !finished ? `draggable="true"
               ondragstart="onDragStart(event,'${table.id}','${p.userId}')"
               ondragend="onDragEnd(event)"
               ondragover="onDragOverPlayer(event)"
               ondragleave="event.currentTarget.classList.remove('drag-over-player')"
               ondrop="onDropToPlayer(event,'${t.id}','${round.id}','${table.id}','${p.userId}')"` : ''}>
          ${tablesEditable && !finished ? '<span style="cursor:grab;color:var(--text-hint);margin-right:2px;font-size:1rem;line-height:1;">::</span>' : ''}
          <div class="player-avatar">${initials(p.displayName)}</div>
          <span style="flex:1;font-weight:600;font-size:0.92rem;">${escHtml(p.displayName)}</span>
          ${anonymousBadge(p)}
          ${!isBench && !finished && (round.status === 'active' || round.status === 'pending') ? `
            <div class="score-control">
              <button class="score-btn" onclick="adjustScore('${t.id}','${round.id}','${table.id}','${p.userId}',-1)">−</button>
              <input type="number" class="score-input" value="${p.score||0}" min="0"
                     onchange="setScore('${t.id}','${round.id}','${table.id}','${p.userId}',this.value)" />
              <button class="score-btn" onclick="adjustScore('${t.id}','${round.id}','${table.id}','${p.userId}',1)">+</button>
            </div>
            <button class="btn btn-sm ${p.eliminated?'btn-ghost':'btn-danger'}"
                    onclick="toggleEliminate('${t.id}','${round.id}','${table.id}','${p.userId}',${!p.eliminated})">
              ${p.eliminated ? '↩' : '✕'}
            </button>` :
          `<span style="font-family:'Cinzel',serif;font-size:1.05rem;font-weight:700;color:var(--accent);">${p.score||0}</span>`}
        </div>`).join('')}
      ${tablesEditable && !finished ? `
        <div class="drop-zone"
             ondragover="onDragOverZone(event)"
             ondragleave="onDragLeaveZone(event)"
             ondrop="onDropToZone(event,'${t.id}','${round.id}','${table.id}')">
          <span>Soltar aquí</span>
        </div>` : ''}
    </div>`;
  }).join('');
}

// ─── DRAG & DROP ─────────────────────────────────────────────────
// Estrategia: usamos solo dos eventos de destino:
//   1. onDragOverPlayer / onDropToPlayer: soltar SOBRE un jugador específico
//   2. onDropToZone: soltar en la zona vacía al final de una mesa
// El pod completo NO tiene handler de drop para evitar disparos erráticos.

const _drag = { tableId: null, userId: null };

function onDragStart(event, tableId, userId) {
  _drag.tableId = tableId;
  _drag.userId  = userId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', userId);
  // Marcar el elemento arrastrado visualmente con un pequeño delay
  // para que el "ghost" del navegador se capture antes del cambio de estilo
  requestAnimationFrame(() => {
    const el = document.getElementById('pr-' + tableId + '-' + userId);
    if (el) el.classList.add('dragging');
  });
}

function onDragEnd(event) {
  // Limpiar todos los estilos de arrastre
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over-player').forEach(el => el.classList.remove('drag-over-player'));
  document.querySelectorAll('.drop-zone-active').forEach(el => el.classList.remove('drop-zone-active'));
}

function onDragOverPlayer(event) {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'move';
  // Resaltar solo este player-row
  document.querySelectorAll('.drag-over-player').forEach(el => el.classList.remove('drag-over-player'));
  event.currentTarget.classList.add('drag-over-player');
}

function onDragOverZone(event) {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.drop-zone-active').forEach(el => el.classList.remove('drop-zone-active'));
  event.currentTarget.classList.add('drop-zone-active');
}

function onDragLeaveZone(event) {
  event.currentTarget.classList.remove('drop-zone-active');
}

// Soltar SOBRE un jugador → insertar antes de ese jugador
async function onDropToPlayer(event, tid, rid, targetTableId, targetUserId) {
  event.preventDefault();
  event.stopPropagation();
  onDragEnd();

  const { tableId: srcTableId, userId: srcUserId } = _drag;
  if (!srcUserId || srcUserId === targetUserId) return;

  const t = App.tournaments.find(tt => tt.id === tid);
  const round = t?.rounds.find(r => r.id === rid);
  if (!round) return;

  const srcTable = round.tables.find(tb => tb.id === srcTableId);
  const dstTable = round.tables.find(tb => tb.id === targetTableId);
  if (!srcTable || !dstTable) return;

  // Sacar jugador del origen
  const srcIdx = srcTable.players.findIndex(p => p.userId === srcUserId);
  if (srcIdx === -1) return;
  const [player] = srcTable.players.splice(srcIdx, 1);

  // Insertar antes del jugador destino
  const dstIdx = dstTable.players.findIndex(p => p.userId === targetUserId);
  const insertAt = dstIdx === -1 ? dstTable.players.length : dstIdx;
  dstTable.players.splice(insertAt, 0, player);

  await _persistTables(tid, rid, round);
}

// Soltar en la ZONA VACÍA al final de una mesa
async function onDropToZone(event, tid, rid, targetTableId) {
  event.preventDefault();
  event.stopPropagation();
  onDragEnd();

  const { tableId: srcTableId, userId: srcUserId } = _drag;
  if (!srcUserId) return;

  // Si es la misma mesa, simplemente mover al final
  const t = App.tournaments.find(tt => tt.id === tid);
  const round = t?.rounds.find(r => r.id === rid);
  if (!round) return;

  const srcTable = round.tables.find(tb => tb.id === srcTableId);
  const dstTable = round.tables.find(tb => tb.id === targetTableId);
  if (!srcTable || !dstTable) return;

  const srcIdx = srcTable.players.findIndex(p => p.userId === srcUserId);
  if (srcIdx === -1) return;
  const [player] = srcTable.players.splice(srcIdx, 1);
  dstTable.players.push(player);

  await _persistTables(tid, rid, round);
}

async function _persistTables(tid, rid, round) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/tables', {
      method: 'PUT',
      body: { tables: round.tables },
    });
    _updateTournamentCache(t);
    // Re-renderizar solo las mesas sin perder timers
    const container = document.getElementById('org-tables-container');
    if (container) {
      const updatedRound = t.rounds.find(r => r.id === rid);
      if (updatedRound) container.innerHTML = renderOrgTables(t, updatedRound);
    }
  } catch(e) {
    toast('Error al guardar mesas: ' + e.message, 'error');
    refreshTournament();
  }
}

// ─── SCORE MANAGEMENT ────────────────────────────────────────
async function adjustScore(tid, rid, tableId, userId, delta) {
  const t = App.tournaments.find(tt => tt.id === tid);
  const round = t?.rounds.find(r => r.id === rid);
  const table = round?.tables.find(tb => tb.id === tableId);
  const player = table?.players.find(p => p.userId === userId);
  if (!player) return;
  await setScoreAPI(tid, rid, tableId, userId, Math.max(0, (player.score||0) + delta));
}

async function setScore(tid, rid, tableId, userId, val) {
  await setScoreAPI(tid, rid, tableId, userId, Math.max(0, parseInt(val)||0));
}

async function setScoreAPI(tid, rid, tableId, userId, score) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/tables/' + tableId + '/players/' + userId, { method: 'PATCH', body: { score } });
    _updateTournamentCache(t);
    // Actualizar el input en DOM directamente para no re-renderizar todo
    const round = t.rounds.find(r => r.id === rid);
    const table = round?.tables.find(tb => tb.id === tableId);
    const player = table?.players.find(p => p.userId === userId);
    if (player) {
      const inputs = document.querySelectorAll('#pod-' + tableId + ' .score-input');
      inputs.forEach(inp => { if (inp.closest('.player-row')?.querySelector('[onclick*="' + userId + '"]')) inp.value = player.score; });
    }
    refreshStandingsCard(t);
  } catch(e) { toast(e.message, 'error'); }
}

async function toggleEliminate(tid, rid, tableId, userId, eliminated) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/tables/' + tableId + '/players/' + userId, { method: 'PATCH', body: { eliminated } });
    _updateTournamentCache(t); renderOrganizerView(t);
    toast(eliminated ? 'Jugador eliminado de la mesa' : 'Jugador restaurado', 'info');
  } catch(e) { toast(e.message, 'error'); }
}

// Global score adjustment desde standings
async function adjustGlobalScore(tid, userId, delta) {
  const t = App.tournaments.find(tt => tt.id === tid);
  if (!t) return;
  const player = t.players.find(p => p.userId === userId);
  if (!player) return;
  const newScore = Math.max(0, (player.score||0) + delta);
  // Optimistic update
  player.score = newScore;
  const el = document.getElementById('gs-' + userId);
  if (el) el.textContent = newScore;
  try {
    const updated = await api('/api/tournaments/' + tid + '/players/' + userId + '/score', { method: 'PATCH', body: { score: newScore } });
    _updateTournamentCache(updated);
  } catch(e) { toast('Error al guardar score', 'error'); }
}

function refreshStandingsCard(t) {
  const card = document.getElementById('standings-card');
  if (card) card.innerHTML = '<span class="section-title">Tabla de Posiciones</span>' + renderStandings(t.players, t.id, false, t.rounds);
}

function renderPlayerControlPanel(t) {
  const playerRows = !t.players.length ? '<p style="color:var(--text-hint);font-size:0.9rem;">Sin jugadores.</p>' : `
    ${t.players.map(p => `
      <div class="card-elevated ${p.eliminatedFromTournament ? 'player-row disqualified' : ''}" style="display:flex;align-items:center;gap:0.65rem;padding:0.55rem 0.7rem;flex-wrap:wrap;">
        <div class="player-avatar" style="width:24px;height:24px;font-size:0.55rem;">${initials(p.displayName)}</div>
        <span style="flex:1;font-weight:600;font-size:0.86rem;${p.eliminatedFromTournament?'text-decoration:line-through;':''}">${escHtml(p.displayName)}</span>
        ${anonymousBadge(p)}
        <div class="score-control">
          <button class="score-btn" onclick="adjustGlobalScore('${t.id}','${p.userId}',-1)">−</button>
          <span id="gs-${p.userId}" style="font-family:'Cinzel',serif;font-weight:700;min-width:1.6rem;text-align:center;">${p.score||0}</span>
          <button class="score-btn" onclick="adjustGlobalScore('${t.id}','${p.userId}',1)">+</button>
        </div>
        <button class="btn btn-sm ${p.eliminatedFromTournament?'btn-ghost':'btn-danger'}" onclick="toggleTournamentDisqualification('${t.id}','${p.userId}',${!p.eliminatedFromTournament})">
          ${p.eliminatedFromTournament ? 'Reintegrar' : 'Descalificar'}
        </button>
      </div>`).join('')}
  `;
  return `<div style="display:flex;flex-direction:column;gap:0.75rem;">
    <div style="position:relative;">
      <input id="org-player-search" class="input" placeholder="Invitar o agregar jugador..." oninput="handleOrgPlayerSearch('${t.id}',this.value)" onblur="setTimeout(()=>hideOrgPlayerSearch(),200)" />
      <div id="org-player-search-dropdown" class="search-dropdown" style="display:none;"></div>
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <input id="org-player-profile-link" class="input" style="flex:1;min-width:180px;" placeholder="Pegar link de perfil o username..." />
      <button class="btn btn-outline btn-sm" onclick="addPlayerFromOrganizerProfileLink('${t.id}')">Invitar por link</button>
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <input id="org-anonymous-player-name" class="input" style="flex:1;min-width:180px;" placeholder="Nombre de jugador anonimo..." />
      <button class="btn btn-outline btn-sm" onclick="addAnonymousPlayerFromOrganizer('${t.id}')">Agregar anonimo</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:0.5rem;">${playerRows}</div>
  </div>`;
}

let _opsTimeout;
function handleOrgPlayerSearch(tid, q) {
  clearTimeout(_opsTimeout);
  if (q.length < 2) { hideOrgPlayerSearch(); return; }
  _opsTimeout = setTimeout(() => doSearchOrgPlayers(tid, q), 300);
}

async function doSearchOrgPlayers(tid, q) {
  try {
    const [results, t] = await Promise.all([
      api('/api/users/search?q=' + encodeURIComponent(q)),
      api('/api/tournaments/' + tid),
    ]);
    const enrolled = t.players.map(p => p.userId);
    const dd = document.getElementById('org-player-search-dropdown');
    dd.innerHTML = results.length ? results.map(u => {
      const already = enrolled.includes(u.id);
      return `<div class="search-dropdown-item" onclick="${already ? '' : `addPlayerFromOrganizer('${tid}','${u.id}')`}" style="${already ? 'opacity:0.5;cursor:default;' : ''}">
        <div class="player-avatar" style="width:28px;height:28px;font-size:0.6rem;">${initials(u.displayName)}</div>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:0.9rem;">${escHtml(u.displayName)}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);">@${escHtml(u.username)}</div>
        </div>
        ${already ? '<span class="badge badge-gray">Ya inscrito</span>' : '<span style="font-size:0.78rem;color:var(--accent);">+ Invitar</span>'}
      </div>`;
    }).join('') : '<div class="search-dropdown-empty">Sin resultados</div>';
    dd.style.display = 'block';
  } catch {}
}

function hideOrgPlayerSearch() {
  const dd = document.getElementById('org-player-search-dropdown');
  if (dd) dd.style.display = 'none';
}

async function addPlayerFromOrganizer(tid, userId) {
  try {
    let t = await api('/api/tournaments/' + tid + '/players', { method: 'POST', body: { userId } });
    const invited = !!t.invited;
    if (t.requested) t = await api('/api/tournaments/' + tid);
    _updateTournamentCache(t);
    renderOrganizerView(t);
    toast(invited ? 'Invitacion enviada' : 'Jugador agregado', invited ? 'info' : 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function addAnonymousPlayerFromOrganizer(tid, name = null) {
  const input = document.getElementById('org-anonymous-player-name');
  const anonymousName = (name || input?.value || '').trim();
  if (!anonymousName) { toast('Ingresa un nombre anonimo', 'error'); return; }
  try {
    const t = await api('/api/tournaments/' + tid + '/players', { method: 'POST', body: { anonymousName } });
    _updateTournamentCache(t);
    renderOrganizerView(t);
    toast('Jugador anonimo agregado', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function addPlayerFromOrganizerProfileLink(tid) {
  const input = document.getElementById('org-player-profile-link');
  const profileRef = extractProfileRef(input?.value);
  if (!profileRef) { toast('Pega un link de perfil o username', 'error'); return; }
  await addPlayerFromOrganizer(tid, profileRef);
  if (input) input.value = '';
}

async function toggleTournamentDisqualification(tid, userId, disqualified) {
  try {
    const t = await api('/api/tournaments/' + tid + '/players/' + userId + '/status', { method: 'PATCH', body: { disqualified } });
    _updateTournamentCache(t);
    renderOrganizerView(t);
  } catch(e) { toast(e.message, 'error'); }
}

// ─── FINISH TABLE MODAL ───────────────────────────────────────
function openFinishTableModal(tid, rid, tableId, mode = 'finish') {
  const t = App.tournaments.find(tt => tt.id === tid);
  const round = t?.rounds.find(r => r.id === rid);
  const table = round?.tables.find(tb => tb.id === tableId);
  if (!table) return;
  const activePlayers = mode === 'revise' ? table.players : table.players.filter(p => !p.eliminated);
  window._finishTableCtx = { tid, rid, tableId, table, mode };

  showModal(`
    <h2 style="font-size:1.2rem;font-weight:700;margin:0 0 0.25rem;">${mode === 'revise' ? 'Corregir' : 'Terminar'} Mesa ${tableId.replace('t','')}</h2>
    <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 1.5rem;">Revisa los puntos y asigna el resultado.</p>
    <span class="section-title">Puntos finales</span>
    <div style="margin-bottom:1.25rem;">
      ${table.players.map(p => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);">
          <span style="font-size:0.9rem;font-weight:600;${p.eliminated?'opacity:0.4;text-decoration:line-through;':''}">${escHtml(p.displayName)}</span>
          <label style="font-size:0.78rem;color:var(--text-muted);display:flex;align-items:center;gap:0.25rem;">
            <input type="checkbox" id="fe-${tableId}-${p.userId}" ${p.eliminated?'checked':''} /> Eliminado
          </label>
          <div class="score-control">
            <button class="score-btn" onclick="adjustModalScore('${tableId}','${p.userId}',-1)">−</button>
            <input type="number" id="ft-${tableId}-${p.userId}" value="${p.score||0}" min="0" class="score-input" />
            <button class="score-btn" onclick="adjustModalScore('${tableId}','${p.userId}',1)">+</button>
          </div>
        </div>`).join('')}
    </div>
    <span class="section-title">Resultado de la mesa</span>
    <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.5rem;">
      <label class="result-option"><input type="radio" name="tresult" value="none" checked /> Sin ganador asignado</label>
      ${activePlayers.map(p => `
        <label class="result-option">
          <input type="radio" name="tresult" value="winner-${p.userId}" />
          🏆 Ganador: <strong>${escHtml(p.displayName)}</strong>
        </label>`).join('')}
      <label class="result-option"><input type="radio" name="tresult" value="draw" /> ⚖ Empate</label>
      <div id="draw-selector" style="display:none;flex-wrap:wrap;gap:0.5rem;padding:0.5rem;background:var(--bg-elevated);border-radius:6px;">
        ${activePlayers.map(p => `
          <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;">
            <input type="checkbox" name="draw-p" value="${p.userId}" style="accent-color:var(--accent);" /> ${escHtml(p.displayName)}
          </label>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:0.75rem;">
      <button class="btn btn-ghost" style="flex:1;" onclick="closeModal()">← Volver</button>
      <button class="btn btn-primary" style="flex:1;" onclick="doFinishTable()">${mode === 'revise' ? 'Guardar Correccion' : 'Cerrar Mesa'}</button>
    </div>`);

  document.querySelectorAll('input[name="tresult"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('draw-selector').style.display = r.value === 'draw' ? 'flex' : 'none';
    });
  });
}

function adjustModalScore(tableId, userId, delta) {
  const inp = document.getElementById('ft-' + tableId + '-' + userId);
  if (inp) inp.value = Math.max(0, parseInt(inp.value||0) + delta);
}

async function doFinishTable() {
  const { tid, rid, tableId, table, mode } = window._finishTableCtx;
  const players = table.players.map(p => {
    const inp = document.getElementById('ft-' + tableId + '-' + p.userId);
    const eliminated = document.getElementById('fe-' + tableId + '-' + p.userId)?.checked;
    return { ...p, score: inp ? Math.max(0, parseInt(inp.value)||0) : p.score, eliminated: !!eliminated };
  });
  const sel = document.querySelector('input[name="tresult"]:checked')?.value || 'none';
  let result = 'none', winnerUserId = null, drawUserIds = [];
  if (sel.startsWith('winner-')) { result = 'winner'; winnerUserId = sel.replace('winner-', ''); }
  else if (sel === 'draw') { result = 'draw'; drawUserIds = [...document.querySelectorAll('input[name="draw-p"]:checked')].map(cb => cb.value); }

  try {
    const endpoint = '/api/tournaments/' + tid + '/rounds/' + rid + '/tables/' + tableId + (mode === 'revise' ? '/revise' : '/finish');
    const t = await api(endpoint, {
      method: 'POST', body: { players, result, winnerUserId, drawUserIds }
    });
    _updateTournamentCache(t); closeModal();
    toast('Mesa cerrada', 'success');
    renderOrganizerView(t);
  } catch(e) { toast(e.message, 'error'); }
}

// ─── FINISH ROUND MODAL ───────────────────────────────────────
function openFinishRoundModal(tid, rid) {
  const t = App.tournaments.find(tt => tt.id === tid);
  const round = t?.rounds.find(r => r.id === rid);
  if (!round) return;
  window._finishRoundCtx = { tid, rid, round };

  const tablesHtml = round.tables
    .filter(table => table.type !== 'bench')
    .map(table => {
      const activePlayers = table.players.filter(p => !p.eliminated);
      return `
    <div style="margin-bottom:1rem;">
      <span class="section-title">Mesa ${table.id.replace('t','')} ${table.status==='finished'?'<span class="badge badge-purple">Ya cerrada</span>':''}</span>
      ${table.status === 'finished'
        ? `<p style="font-size:0.85rem;color:var(--text-hint);margin:0;">Esta mesa ya fue cerrada.</p>`
        : `<div>
          ${table.players.map(p => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);">
            <span style="font-size:0.88rem;font-weight:600;${p.eliminated?'opacity:0.5;text-decoration:line-through;':''}">${escHtml(p.displayName)}</span>
            <label style="font-size:0.78rem;color:var(--text-muted);display:flex;align-items:center;gap:0.25rem;">
              <input type="checkbox" id="rme-${table.id}-${p.userId}" ${p.eliminated?'checked':''} /> Eliminado
            </label>
            <div class="score-control">
              <button class="score-btn" onclick="adjustRoundModalScore('${table.id}','${p.userId}',-1)">−</button>
              <input type="number" id="rm-${table.id}-${p.userId}" value="${p.score||0}" min="0" class="score-input" />
              <button class="score-btn" onclick="adjustRoundModalScore('${table.id}','${p.userId}',1)">+</button>
            </div>
          </div>`).join('')}
          <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.75rem;">
            <label class="result-option"><input type="radio" name="rresult-${table.id}" value="none" checked /> Sin ganador asignado</label>
            ${activePlayers.map(p => `
              <label class="result-option">
                <input type="radio" name="rresult-${table.id}" value="winner-${p.userId}" />
                Ganador: <strong>${escHtml(p.displayName)}</strong>
              </label>`).join('')}
            <label class="result-option"><input type="radio" name="rresult-${table.id}" value="draw" /> Empate</label>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;padding:0.5rem;background:var(--bg-elevated);border-radius:6px;">
              ${activePlayers.map(p => `
                <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;">
                  <input type="checkbox" name="rdraw-${table.id}" value="${p.userId}" style="accent-color:var(--accent);" /> ${escHtml(p.displayName)}
                </label>`).join('')}
            </div>
          </div>
        </div>`}
    </div>`;
    }).join('');

  showModal(`
    <h2 style="font-size:1.2rem;font-weight:700;margin:0 0 0.25rem;">Terminar Ronda ${round.number}</h2>
    <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 1.25rem;">
      Se cerraran todas las mesas abiertas. Revisa puntos, eliminados y resultado de cada mesa.
    </p>
    <div style="max-height:50vh;overflow-y:auto;margin-bottom:1.5rem;">${tablesHtml}</div>
    <div style="display:flex;gap:0.75rem;">
      <button class="btn btn-ghost" style="flex:1;" onclick="closeModal()">← Volver</button>
      <button class="btn btn-warning" style="flex:1;" onclick="doFinishRound()">⏹ Concluir Ronda</button>
    </div>`);
}

function adjustRoundModalScore(tableId, userId, delta) {
  const inp = document.getElementById('rm-' + tableId + '-' + userId);
  if (inp) inp.value = Math.max(0, parseInt(inp.value||0) + delta);
}

async function doFinishRound() {
  const { tid, rid, round } = window._finishRoundCtx;
  const tables = round.tables
    .filter(table => table.type !== 'bench')
    .map(table => {
      const sel = document.querySelector('input[name="rresult-' + table.id + '"]:checked')?.value || 'none';
      let result = 'none', winnerUserId = null, drawUserIds = [];
      if (sel.startsWith('winner-')) { result = 'winner'; winnerUserId = sel.replace('winner-', ''); }
      else if (sel === 'draw') { result = 'draw'; drawUserIds = [...document.querySelectorAll('input[name="rdraw-' + table.id + '"]:checked')].map(cb => cb.value); }
      return {
        id: table.id,
        players: table.status === 'finished' ? table.players : table.players.map(p => {
      const inp = document.getElementById('rm-' + table.id + '-' + p.userId);
          const eliminated = document.getElementById('rme-' + table.id + '-' + p.userId)?.checked;
          return { ...p, score: inp ? Math.max(0, parseInt(inp.value)||0) : p.score, eliminated: !!eliminated };
        }),
        result,
        winnerUserId,
        drawUserIds,
      };
    });
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/finish', { method: 'POST', body: { tables } });
    _updateTournamentCache(t); closeModal(); stopAllTimers();
    toast('Ronda ' + round.number + ' finalizada', 'success');
    renderOrganizerView(t);
  } catch(e) { toast(e.message, 'error'); }
}

async function activateRound(tid, rid) {
  try {
    const t = await api('/api/tournaments/' + tid + '/rounds/' + rid + '/activate', { method: 'POST' });
    _updateTournamentCache(t); toast('Ronda iniciada', 'success'); renderOrganizerView(t);
  } catch(e) { toast(e.message, 'error'); }
}

async function refreshTournament() {
  try {
    const t = await api('/api/tournaments/' + App.currentTournamentId);
    _updateTournamentCache(t);
    const isOrg = App.currentUser && t.organizerId === App.currentUser.id;
    if (isOrg) renderOrganizerView(t); else renderSpectatorView(t);
  } catch(e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// VISTA ESPECTADOR
// ═══════════════════════════════════════════════════════════════
function renderSpectatorView(t) {
  stopAllTimers();
  if (t.status === 'finished') {
    document.getElementById('spectator-content').innerHTML = renderFinalResults(t, false);
    return;
  }
  const isOrg = App.currentUser && t.organizerId === App.currentUser.id;
  const activeRound = t.rounds.find(r => r.status === 'active');
  const isFinished = t.status === 'finished';
  const alreadyEnrolled = App.currentUser && t.players.some(p => p.userId === App.currentUser.id);
  const pendingRequest = App.currentUser && (t.joinRequests||[]).some(r => r.userId === App.currentUser.id && r.status === 'pending');

  document.getElementById('spectator-content').innerHTML = `
    <div style="max-width:960px;margin:0 auto;">
      <a class="btn btn-ghost btn-sm" href="/" onclick="navigateLink(event,'home')" style="margin-bottom:1.5rem;">← Volver</a>
      <div class="card card-accent-left" style="margin-bottom:1.5rem;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
          <div>
            <h1 style="font-size:1.5rem;font-weight:700;margin:0 0 0.5rem;">${escHtml(t.name)}</h1>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
              <span class="badge ${t.status==='active'?'badge-green':t.status==='finished'?'badge-purple':'badge-gray'}">
                ${t.status==='active'?'En Curso':t.status==='finished'?'Finalizado':'Lobby'}
              </span>
              ${t.isRanked?'<span class="badge badge-gold">⭐ Rankeado</span>':''}
              <span class="badge badge-gray">Min. ${t.minimumPlayers || (t.isRanked ? 8 : 2)} jugadores</span>
              <a href="${profileHref(t.organizerUsername || t.organizerId)}" onclick="profileLinkClick(event,'${jsAttr(t.organizerUsername || t.organizerId)}')" style="font-size:0.82rem;color:var(--accent);cursor:pointer;">por ${escHtml(t.organizerName)}</a>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.5rem;">
            <button class="btn btn-ghost btn-sm" onclick="copyLink('${jsAttr(tournamentHref(t.id))}')" title="Copiar link del torneo">
              🔗 Copiar link
            </button>
            <span style="font-family:'Cinzel',serif;font-size:1.2rem;font-weight:700;color:var(--accent);">${t.currentRound}/${t.totalRounds}</span>
            <span style="font-size:0.75rem;color:var(--text-hint);">rondas</span>
            ${!isOrg && t.status === 'lobby' ? (
              alreadyEnrolled ? '<span class="badge badge-green">✓ Inscrito</span>' :
              pendingRequest  ? '<span class="badge badge-orange">⏳ Solicitud enviada</span>' :
              t.visibility === 'private' ? '<span class="badge badge-gray">🔒 Privado</span>' :
              `<button class="btn btn-primary btn-sm" onclick="selfEnroll('${t.id}')">
                ${t.visibility === 'approval' ? '📨 Solicitar ingreso' : '+ Inscribirme'}
              </button>`
            ) : ''}
          </div>
        </div>
      </div>

      <!-- TIMER si hay ronda activa -->
      ${activeRound?.startTime ? `
        <div class="card" style="display:flex;gap:2rem;align-items:center;padding:1rem 1.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">
          <div>
            <div style="font-size:0.7rem;color:var(--text-hint);letter-spacing:0.1em;margin-bottom:0.25rem;">TIEMPO RESTANTE</div>
            <span id="spec-countdown" class="timer-display"></span>
          </div>
          <div>
            <div style="font-size:0.7rem;color:var(--text-hint);letter-spacing:0.1em;margin-bottom:0.25rem;">TRANSCURRIDO</div>
            <span id="spec-elapsed" class="stopwatch-display"></span>
          </div>
          <div style="flex:1;text-align:right;">
            <button class="btn btn-ghost btn-sm" onclick="refreshTournament()">↻ Actualizar</button>
          </div>
        </div>` : ''}

      <div style="display:grid;grid-template-columns:minmax(0,1.8fr) minmax(0,1fr);gap:1.5rem;align-items:start;" class="two-col">

        <!-- MESAS -->
        <div>
          ${activeRound ? `
            <span class="section-title">● Ronda ${activeRound.number} en Curso</span>
            <div style="display:flex;flex-direction:column;gap:1rem;">
              ${activeRound.tables.map(table => {
                const isBench = table.type === 'bench' || table.id === 'bench';
                const finished = table.status === 'finished';
                const resultBadge = !isBench && finished ? (
                  table.result === 'winner' ? `<span class="badge badge-gold">🏆 ${escHtml(table.winner?.displayName||'?')}</span>` :
                  table.result === 'draw'   ? '<span class="badge badge-orange">⚖ Empate</span>' :
                  '<span class="badge badge-gray">Sin ganador</span>'
                ) : '';
                return `
                <div class="table-pod ${finished?'pod-finished':''} ${isBench ? 'bench-pod' : ''}">
                  <div class="table-pod-header">
                    <h3>${isBench ? 'Banca' : 'Mesa ' + table.id.replace('t','')}</h3>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                      ${resultBadge}
                      ${!isBench && !finished && table.startTime ? `<span id="spec-sw-${table.id}" class="stopwatch-display"></span>` : ''}
                      <span style="font-size:0.78rem;color:var(--text-muted);">${table.players.filter(p=>!p.eliminated).length} activos</span>
                    </div>
                  </div>
                  ${table.players.map(p => `
                    <div class="player-row ${p.eliminated?'eliminated':''}">
                      <div class="player-avatar">${initials(p.displayName)}</div>
                      <span style="flex:1;font-weight:600;">${escHtml(p.displayName)}</span>
                      ${anonymousBadge(p)}
                      ${p.eliminated?'<span class="badge badge-red" style="font-size:0.7rem;">Elim.</span>':''}
                      <span style="font-family:\'Cinzel\',serif;font-size:1.05rem;font-weight:700;color:var(--accent);">${p.score||0}</span>
                    </div>`).join('')}
                </div>`;
              }).join('')}
            </div>` :
          isFinished ? `
            <div class="card card-accent-gold" style="text-align:center;padding:2.5rem;">
              <div style="font-size:2.5rem;margin-bottom:0.75rem;">🏆</div>
              <h2 style="font-family:'Cinzel',serif;font-size:1.4rem;font-weight:700;color:var(--gold);margin:0 0 0.5rem;">Torneo Finalizado</h2>
              <p style="color:var(--text-muted);margin:0;">Revisa la tabla de posiciones para el ranking final.</p>
            </div>` :
          t.status === 'lobby' ? `
            <div class="card" style="text-align:center;padding:2.5rem;color:var(--text-hint);">
              <div style="font-size:2rem;margin-bottom:0.75rem;">⏳</div>
              <p>El torneo está en fase de inscripción.</p>
              <p style="font-size:0.88rem;">Jugadores: ${t.players.length}</p>
            </div>` :
          `<div class="card" style="text-align:center;padding:2rem;color:var(--text-hint);">
            <p>Esperando inicio de la siguiente ronda...</p>
            <button class="btn btn-ghost btn-sm" onclick="refreshTournament()" style="margin-top:0.75rem;">↻ Actualizar</button>
          </div>`}

          ${t.rounds.filter(r=>r.status==='finished').length ? `
            <div style="margin-top:1.5rem;">
              <span class="section-title">Resumen de Rondas Anteriores</span>
              ${renderRoundHistory(t)}
            </div>` : ''}
        </div>

        <!-- STANDINGS + PREMIOS -->
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <div class="card">
            <span class="section-title">Tabla de Posiciones</span>
            ${renderStandings(t.players, t.id, false, t.rounds)}
          </div>
          ${t.prizes.length ? `
            <div class="card">
              <span class="section-title">Premios</span>
              <div style="display:flex;flex-direction:column;gap:0.5rem;">
                ${t.prizes.map(p => `<div class="prize-card">
                  ${p.imageUrl?`<img src="${escHtml(p.imageUrl)}" style="width:28px;height:38px;object-fit:cover;border-radius:3px;" onerror="this.style.display='none'" />`:'🃏'}
                  <span style="font-size:0.88rem;">${escHtml(p.value)}</span>
                </div>`).join('')}
              </div>
            </div>` : ''}
        </div>
      </div>
    </div>`;

  if (activeRound?.startTime) {
    startCountdown('spec-countdown', activeRound, t, false);
    startStopwatch('spec-elapsed', activeRound);
    for (const tbl of activeRound.tables) {
      if (tbl.startTime && tbl.status !== 'finished') {
        startStopwatch('spec-sw-' + tbl.id, activeRound, tbl.startTime);
      }
    }
  }
}

async function selfEnroll(tournamentId) {
  if (!App.currentUser) { toast('Debes iniciar sesión', 'error'); showLoginModal(); return; }
  try {
    const result = await api('/api/tournaments/' + tournamentId + '/players', { method: 'POST', body: { userId: App.currentUser.id } });
    if (result.requested) { toast(result.message, 'info'); }
    else { toast('¡Inscrito en el torneo!', 'success'); }
    const t = await api('/api/tournaments/' + tournamentId);
    _updateTournamentCache(t); renderSpectatorView(t);
  } catch(e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// HISTORIAL DE RONDAS
// ═══════════════════════════════════════════════════════════════
function renderRoundHistory(t, editable = false) {
  return t.rounds.filter(r => r.status === 'finished').map(round => {
    const dur = round.endTime && round.startTime ? formatDuration(Math.max(0, round.endTime - round.startTime - (round.totalPausedMs || 0))) : '—';
    return `
      <div class="card-elevated" style="margin-bottom:0.75rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
          <span style="font-family:'Cinzel',serif;font-size:0.88rem;font-weight:600;">Ronda ${round.number}</span>
          <span style="font-size:0.8rem;color:var(--text-muted);">⏱ ${dur}</span>
        </div>
        ${round.tables.map(table => {
          if (table.type === 'bench') return '';
          const tdur = table.endTime && table.startTime ? formatDuration(Math.max(0, table.endTime - table.startTime - (round.totalPausedMs || 0))) : '—';
          const resultStr = table.result === 'winner' ? '🏆 ' + escHtml(table.winner?.displayName||'?') :
                            table.result === 'draw'   ? '⚖ Empate: ' + (table.drawPlayers||[]).map(p=>escHtml(p.displayName)).join(', ') :
                            'Sin ganador';
          return `
            <div style="padding:0.45rem 0;border-bottom:1px solid rgba(46,46,66,0.4);">
              <div style="display:flex;justify-content:space-between;margin-bottom:0.2rem;">
                <span style="font-size:0.82rem;color:var(--text-muted);">Mesa ${table.id.replace('t','')}</span>
                <span style="font-size:0.75rem;color:var(--text-hint);">⏱ ${tdur}</span>
              </div>
              <div style="font-size:0.85rem;color:var(--gold);">${resultStr}</div>
              ${editable ? `<button class="btn btn-outline btn-sm" style="margin-top:0.4rem;" onclick="openFinishTableModal('${t.id}','${round.id}','${table.id}','revise')">Corregir</button>` : ''}
              <div style="font-size:0.75rem;color:var(--text-hint);margin-top:0.15rem;">
                ${table.players.map(p=>`${escHtml(p.displayName)} (${p.score||0})`).join(' · ')}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// STANDINGS
// ═══════════════════════════════════════════════════════════════
// Calcula el OW% (Opponent Win Percentage) de un jugador.
// OW% = promedio del win rate de cada oponente que se ha enfrentado.
// Win rate de un oponente = sus victorias / sus partidas totales jugadas.
// Si no hay datos suficientes devuelve null (se muestra como "—").
function calcOWP(player, allPlayers, rounds) {
  // Recopilar todos los oponentes con los que se ha sentado
  const opponentIds = new Set();
  for (const round of rounds) {
    if (round.status !== 'finished') continue;
    for (const table of round.tables) {
      const inTable = table.players.some(p => p.userId === player.userId);
      if (!inTable) continue;
      for (const p of table.players) {
        if (p.userId !== player.userId) opponentIds.add(p.userId);
      }
    }
  }
  if (!opponentIds.size) return null;

  const rates = [];
  for (const oid of opponentIds) {
    const opp = allPlayers.find(p => p.userId === oid);
    if (!opp) continue;
    const total = (opp.wins || 0) + (opp.losses || 0) + (opp.draws || 0);
    if (total === 0) continue;
    // Win rate del oponente; los empates cuentan 0.5
    const wr = ((opp.wins || 0) + (opp.draws || 0) * 0.5) / total;
    rates.push(wr);
  }
  if (!rates.length) return null;
  return rates.reduce((s, r) => s + r, 0) / rates.length;
}

function renderStandings(players, tid, editable, rounds) {
  if (!players.length) return '<p style="color:var(--text-hint);text-align:center;padding:1rem 0;font-size:0.9rem;">Sin jugadores.</p>';
  rounds = rounds || [];

  // Calcular OW% para cada jugador antes de ordenar
  const withOwp = players.map(p => ({
    ...p,
    owp: calcOWP(p, players, rounds),
  }));

  // Ordenar: Pts DESC → Victorias DESC → OW% DESC
  const sorted = withOwp.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.wins||0) !== (a.wins||0)) return (b.wins||0) - (a.wins||0);
    if (b.owp !== null && a.owp !== null) return b.owp - a.owp;
    return 0;
  });

  const icons = ['🥇','🥈','🥉'];
  const fmtOwp = (v) => v === null ? '—' : (v * 100).toFixed(1) + '%';

  return `<table class="standings-table">
    <thead><tr>
      <th style="width:1.8rem;">#</th>
      <th>Jugador</th>
      <th style="text-align:right;" title="Puntos totales">Pts</th>
      <th style="text-align:right;" title="Victorias">V</th>
      <th style="text-align:right;" title="Empates">E</th>
      <th style="text-align:right;" title="Opponent Win Percentage — desempate estándar TCG">OW%</th>
    </tr></thead>
    <tbody>
      ${sorted.map((p,i) => `
        <tr class="${i<3?'rank-'+(i+1):''}">
          <td style="font-family:'Cinzel',serif;font-size:0.82rem;">${icons[i]||i+1}</td>
          <td style="max-width:120px;">
            <div style="display:flex;align-items:center;gap:0.4rem;">
              <div class="player-avatar" style="width:20px;height:20px;font-size:0.5rem;flex-shrink:0;">${initials(p.displayName)}</div>
              <span style="font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(p.displayName)}</span>
              ${anonymousBadge(p)}
            </div>
          </td>
          <td style="text-align:right;">
            ${editable ? `
              <div style="display:flex;align-items:center;justify-content:flex-end;gap:0.15rem;">
                <button class="score-btn" style="width:16px;height:16px;font-size:0.75rem;border-radius:3px;" onclick="adjustGlobalScore('${tid}','${p.userId}',-1)">−</button>
                <span id="gs-${p.userId}" style="font-family:'Cinzel',serif;font-weight:700;font-size:0.88rem;min-width:1.5rem;text-align:center;">${p.score||0}</span>
                <button class="score-btn" style="width:16px;height:16px;font-size:0.75rem;border-radius:3px;" onclick="adjustGlobalScore('${tid}','${p.userId}',1)">+</button>
              </div>` :
              `<span style="font-family:'Cinzel',serif;font-weight:700;font-size:0.88rem;">${p.score||0}</span>`}
          </td>
          <td style="text-align:right;font-size:0.82rem;color:var(--text-muted);">${p.wins||0}</td>
          <td style="text-align:right;font-size:0.82rem;color:var(--text-muted);">${p.draws||0}</td>
          <td style="text-align:right;font-size:0.78rem;color:var(--text-hint);" title="OW%: ${fmtOwp(p.owp)}">${fmtOwp(p.owp)}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

// ═══════════════════════════════════════════════════════════════
// PERFIL DE USUARIO
// ═══════════════════════════════════════════════════════════════
async function openProfile(userId) {
  try {
    const data = await api('/auth/profile/' + encodeURIComponent(userId));
    renderProfileView(data);
    navigate('profile', profileSlug(data.user));
  } catch(e) { toast('No se pudo cargar el perfil', 'error'); }
}

function renderProfileView({ user, organizedActive, organizedFinished, playingIn, invitedTo = [], officialRanking = [] }) {
  const isOwn = App.currentUser?.id === user.id;
  const canInviteFromProfile = App.currentUser?.role === 'organizer' && !isOwn && organizerLobbyTournamentsForInvite(user.id).length > 0;
  // Normalizar _id → id para compatibilidad con MongoDB
  const normalize = t => ({ ...t, id: t._id || t.id });
  organizedActive   = organizedActive.map(normalize);
  organizedFinished = organizedFinished.map(normalize);
  playingIn         = playingIn.map(normalize);
  invitedTo         = invitedTo.map(normalize);
  document.getElementById('profile-content').innerHTML = `
    <a class="btn btn-ghost btn-sm" href="/" onclick="navigateLink(event,'home')" style="margin-bottom:1.5rem;">← Inicio</a>
    <div class="card" style="display:flex;align-items:center;gap:1.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">
      <div class="player-avatar" style="width:64px;height:64px;font-size:1.4rem;border:2px solid var(--accent);">${initials(user.displayName)}</div>
      <div style="flex:1;">
        <h1 style="font-size:1.4rem;font-weight:700;margin:0 0 0.35rem;">${escHtml(user.displayName)}</h1>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
          <span style="font-size:0.85rem;color:var(--text-muted);">@${escHtml(user.username)}</span>
          ${user.isLicensed?'<span class="badge badge-gold">Organizador Oficial</span>':user.role==='organizer'?'<span class="badge badge-purple">Organizador</span>':'<span class="badge badge-gray">Jugador</span>'}
          ${isOwn?'<span class="badge badge-purple">Tú</span>':''}
        </div>
      </div>
      ${canInviteFromProfile ? `<button class="btn btn-primary btn-sm" onclick="inviteProfileUser('${user.id}')">Invitar a torneo</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="copyLink('${jsAttr(profileHref(user))}')" title="Copiar link del perfil">
        🔗 Copiar link
      </button>
    </div>

    ${isOwn ? `
      <div class="card" style="margin-bottom:1.5rem;">
        <span class="section-title">Preferencias de Invitacion</span>
        <select class="input" onchange="updateInvitationPreference(this.value)">
          <option value="manual" ${(user.invitationPolicy||'manual')==='manual'?'selected':''}>Aceptar mediante invitacion</option>
          <option value="auto" ${user.invitationPolicy==='auto'?'selected':''}>Aceptar automaticamente</option>
        </select>
      </div>` : ''}

    ${isOwn && invitedTo.length ? `
      <div style="margin-bottom:1.5rem;">
        <span class="section-title">Invitaciones Pendientes (${invitedTo.length})</span>
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
          ${invitedTo.map(t => invitationRow(t)).join('')}
        </div>
      </div>` : ''}

    ${user.isLicensed ? `
      <div style="margin-bottom:1.5rem;">
        <span class="section-title">Ranking del Organizador Oficial (${officialRanking.length})</span>
        <div class="card-elevated" style="padding:0;">
          ${officialRanking.length ? officialRanking.slice(0,20).map((r,i)=>`
            <div style="display:flex;align-items:center;gap:0.75rem;padding:0.55rem 0.8rem;border-bottom:1px solid var(--border);">
              <span style="font-family:'Cinzel',serif;color:var(--text-hint);width:1.6rem;">${i+1}</span>
              <span style="flex:1;font-weight:600;">${escHtml(r.displayName)}</span>
              ${anonymousBadge(r)}
              <span class="badge badge-gold">${r.points} pts</span>
              <span style="font-size:0.78rem;color:var(--text-muted);">${r.tournamentsPlayed} torneos</span>
            </div>`).join('') : '<div style="padding:0.8rem;color:var(--text-hint);font-size:0.9rem;">Sin ranking acumulado todavia.</div>'}
        </div>
      </div>` : ''}

    ${organizedActive.length ? `
      <div style="margin-bottom:1.5rem;">
        <span class="section-title">Torneos Organizados — Activos (${organizedActive.length})</span>
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
          ${organizedActive.map(t => profileTRow(t, isOwn && App.currentUser.id === t.organizerId)).join('')}
        </div>
      </div>` : ''}

    ${organizedFinished.length ? `
      <div style="margin-bottom:1.5rem;">
        <span class="section-title">Torneos Organizados — Finalizados (${organizedFinished.length})</span>
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
          ${organizedFinished.map(t => profileTRow(t, isOwn && App.currentUser.id === t.organizerId)).join('')}
        </div>
      </div>` : ''}

    ${playingIn.length ? `
      <div>
        <span class="section-title">Participando en (${playingIn.length})</span>
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
          ${playingIn.map(t => profileTRow(t, false)).join('')}
        </div>
      </div>` : ''}

    ${!organizedActive.length && !organizedFinished.length && !playingIn.length && !invitedTo.length ? `
      <div class="card" style="text-align:center;padding:3rem;color:var(--text-hint);">Sin actividad en torneos todavía.</div>` : ''}`;
}

function profileTRow(t, canManage) {
  const sb = { lobby:'badge-gray', active:'badge-green', review:'badge-orange', finished:'badge-purple' };
  const sl = { lobby:'Lobby', active:'En curso', review:'Revision', finished:'Finalizado' };
  const tid = t._id || t.id;
  return `
    <a class="card-elevated" href="${tournamentHref(tid)}" style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;cursor:pointer;text-decoration:none;color:inherit;"
         onclick="tournamentLinkClick(event,'${jsAttr(tid)}')"
         onmouseenter="this.style.borderColor='var(--border-glow)'" onmouseleave="this.style.borderColor='var(--border)'">
      <div style="flex:1;">
        <div style="font-weight:600;font-size:0.92rem;">${escHtml(t.name)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">
          ${t.players.length} jugadores · Ronda ${t.currentRound}/${t.totalRounds}
          ${t.isRanked?'· <span style="color:var(--gold);">⭐ Rankeado</span>':''}
        </div>
      </div>
      <span class="badge ${sb[t.status]||'badge-gray'}">${sl[t.status]||t.status}</span>
      ${canManage?'<span class="badge badge-purple">Administrar →</span>':''}
    </a>`;
}

// ═══════════════════════════════════════════════════════════════
// TIMERS
// ═══════════════════════════════════════════════════════════════
function organizerLobbyTournamentsForInvite(userId) {
  if (!App.currentUser || App.currentUser.role !== 'organizer') return [];
  return (App.tournaments || []).filter(t =>
    t.organizerId === App.currentUser.id &&
    t.status === 'lobby' &&
    !(t.players || []).some(player => player.userId === userId)
  );
}

function inviteProfileUser(userId) {
  const tournaments = organizerLobbyTournamentsForInvite(userId);
  if (!tournaments.length) {
    toast('No tienes torneos en lobby disponibles', 'error');
    return;
  }
  if (tournaments.length === 1) {
    sendProfileInvitation(tournaments[0].id, userId);
    return;
  }

  showModal(`
    <h2 style="font-size:1.2rem;font-weight:700;margin:0 0 0.25rem;">Invitar a torneo</h2>
    <p style="color:var(--text-muted);font-size:0.9rem;margin:0 0 1rem;">Elige a cual torneo en lobby quieres invitar a este jugador.</p>
    <div style="display:flex;flex-direction:column;gap:0.6rem;margin-bottom:1.25rem;">
      ${tournaments.map(t => `
        <label class="result-option">
          <input type="radio" name="invite-tournament" value="${t.id}" />
          <span style="flex:1;">${escHtml(t.name)}</span>
          <span class="badge badge-gray">${t.players.length} jugadores</span>
        </label>`).join('')}
    </div>
    <div style="display:flex;gap:0.75rem;">
      <button class="btn btn-ghost" style="flex:1;" onclick="closeModal()">Volver</button>
      <button class="btn btn-primary" style="flex:1;" onclick="confirmProfileInvitation('${userId}')">Enviar invitacion</button>
    </div>`);
}

function confirmProfileInvitation(userId) {
  const tournamentId = document.querySelector('input[name="invite-tournament"]:checked')?.value;
  if (!tournamentId) { toast('Selecciona un torneo', 'error'); return; }
  sendProfileInvitation(tournamentId, userId);
}

async function sendProfileInvitation(tournamentId, userId) {
  try {
    let t = await api('/api/tournaments/' + tournamentId + '/players', { method: 'POST', body: { userId } });
    const invited = !!t.invited;
    if (t.requested) t = await api('/api/tournaments/' + tournamentId);
    _updateTournamentCache(t);
    closeModal();
    toast(invited ? 'Invitacion enviada' : 'Jugador agregado', invited ? 'info' : 'success');
  } catch(e) { toast(e.message, 'error'); }
}

function invitationRow(t) {
  return `
    <div class="card-elevated" style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;">
      <div style="flex:1;">
        <div style="font-weight:600;font-size:0.92rem;">${escHtml(t.name)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);">${t.players.length} jugadores · ${t.isRanked ? 'Oficial' : 'Normal'}</div>
      </div>
      <button class="btn btn-success btn-sm" onclick="answerInvitation('${t.id}','accept')">Aceptar</button>
      <button class="btn btn-danger btn-sm" onclick="answerInvitation('${t.id}','reject')">Rechazar</button>
    </div>`;
}

async function updateInvitationPreference(invitationPolicy) {
  try {
    const r = await api('/api/users/me/preferences', { method: 'PATCH', body: { invitationPolicy } });
    App.currentUser = r.user;
    renderHeader();
    toast('Preferencia actualizada', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function answerInvitation(tournamentId, action) {
  try {
    await api('/api/tournaments/' + tournamentId + '/invitations/me', { method: 'PATCH', body: { action } });
    toast(action === 'accept' ? 'Invitacion aceptada' : 'Invitacion rechazada', action === 'accept' ? 'success' : 'info');
    openProfile(profileSlug(App.currentUser));
  } catch(e) { toast(e.message, 'error'); }
}

function startCountdown(elId, round, tournament, alertOrganizer = false) {
  const durationMinutes = roundLimitMinutes(tournament, round);
  const total = durationMinutes * 60000;
  if (durationMinutes === 0) {
    const el = document.getElementById(elId);
    if (el) {
      el.textContent = 'Sin limite';
      el.className = 'timer-display';
    }
    return;
  }

  const tick = () => {
    const el = document.getElementById(elId);
    if (!el) { clearInterval(App.timers[elId]); return; }
    const rem = total - roundElapsedMs(round);
    if (rem <= 0) {
      el.textContent = '00:00';
      el.className = 'timer-display timer-danger';
      if (alertOrganizer && !round.pausedAt && !App.expiredRounds.has(round.id)) handleRoundTimeExpired(tournament.id, round.id);
      return;
    }
    const m = Math.floor(rem/60000), s = Math.floor((rem%60000)/1000);
    el.textContent = pad(m) + ':' + pad(s);
    const pct = rem/total;
    el.className = 'timer-display' + (round.pausedAt ? ' timer-warning' : pct<0.1 ? ' timer-danger' : pct<0.25 ? ' timer-warning' : '');
  };
  clearInterval(App.timers[elId]);
  App.timers[elId] = setInterval(tick, 1000);
  tick();
}

function startStopwatch(elId, round, startTime = round.startTime) {
  const tick = () => {
    const el = document.getElementById(elId);
    if (!el) { clearInterval(App.timers[elId]); return; }
    const pausedMs = (round.totalPausedMs || 0) + (round.pausedAt ? Math.max(0, Date.now() - round.pausedAt) : 0);
    const elapsed = Math.max(0, Date.now() - startTime - pausedMs);
    const m = Math.floor(elapsed/60000), s = Math.floor((elapsed%60000)/1000);
    el.textContent = pad(m) + ':' + pad(s);
  };
  clearInterval(App.timers[elId]);
  App.timers[elId] = setInterval(tick, 1000);
  tick();
}

function handleRoundTimeExpired(tid, rid) {
  App.expiredRounds.add(rid);
  const t = App.tournaments.find(tt => tt.id === tid);
  const round = t?.rounds.find(r => r.id === rid);
  if (!round || round.status !== 'active') return;

  showModal(`
    <h2 style="font-size:1.2rem;font-weight:700;margin:0 0 0.25rem;">Tiempo agotado</h2>
    <p style="color:var(--text-muted);font-size:0.9rem;margin:0 0 1.25rem;">
      La ronda ${round.number} llego al limite. Puedes agregar tiempo, dejar que siga corriendo o cerrar la ronda revisando cada mesa.
    </p>
    <div style="display:flex;flex-direction:column;gap:0.75rem;">
      <button class="btn btn-primary" onclick="App.expiredRounds.delete('${rid}'); closeModal(); adjustRoundTime('${tid}','${rid}',5)">Agregar 5 min</button>
      <button class="btn btn-ghost" onclick="closeModal(); toast('El tiempo seguira corriendo', 'info')">Dejar correr</button>
      <button class="btn btn-warning" onclick="closeModal(); openFinishRoundModal('${tid}','${rid}')">Terminar ronda</button>
    </div>`);
}

function stopAllTimers() {
  for (const id of Object.keys(App.timers)) {
    clearInterval(App.timers[id]);
    delete App.timers[id];
  }
}

// ═══════════════════════════════════════════════════════════════
// HEADER SEARCH
// ═══════════════════════════════════════════════════════════════
let _hsTimeout;
function handleHeaderSearch(q) {
  clearTimeout(_hsTimeout);
  const dd = document.getElementById('header-search-dropdown');
  if (q.length < 2) { dd.style.display='none'; return; }
  _hsTimeout = setTimeout(async () => {
    const results = App.tournaments.filter(t => t.name.toLowerCase().includes(q.toLowerCase())).slice(0,6);
    let userResults = [];
    try { userResults = await api('/api/users/search?q=' + encodeURIComponent(q)); } catch {}
    dd.innerHTML = results.length
      ? results.map(t => `<a class="search-dropdown-item" href="${tournamentHref(t.id)}" onclick="hideHeaderSearch();tournamentLinkClick(event,'${jsAttr(t.id)}')" style="text-decoration:none;color:inherit;">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.88rem;">${escHtml(t.name)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${t.players.length} jug. · Ronda ${t.currentRound}/${t.totalRounds}</div>
          </div>
          <span class="badge ${statusMeta(t.status).badge}">${statusMeta(t.status).label}</span>
        </a>`).join('')
      : '<div class="search-dropdown-empty">Sin resultados</div>';
    if (results.length || userResults.length) {
      const tournamentHtml = results.length ? '<div class="search-dropdown-empty" style="text-align:left;padding:0.45rem 0.75rem;">Torneos</div>' + dd.innerHTML : '';
      const usersHtml = userResults.slice(0,4).map(u => `<a class="search-dropdown-item" href="${profileHref(u)}" onclick="hideHeaderSearch();profileLinkClick(event,'${jsAttr(profileSlug(u))}')" style="text-decoration:none;color:inherit;">
          <div class="player-avatar" style="width:28px;height:28px;font-size:0.6rem;">${initials(u.displayName)}</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.88rem;">${escHtml(u.displayName)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">@${escHtml(u.username)}</div>
          </div>
          <span class="badge badge-gold">Jugador</span>
        </a>`).join('');
      dd.innerHTML = tournamentHtml + (usersHtml ? '<div class="search-dropdown-empty" style="text-align:left;padding:0.45rem 0.75rem;">Jugadores</div>' + usersHtml : '');
    }
    dd.style.display = 'block';
  }, 250);
}
function hideHeaderSearch() {
  document.getElementById('header-search-dropdown').style.display='none';
  document.getElementById('header-search').value='';
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
}
function formatDuration(ms) {
  if (!ms||ms<0) return '—';
  const s = Math.floor(ms/1000), m = Math.floor(s/60);
  return m + 'm ' + (s%60) + 's';
}
function pad(n) { return String(n).padStart(2,'0'); }
function _updateTournamentCache(t) {
  const idx = App.tournaments.findIndex(tt => tt.id === t.id);
  if (idx !== -1) App.tournaments[idx] = t; else App.tournaments.push(t);
}

// Auto-refresh cada 30s cuando hay torneo abierto
setInterval(() => {
  if (App.currentTournamentId && (App.currentView==='organizer'||App.currentView==='spectator')) {
    refreshTournament();
  }
}, 30000);

init();
