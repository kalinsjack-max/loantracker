import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, collection, query, where,
  onSnapshot, runTransaction, arrayUnion, increment, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round(n * 100) / 100;
const money = n => '৳' + (+n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const show = id => ['auth', 'setup', 'app'].forEach(x => { const el = $(x), on = x === id; el.classList.toggle('hidden', !on); if (x !== 'app') el.classList.toggle('flex', on); });
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'glass-card rounded-2xl px-4 py-3 text-xs font-semibold shadow-2xl';
  t.textContent = msg; $('toasts').appendChild(t); setTimeout(() => t.remove(), 4500);
}
const openModal = html => { $('modal-box').innerHTML = html; $('modal').classList.remove('hidden'); $('modal').classList.add('flex'); };
const closeModal = () => { $('modal').classList.add('hidden'); $('modal').classList.remove('flex'); };
$('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
const errMsg = e => ({
  'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড ভুল', 'auth/email-already-in-use': 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা আছে',
  'auth/weak-password': 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে', 'auth/invalid-email': 'ইমেইল সঠিক নয়',
  'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে, একটু পরে আবার চেষ্টা করুন', 'auth/popup-closed-by-user': 'লগইন বাতিল হয়েছে'
}[e.code] || e.message);

/* ---------- state ---------- */
let me = null, profile = null, entries = [], notes = [], unsubs = [];
let ftype = 'lent', selected = null, found = new Map(), filter = 'all', payId = null;
let mode = 'login', pending = null, notesLoaded = false;

/* ---------- theme ---------- */
const applyTheme = t => { document.documentElement.classList.toggle('light', t === 'light'); document.documentElement.classList.toggle('dark', t !== 'light'); };
applyTheme(localStorage.getItem('haulat_theme') || 'dark');

/* ---------- username (unique) ---------- */
async function claim(uid, raw, display) {
  const u = raw.trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_.]{3,20}$/.test(u)) throw new Error('ইউজারনেম ৩-২০ অক্ষরের হতে হবে; শুধু a-z, 0-9, _ এবং . ব্যবহার করা যাবে');
  await runTransaction(db, async tx => {
    const uref = doc(db, 'usernames', u), pref = doc(db, 'users', uid);
    const [us, ps] = await Promise.all([tx.get(uref), tx.get(pref)]);
    if (us.exists() && us.data().uid !== uid) throw new Error('এই ইউজারনেম আগেই অন্য কেউ নিয়ে নিয়েছে, অন্য একটি দিন');
    const old = ps.exists() ? ps.data().usernameLower : null;
    if (old && old !== u) tx.delete(doc(db, 'usernames', old));
    const name = (display || (ps.exists() && ps.data().name) || u).trim();
    tx.set(uref, { uid });
    tx.set(pref, { uid, username: u, usernameLower: u, name, nameLower: name.toLowerCase() });
  });
}

/* ---------- auth UI ---------- */
$('toggle-mode').onclick = () => {
  mode = mode === 'login' ? 'signup' : 'login';
  $('signup-only').classList.toggle('hidden', mode === 'login');
  $('auth-btn').textContent = mode === 'login' ? 'লগইন' : 'অ্যাকাউন্ট খুলুন';
  $('auth-sub').textContent = mode === 'login' ? 'আপনার অ্যাকাউন্টে লগইন করুন' : 'নতুন অ্যাকাউন্ট খুলুন';
  $('toggle-mode').textContent = mode === 'login' ? 'নতুন অ্যাকাউন্ট খুলুন' : 'আগে থেকে অ্যাকাউন্ট আছে? লগইন';
  $('auth-err').textContent = '';
};
$('auth-form').onsubmit = async e => {
  e.preventDefault(); $('auth-err').textContent = '';
  const email = $('a-email').value.trim(), pass = $('a-pass').value;
  try {
    if (mode === 'login') await signInWithEmailAndPassword(auth, email, pass);
    else {
      const name = $('a-name').value.trim(), user = $('a-user').value.trim();
      if (!name || !user) throw new Error('নাম এবং ইউজারনেম দিন');
      pending = { name, user };
      await createUserWithEmailAndPassword(auth, email, pass);
    }
  } catch (err) { pending = null; $('auth-err').textContent = errMsg(err); }
};
$('google-btn').onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (err) { $('auth-err').textContent = errMsg(err); } };
$('forgot').onclick = async () => {
  const email = $('a-email').value.trim();
  if (!email) { $('auth-err').textContent = 'আগে ইমেইল ঘরে ইমেইল লিখুন'; return; }
  try { await sendPasswordResetEmail(auth, email); toast('পাসওয়ার্ড রিসেট লিংক ইমেইলে পাঠানো হয়েছে'); } catch (err) { $('auth-err').textContent = errMsg(err); }
};
$('setup-form').onsubmit = async e => {
  e.preventDefault(); $('setup-err').textContent = '';
  try { await claim(me, $('s-user').value, $('s-name').value); profile = (await getDoc(doc(db, 'users', me))).data(); startApp(); }
  catch (err) { $('setup-err').textContent = err.message; }
};

onAuthStateChanged(auth, async u => {
  stopApp();
  if (!u) { me = null; profile = null; show('auth'); return; }
  me = u.uid;
  let snap = await getDoc(doc(db, 'users', me)), setupErr = '';
  if (!snap.exists() && pending) {
    try { await claim(me, pending.user, pending.name); snap = await getDoc(doc(db, 'users', me)); }
    catch (err) { setupErr = err.message; }
  }
  pending = null;
  if (!snap.exists()) { $('s-name').value = u.displayName || ''; $('setup-err').textContent = setupErr; show('setup'); return; }
  profile = snap.data(); startApp();
});

function stopApp() { unsubs.forEach(f => f()); unsubs = []; entries = []; notes = []; notesLoaded = false; }

function startApp() {
  show('app');
  $('hello').textContent = `${profile.name} • @${profile.username}`;
  $('f-date').value = today();
  stopApp();
  unsubs.push(onSnapshot(query(collection(db, 'entries'), where('participants', 'array-contains', me)),
    s => { entries = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, e => toast('ডেটা লোড হয়নি: ' + e.message)));
  unsubs.push(onSnapshot(query(collection(db, 'notifications'), where('toUid', '==', me)), s => {
    if (notesLoaded) s.docChanges().forEach(c => { if (c.type === 'added') toast('🔔 ' + c.doc.data().text); });
    notesLoaded = true;
    notes = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
    renderBell(); if (!$('modal').classList.contains('hidden') && $('modal-box').dataset.kind === 'notifs') showNotifs();
  }));
}

/* ---------- data helpers ---------- */
const V = e => {
  const mine = e.creatorUid === me;
  return { ...e, mine, dir: mine ? e.type : (e.type === 'lent' ? 'borrowed' : 'lent'),
    pname: mine ? e.otherName : e.creatorName, puser: mine ? e.otherUsername : e.creatorUsername,
    puid: mine ? e.otherUid : e.creatorUid, rem: Math.max(0, r2(e.amount - (e.paid || 0))) };
};
const notify = (toUid, entryId, kind, text) => toUid && addDoc(collection(db, 'notifications'), { toUid, fromUid: me, entryId, kind, text, read: false, createdAt: Date.now() });

/* ---------- render ---------- */
function render() {
  const all = entries.map(V);
  const acc = all.filter(v => v.status === 'accepted');
  let lent = 0, owed = 0; const lp = new Set(), op = new Set();
  acc.forEach(v => { if (!v.rem) return; if (v.dir === 'lent') { lent += v.rem; lp.add(v.puid || v.pname); } else { owed += v.rem; op.add(v.puid || v.pname); } });
  const net = r2(lent - owed);
  $('st-lent').textContent = money(lent); $('st-owed').textContent = money(owed);
  $('st-lent-n').textContent = lp.size ? `${lp.size} জনের কাছে পাবেন` : 'কোনো পাওনা বাকি নেই';
  $('st-owed-n').textContent = op.size ? `${op.size} জনকে দিতে হবে` : 'কোনো দেনা বাকি নেই';
  $('st-net').textContent = (net > 0 ? '+' : net < 0 ? '-' : '') + money(Math.abs(net));
  $('st-net').className = 'text-3xl font-extrabold mono mt-1 ' + (net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : '');
  const pend = all.filter(v => v.status === 'pending').length;
  $('st-pend').textContent = pend ? `⏳ ${pend}টি হিসাব অনুমোদনের অপেক্ষায়` : '';

  const tabs = [['all', 'সব'], ['lent', 'পাওনা'], ['borrowed', 'দেনা'], ['pending', `অপেক্ষমাণ${pend ? ' (' + pend + ')' : ''}`], ['settled', 'পরিশোধিত']];
  $('tabs').innerHTML = tabs.map(([k, l]) => `<button data-act="tab" data-v="${k}" class="tab ${filter === k ? 'on' : ''}">${l}</button>`).join('');

  const q = $('q').value.trim().toLowerCase().replace(/^@/, '');
  let list = all.filter(v => {
    if (filter === 'lent') return v.status === 'accepted' && v.dir === 'lent';
    if (filter === 'borrowed') return v.status === 'accepted' && v.dir === 'borrowed';
    if (filter === 'pending') return v.status !== 'accepted';
    if (filter === 'settled') return v.status === 'accepted' && !v.rem;
    return true;
  }).filter(v => !q || [v.pname, v.puser, v.note].some(x => (x || '').toLowerCase().includes(q)));
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $('list').innerHTML = list.length ? list.map(card).join('') :
    `<div class="glass-card rounded-3xl p-10 text-center text-sm text-slate-400">কোনো হিসাব পাওয়া যায়নি। বাম পাশের ফর্ম থেকে নতুন হিসাব যোগ করুন।</div>`;
  renderBell();
}

function card(v) {
  const lent = v.dir === 'lent', settled = v.status === 'accepted' && !v.rem;
  const pct = v.amount ? Math.min(100, Math.round((v.paid || 0) / v.amount * 100)) : 0;
  let st = '';
  if (v.status === 'pending') st = v.mine ? `<span class="tag amber">⏳ ${esc(v.pname)} এখনো accept করেননি</span>` : `<span class="tag amber">⏳ আপনার অনুমোদন দরকার</span>`;
  else if (v.status === 'rejected') st = `<span class="tag rose">✖ প্রত্যাখ্যাত</span>`;
  else if (settled) st = `<span class="tag slate">✓ পরিশোধিত</span>`;
  else if (v.puid) st = `<span class="tag green">✔ Accepted</span>`;
  const overdue = v.status === 'accepted' && v.rem && v.dueDate && v.dueDate < today() ? `<span class="tag amber">সময় পার হয়েছে</span>` : '';
  const actions = [
    v.status === 'pending' && !v.mine ? `<button data-act="accept" data-id="${v.id}" class="btn">✔ Accept</button><button data-act="reject" data-id="${v.id}" class="ghost text-rose-400">✖ Reject</button>` : '',
    v.status === 'accepted' && v.rem ? `<button data-act="pay" data-id="${v.id}" class="btn">💰 জমা / পরিশোধ</button>` : '',
    v.mine ? `<button data-act="del" data-id="${v.id}" class="ghost text-rose-400">🗑</button>` : ''
  ].join('');
  const log = (v.log || []).map(l => `<div>↳ ${money(l.amt)} • ${esc(l.date)} • ${esc(l.by)}${l.note ? ' — ' + esc(l.note) : ''}</div>`).join('');
  return `<div class="sub rounded-3xl p-4 space-y-3 ${settled ? 'opacity-70' : ''}">
    <div class="flex flex-wrap justify-between gap-2">
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-extrabold">${esc(v.pname)}</span>
          ${v.puser ? `<span class="text-xs text-slate-400">@${esc(v.puser)}</span>` : '<span class="tag slate">ব্যক্তিগত</span>'}
          <span class="tag ${lent ? 'green' : 'rose'}">${lent ? 'পাবো' : 'দিবো'}</span>${st}${overdue}
        </div>
        <div class="text-sm">${v.note ? esc(v.note) : '<i class="text-slate-400">কোনো নোট নেই</i>'}</div>
        <div class="text-[11px] text-slate-400">📅 ${esc(v.date)}${v.dueDate ? ' • ফেরত: ' + esc(v.dueDate) : ''}</div>
      </div>
      <div class="flex gap-2 items-start flex-wrap">${actions}</div>
    </div>
    <div>
      <div class="flex justify-between text-xs mb-1.5"><span>মোট: <b class="mono">${money(v.amount)}</b></span><span>পরিশোধ: <b class="mono text-sky-400">${money(v.paid || 0)}</b> (${pct}%)</span><span>বাকি: <b class="mono ${lent ? 'text-emerald-400' : 'text-rose-400'}">${money(v.rem)}</b></span></div>
      <div class="h-2 rounded-full bg-slate-500/20 overflow-hidden"><div class="h-full bg-gradient-to-r from-emerald-500 to-sky-400" style="width:${pct}%"></div></div>
      ${log ? `<div class="text-[11px] text-slate-400 mt-2 space-y-0.5">${log}</div>` : ''}
    </div></div>`;
}

function renderBell() {
  const n = notes.filter(x => !x.read).length;
  $('bell').textContent = n; $('bell').classList.toggle('hidden', !n);
}

/* ---------- add entry + user search ---------- */
$('f-person').oninput = (() => {
  let t; return () => { selected = null; $('sel-note').textContent = 'তালিকা থেকে ইউজার সিলেক্ট না করলে এটি শুধু আপনার ব্যক্তিগত হিসাব হবে।'; $('sel-note').className = 'text-[11px] mt-1.5 text-slate-400'; clearTimeout(t); t = setTimeout(searchUsers, 300); };
})();
async function searchUsers() {
  const q = $('f-person').value.trim().toLowerCase().replace(/^@/, ''), box = $('suggest');
  if (q.length < 2) { box.classList.add('hidden'); return; }
  const run = f => getDocs(query(collection(db, 'users'), where(f, '>=', q), where(f, '<=', q + '\uf8ff'), limit(5)));
  try {
    const [a, b] = await Promise.all([run('usernameLower'), run('nameLower')]);
    found = new Map(); [...a.docs, ...b.docs].forEach(d => { if (d.id !== me) found.set(d.id, d.data()); });
    box.innerHTML = found.size ? [...found.values()].map(u => `<button type="button" data-act="pick" data-uid="${u.uid}" class="w-full text-left px-3.5 py-2.5 text-sm hover:bg-emerald-500/10 flex justify-between"><b>${esc(u.name)}</b><span class="text-slate-400">@${esc(u.username)}</span></button>`).join('')
      : '<div class="px-3.5 py-2.5 text-xs text-slate-400">কোনো ইউজার পাওয়া যায়নি (ব্যক্তিগত হিসাব হিসেবে সেভ হবে)</div>';
    box.classList.remove('hidden');
  } catch (e) { toast('সার্চ করা যায়নি: ' + e.message); }
}
$('add-form').onsubmit = async e => {
  e.preventDefault();
  const amount = r2(parseFloat($('f-amount').value));
  const typed = $('f-person').value.trim();
  if (!typed || !(amount > 0)) return toast('সঠিক নাম ও টাকার পরিমাণ দিন');
  const o = selected;
  const data = { creatorUid: me, creatorName: profile.name, creatorUsername: profile.username,
    otherUid: o ? o.uid : null, otherName: o ? o.name : typed, otherUsername: o ? o.username : null,
    type: ftype, amount, paid: 0, note: $('f-note').value.trim(), date: $('f-date').value || today(), dueDate: $('f-due').value,
    status: o ? 'pending' : 'accepted', participants: o ? [me, o.uid] : [me], log: [], createdAt: Date.now() };
  $('f-submit').disabled = true;
  try {
    const ref = await addDoc(collection(db, 'entries'), data);
    if (o) await notify(o.uid, ref.id, 'request', ftype === 'lent'
      ? `${profile.name} (@${profile.username}) বলছেন তিনি আপনাকে ${money(amount)} ধার দিয়েছেন। Accept করুন।`
      : `${profile.name} (@${profile.username}) বলছেন তিনি আপনার কাছ থেকে ${money(amount)} ধার নিয়েছেন। Accept করুন।`);
    toast(o ? `${o.name}-এর কাছে অনুরোধ পাঠানো হয়েছে, accept করা পর্যন্ত Pending থাকবে` : 'ব্যক্তিগত হিসাব যোগ হয়েছে');
    e.target.reset(); $('f-date').value = today(); selected = null; $('suggest').classList.add('hidden');
  } catch (err) { toast('সমস্যা: ' + err.message); }
  $('f-submit').disabled = false;
};

/* ---------- actions ---------- */
async function respond(id, ok) {
  const e = entries.find(x => x.id === id); if (!e) return;
  await updateDoc(doc(db, 'entries', id), { status: ok ? 'accepted' : 'rejected' });
  await notify(e.creatorUid, id, ok ? 'accepted' : 'rejected', `${profile.name} (@${profile.username}) আপনার ${money(e.amount)} হিসাবটি ${ok ? 'accept করেছেন ✔' : 'প্রত্যাখ্যান করেছেন ✖'}`);
  toast(ok ? 'হিসাব accept করা হয়েছে' : 'হিসাব প্রত্যাখ্যান করা হয়েছে');
}
function showNotifs() {
  const rows = notes.length ? notes.map(n => {
    const e = entries.find(x => x.id === n.entryId);
    const act = n.kind === 'request' && e && e.status === 'pending' && e.creatorUid !== me
      ? `<div class="flex gap-2 mt-2"><button data-act="accept" data-id="${n.entryId}" class="btn">✔ Accept</button><button data-act="reject" data-id="${n.entryId}" class="ghost text-rose-400">✖ Reject</button></div>` : '';
    return `<div data-act="read" data-id="${n.id}" class="sub rounded-2xl p-3 text-sm cursor-pointer ${n.read ? 'opacity-60' : 'border-emerald-500/40'}">${n.read ? '' : '<span class="tag green mr-1">নতুন</span>'}${esc(n.text)}
      <div class="text-[10px] text-slate-400 mt-1">${new Date(n.createdAt).toLocaleString('bn-BD')}</div>${act}</div>`;
  }).join('') : '<p class="text-sm text-slate-400 text-center py-6">কোনো নোটিফিকেশন নেই</p>';
  openModal(`<div class="flex justify-between items-center mb-4"><h3 class="font-bold">🔔 নোটিফিকেশন</h3><div class="flex gap-2"><button data-act="readall" class="ghost">সব পড়া হয়েছে</button><button data-act="close" class="ghost">✕</button></div></div><div class="space-y-2.5">${rows}</div>`);
  $('modal-box').dataset.kind = 'notifs';
}
function showProfile() {
  openModal(`<div class="flex justify-between mb-4"><h3 class="font-bold">👤 প্রোফাইল</h3><button data-act="close" class="ghost">✕</button></div>
  <div class="space-y-3"><div><label class="text-xs text-slate-400">নাম</label><input id="p-name" class="inp mt-1" value="${esc(profile.name)}"></div>
  <div><label class="text-xs text-slate-400">ইউজারনেম (ইউনিক)</label><input id="p-user" class="inp mt-1" value="${esc(profile.username)}" autocapitalize="none"></div>
  <p id="p-err" class="text-xs text-rose-400 min-h-[1rem]"></p>
  <div class="flex justify-between"><button data-act="logout" class="ghost text-rose-400">লগআউট</button><button data-act="saveprofile" class="btn">সেভ করুন</button></div></div>`);
  $('modal-box').dataset.kind = 'profile';
}
function showPay(id) {
  const v = V(entries.find(x => x.id === id)); payId = id;
  openModal(`<div class="flex justify-between mb-3"><h3 class="font-bold">💰 জমা / পরিশোধ</h3><button data-act="close" class="ghost">✕</button></div>
  <p class="text-sm mb-3">${esc(v.pname)} • বাকি: <b class="mono">${money(v.rem)}</b></p>
  <div class="space-y-3"><input id="pay-amt" type="number" step="any" min="0.01" max="${v.rem}" class="inp mono font-bold" placeholder="কত টাকা?">
  <div class="flex gap-2"><button data-act="payfull" data-v="${v.rem}" class="ghost">সম্পূর্ণ বাকি</button><button data-act="payfull" data-v="${r2(v.rem / 2)}" class="ghost">৫০%</button></div>
  <input id="pay-note" class="inp" placeholder="নোট (ঐচ্ছিক) যেমন: বিকাশে দিয়েছে">
  <button data-act="dopay" class="btn w-full py-3">নিশ্চিত করুন</button></div>`);
  $('modal-box').dataset.kind = 'pay';
}

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) { if (!ev.target.closest('#suggest')) $('suggest').classList.add('hidden'); return; }
  const a = b.dataset.act, id = b.dataset.id;
  try {
    if (a === 'logout') { closeModal(); await signOut(auth); }
    else if (a === 'close') closeModal();
    else if (a === 'theme') { const t = document.documentElement.classList.contains('light') ? 'dark' : 'light'; localStorage.setItem('haulat_theme', t); applyTheme(t); }
    else if (a === 'tab') { filter = b.dataset.v; render(); }
    else if (a === 'ftype') {
      ftype = b.dataset.v;
      $('t-lent').className = 'tab ' + (ftype === 'lent' ? 'on' : ''); $('t-borrowed').className = 'tab ' + (ftype === 'borrowed' ? 'on' : '');
    }
    else if (a === 'pick') {
      selected = found.get(b.dataset.uid); $('f-person').value = selected.name; $('suggest').classList.add('hidden');
      $('sel-note').textContent = `✔ @${selected.username} সিলেক্ট হয়েছে — তিনি accept করার আগে এটি Pending থাকবে`; $('sel-note').className = 'text-[11px] mt-1.5 text-emerald-400';
    }
    else if (a === 'accept') { await respond(id, true); }
    else if (a === 'reject') { await respond(id, false); }
    else if (a === 'notifs') showNotifs();
    else if (a === 'read') await updateDoc(doc(db, 'notifications', id), { read: true });
    else if (a === 'readall') await Promise.all(notes.filter(n => !n.read).map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
    else if (a === 'profile') showProfile();
    else if (a === 'saveprofile') {
      try { await claim(me, $('p-user').value, $('p-name').value.trim() || profile.name); profile = (await getDoc(doc(db, 'users', me))).data();
        $('hello').textContent = `${profile.name} • @${profile.username}`; closeModal(); toast('প্রোফাইল আপডেট হয়েছে'); }
      catch (err) { $('p-err').textContent = err.message; }
    }
    else if (a === 'pay') showPay(id);
    else if (a === 'payfull') $('pay-amt').value = b.dataset.v;
    else if (a === 'dopay') {
      const e = entries.find(x => x.id === payId), v = V(e), amt = r2(parseFloat($('pay-amt').value));
      if (!(amt > 0)) return toast('সঠিক পরিমাণ দিন');
      const pay = Math.min(amt, v.rem);
      await updateDoc(doc(db, 'entries', payId), { paid: increment(pay), log: arrayUnion({ amt: pay, date: today(), note: $('pay-note').value.trim(), by: profile.name, uid: me }) });
      await notify(v.puid, payId, 'payment', `${profile.name} (@${profile.username}) ${money(pay)} পরিশোধ/জমা যুক্ত করেছেন। বাকি ${money(r2(v.rem - pay))}`);
      closeModal(); toast(pay >= v.rem ? 'সম্পূর্ণ পরিশোধ হয়েছে ✔' : `${money(pay)} যুক্ত হয়েছে, বাকি ${money(r2(v.rem - pay))}`);
    }
    else if (a === 'del') {
      const e = entries.find(x => x.id === id);
      if (!confirm('এই হিসাবটি স্থায়ীভাবে মুছে ফেলবেন?')) return;
      await deleteDoc(doc(db, 'entries', id));
      if (e.otherUid) await notify(e.otherUid, id, 'deleted', `${profile.name} (@${profile.username}) ${money(e.amount)} হিসাবটি মুছে দিয়েছেন`);
      toast('হিসাব মুছে ফেলা হয়েছে');
    }
  } catch (err) { toast('সমস্যা: ' + err.message); }
});
$('q').oninput = render;
