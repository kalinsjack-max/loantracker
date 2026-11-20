/* Extra features: insights, reminders, PWA, statement, profile extras, account tools */
import { sendEmailVerification, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, deleteDoc, getDoc, setDoc, addDoc, updateDoc, collection, query, where, onSnapshot, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function initExtras(c) {
  const { auth, db, esc, money, getLang, toast, openModal, closeModal, signOut, get, av, people, notify } = c;
  const tx = (bn, en) => getLang() === 'bn' ? bn : en;
  const today = () => new Date().toISOString().slice(0, 10);
  const $ = id => document.getElementById(id);
  let last = [], once = false, msgs = [], chatUid = null, subUid = null, unsub = null, repJson = '';
  const rd = n => Math.round(n * 100) / 100;
  const ago = ts => new Date(ts).toLocaleString(getLang() === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const foot = () => { const L = getLang() === 'bn' ? ['সহায়তা', 'প্রাইভেসি', 'শর্তাবলী'] : ['Help', 'Privacy', 'Terms']; document.querySelectorAll('footer a').forEach((a, i) => a.textContent = L[i] || a.textContent); };
  foot(); document.addEventListener('click', e => { if (e.target.closest('[data-act="lang"]')) setTimeout(foot, 0); });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'chat-in') { e.preventDefault(); sendMsg(chatUid); } });

  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

  const acc = () => last.filter(v => v.status === 'accepted');
  const overdue = () => acc().filter(v => v.rem > 0 && v.dueDate && v.dueDate < today());
  const soon = () => { const d = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10); return acc().filter(v => v.rem > 0 && v.dueDate && v.dueDate >= today() && v.dueDate <= d); };

  function insights() {
    const box = $('insights'); if (!box) return;
    const months = [], now = new Date(), key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ k: key(d), l: d.toLocaleString(getLang() === 'bn' ? 'bn-BD' : 'en', { month: 'short' }), a: 0, b: 0 }); }
    acc().forEach(v => { const m = months.find(x => x.k === (v.date || '').slice(0, 7)); if (m) m[v.dir === 'lent' ? 'a' : 'b'] += v.amount; });
    const mx = Math.max(1, ...months.map(m => Math.max(m.a, m.b))), short = n => n >= 1e5 ? (n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'k' : '' + n;
    const bars = months.map((m, i) => { const x = 20 + i * 96, h1 = m.a / mx * 90, h2 = m.b / mx * 90;
      return `<rect x="${x}" y="${115 - h1}" width="28" height="${h1}" rx="5" fill="#10b981"/><rect x="${x + 32}" y="${115 - h2}" width="28" height="${h2}" rx="5" fill="#f43f5e"/>${m.a ? `<text x="${x + 14}" y="${109 - h1}" font-size="11" text-anchor="middle" fill="#10b981">${short(m.a)}</text>` : ''}${m.b ? `<text x="${x + 46}" y="${109 - h2}" font-size="11" text-anchor="middle" fill="#f43f5e">${short(m.b)}</text>` : ''}<text x="${x + 30}" y="136" font-size="12" text-anchor="middle" fill="currentColor" opacity=".65">${m.l}</text>`; }).join('');
    const od = overdue(), sn = soon(), odSum = od.reduce((s, v) => s + v.rem, 0);
    box.innerHTML = `<div class="glass rounded-3xl p-5 md:col-span-2"><div class="text-xs font-bold mb-2">📊 ${tx('মাসিক লেনদেন (শেষ ৬ মাস)', 'Monthly activity (last 6 months)')} <span class="text-emerald-500">■ ${tx('দিয়েছি', 'Lent')}</span> <span class="text-rose-500">■ ${tx('নিয়েছি', 'Borrowed')}</span></div><svg viewBox="0 0 600 145" class="w-full" style="max-height:200px">${bars}</svg></div>
    <div class="glass rounded-3xl p-5"><div class="text-xs font-bold text-amber-500">⏰ ${tx('মেয়াদোত্তীর্ণ ও আসন্ন', 'Overdue & upcoming')}</div>
      <div class="text-2xl font-extrabold mono mt-2 ${od.length ? 'text-rose-500' : ''}">${money(odSum)}</div>
      <div class="text-xs text-mut mt-1">${od.length ? tx(od.length + 'টি বকেয়া', od.length + ' overdue') : tx('কোনো বকেয়া নেই ✓', 'Nothing overdue ✓')}</div>
      <div class="text-xs text-amber-500 mt-1">${sn.length ? tx('৩ দিনের মধ্যে ' + sn.length + 'টি', sn.length + ' due within 3 days') : ''}</div></div>`;
  }

  function remind() {
    const od = overdue(), sn = soon(); if (!od.length && !sn.length) return;
    const m = od.length ? tx(od.length + 'টি হিসাবের ফেরতের তারিখ পেরিয়ে গেছে', od.length + ' entries are overdue') : tx(sn.length + 'টি হিসাবের তারিখ ৩ দিনের মধ্যে', sn.length + ' entries due within 3 days');
    toast('⏰ ' + m, 'info');
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Haulat Tracker', { body: m, icon: '/icons/icon-192.png' });
  }

  function banner() {
    const u = auth.currentUser; let b = $('vbar');
    if (!u || u.emailVerified || !u.providerData.some(p => p.providerId === 'password')) { b && b.remove(); return; }
    if (b) return; b = document.createElement('div'); b.id = 'vbar';
    b.className = 'glass rounded-2xl p-3 mb-4 text-xs flex items-center justify-between gap-2 flex-wrap';
    b.innerHTML = `<span>✉️ ${tx('আপনার ইমেইল ভেরিফাই করা হয়নি', 'Your email is not verified yet')}</span><button data-act="verify" class="btn sm">${tx('ভেরিফিকেশন মেইল পাঠান', 'Send verification email')}</button>`;
    $('stats').before(b);
  }

  function tour() {
    if (localStorage.getItem('haulat_tour')) return; localStorage.setItem('haulat_tour', '1');
    openModal(`<div class="text-center space-y-3"><div class="text-4xl">👋</div><h3 class="text-lg font-extrabold">${tx('স্বাগতম!', 'Welcome!')}</h3>
      <ol class="text-sm text-left space-y-2 list-decimal pl-5"><li>${tx('বাঁ দিকের ফর্মে নতুন হিসাব যোগ করুন', 'Add a new entry using the form')}</li><li>${tx('নাম লিখে ইউজার সিলেক্ট করলে সে নোটিফিকেশন পাবে', 'Select a user to send them a request')}</li><li>${tx('🔔-এ অনুরোধ Accept/Reject করুন', 'Accept or reject requests from the 🔔 bell')}</li><li>${tx('🛠 টুলসে স্টেটমেন্ট, CSV ও রিমাইন্ডার পাবেন', 'Find statement, CSV and reminders in 🛠 Tools')}</li></ol>
      <button data-act="close" class="btn w-full">${tx('শুরু করি', 'Get started')}</button></div>`);
  }

  function statement() {
    const u = get().profile, rows = last.filter(v => v.status === 'accepted').map(v => `<tr><td>${esc(v.date)}</td><td>${esc(v.pname)}</td><td>${v.dir === 'lent' ? 'Lent' : 'Borrowed'}</td><td>${v.amount}</td><td>${v.paid || 0}</td><td>${v.rem}</td><td>${esc(v.dueDate || '')}</td></tr>`).join('');
    const w = open('', '_blank'); if (!w) return toast(tx('পপআপ ব্লক করা আছে', 'Popup blocked'), 'info');
    w.document.write(`<title>Statement</title><style>body{font:14px sans-serif;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;text-align:left}h2{margin:0}</style><h2>Haulat Tracker — Statement</h2><p>${esc(u.name)} (@${esc(u.username)}) · ${today()}</p><table><tr><th>Date</th><th>Person</th><th>Type</th><th>Amount</th><th>Paid</th><th>Remaining</th><th>Due</th></tr>${rows}</table><script>onload=()=>print()<\/script>`); w.document.close();
  }

  const stats = () => { const a = acc(), tot = a.reduce((s, v) => s + v.amount, 0), pd = a.reduce((s, v) => s + (v.paid || 0), 0);
    return { n: last.length, settled: a.filter(v => !v.rem).length, active: a.filter(v => v.rem > 0).length, rate: tot ? Math.round(pd / tot * 100) : 100, late: overdue().length }; };


  /* ---------- reputation (public repayment record) ---------- */
  function repCalc() {
    const a = acc(), b = a.filter(v => v.dir === 'borrowed' && v.puid), l = a.filter(v => v.dir === 'lent' && v.puid);
    let late = 0, od = 0, paid = 0, tot = 0;
    b.forEach(v => { tot += v.amount; paid += v.paid || 0;
      const o = v.rem > 0 && v.dueDate && v.dueDate < today(), lt = v.dueDate && (v.log || []).some(x => (x.k || 'repay') === 'repay' && x.status === 'confirmed' && x.ts > new Date(v.dueDate + 'T23:59:59').getTime());
      if (o) od++; if (o || lt) late++; });
    return { bCount: b.length, bTotal: rd(tot), bPaid: rd(paid), bSettled: b.filter(v => !v.rem).length, bOverdue: od, bLate: late, lCount: l.length, lTotal: rd(l.reduce((s, v) => s + v.amount, 0)), partners: new Set(a.filter(v => v.puid).map(v => v.puid)).size };
  }
  function sync() {
    const me = get().me; if (!me) return;
    const r = repCalc(), j = me + JSON.stringify(r);
    if (j !== repJson) { repJson = j; setDoc(doc(db, 'reputation', me), { ...r, updatedAt: Date.now() }).catch(() => {}); }
    if (subUid !== me) { unsub && unsub(); subUid = me; msgs = [];
      unsub = onSnapshot(query(collection(db, 'messages'), where('participants', 'array-contains', me)), snap => { msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })); chatList(); }, () => {}); }
  }
  const onTime = r => r && r.bCount ? Math.round((r.bCount - r.bLate) / r.bCount * 100) : null;
  function rating(r) {
    if (!r || !r.bCount) return { c: 'slate', t: tx('🆕 এখনো ধার নেননি', '🆕 No borrowing history yet') };
    const on = onTime(r);
    if (on < 50 || (r.bOverdue && on < 70)) return { c: 'rose', t: tx('⚠️ ঝুঁকিপূর্ণ – বকেয়া/দেরি আছে', '⚠️ Risky – overdue / late payments') };
    if (on >= 90) return { c: 'green', t: tx('✅ নির্ভরযোগ্য', '✅ Reliable') };
    return { c: 'sky', t: tx('🟡 মোটামুটি', '🟡 Average') };
  }
  const userDoc = async uid => people.get(uid) || (await getDoc(doc(db, 'users', uid))).data();
  async function viewProfile(uid) {
    const [p, rs] = await Promise.all([userDoc(uid), getDoc(doc(db, 'reputation', uid)).catch(() => null)]);
    if (!p) return toast(tx('ইউজার পাওয়া যায়নি', 'User not found'), 'info');
    const r = rs && rs.exists() ? rs.data() : null, g = rating(r), rp = r && r.bTotal ? Math.round(r.bPaid / r.bTotal * 100) : null, on = onTime(r), me = get().me;
    const cell = (v, l, cls = '') => `<div class="glass rounded-2xl p-2.5 text-center"><div class="font-extrabold mono ${cls}">${v}</div><div class="text-[10px] text-mut">${l}</div></div>`;
    openModal(`<div class="flex justify-between items-start mb-3"><h3 class="font-extrabold">👤 ${tx('প্রোফাইল', 'Profile')}</h3><button data-act="close" class="ghost sm" aria-label="close">✕</button></div>
    <div class="flex items-center gap-4 mb-3">${av(p.name, p.photo, 'xl')}<div class="min-w-0"><div class="text-lg font-extrabold">${esc(p.name)}</div><div class="text-xs text-mut">@${esc(p.username)}</div>${p.bio ? `<div class="text-sm mt-1">${esc(p.bio)}</div>` : ''}</div></div>
    <div class="flex flex-wrap gap-2 mb-4 text-[11px]">${p.location ? `<span class="tag slate">📍 ${esc(p.location)}</span>` : `<span class="tag slate">📍 ${tx('অবস্থান দেওয়া নেই', 'Location not set')}</span>`}${p.occupation ? `<span class="tag slate">💼 ${esc(p.occupation)}</span>` : ''}</div>
    <div class="glass rounded-2xl p-3 mb-3"><div class="text-xs font-bold mb-2">${tx('পরিশোধের রেকর্ড', 'Repayment record')}</div><span class="tag ${g.c} !text-xs">${g.t}</span>
      ${r && r.bCount ? `<div class="grid grid-cols-4 gap-2 mt-3">${cell(r.bCount, tx('ধার নিয়েছে', 'Borrowed'))}${cell(on + '%', tx('সময়মতো', 'On time'), on >= 90 ? 'text-emerald-500' : on < 60 ? 'text-rose-500' : '')}${cell(rp + '%', tx('পরিশোধ', 'Repaid'))}${cell(r.bOverdue, tx('এখন বকেয়া', 'Overdue now'), r.bOverdue ? 'text-rose-500' : '')}</div><div class="text-[11px] text-mut mt-2">${tx('মোট ধার', 'Total borrowed')}: ${money(r.bTotal)} • ${tx('পরিশোধ', 'Repaid')}: ${money(r.bPaid)} • ${tx('নিষ্পন্ন', 'Settled')}: ${r.bSettled}</div>` : ''}
      ${r && r.lCount ? `<div class="text-[11px] text-mut mt-1">${tx('ধার দিয়েছে', 'Has lent')}: ${r.lCount}${tx('টি', ' loans')} (${money(r.lTotal)})</div>` : ''}
      <p class="text-[10px] text-mut mt-2">${tx('শুধু দুই পক্ষ নিশ্চিত করেছে এমন হিসাব থেকে তৈরি। ব্যক্তিগত হিসাব ধরা হয় না।', 'Based only on entries confirmed by both sides. Personal entries are not counted.')}</p></div>
    ${uid !== me ? `<button data-act="chat" data-uid="${uid}" class="btn w-full py-3">💬 ${tx('মেসেজ পাঠান', 'Send message')}</button>` : ''}`, 'viewprofile');
  }

  /* ---------- messages ---------- */
  const thread = uid => msgs.filter(m => m.participants.includes(uid)).sort((a, b) => a.ts - b.ts);
  function chatList() {
    const el = $('chat-list'); if (!el || !chatUid) return; const me = get().me, th = thread(chatUid);
    el.innerHTML = th.length ? th.map(m => `<div class="flex ${m.from === me ? 'justify-end' : ''}"><div class="rounded-2xl px-3 py-2 text-sm max-w-[80%] break-words ${m.from === me ? 'bg-emerald-500/20' : 'bg-slate-500/15'}">${esc(m.text)}<div class="text-[10px] text-mut mt-0.5">${ago(m.ts)}</div></div></div>`).join('') : `<p class="text-xs text-mut text-center py-6">${tx('কোনো মেসেজ নেই। প্রথম মেসেজ পাঠান', 'No messages yet. Say hello!')}</p>`;
    el.scrollTop = el.scrollHeight;
    th.filter(m => m.to === me && !m.read).forEach(m => updateDoc(doc(db, 'messages', m.id), { read: true }).catch(() => {}));
  }
  async function openChat(uid) {
    chatUid = uid; const p = await userDoc(uid) || {};
    openModal(`<div class="flex justify-between items-center mb-3"><div class="flex items-center gap-3 min-w-0">${av(p.name, p.photo, 'sm')}<div class="min-w-0"><div class="font-extrabold truncate">${esc(p.name || '')}</div><div class="text-[11px] text-mut">@${esc(p.username || '')}</div></div></div><button data-act="close" class="ghost sm" aria-label="close">✕</button></div>
    <div id="chat-list" class="space-y-2 overflow-y-auto" style="max-height:50vh;min-height:150px"></div>
    <div class="flex gap-2 mt-3"><input id="chat-in" class="inp" maxlength="500" placeholder="${tx('মেসেজ লিখুন…', 'Type a message…')}" autocomplete="off"><button data-act="chatsend" data-uid="${uid}" class="btn" aria-label="send">➤</button></div>`, 'chat');
    chatList(); setTimeout(() => $('chat-in') && $('chat-in').focus(), 60);
  }
  async function sendMsg(uid) {
    const inp = $('chat-in'), text = inp ? inp.value.trim() : ''; if (!text || !uid) return; const me = get().me; inp.value = '';
    try { await addDoc(collection(db, 'messages'), { participants: [me, uid], from: me, to: uid, text: text.slice(0, 500), ts: Date.now(), read: false }); await notify(uid, '', 'message', { preview: text.slice(0, 60) }); }
    catch { inp.value = text; toast(tx('মেসেজ পাঠানো যায়নি', 'Could not send message'), 'info'); }
  }
  async function inbox() {
    const me = get().me, m = new Map();
    msgs.forEach(x => { const o = x.participants.find(q => q !== me); if (!o) return; const c = m.get(o) || { last: x, un: 0 }; if (x.ts > c.last.ts) c.last = x; if (x.to === me && !x.read) c.un++; m.set(o, c); });
    const ids = [...m.keys()].sort((a, b) => m.get(b).last.ts - m.get(a).last.ts), us = await Promise.all(ids.map(userDoc));
    const rows = ids.map((id, i) => { const c = m.get(id), u = us[i] || {}; return `<button data-act="chat" data-uid="${id}" class="ghost w-full !justify-start gap-3 py-2.5 text-left">${av(u.name, u.photo, 'sm')}<div class="min-w-0 flex-1"><div class="font-bold text-sm">${esc(u.name || '?')} ${c.un ? `<span class="tag rose">${c.un}</span>` : ''}</div><div class="text-[11px] text-mut truncate">${esc(c.last.text)}</div></div></button>`; }).join('');
    openModal(`<div class="flex justify-between items-center mb-3"><h3 class="font-extrabold">💬 ${tx('মেসেজ', 'Messages')}</h3><button data-act="close" class="ghost sm" aria-label="close">✕</button></div><div class="space-y-2">${rows || `<p class="text-xs text-mut text-center py-6">${tx('কোনো মেসেজ নেই। কারও প্রোফাইল থেকে মেসেজ পাঠান।', 'No messages yet. Open someone’s profile to message them.')}</p>`}</div>`, 'inbox');
  }


  /* ---------- find people ---------- */
  let fpTm;
  function findBtn() {
    if ($('fp-btn')) return; const tb = document.querySelector('header [data-act="tools"]'); if (!tb) return;
    const b = document.createElement('button'); b.id = 'fp-btn'; b.dataset.act = 'people'; b.className = 'ghost'; b.textContent = '🔎'; b.setAttribute('aria-label', 'find people'); b.title = tx('মানুষ খুঁজুন', 'Find people'); tb.before(b);
  }
  function findPeople() {
    openModal(`<div class="flex justify-between items-center mb-3"><h3 class="font-extrabold">🔎 ${tx('মানুষ খুঁজুন', 'Find people')}</h3><button data-act="close" class="ghost sm" aria-label="close">✕</button></div><input id="fp-in" class="inp" autocomplete="off" autocapitalize="none" placeholder="${tx('নাম বা @ইউজারনেম লিখুন', 'Type a name or @username')}"><div id="fp-res" class="space-y-2 mt-3"></div><p class="text-[11px] text-mut mt-3">${tx('কারও উপর ট্যাপ করলে তার প্রোফাইল ও পরিশোধের রেকর্ড দেখা যাবে।', 'Tap a person to see their profile and repayment record.')}</p>`, 'findp');
    setTimeout(() => $('fp-in') && $('fp-in').focus(), 60);
  }
  async function fpSearch() {
    const el = $('fp-in'), box = $('fp-res'); if (!el || !box) return;
    const q = el.value.trim().toLowerCase().replace(/^@/, ''); if (!q) { box.innerHTML = ''; return; }
    const run = f => getDocs(query(collection(db, 'users'), where(f, '>=', q), where(f, '<=', q + '\uf8ff'), limit(8)));
    try {
      const [a, b] = await Promise.all([run('usernameLower'), run('nameLower')]), m = new Map(); [...a.docs, ...b.docs].forEach(d => m.set(d.id, d.data()));
      box.innerHTML = m.size ? [...m.entries()].map(([id, u]) => `<button data-act="viewp" data-uid="${id}" class="ghost w-full !justify-start gap-3 py-2.5 text-left">${av(u.name, u.photo, 'sm')}<div class="min-w-0"><div class="font-bold text-sm truncate">${esc(u.name)}</div><div class="text-[11px] text-mut">@${esc(u.username)}${u.location ? ' · 📍 ' + esc(u.location) : ''}</div></div></button>`).join('') : `<p class="text-xs text-mut text-center py-4">${tx('কাউকে পাওয়া যায়নি', 'No one found')}</p>`;
    } catch { box.innerHTML = `<p class="text-xs text-rose-400 text-center py-4">${tx('খুঁজতে সমস্যা হয়েছে', 'Search failed')}</p>`; }
  }
  document.addEventListener('input', e => { if (e.target.id === 'fp-in') { clearTimeout(fpTm); fpTm = setTimeout(fpSearch, 280); } });

  return {
    onRender(all) { last = all; insights(); banner(); sync(); findBtn(); if (!once) { once = true; remind(); tour(); } },
    selBtn(u) { try { let b = $('sel-prof'); if (!u) { b && b.remove(); return; } if (!b) { b = document.createElement('button'); b.id = 'sel-prof'; b.type = 'button'; b.dataset.act = 'viewp'; b.className = 'ghost sm mt-1.5'; $('sel-note').after(b); } b.dataset.uid = u.uid; b.textContent = '👤 ' + tx('প্রোফাইল ও রেকর্ড দেখুন', 'View profile & record'); } catch {} },
    toolsHtml: () => `<button data-act="people" class="ghost w-full !justify-start py-3">🔎 ${tx('মানুষ খুঁজুন (প্রোফাইল)', 'Find people (profiles)')}</button><button data-act="inbox" class="ghost w-full !justify-start py-3">💬 ${tx('মেসেজ', 'Messages')}</button><button data-act="stmt" class="ghost w-full !justify-start py-3">🧾 ${tx('স্টেটমেন্ট (PDF/প্রিন্ট)', 'Statement (PDF / Print)')}</button><button data-act="json" class="ghost w-full !justify-start py-3">💾 ${tx('আমার ডেটা ডাউনলোড (JSON)', 'Download my data (JSON)')}</button><button data-act="notifperm" class="ghost w-full !justify-start py-3">🔔 ${tx('ব্রাউজার রিমাইন্ডার চালু করুন', 'Enable browser reminders')}</button><button data-act="tour" class="ghost w-full !justify-start py-3">❓ ${tx('গাইড দেখুন', 'Show guide')}</button>`,
    profileTop() {
      const u = auth.currentUser, s = stats(), p = get().profile, since = u.metadata.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString(getLang() === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', year: 'numeric' }) : '—';
      const cell = (v, l) => `<div class="glass rounded-2xl p-2.5 text-center"><div class="font-extrabold mono">${v}</div><div class="text-[10px] text-mut">${l}</div></div>`;
      return `<div class="flex flex-wrap gap-2 mb-3 text-[11px]"><span class="tag sky">@${esc(p.username)}</span><span class="tag ${u.emailVerified ? 'sky' : 'slate'}">${u.emailVerified ? '✓ ' + tx('ভেরিফাইড', 'Verified') : '✉ ' + tx('আনভেরিফাইড', 'Unverified')}</span><span class="tag slate">📅 ${tx('সদস্য: ', 'Member since ')}${since}</span>${p.location ? `<span class="tag slate">📍 ${esc(p.location)}</span>` : ''}${p.occupation ? `<span class="tag slate">💼 ${esc(p.occupation)}</span>` : ''}</div>
      <div class="grid grid-cols-4 gap-2 mb-4">${cell(s.n, tx('মোট', 'Entries'))}${cell(s.active, tx('চলমান', 'Active'))}${cell(s.settled, tx('নিষ্পন্ন', 'Settled'))}${cell(s.rate + '%', tx('পরিশোধ', 'Repaid'))}</div>`;
    },
    profileFields: (p, priv) => `<div class="grid grid-cols-2 gap-3"><div><label class="lb">${tx('অবস্থান', 'Location')}</label><input id="p-loc" class="inp" maxlength="60" value="${esc(p.location || '')}"></div><div><label class="lb">${tx('পেশা', 'Occupation')}</label><input id="p-job" class="inp" maxlength="60" value="${esc(p.occupation || '')}"></div></div><div><label class="lb">${tx('জন্ম তারিখ', 'Birthday')} <span class="text-mut">(${tx('ব্যক্তিগত', 'private')})</span></label><input id="p-dob" type="date" class="inp" value="${esc(priv.dob || '')}"></div>`,
    profileAccount: () => `<div class="sect"><h4 class="font-bold text-sm mb-3">⚙️ ${tx('অ্যাকাউন্ট', 'Account')}</h4><div class="space-y-2.5">${auth.currentUser.emailVerified ? '' : `<button data-act="verify" class="ghost w-full !justify-start">✉️ ${tx('ইমেইল ভেরিফাই করুন', 'Verify email')}</button>`}<button data-act="json" class="ghost w-full !justify-start">💾 ${tx('ডেটা ডাউনলোড', 'Download my data')}</button><button data-act="delacct" class="ghost red w-full !justify-start">🗑 ${tx('অ্যাকাউন্ট মুছুন', 'Delete account')}</button><p class="text-[11px] text-mut"><a href="/privacy.html" class="underline">Privacy</a> · <a href="/terms.html" class="underline">Terms</a> · <a href="/help.html" class="underline">Help</a></p></div></div>`,
    async act(a, ds = {}) {
      if (a === 'viewp') return viewProfile(ds.uid); if (a === 'chat') return openChat(ds.uid); if (a === 'chatsend') return sendMsg(ds.uid); if (a === 'inbox') return inbox(); if (a === 'people') return findPeople();
      const u = auth.currentUser, g = get();
      if (a === 'stmt') { closeModal(); statement(); }
      if (a === 'tour') { localStorage.removeItem('haulat_tour'); closeModal(); tour(); }
      if (a === 'notifperm') { const r = 'Notification' in window ? await Notification.requestPermission() : 'denied'; toast(r === 'granted' ? tx('রিমাইন্ডার চালু', 'Reminders enabled') : tx('অনুমতি পাওয়া যায়নি', 'Permission not granted'), r === 'granted' ? 'ok' : 'info'); }
      if (a === 'verify') { try { await sendEmailVerification(u); toast(tx('ভেরিফিকেশন মেইল পাঠানো হয়েছে', 'Verification email sent'), 'ok'); } catch { toast(tx('কিছুক্ষণ পরে চেষ্টা করুন', 'Try again later'), 'info'); } }
      if (a === 'json') { const b = new Blob([JSON.stringify({ profile: g.profile, private: g.priv, entries: g.entries }, null, 2)], { type: 'application/json' }), l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = `haulat-data-${today()}.json`; l.click(); URL.revokeObjectURL(l.href); }
      if (a === 'delacct') { if (prompt(tx('নিশ্চিত করতে DELETE লিখুন', 'Type DELETE to confirm')) !== 'DELETE') return;
        try { await deleteDoc(doc(db, 'reputation', u.uid)).catch(() => {}); await deleteDoc(doc(db, 'private', u.uid)); await deleteDoc(doc(db, 'users', u.uid)); await deleteUser(u); location.reload(); }
        catch { toast(tx('নিরাপত্তার জন্য আবার লগইন করে চেষ্টা করুন', 'Please log in again, then retry'), 'info'); } }
    }
  };
}
