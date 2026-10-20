// Gated help search UI: Google sign-in, article loading through the Apps Script API,
// instant client-side search and article reading. No article content ships with this page.
import { CONFIG } from './config.js';
import { buildIndex, search } from './search.js';

const SESSION_KEY = 'hs.session';
const CACHE_MS = CONFIG.CACHE_MINUTES * 60 * 1000;
const DEBOUNCE_MS = 150;
// Stale data is wiped once refreshes keep failing this long, so revoked access cannot linger.
const STALE_LIMIT_MS = 15 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const views = ['signin-view', 'search-view', 'article-view'];

let session = null; // { idToken, email, exp, articles, images, cachedAt }
let index = [];
let pollTimer = null;
let debounceTimer = null;
const loggedQueries = new Set();
// Drive images fetched on demand, keyed by id; holds the pending request so duplicates share it.
// Cleared with the rest of the data.
const imageCache = new Map();
const DRIVE_IMAGE_ID = /^[0-9a-f]{32}$/;

async function callApi(body) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Reads the token payload for display and cache timing only; the server does the authorization.
function decodeToken(idToken) {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = part.padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return { email: String(payload.email || ''), exp: Number(payload.exp) || 0 };
  } catch {
    return null;
  }
}

const tokenSecondsLeft = (s) => (s ? s.exp - Date.now() / 1000 : 0);

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Quota exceeded or storage blocked: keep working from memory only.
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

function showView(id) {
  views.forEach((view) => { $(view).hidden = view !== id; });
}

// Shows a message in the status area, with an optional spinner and action buttons.
function setStatus(text, { spinner = false, actions = [] } = {}) {
  const status = $('status');
  status.replaceChildren();
  if (spinner) {
    const dot = document.createElement('span');
    dot.className = 'spinner';
    status.append(dot);
  }
  const message = document.createElement('span');
  message.textContent = text;
  status.append(message);
  actions.forEach(({ label, onClick }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    status.append(button);
  });
  status.hidden = false;
}

function clearStatus() {
  $('status').hidden = true;
  $('status').replaceChildren();
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

// Removes every trace of article data from memory, storage and the page.
function wipeData() {
  stopPolling();
  session = null;
  index = [];
  imageCache.clear();
  clearSession();
  $('result-list').innerHTML = '';
  $('article-body').innerHTML = '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function showSignin() {
  wipeData();
  clearStatus();
  showView('signin-view');
}

// The account signed in but is not in the Users list: drop all data and let them pick another account.
function showForbidden(email) {
  wipeData();
  window.google?.accounts?.id?.disableAutoSelect();
  showView('signin-view');
  setStatus(`Tài khoản ${email} chưa được cấp quyền. Liên hệ quản trị viên hoặc đăng nhập bằng tài khoản khác.`);
}

function signOut() {
  window.google?.accounts?.id?.disableAutoSelect();
  clearSession();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  location.reload();
}

function useData(data) {
  session = data;
  index = buildIndex(session.articles);
  $('user-email').textContent = session.email;
  clearStatus();
  route();
  if (!pollTimer) pollTimer = setInterval(refresh, CACHE_MS);
}

async function bootstrap(idToken) {
  const claims = decodeToken(idToken);
  if (!claims) return showSignin();
  showView(null);
  setStatus('Đang tải…', { spinner: true });
  let res;
  try {
    res = await callApi({ action: 'bootstrap', idToken });
  } catch {
    res = null;
  }
  if (res?.ok) {
    session = { idToken, email: res.email, exp: claims.exp, articles: res.articles, images: res.images, cachedAt: Date.now() };
    saveSession();
    return useData(session);
  }
  if (res?.error === 'invalid_token') return showSignin();
  if (res?.error === 'forbidden') return showForbidden(claims.email);
  setStatus('Không tải được dữ liệu, thử lại sau.', {
    actions: [{ label: 'Thử lại', onClick: () => bootstrap(idToken) }],
  });
}

// Periodic re-check so a revoked user loses access even with the tab left open.
async function refresh() {
  if (!session) return stopPolling();
  if (tokenSecondsLeft(session) <= 0) return showSignin();
  const { idToken } = session;
  let res;
  try {
    res = await callApi({ action: 'bootstrap', idToken });
  } catch {
    res = null;
  }
  if (!session || session.idToken !== idToken) return; // Signed out or replaced while waiting.
  if (res?.ok) {
    session = { ...session, email: res.email, articles: res.articles, images: res.images, cachedAt: Date.now() };
    saveSession();
    useData(session);
  } else if (res?.error === 'invalid_token') {
    showSignin();
  } else if (res?.error === 'forbidden') {
    showForbidden(session.email);
  } else if (Date.now() - session.cachedAt > STALE_LIMIT_MS) {
    wipeData();
    showView(null);
    setStatus('Không tải được dữ liệu, thử lại sau.', {
      actions: [{ label: 'Thử lại', onClick: () => bootstrap(idToken) }],
    });
  }
  // Otherwise a transient error: keep the current content and retry next round.
}

// Background tabs throttle timers, so re-check as soon as the page is visible again.
function refreshIfStale() {
  if (document.visibilityState === 'visible' && session && Date.now() - session.cachedAt >= CACHE_MS) refresh();
}

function onCredential(response) {
  bootstrap(response.credential);
}

function currentResults() {
  const query = $('search-input').value;
  if (query.trim() === '') {
    return [...session.articles].sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  }
  return search(index, query);
}

function renderResults(results) {
  const items = results.map((article) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#/a/${encodeURIComponent(article.id)}`;
    const title = document.createElement('span');
    title.className = 'result-title';
    title.textContent = article.title;
    const tags = document.createElement('span');
    tags.className = 'result-tags';
    tags.textContent = article.tags.join(' · ');
    link.append(title, tags);
    item.append(link);
    return item;
  });
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'result-empty';
    empty.textContent = 'Không tìm thấy bài phù hợp.';
    items.push(empty);
  }
  $('result-list').replaceChildren(...items);
}

function renderArticle(article) {
  const markdown = String(article.body).replace(/\(img:([^)\s]+)\)/g, (match, id) => {
    if (session.images[id]) return `(${session.images[id]})`;
    return DRIVE_IMAGE_ID.test(id) ? `(#img-${id})` : match;
  });
  const body = $('article-body');
  body.innerHTML = DOMPurify.sanitize(marked.parse(markdown));
  body.querySelectorAll('img[src^="#img-"]').forEach(loadDriveImage);
  const heading = document.createElement('h1');
  heading.textContent = article.title;
  body.prepend(heading);
  showView('article-view');
  window.scrollTo(0, 0);
}

// Fetches one Drive image through the API. Docs exports have no alt text, so the image area
// stays empty until the data arrives or if the request fails.
async function loadDriveImage(img) {
  const id = img.getAttribute('src').slice(5);
  img.removeAttribute('src');
  if (!imageCache.has(id)) {
    if (!session || tokenSecondsLeft(session) <= 0) return;
    const pending = fetchDriveImage(id, session.idToken);
    imageCache.set(id, pending);
    // A failed lookup is dropped from the cache so a later view retries it.
    pending.then((dataUri) => {
      if (!dataUri && imageCache.get(id) === pending) imageCache.delete(id);
    });
  }
  const dataUri = await imageCache.get(id);
  if (dataUri && img.isConnected) img.src = dataUri;
}

// Resolves to the image data URI, or null when it cannot be shown.
async function fetchDriveImage(id, idToken) {
  let res = null;
  try {
    res = await callApi({ action: 'image', idToken, id });
  } catch {
    // Network error: treated like a missing image.
  }
  // The user may have signed out or been revoked while the request was in flight.
  const ok = session?.idToken === idToken && res?.ok &&
    typeof res.dataUri === 'string' && res.dataUri.startsWith('data:image/');
  return ok ? res.dataUri : null;
}

function route() {
  if (!session) return;
  const match = location.hash.match(/^#\/a\/(.+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const article = session.articles.find((a) => a.id === id);
    if (article) return renderArticle(article);
    history.replaceState(null, '', location.pathname + location.search);
  }
  $('article-body').innerHTML = '';
  renderResults(currentResults());
  showView('search-view');
}

function logZeroResult(query) {
  const key = query.trim();
  if (key === '' || loggedQueries.has(key) || tokenSecondsLeft(session) <= 0) return;
  loggedQueries.add(key);
  callApi({ action: 'logZero', idToken: session.idToken, query: key }).catch(() => {});
}

function wireEvents() {
  $('search-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { if (session) renderResults(currentResults()); }, DEBOUNCE_MS);
  });
  $('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(debounceTimer);
    if (!session) return;
    const results = currentResults();
    renderResults(results);
    if (results.length === 0) logZeroResult($('search-input').value);
  });
  $('back-button').addEventListener('click', () => { location.hash = ''; });
  $('signout-button').addEventListener('click', signOut);
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', refreshIfStale);
}

// Polls for the Google Identity Services script every 100ms, for up to 10 seconds.
function waitForGis() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - startedAt > 10000) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

async function initGis() {
  if (!(await waitForGis())) {
    if (!session) {
      showView(null);
      setStatus('Không tải được dữ liệu, thử lại sau.', {
        actions: [{ label: 'Thử lại', onClick: () => location.reload() }],
      });
    }
    return;
  }
  google.accounts.id.initialize({ client_id: CONFIG.CLIENT_ID, callback: onCredential, auto_select: true });
  google.accounts.id.renderButton($('signin-button'), {
    theme: 'outline', size: 'large', text: 'signin_with', locale: 'vi',
  });
}

function start() {
  wireEvents();
  const cached = loadSession();
  if (cached && tokenSecondsLeft(cached) > 0 && Date.now() - cached.cachedAt < CACHE_MS) {
    useData(cached);
  } else if (cached && tokenSecondsLeft(cached) > 60) {
    bootstrap(cached.idToken);
  } else {
    showSignin();
  }
  initGis();
}

start();
