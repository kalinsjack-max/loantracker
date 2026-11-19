import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
  signOut, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot,
  runTransaction, arrayUnion, increment, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { t, getLang, setLang, applyI18n, ic, hydrate } from "./i18n.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ================= helpers ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round(n * 100) / 100;
let cur = localStorage.getItem('haulat_cur') || '৳';
const money = n => cur + (+n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const fdate = s => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return new Intl.DateTimeFormat(getLang() === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d)); };
const ini = n => { const p = (n || '?').trim().split(/\s+/); return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0].slice(0, 2)).toUpperCase(); };
const okImg = p => typeof p === 'string' && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(p);
const av = (name, photo, cls = '') => okImg(photo) ? `<img src="${photo}" alt="" class="av ${cls}">` : `<div class="av ${cls}">${esc(ini(name))}</div>`;
const show = id => ['auth', 'setup', 'app'].forEach(x => { const el = $(x), on = x === id; el.classList.toggle('hidden', !on); if (x !== 'app') el.classList.toggle('flex', on); });
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast glass ${type}`;
  el.innerHTML = `<span class="d">${ic(type === 'ok' ? 'check' : type === 'err' ? 'x' : 'bell', 'w-3.5 h-3.5')}</span><span>${esc(msg)}</span>`;
  $('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 4200);
}

/* ---- modal ---- */
let modalKind = '', modalTimer;
function openModal(html, kind = '') {
  clearTimeout(modalTimer);
  const box = $('modal-box'), st = box.scrollTop;
  box.innerHTML = html; hydrate(box); modalKind = kind;
  $('modal').classList.add('open');
  if (kind === 'notifs') box.scrollTop = st;
}
function closeModal() {
  if (modalKind === 'notifs') markAllRead();
  modalKind = ''; $('modal').classList.remove('open');
  modalTimer = setTimeout(() => { if (!modalKind) $('modal-box').innerHTML = ''; }, 300);
  if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
}
$('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
const mhead = (icon, title, cls = '') => `<div class="mhead"><h3><span class="mico ${cls}">${ic(icon, 'w-5 h-5')}</span>${title}</h3><button data-act="close" class="ghost sm" aria-label="close">${ic('x')}</button></div>`;

let confirmResolve = null;
function confirmBox(title, msg, yes) {
  return new Promise(res => {
    confirmResolve = res;
    openModal(`${mhead('info', esc(title), 'rose')}<p class="text-sm text-mut leading-relaxed mb-5">${esc(msg)}</p>
      <div class="flex justify-end gap-2"><button data-act="cn" class="ghost">${t('cancel')}</button><button data-act="cy" class="btn-danger">${esc(yes)}</button></div>`, 'confirm');
  });
}

const authErr = e => ({ 'auth/invalid-credential': 'e_cred', 'auth/wrong-password': 'e_cred', 'auth/email-already-in-use': 'e_exists', 'auth/weak-password': 'e_weak',
  'auth/invalid-email': 'e_email', 'auth/too-many-requests': 'e_many', 'auth/popup-closed-by-user': 'e_popup' }[e.code] ? t({ 'auth/invalid-credential': 'e_cred', 'auth/wrong-password': 'e_cred', 'auth/email-already-in-use': 'e_exists', 'auth/weak-password': 'e_weak',
  'auth/invalid-email': 'e_email', 'auth/too-many-requests': 'e_many', 'auth/popup-closed-by-user': 'e_popup' }[e.code]) : (e.message || t('err')));
const appErr = e => e.code === 'uname' || e.code === 'taken' ? t('e_' + e.code) : (e.message || t('err'));

/* ================= state ================= */
let me = null, profile = null, priv = {}, entries = [], notes = [], unsubs = [];
const people = new Map();
let ftype = 'lent', selected = null, found = new Map(), filter = 'all', view = 'list';
let mode = 'login', pending = null, notesLoaded = false, loading = true, animNext = true;
let payId = null, editId = null, draftPhoto = null;

/* ================= theme / language / currency ================= */
const applyTheme = th => {
  document.documentElement.classList.toggle('light', th === 'light'); document.documentElement.classList.toggle('dark', th !== 'light');
  document.querySelectorAll('[data-act="theme"]').forEach(b => b.innerHTML = ic(th === 'light' ? 'moon' : 'sun'));
};
applyTheme(localStorage.getItem('haulat_theme') || 'dark');
$('cur').value = cur;
function refreshLang() {
  applyI18n(); applyAuthMode(); setFormType(ftype);
  if (me && profile) { headerInfo(); render(); }
}

/* ================= username claim (unique) ================= */
async function claim(uid, raw, display) {
  const u = raw.trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_.]{3,20}$/.test(u)) throw Object.assign(new Error(), { code: 'uname' });
  await runTransaction(db, async tx => {
    const uref = doc(db, 'usernames', u), pref = doc(db, 'users', uid);
    const [us, ps] = await Promise.all([tx.get(uref), tx.get(pref)]);
    if (us.exists() && us.data().uid !== uid) throw Object.assign(new Error(), { code: 'taken' });
    const old = ps.exists() ? ps.data().usernameLower : null;
    if (old && old !== u) tx.delete(doc(db, 'usernames', old));
    const name = (display || (ps.exists() && ps.data().name) || u).trim();
    tx.set(uref, { uid });
    tx.set(pref, { uid, username: u, usernameLower: u, name, nameLower: name.toLowerCase() }, { merge: true });
  });
}

/* ================= auth ================= */
function applyAuthMode() {
  const s = mode === 'signup';
  $('signup-only').classList.toggle('hidden', !s);
  $('auth-btn').textContent = t(s ? 'signup' : 'login');
  $('auth-sub').textContent = t(s ? 'signupSub' : 'loginSub');
  $('toggle-mode').textContent = t(s ? 'toLogin' : 'toSignup');
  $('a-pass').autocomplete = s ? 'new-password' : 'current-password';
}
$('toggle-mode').onclick = () => { mode = mode === 'login' ? 'signup' : 'login'; $('auth-err').textContent = ''; applyAuthMode(); };
$('auth-form').onsubmit = async e => {
  e.preventDefault(); $('auth-err').textContent = ''; $('auth-btn').disabled = true;
  const email = $('a-email').value.trim(), pass = $('a-pass').value;
  try {
    if (mode === 'login') await signInWithEmailAndPassword(auth, email, pass);
    else {
      const name = $('a-name').value.trim(), user = $('a-user').value.trim();
      if (!name || !user) throw new Error(t('needNameUser'));
      pending = { name, user };
      await createUserWithEmailAndPassword(auth, email, pass);
    }
  } catch (err) { pending = null; $('auth-err').textContent = authErr(err); }
  $('auth-btn').disabled = false;
};
$('google-btn').onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (err) { $('auth-err').textContent = authErr(err); } };
$('forgot').onclick = async () => {
  const email = $('a-email').value.trim();
  if (!email) { $('auth-err').textContent = t('needEmail'); return; }
  try { await sendPasswordResetEmail(auth, email); toast(t('resetSent'), 'ok'); } catch (err) { $('auth-err').textContent = authErr(err); }
};
$('setup-form').onsubmit = async e => {
  e.preventDefault(); $('setup-err').textContent = '';
  try { await claim(me, $('s-user').value, $('s-name').value); profile = (await getDoc(doc(db, 'users', me))).data(); startApp(); }
  catch (err) { $('setup-err').textContent = appErr(err); }
};

onAuthStateChanged(auth, async u => {
  stopApp();
  if (!u) { me = null; profile = null; show('auth'); return; }
  me = u.uid;
  let snap = await getDoc(doc(db, 'users', me)), setupErr = '';
  if (!snap.exists() && pending) {
    try { await claim(me, pending.user, pending.name); snap = await getDoc(doc(db, 'users', me)); } catch (err) { setupErr = appErr(err); }
  }
  pending = null;
  if (!snap.exists()) { $('s-name').value = u.displayName || ''; $('setup-err').textContent = setupErr; show('setup'); return; }
  profile = snap.data(); startApp();
});

function stopApp() { unsubs.forEach(f => f()); unsubs = []; entries = []; notes = []; notesLoaded = false; loading = true; people.clear(); }

async function loadPeople(uids) {
  const miss = [...new Set(uids)].filter(u => u && !people.has(u));
  await Promise.all(miss.map(async u => { try { const s = await getDoc(doc(db, 'users', u)); if (s.exists()) people.set(u, s.data()); } catch { } }));
}
function headerInfo() {
  $('hello').textContent = `${profile.name} • @${profile.username}`;
  $('me-btn').innerHTML = `${av(profile.name, profile.photo, 'sm')}<span class="text-xs font-bold hidden sm:inline max-w-[7rem] truncate">${esc(profile.name)}</span>`;
}
async function startApp() {
  show('app'); stopApp(); people.set(me, profile); animNext = true;
  headerInfo(); $('f-date').value = today(); render();
  try { const ps = await getDoc(doc(db, 'private', me)); priv = ps.exists() ? ps.data() : {}; } catch { priv = {}; }
  unsubs.push(onSnapshot(query(collection(db, 'entries'), where('participants', 'array-contains', me)), async s => {
    entries = s.docs.map(d => ({ id: d.id, ...d.data() }));
    await loadPeople(entries.flatMap(e => e.participants || []));
    loading = false; render(); if (modalKind === 'notifs') showNotifs();
  }, e => { loading = false; render(); toast(t('loadErr') + ': ' + e.message, 'err'); }));
  unsubs.push(onSnapshot(query(collection(db, 'notifications'), where('toUid', '==', me)), async s => {
    if (notesLoaded) s.docChanges().forEach(c => { if (c.type === 'added') toast('🔔 ' + nText({ id: c.doc.id, ...c.doc.data() }), 'info'); });
    notesLoaded = true;
    notes = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
    await loadPeople(notes.map(n => n.fromUid));
    renderBell(); if (modalKind === 'notifs') showNotifs();
  }));
}

/* ================= data helpers ================= */
const V = e => {
  const mine = e.creatorUid === me, puid = mine ? e.otherUid : e.creatorUid, pu = people.get(puid);
  return { ...e, mine, puid, dir: mine ? e.type : (e.type === 'lent' ? 'borrowed' : 'lent'),
    pname: pu?.name || (mine ? e.otherName : e.creatorName), puser: pu?.username || (mine ? e.otherUsername : e.creatorUsername), pphoto: pu?.photo || '',
    rem: Math.max(0, r2(e.amount - (e.paid || 0))), pend: r2((e.log || []).filter(l => l.status === 'pending').reduce((a, l) => a + l.amt, 0)) };
};
const notify = (toUid, entryId, kind, data) => toUid && addDoc(collection(db, 'notifications'), {
  toUid, fromUid: me, entryId, kind, read: false, createdAt: Date.now(), data: { name: profile.name, username: profile.username, ...data } });
function nText(n) {
  const d = n.data || {}, w = `${d.name} (@${d.username})`, a = money(d.amount || 0);
  switch (n.kind) {
    case 'request': return t(d.type === 'lent' ? 'nReqLent' : 'nReqBorrowed', w, a);
    case 'accepted': return t(d.type === 'lent' ? 'nAccL' : 'nAccB', w, a);
    case 'rejected': return t(d.type === 'lent' ? 'nRejL' : 'nRejB', w, a);
    case 'payment': return d.payId ? t(d.dir === 'borrowed' ? 'askPayRecv' : 'askPayGave', w, a) : t('nPay', w, a, money(d.rem || 0));
    case 'payAcc': return t('nPayAcc', w, a, money(d.rem || 0));
    case 'payRej': return t('nPayRej', w, a);
    case 'deleted': return t('nDel', w, a);
    case 'reminder': return t('nRemind', w, a);
    case 'edited': return t('nEdit', w, a);
    default: return '';
  }
}
const markAllRead = () => Promise.all(notes.filter(n => !n.read).map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => { })));

/* ================= render ================= */
function countTo(el, to, fmt) {
  const from = +el.dataset.v || 0; el.dataset.v = to;
  if (from === to || reduce) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = n => { const p = Math.min(1, (n - t0) / 700), k = 1 - Math.pow(1 - p, 3); el.textContent = fmt(p < 1 ? Math.round(from + (to - from) * k) : to); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function render() {
  if (!me || !profile) return;
  const all = entries.map(V), acc = all.filter(v => v.status === 'accepted');
  let lent = 0, owed = 0, lT = 0, lP = 0, oT = 0, oP = 0; const lp = new Set(), op = new Set();
  acc.forEach(v => {
    if (v.dir === 'lent') { lT += v.amount; lP += v.paid || 0; if (v.rem) { lent += v.rem; lp.add(v.puid || v.pname); } }
    else { oT += v.amount; oP += v.paid || 0; if (v.rem) { owed += v.rem; op.add(v.puid || v.pname); } }
  });
  const net = r2(lent - owed);
  countTo($('st-lent'), lent, money); countTo($('st-owed'), owed, money);
  countTo($('st-net'), net, v => (v > 0 ? '+' : v < 0 ? '-' : '') + money(Math.abs(v)));
  $('st-lent-n').textContent = lp.size ? t('stLentN', lp.size) : t('stLentNone');
  $('st-owed-n').textContent = op.size ? t('stOwedN', op.size) : t('stOwedNone');
  $('st-net').className = 'text-3xl font-extrabold mono mt-2 ' + (net > 0 ? 'text-emerald-500' : net < 0 ? 'text-rose-500' : '');
  $('st-net-s').textContent = t(net > 0 ? 'netPos' : net < 0 ? 'netNeg' : 'netZero');
  const lpct = lT ? Math.round(lP / lT * 100) : 0, opct = oT ? Math.round(oP / oT * 100) : 0;
  $('ring-l').style.strokeDashoffset = 138.23 * (1 - lpct / 100); $('ring-l-t').textContent = lpct + '%';
  $('ring-o').style.strokeDashoffset = 138.23 * (1 - opct / 100); $('ring-o-t').textContent = opct + '%';
  const sum = lent + owed, ls = sum ? Math.round(lent / sum * 100) : 50;
  $('bar-l').style.width = ls + '%'; $('bar-o').style.width = (100 - ls) + '%';
  const pend = all.filter(v => v.status === 'pending').length;
  $('st-pend').textContent = pend ? t('stPend', pend) : '';

  $('views').innerHTML = [['list', 'list', 'vList'], ['people', 'users', 'vPeople'], ['history', 'clock', 'vHistory']]
    .map(([k, i, l]) => `<button data-act="view" data-v="${k}" class="tab flex items-center gap-1.5 ${view === k ? 'on' : ''}">${ic(i, 'w-3.5 h-3.5')}${t(l)}</button>`).join('');
  const tabs = [['all', t('all')], ['lent', t('lent')], ['borrowed', t('borrowed')], ['pending', t('pending') + (pend ? ` (${pend})` : '')], ['settled', t('settled')]];
  $('tabs').classList.toggle('hidden', view !== 'list');
  $('tabs').innerHTML = tabs.map(([k, l]) => `<button data-act="tab" data-v="${k}" class="tab ${filter === k ? 'on' : ''}">${l}</button>`).join('');

  const q = $('q').value.trim().toLowerCase().replace(/^@/, '');
  const hit = v => !q || [v.pname, v.puser, v.note].some(x => (x || '').toLowerCase().includes(q));
  const box = $('list'); box.classList.toggle('noanim', !animNext); animNext = false;
  if (loading) box.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  else if (view === 'people') box.innerHTML = peopleView(all.filter(hit)) || empty();
  else if (view === 'history') box.innerHTML = historyView(all.filter(hit)) || empty();
  else {
    const list = all.filter(v => {
      if (filter === 'lent') return v.status === 'accepted' && v.dir === 'lent';
      if (filter === 'borrowed') return v.status === 'accepted' && v.dir === 'borrowed';
      if (filter === 'pending') return v.status !== 'accepted';
      if (filter === 'settled') return v.status === 'accepted' && !v.rem;
      return true;
    }).filter(hit).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    box.innerHTML = list.length ? list.map(card).join('') : empty();
  }
  renderBell();
}
const empty = () => `<div class="glass rounded-3xl p-12 text-center fu"><div class="w-14 h-14 mx-auto rounded-2xl bg-slate-500/10 text-mut flex items-center justify-center mb-3">${ic('inbox', 'w-7 h-7')}</div><div class="font-bold">${t('emptyT')}</div><div class="text-xs text-mut mt-1">${t('emptyS')}</div></div>`;

function card(v, i) {
  const lent = v.dir === 'lent', settled = v.status === 'accepted' && !v.rem, nm = esc(v.pname);
  const pct = v.amount ? Math.min(100, Math.round((v.paid || 0) / v.amount * 100)) : 0;
  const overdue = v.status === 'accepted' && v.rem && v.dueDate && v.dueDate < today();
  let banner = '';
  if (v.status === 'pending' && !v.mine) banner = `<div class="banner amber"><div class="font-semibold mb-2.5">${t(lent ? 'askGave' : 'askRecv', nm, money(v.amount))}</div>
    <div class="flex flex-wrap gap-2"><button data-act="accept" data-id="${v.id}" class="btn">${ic('check')}${t(lent ? 'yesGave' : 'yesRecv')}</button><button data-act="reject" data-id="${v.id}" class="btn-danger">${ic('x')}${t(lent ? 'noGave' : 'noRecv')}</button></div></div>`;
  else if (v.status === 'pending' && v.puid) banner = `<div class="banner amber font-semibold">${t(lent ? 'waitLent' : 'waitBorrowed', nm)}</div>`;
  else if (v.status === 'rejected') banner = `<div class="banner rose"><span class="font-semibold">${v.mine ? t(lent ? 'rejLent' : 'rejBorrowed', nm) : t('rejByMe')}</span>${v.mine ? `<div class="mt-2"><button data-act="edit" data-id="${v.id}" class="ghost">${ic('send')}${t('resend')}</button></div>` : ''}</div>`;
  const tags = [lent ? `<span class="tag green">${t('toRecv')}</span>` : `<span class="tag rose">${t('toPay')}</span>`,
    !v.puid ? `<span class="tag slate">${ic('lock', 'w-3 h-3')}${t('personal')}</span>` : '',
    v.status === 'accepted' && v.puid && !settled ? `<span class="tag sky">${ic('check', 'w-3 h-3')}${t('confirmed')}</span>` : '',
    settled ? `<span class="tag slate">${ic('check', 'w-3 h-3')}${t('settled')}</span>` : '', overdue ? `<span class="tag amber">${t('overdue')}</span>` : ''].join('');
  const acts = [v.status === 'accepted' && v.rem ? `<button data-act="pay" data-id="${v.id}" class="btn">${ic('coins')}${t('pay')}</button>` : '',
    v.status === 'accepted' && v.rem && lent && v.puid ? `<button data-act="remind" data-id="${v.id}" class="ghost sm" title="${t('remind')}">${ic('bell')}</button>` : '',
    v.mine ? `<button data-act="edit" data-id="${v.id}" class="ghost sm" title="${t('edit')}">${ic('edit')}</button><button data-act="del" data-id="${v.id}" class="ghost sm red" title="${t('del')}">${ic('trash')}</button>` : ''].join('');
  const log = (v.log || []).map(l => { const st = l.status === 'pending' ? `<span class="tag amber">⏳ ${t('payWait')}</span>` : l.status === 'rejected' ? `<span class="tag rose">✖ ${t('rejTag')}</span>` : '';
    return `<div class="flex justify-between gap-2 items-center"><span>↳ ${esc(fdate(l.date))} • ${esc(l.by)}${l.note ? ' — ' + esc(l.note) : ''} ${st}</span><b class="mono ${l.status === 'rejected' ? 'line-through opacity-60' : ''}">${money(l.amt)}</b></div>`; }).join('');
  const payBan = (v.log || []).filter(l => l.status === 'pending' && l.uid !== me).map(l => `<div class="banner amber"><div class="font-semibold mb-2.5">${t(l.dir === 'borrowed' ? 'askPayRecv' : 'askPayGave', nm, money(l.amt))}</div>
    <div class="flex flex-wrap gap-2"><button data-act="payok" data-id="${v.id}" data-pid="${l.id}" class="btn">${ic('check')}${t(l.dir === 'borrowed' ? 'yesRecv' : 'yesGave')}</button><button data-act="payno" data-id="${v.id}" data-pid="${l.id}" class="btn-danger">${ic('x')}${t(l.dir === 'borrowed' ? 'noRecv' : 'noGave')}</button></div></div>`).join('');
  return `<div class="glass lift rounded-3xl p-4 space-y-3 ${settled ? 'opacity-75' : ''}" style="animation-delay:${Math.min(i * 45, 360)}ms">
    <div class="flex flex-wrap justify-between gap-3">
      <div class="flex gap-3 min-w-0">${av(v.pname, v.pphoto)}<div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1"><span class="font-extrabold">${nm}</span>${v.puser ? `<span class="text-xs text-mut">@${esc(v.puser)}</span>` : ''}${tags}</div>
        <div class="text-sm">${v.note ? esc(v.note) : `<i class="text-mut">${t('noNote')}</i>`}</div>
        <div class="text-[11px] text-mut flex flex-wrap gap-x-3">${ic('cal', 'w-3 h-3 inline')}<span>${esc(fdate(v.date))}</span>${v.dueDate ? `<span class="${overdue ? 'text-amber-500 font-semibold' : ''}">${t('dueP')}: ${esc(fdate(v.dueDate))}</span>` : ''}</div></div></div>
      <div class="flex gap-2 items-start flex-wrap">${acts}</div></div>
    ${banner}${payBan}
    <div><div class="flex flex-wrap justify-between gap-1 text-xs mb-1.5"><span>${t('total')}: <b class="mono">${money(v.amount)}</b></span><span>${t('paid')}: <b class="mono text-sky-500">${money(v.paid || 0)}</b> (${pct}%)</span><span>${t('remaining')}: <b class="mono ${lent ? 'text-emerald-500' : 'text-rose-500'}">${money(v.rem)}</b></span></div>
      <div class="h-2 rounded-full bg-slate-500/20 overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r ${lent ? 'from-emerald-500 to-teal-400' : 'from-sky-500 to-indigo-400'} transition-all duration-700" style="width:${pct}%"></div></div>
      ${log ? `<div class="text-[11px] text-mut mt-2.5 space-y-1">${log}</div>` : ''}</div></div>`;
}

function groups(list) {
  const m = new Map();
  list.filter(v => v.status === 'accepted').forEach(v => {
    const k = v.puid || 'n:' + (v.pname || '').toLowerCase();
    if (!m.has(k)) m.set(k, { name: v.pname, user: v.puser, photo: v.pphoto, lent: 0, owed: 0, n: 0 });
    const g = m.get(k); g.n++; if (v.dir === 'lent') g.lent += v.rem; else g.owed += v.rem;
  });
  return [...m.values()].sort((a, b) => Math.abs(b.lent - b.owed) - Math.abs(a.lent - a.owed));
}
function peopleView(list) {
  return groups(list).map((g, i) => { const net = r2(g.lent - g.owed);
    return `<div class="glass lift rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3" style="animation-delay:${Math.min(i * 45, 360)}ms">
      <div class="flex items-center gap-3">${av(g.name, g.photo)}<div><div class="font-extrabold">${esc(g.name)} ${g.user ? `<span class="text-xs text-mut font-normal">@${esc(g.user)}</span>` : ''}</div>
        <div class="text-[11px] text-mut">${t('toRecv')}: <b class="mono text-emerald-500">${money(g.lent)}</b> • ${t('toPay')}: <b class="mono text-rose-500">${money(g.owed)}</b> • ${t('nEntries', g.n)}</div></div></div>
      <div class="flex items-center gap-3"><div class="text-right"><div class="text-[10px] uppercase tracking-wider text-mut font-bold">${t('net')}</div><div class="text-lg font-extrabold mono ${net > 0 ? 'text-emerald-500' : net < 0 ? 'text-rose-500' : 'text-mut'}">${net > 0 ? '+' : net < 0 ? '-' : ''}${money(Math.abs(net))}</div></div>
      <button data-act="openp" data-v="${esc(g.user || g.name)}" class="ghost">${t('open')}</button></div></div>`; }).join('');
}
function historyView(list) {
  const ev = [];
  list.forEach(v => { ev.push({ date: v.date, ts: v.createdAt || 0, k: 'c', v }); (v.log || []).forEach(l => ev.push({ date: l.date, ts: l.ts || 0, k: 'p', v, l })); });
  ev.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.ts - a.ts);
  if (!ev.length) return '';
  return `<div class="timeline space-y-3">${ev.map((e, i) => { const lent = e.v.dir === 'lent', nm = esc(e.v.pname);
    const dot = e.k === 'p' ? 'bg-sky-500 text-white' : lent ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white';
    const txt = e.k === 'p' ? (e.l.status === 'pending' ? '⏳ ' : e.l.status === 'rejected' ? '✖ ' : '') + t('evPay', nm, money(e.l.amt), esc(e.l.by)) : t(lent ? 'evLent' : 'evBorrowed', nm, money(e.v.amount));
    return `<div class="glass rounded-2xl p-3.5 relative flex flex-wrap justify-between gap-2" style="animation-delay:${Math.min(i * 35, 350)}ms"><span class="tdot ${dot}">${ic(e.k === 'p' ? 'coins' : lent ? 'send' : 'download', 'w-3 h-3')}</span>
      <div><div class="text-sm font-semibold">${txt}</div><div class="text-[11px] text-mut mt-0.5">${esc(fdate(e.date))}${e.v.note && e.k === 'c' ? ' • ' + esc(e.v.note) : ''}</div></div>
      <span class="font-extrabold mono ${e.k === 'p' ? 'text-sky-500' : lent ? 'text-emerald-500' : 'text-rose-500'}">${money(e.k === 'p' ? e.l.amt : e.v.amount)}</span></div>`; }).join('')}</div>`;
}
function renderBell() {
  const n = notes.filter(x => !x.read).length;
  $('bell').textContent = n; $('bell').classList.toggle('hidden', !n); $('bell-ic').classList.toggle('bellpulse', n > 0);
}

/* ================= add entry ================= */
function setFormType(tp) {
  ftype = tp; $('t-lent').classList.toggle('on', tp === 'lent'); $('t-borrowed').classList.toggle('on', tp === 'borrowed');
  $('t-borrowed').style.background = tp === 'borrowed' ? 'linear-gradient(90deg,#f43f5e,#db2777)' : ''; $('t-borrowed').style.color = tp === 'borrowed' ? '#fff' : '';
  setSelNote();
}
function setSelNote() {
  const n = $('sel-note'); n.textContent = selected ? t('hintSel', selected.username) : t('hintPersonal'); n.className = 'text-[11px] mt-1.5 ' + (selected ? 'text-emerald-500 font-semibold' : 'text-mut');
}
$('f-person').oninput = (() => { let tm; return () => { selected = null; setSelNote(); clearTimeout(tm); tm = setTimeout(searchUsers, 280); }; })();
async function searchUsers() {
  const q = $('f-person').value.trim().toLowerCase().replace(/^@/, ''), box = $('suggest');
  if (q.length < 2) { box.classList.add('hidden'); return; }
  const run = f => getDocs(query(collection(db, 'users'), where(f, '>=', q), where(f, '<=', q + '\uf8ff'), limit(5)));
  try {
    const [a, b] = await Promise.all([run('usernameLower'), run('nameLower')]);
    found = new Map(); [...a.docs, ...b.docs].forEach(d => { if (d.id !== me) found.set(d.id, d.data()); });
    box.innerHTML = found.size ? [...found.values()].map(u => `<button type="button" data-act="pick" data-uid="${u.uid}" class="w-full text-left px-3 py-2.5 hover:bg-emerald-500/10 flex items-center gap-3 transition">${av(u.name, u.photo, 'sm')}<div class="min-w-0"><div class="text-sm font-bold truncate">${esc(u.name)}</div><div class="text-[11px] text-mut">@${esc(u.username)}</div></div></button>`).join('')
      : `<div class="px-3.5 py-3 text-xs text-mut">${t('noUser')}</div>`;
    box.classList.remove('hidden');
  } catch (e) { toast(e.message, 'err'); }
}
$('add-form').onsubmit = async e => {
  e.preventDefault();
  const amount = r2(parseFloat($('f-amount').value)), typed = $('f-person').value.trim();
  if (!typed || !(amount > 0)) return toast(t('badAmount'), 'err');
  const o = selected;
  const data = { creatorUid: me, creatorName: profile.name, creatorUsername: profile.username, otherUid: o ? o.uid : null, otherName: o ? o.name : typed, otherUsername: o ? o.username : null,
    type: ftype, amount, paid: 0, note: $('f-note').value.trim(), date: $('f-date').value || today(), dueDate: $('f-due').value,
    status: o ? 'pending' : 'accepted', participants: o ? [me, o.uid] : [me], log: [], createdAt: Date.now() };
  $('f-submit').disabled = true;
  try {
    const ref = await addDoc(collection(db, 'entries'), data);
    if (o) { people.set(o.uid, o); await notify(o.uid, ref.id, 'request', { amount, type: ftype }); }
    toast(o ? t('sentReq', o.name) : t('addedPersonal'), 'ok'); animNext = true;
    e.target.reset(); $('f-date').value = today(); selected = null; setSelNote(); $('suggest').classList.add('hidden');
  } catch (err) { toast(err.message, 'err'); }
  $('f-submit').disabled = false;
};

/* ================= actions ================= */
async function respond(id, ok) {
  const e = entries.find(x => x.id === id); if (!e) return;
  await updateDoc(doc(db, 'entries', id), { status: ok ? 'accepted' : 'rejected' });
  await notify(e.creatorUid, id, ok ? 'accepted' : 'rejected', { amount: e.amount, type: e.type });
  notes.filter(n => n.entryId === id && n.kind === 'request' && !n.read).forEach(n => updateDoc(doc(db, 'notifications', n.id), { read: true }));
  toast(t(ok ? 'accepted' : 'rejected'), ok ? 'ok' : 'info');
}
async function respondPay(eid, pid, ok) {
  const ref = doc(db, 'entries', eid); let rec = null, item = null, remAfter = 0;
  await runTransaction(db, async tx => {
    const sn = await tx.get(ref); if (!sn.exists()) return;
    const e = sn.data(), log = (e.log || []).map(l => ({ ...l })), it = log.find(l => l.id === pid);
    if (!it || it.status !== 'pending') return;
    const rem = r2(e.amount - (e.paid || 0)), pay = ok ? Math.min(it.amt, rem) : 0;
    it.status = ok ? 'confirmed' : 'rejected'; if (ok) it.amt = pay;
    const upd = { log }; if (ok) upd.paid = r2((e.paid || 0) + pay);
    tx.update(ref, upd); rec = it.uid; item = it; remAfter = r2(rem - pay);
  });
  if (rec) await notify(rec, eid, ok ? 'payAcc' : 'payRej', { amount: item.amt, rem: remAfter, dir: item.dir });
  notes.filter(n => n.data?.payId === pid && !n.read).forEach(n => updateDoc(doc(db, 'notifications', n.id), { read: true }));
  toast(t(ok ? 'accepted' : 'rejected'), ok ? 'ok' : 'info');
}
function showNotifs() {
  const rows = notes.length ? notes.map(n => {
    const e = entries.find(x => x.id === n.entryId), f = people.get(n.fromUid);
    let st = '';
    if (n.kind === 'request') {
      if (!e) st = `<span class="tag slate">${t('nDeleted')}</span>`;
      else if (e.status === 'pending' && e.creatorUid !== me) { const lent = V(e).dir === 'lent';
        st = `<div class="flex flex-wrap gap-2 mt-2.5"><button data-act="accept" data-id="${n.entryId}" class="btn">${ic('check')}${t(lent ? 'yesGave' : 'yesRecv')}</button><button data-act="reject" data-id="${n.entryId}" class="btn-danger">${ic('x')}${t(lent ? 'noGave' : 'noRecv')}</button></div>`; }
      else if (e.status === 'accepted') st = `<span class="tag green mt-2">${ic('check', 'w-3 h-3')}${t('nYouAccepted')}</span>`;
      else if (e.status === 'rejected') st = `<span class="tag rose mt-2">${ic('x', 'w-3 h-3')}${t('nYouRejected')}</span>`;
    }
    if (n.kind === 'payment' && n.data?.payId) {
      const l = (e?.log || []).find(x => x.id === n.data.payId);
      if (!e || !l) st = `<span class="tag slate mt-2">${t('nDeleted')}</span>`;
      else if (l.status === 'pending' && l.uid !== me) { const b = l.dir === 'borrowed';
        st = `<div class="flex flex-wrap gap-2 mt-2.5"><button data-act="payok" data-id="${n.entryId}" data-pid="${l.id}" class="btn">${ic('check')}${t(b ? 'yesRecv' : 'yesGave')}</button><button data-act="payno" data-id="${n.entryId}" data-pid="${l.id}" class="btn-danger">${ic('x')}${t(b ? 'noRecv' : 'noGave')}</button></div>`; }
      else if (l.status === 'rejected') st = `<span class="tag rose mt-2">${ic('x', 'w-3 h-3')}${t('nYouRejected')}</span>`;
      else st = `<span class="tag green mt-2">${ic('check', 'w-3 h-3')}${t('nYouAccepted')}</span>`;
    }
    return `<div class="sub rounded-2xl p-3 flex gap-3 ${n.read ? 'opacity-70' : 'border-emerald-500/40'}">${av(f?.name || n.data?.name, f?.photo, 'sm')}
      <div class="min-w-0 flex-1"><div class="text-[13px] leading-snug">${!n.read ? `<span class="tag green mr-1">${t('newTag')}</span>` : ''}${esc(nText(n))}</div>
      <div class="text-[10px] text-mut mt-1">${esc(new Date(n.createdAt).toLocaleString(getLang() === 'bn' ? 'bn-BD' : 'en-GB'))}</div>${st}</div>
      <button data-act="delnote" data-id="${n.id}" class="text-mut hover:text-rose-500 self-start p-1" aria-label="delete">${ic('x', 'w-3.5 h-3.5')}</button></div>`;
  }).join('') : `<div class="py-10 text-center text-sm text-mut">${ic('bell', 'w-8 h-8 mx-auto mb-2 opacity-50')}${t('noNotif')}</div>`;
  openModal(`${mhead('bell', t('notifTitle'))}${notes.length ? `<div class="flex justify-end gap-2 mb-3"><button data-act="readall" class="ghost sm">${t('markAll')}</button><button data-act="clearnotes" class="ghost sm red">${t('clearAll')}</button></div>` : ''}<div class="space-y-2.5">${rows}</div>`, 'notifs');
}
function showTools() {
  openModal(`${mhead('tools', t('tools'), 'sky')}<div class="space-y-2.5"><button data-act="csv" class="ghost w-full !justify-start py-3">${ic('download')}${t('exportCsv')}</button><button data-act="sumcopy" class="ghost w-full !justify-start py-3">${ic('copy')}${t('copySum')}</button></div>`, 'tools');
}
function showPay(id) {
  const v = V(entries.find(x => x.id === id)); payId = id; const mx = Math.max(0, r2(v.rem - v.pend));
  openModal(`${mhead('coins', t('payTitle'))}
    <div class="sub rounded-2xl p-3.5 mb-4 flex items-center gap-3">${av(v.pname, v.pphoto, 'sm')}<div class="flex-1 min-w-0"><div class="font-bold truncate">${esc(v.pname)}</div><div class="text-[11px] text-mut">${t('remaining')}</div></div><div class="font-extrabold mono text-lg">${money(v.rem)}</div></div>
    <div class="space-y-3"><input id="pay-amt" type="number" step="any" min="0.01" max="${mx}" class="inp mono font-bold text-base" placeholder="${t('payAmt')}" data-rem="${v.rem}">
    <div class="flex gap-2 flex-wrap"><button data-act="payfill" data-v="${mx}" class="ghost sm">${t('full')}</button><button data-act="payfill" data-v="${r2(mx / 2)}" class="ghost sm">${t('half')}</button></div>
    <div class="text-xs text-mut flex justify-between border-t border-slate-500/15 pt-2.5"><span>${t('after')}</span><b id="pay-after" class="mono text-sky-500">${money(v.rem)}</b></div>
    ${v.puid ? `<p class="text-[11px] text-amber-500">⏳ ${t('payConfirmHint')}</p>` : ''}<input id="pay-note" class="inp" placeholder="${t('payNote')}"><button data-act="dopay" class="btn w-full py-3">${ic('check')}${t('confirm')}</button></div>`, 'pay');
  setTimeout(() => $('pay-amt')?.focus(), 250);
}
function showEdit(id) {
  const v = V(entries.find(x => x.id === id)); editId = id;
  const canAmt = v.mine && !(v.paid || 0) && (v.status !== 'accepted' || !v.puid);
  openModal(`${mhead('edit', t('editTitle'), 'sky')}<div class="space-y-3">
    <div><label class="lb">${t('amount')}</label><input id="e-amt" type="number" step="any" min="0.01" class="inp mono font-bold" value="${v.amount}" ${canAmt ? '' : 'disabled'}>${canAmt ? '' : `<p class="text-[11px] text-mut mt-1">${t('amtLocked')}</p>`}</div>
    <div><label class="lb">${t('note')}</label><input id="e-note" class="inp" value="${esc(v.note)}"></div>
    <div class="grid grid-cols-2 gap-3"><div><label class="lb">${t('date')}</label><input id="e-date" type="date" class="inp !text-xs" value="${esc(v.date)}"></div><div><label class="lb">${t('due')}</label><input id="e-due" type="date" class="inp !text-xs" value="${esc(v.dueDate || '')}"></div></div>
    <div class="flex justify-end gap-2 pt-1"><button data-act="close" class="ghost">${t('cancel')}</button><button data-act="doedit" class="btn">${v.status === 'rejected' ? ic('send') + t('resend') : t('saveCh')}</button></div></div>`, 'edit');
}
function showProfile() {
  draftPhoto = profile.photo || '';
  const hasPass = auth.currentUser.providerData.some(p => p.providerId === 'password');
  openModal(`${mhead('user', t('pTitle'))}
    <div class="flex items-center gap-4 mb-4"><div id="p-av">${av(profile.name, draftPhoto, 'xl')}</div>
      <div class="flex flex-col gap-2"><label class="ghost cursor-pointer">${ic('camera')}${t('pPhoto')}<input id="p-file" type="file" accept="image/*" class="hidden"></label><button data-act="rmphoto" class="ghost sm red">${t('pRemove')}</button></div></div>
    <div class="space-y-3">
      <div><label class="lb">${t('pEmail')}</label><input class="inp opacity-70" value="${esc(auth.currentUser.email || '')}" disabled></div>
      <div><label class="lb">${t('pName')}</label><input id="p-name" class="inp" value="${esc(profile.name)}"></div>
      <div><label class="lb">${t('pUser')}</label><input id="p-user" class="inp" value="${esc(profile.username)}" autocapitalize="none"><p class="text-[11px] text-mut mt-1">${t('pUserHint')}</p></div>
      <div><label class="lb">${t('pBio')}</label><input id="p-bio" class="inp" maxlength="120" value="${esc(profile.bio || '')}"></div>
      <div><label class="lb">${t('pPhone')}</label><input id="p-phone" type="tel" class="inp" value="${esc(priv.phone || '')}"></div>
      <div><label class="lb">${t('pAddr')}</label><textarea id="p-addr" rows="2" class="inp">${esc(priv.address || '')}</textarea><p class="text-[11px] text-mut mt-1">${t('pPrivate')}</p></div>
      <p id="p-err" class="text-xs text-rose-400 min-h-[1rem]"></p>
      <div class="flex justify-between gap-2"><button data-act="logout" class="ghost red">${ic('logout')}${t('logout')}</button><button data-act="saveprofile" class="btn">${ic('check')}${t('save')}</button></div></div>
    <div class="sect"><h4 class="font-bold text-sm flex items-center gap-2 mb-3">${ic('lock')}${t('pSec')}</h4>
    ${hasPass ? `<div class="space-y-3"><input id="pw-cur" type="password" class="inp" placeholder="${t('curPass')}" autocomplete="current-password"><input id="pw-new" type="password" class="inp" placeholder="${t('newPass')}" autocomplete="new-password"><input id="pw-new2" type="password" class="inp" placeholder="${t('confPass')}" autocomplete="new-password">
      <p id="pw-err" class="text-xs min-h-[1rem]"></p><button data-act="chpass" class="btn w-full">${t('chPass')}</button></div>` : `<p class="text-xs text-mut">${t('googleNoPass')}</p>`}</div>`, 'profile');
}
function resizePhoto(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const s = 220, c = document.createElement('canvas'); c.width = c.height = s; const m = Math.min(img.width, img.height), x = (img.width - m) / 2, y = (img.height - m) / 2;
      c.getContext('2d').drawImage(img, x, y, m, m, 0, 0, s, s); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82)); };
    img.onerror = () => rej(new Error(t('imgBad'))); img.src = url;
  });
}
document.addEventListener('change', async e => {
  if (e.target.id === 'p-file' && e.target.files[0]) {
    try { draftPhoto = await resizePhoto(e.target.files[0]); $('p-av').innerHTML = av(profile.name, draftPhoto, 'xl'); } catch (err) { toast(err.message, 'err'); }
  }
  if (e.target.id === 'cur') { cur = e.target.value; localStorage.setItem('haulat_cur', cur); countersReset(); render(); }
});
const countersReset = () => ['st-lent', 'st-owed', 'st-net'].forEach(i => $(i).dataset.v = 0);
document.addEventListener('input', e => {
  if (e.target.id === 'pay-amt') { const rem = +e.target.dataset.rem, v = parseFloat(e.target.value) || 0; $('pay-after').textContent = money(Math.max(0, r2(rem - v))); }
});

function summaryText() {
  const all = entries.map(V).filter(v => v.status === 'accepted' && v.rem); if (!all.length) return '';
  let l = 0, o = 0; const by = new Map();
  all.forEach(v => { const k = v.pname; const s = v.dir === 'lent' ? v.rem : -v.rem; by.set(k, (by.get(k) || 0) + s); if (s > 0) l += s; else o -= s; });
  return [t('sumTitle'), `${t('sumLent')}: ${money(l)}`, `${t('sumOwed')}: ${money(o)}`, `${t('sumNet')}: ${l - o >= 0 ? '+' : '-'}${money(Math.abs(l - o))}`, '', t('sumBy'),
    ...[...by].map(([n, s]) => `• ${n}: ${s > 0 ? t('sumOwes') : t('sumIowe')} ${money(Math.abs(s))}`)].join('\n');
}
function exportCsv() {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Person', 'Username', 'Direction', 'Amount', 'Paid', 'Remaining', 'Status', 'Note', 'Due'], ...entries.map(V).map(v => [v.date, v.pname, v.puser || '', v.dir, v.amount, v.paid || 0, v.rem, v.status, v.note, v.dueDate || ''])];
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `haulat-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

/* ================= click delegation ================= */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]');
  if (!b) { if (!ev.target.closest('#suggest') && ev.target.id !== 'f-person') $('suggest').classList.add('hidden'); return; }
  const a = b.dataset.act, id = b.dataset.id;
  try {
    switch (a) {
      case 'close': closeModal(); break;
      case 'cy': { const r = confirmResolve; confirmResolve = null; modalKind = ''; closeModal(); r && r(true); break; }
      case 'cn': closeModal(); break;
      case 'logout': closeModal(); await signOut(auth); break;
      case 'theme': { const th = document.documentElement.classList.contains('light') ? 'dark' : 'light'; localStorage.setItem('haulat_theme', th); applyTheme(th); break; }
      case 'lang': setLang(b.dataset.v); refreshLang(); break;
      case 'tab': filter = b.dataset.v; animNext = true; render(); break;
      case 'view': view = b.dataset.v; animNext = true; render(); break;
      case 'openp': $('q').value = b.dataset.v; view = 'list'; filter = 'all'; animNext = true; render(); break;
      case 'ftype': setFormType(b.dataset.v); break;
      case 'qa': $('f-amount').value = r2((parseFloat($('f-amount').value) || 0) + +b.dataset.v); break;
      case 'pick': selected = found.get(b.dataset.uid); $('f-person').value = selected.name; $('suggest').classList.add('hidden'); setSelNote(); break;
      case 'accept': await respond(id, true); break;
      case 'reject': await respond(id, false); break;
      case 'notifs': showNotifs(); break;
      case 'readall': await markAllRead(); break;
      case 'clearnotes': await Promise.all(notes.map(n => deleteDoc(doc(db, 'notifications', n.id)))); break;
      case 'delnote': await deleteDoc(doc(db, 'notifications', id)); break;
      case 'tools': showTools(); break;
      case 'csv': exportCsv(); toast(t('csvDone'), 'ok'); closeModal(); break;
      case 'sumcopy': { const s = summaryText(); closeModal(); if (!s) return toast(t('nothing'), 'info'); await navigator.clipboard.writeText(s); toast(t('copied'), 'ok'); break; }
      case 'profile': showProfile(); break;
      case 'rmphoto': draftPhoto = ''; $('p-av').innerHTML = av(profile.name, '', 'xl'); break;
      case 'saveprofile': {
        try {
          await claim(me, $('p-user').value, $('p-name').value.trim() || profile.name);
          await updateDoc(doc(db, 'users', me), { bio: $('p-bio').value.trim(), photo: draftPhoto || '' });
          priv = { phone: $('p-phone').value.trim(), address: $('p-addr').value.trim() }; await setDoc(doc(db, 'private', me), priv);
          profile = (await getDoc(doc(db, 'users', me))).data(); people.set(me, profile); headerInfo(); closeModal(); render(); toast(t('pSaved'), 'ok');
        } catch (err) { $('p-err').textContent = appErr(err); }
        break;
      }
      case 'chpass': {
        const er = $('pw-err'); er.className = 'text-xs min-h-[1rem] text-rose-400'; er.textContent = '';
        const c = $('pw-cur').value, n1 = $('pw-new').value, n2 = $('pw-new2').value;
        if (n1.length < 6) { er.textContent = t('e_weak'); break; }
        if (n1 !== n2) { er.textContent = t('passMis'); break; }
        try { const u = auth.currentUser; await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, c)); await updatePassword(u, n1);
          er.className = 'text-xs min-h-[1rem] text-emerald-500'; er.textContent = t('passOk'); ['pw-cur', 'pw-new', 'pw-new2'].forEach(i => $(i).value = ''); toast(t('passOk'), 'ok'); }
        catch (err) { er.textContent = authErr(err); }
        break;
      }
      case 'pay': showPay(id); break;
      case 'payfill': $('pay-amt').value = b.dataset.v; $('pay-amt').dispatchEvent(new Event('input', { bubbles: true })); break;
      case 'dopay': {
        const e = entries.find(x => x.id === payId), v = V(e), amt = r2(parseFloat($('pay-amt').value));
        if (!(amt > 0)) return toast(t('badAmount'), 'err');
        const mx = Math.max(0, r2(v.rem - v.pend)); if (mx <= 0) return toast(t('payPendingAll'), 'info');
        const pay = Math.min(amt, mx), note = $('pay-note').value.trim();
        const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), amt: pay, date: today(), ts: Date.now(), note, by: profile.name, uid: me, dir: v.dir, status: v.puid ? 'pending' : 'confirmed' };
        if (v.puid) { await updateDoc(doc(db, 'entries', payId), { log: arrayUnion(item) }); await notify(v.puid, payId, 'payment', { amount: pay, dir: v.dir, payId: item.id }); closeModal(); toast(t('paySent'), 'ok'); }
        else { await updateDoc(doc(db, 'entries', payId), { paid: increment(pay), log: arrayUnion(item) }); closeModal(); toast(pay >= v.rem ? t('paidFull') : t('paidPart', money(pay), money(r2(v.rem - pay))), 'ok'); }
        break;
      }
      case 'payok': await respondPay(id, b.dataset.pid, true); break;
      case 'payno': await respondPay(id, b.dataset.pid, false); break;
      case 'edit': showEdit(id); break;
      case 'doedit': {
        const e = entries.find(x => x.id === editId), v = V(e), upd = { note: $('e-note').value.trim(), date: $('e-date').value || e.date, dueDate: $('e-due').value };
        const amtEl = $('e-amt'); let resend = e.status === 'rejected';
        if (!amtEl.disabled) { const am = r2(parseFloat(amtEl.value)); if (!(am > 0)) return toast(t('badAmount'), 'err'); if (am !== e.amount) { upd.amount = am; resend = resend || (e.status === 'pending' && !!e.otherUid); } }
        if (resend && e.otherUid) upd.status = 'pending';
        await updateDoc(doc(db, 'entries', editId), upd);
        if (resend && e.otherUid) await notify(e.otherUid, editId, upd.status === 'pending' && e.status === 'rejected' ? 'request' : 'edited', { amount: upd.amount ?? e.amount, type: e.type });
        closeModal(); toast(t('updated'), 'ok'); break;
      }
      case 'remind': {
        const e = entries.find(x => x.id === id), v = V(e);
        if (e.remindedAt && Date.now() - e.remindedAt < 3600000) return toast(t('remindWait'), 'info');
        await updateDoc(doc(db, 'entries', id), { remindedAt: Date.now() });
        await notify(v.puid, id, 'reminder', { amount: v.rem }); toast(t('reminded'), 'ok'); break;
      }
      case 'del': {
        const e = entries.find(x => x.id === id), v = V(e);
        if (!await confirmBox(t('delTitle'), t('delMsg', v.pname, money(e.amount)), t('yesDel'))) return;
        await deleteDoc(doc(db, 'entries', id));
        if (e.otherUid) await notify(e.otherUid, id, 'deleted', { amount: e.amount });
        toast(t('deleted'), 'ok'); break;
      }
    }
  } catch (err) { toast(err.message || t('err'), 'err'); }
});
$('q').oninput = () => { animNext = true; render(); };

/* ================= boot ================= */
hydrate(); applyI18n(); applyAuthMode(); applyTheme(localStorage.getItem('haulat_theme') || 'dark');
