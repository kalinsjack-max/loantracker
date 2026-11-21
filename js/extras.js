/* Extra features: insights, reminders, PWA, statement, profile extras, account tools */
import { sendEmailVerification, deleteUser, getAuth, createUserWithEmailAndPassword, signOut as signOutSecondary } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { doc, deleteDoc, getDoc, setDoc, addDoc, updateDoc, collection, query, where, onSnapshot, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function initExtras(c) {
  const { auth, db, esc, money, getLang, toast, openModal, closeModal, signOut, get, av, people, notify } = c;
  const tx = (bn, en) => getLang() === 'bn' ? bn : en;
  const today = () => new Date().toISOString().slice(0, 10);
  const $ = id => document.getElementById(id);
  let msgReady = false, last = [], once = false, msgs = [], chatUid = null, subUid = null, unsub = null, repJson = '';
  const rd = n => Math.round(n * 100) / 100;
  const ago = ts => new Date(ts).toLocaleString(getLang() === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const foot = () => { const L = getLang() === 'bn' ? ['সহায়তা', 'প্রাইভেসি', 'শর্তাবলী'] : ['Help', 'Privacy', 'Terms']; document.querySelectorAll('footer .fl a').forEach((a, i) => { if (L[i]) a.textContent = L[i]; }); const cp = $('foot-copy'); if (cp) cp.textContent = getLang() === 'bn' ? '© ২০২৬ হাওলাত ট্র্যাকার। সর্বস্বত্ব সংরক্ষিত।' : '© 2026 Haulat Tracker. All rights reserved.'; };
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
    const recent = a.filter(v => v.puid).sort((x, y) => (y.date || '').localeCompare(x.date || '')).slice(0, 8).map(v => {
      const bor = v.dir === 'borrowed', od = bor && v.rem > 0 && v.dueDate && v.dueDate < today(), lt = bor && v.dueDate && (v.log || []).some(x => (x.k || 'repay') === 'repay' && x.status === 'confirmed' && x.ts > new Date(v.dueDate + 'T23:59:59').getTime());
      return { d: bor ? 'b' : 'l', a: v.amount, p: rd(v.paid || 0), s: v.rem ? (od ? 'o' : 'a') : 's', l: lt ? 1 : 0, t: v.date || '' }; });
    return { recent, bCount: b.length, bTotal: rd(tot), bPaid: rd(paid), bSettled: b.filter(v => !v.rem).length, bOverdue: od, bLate: late, lCount: l.length, lTotal: rd(l.reduce((s, v) => s + v.amount, 0)), lPaid: rd(l.reduce((s, v) => s + (v.paid || 0), 0)), partners: new Set(a.filter(v => v.puid).map(v => v.puid)).size };
  }
  let rt;
  function sync() {
    const me = get().me; if (!me) return;
    clearTimeout(rt); rt = setTimeout(() => { // wait a moment so entries are fully loaded
      const r = repCalc(), j = me + JSON.stringify(r);
      if (j !== repJson) { repJson = j; updateDoc(doc(db, 'users', me), { rep: { ...r, updatedAt: Date.now() } }).catch(e => console.warn('record sync failed', e)); }
    }, 1500);
    if (subUid !== me) { unsub && unsub(); unsubSt && unsubSt(); subUid = me; msgs = []; myStatus = 'active'; myReason = ''; isAdmin = false; { const c0 = $('adm-console'); c0 && c0.remove(); } watchMe(me);
      msgReady = false;
      unsub = onSnapshot(query(collection(db, 'messages'), where('participants', 'array-contains', me)), snap => {
        if (msgReady) snap.docChanges().forEach(c => { if (c.type === 'added') { const m = c.doc.data(); if (m.to === me && !m.read) incoming(m); } });
        msgReady = true; msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })); chatList(); drawInbox(); badge();
      }, () => {}); }
  }
  const onTime = r => r && r.bCount ? Math.round((r.bCount - r.bLate) / r.bCount * 100) : null;
  function rating(r) {
    if (!r) return { c: 'slate', t: tx('⏳ রেকর্ড এখনো তৈরি হয়নি', '⏳ Record not generated yet') };
    if (!r.bCount && !r.lCount) return { c: 'slate', t: tx('🆕 এখনো কোনো নিশ্চিত লেনদেন নেই', '🆕 No confirmed transactions yet') };
    if (!r.bCount) return { c: 'green', t: tx('🤝 শুধু ধার দিয়েছে, কখনো ধার নেয়নি', '🤝 Has only lent money, never borrowed') };
    const on = onTime(r);
    if (on < 50 || (r.bOverdue && on < 70)) return { c: 'rose', t: tx('⚠️ ঝুঁকিপূর্ণ – বকেয়া/দেরি আছে', '⚠️ Risky – overdue / late payments') };
    if (on >= 90) return { c: 'green', t: tx('✅ নির্ভরযোগ্য', '✅ Reliable') };
    return { c: 'sky', t: tx('🟡 মোটামুটি', '🟡 Average') };
  }
  const userDoc = async uid => people.get(uid) || (await getDoc(doc(db, 'users', uid))).data();
  async function viewProfile(uid) {
    const me = get().me; let p = null;
    try { const sn = await getDoc(doc(db, 'users', uid)); p = sn.exists() ? sn.data() : null; } catch { /* fall back to cache */ }
    p = p || people.get(uid);
    if (!p || (p.hidden && uid !== me)) return toast(tx('ইউজার পাওয়া যায়নি', 'User not found'), 'info');
    const r = uid === me ? repCalc() : (p.rep || null), g = rating(r), on = onTime(r), rp = r && r.bTotal ? Math.round(r.bPaid / r.bTotal * 100) : null, lp = r && r.lTotal ? Math.round((r.lPaid || 0) / r.lTotal * 100) : null;
    const cell = (v, l, cls = '') => `<div class="glass rounded-2xl p-2.5 text-center"><div class="font-extrabold mono ${cls}">${v}</div><div class="text-[10px] text-mut">${l}</div></div>`;
    const mine = uid === me ? [] : acc().filter(v => v.puid === uid), sum = (a, f) => rd(a.reduce((x, v) => x + f(v), 0));
    const gave = mine.filter(v => v.dir === 'lent'), took = mine.filter(v => v.dir === 'borrowed'), theyOwe = sum(gave, v => v.rem), youOwe = sum(took, v => v.rem);
    const hist = uid === me ? '' : `<div class="glass rounded-2xl p-3 mb-3"><div class="text-xs font-bold mb-2">🤝 ${tx('আপনার সাথে তার লেনদেন', 'Your history with them')}</div>${mine.length ? `<div class="grid grid-cols-3 gap-2">${cell(mine.length, tx('মোট হিসাব', 'Entries'))}${cell(money(sum(gave, v => v.amount)), tx('আপনি দিয়েছেন', 'You lent'), 'text-emerald-500')}${cell(money(sum(took, v => v.amount)), tx('আপনি নিয়েছেন', 'You borrowed'), 'text-rose-500')}</div><div class="text-[11px] text-mut mt-2">${tx('সে আপনাকে দেবে', 'They owe you')}: <b class="mono">${money(theyOwe)}</b> • ${tx('আপনি তাকে দেবেন', 'You owe them')}: <b class="mono">${money(youOwe)}</b></div>` : `<p class="text-xs text-mut">${tx('আপনাদের মধ্যে এখনো কোনো নিশ্চিত হিসাব নেই।', 'You have no confirmed entries with this person yet.')}</p>`}</div>`;
    const deals = r ? (r.bCount || 0) + (r.lCount || 0) : 0;
    openModal(`<div class="flex justify-between items-start mb-3"><h3 class="font-extrabold">👤 ${tx('প্রোফাইল', 'Profile')}</h3><button data-act="close" class="ghost sm" aria-label="close">✕</button></div>
    <div class="flex items-center gap-4 mb-3">${av(p.name, p.photo, 'xl')}<div class="min-w-0"><div class="text-lg font-extrabold">${esc(p.name)}</div><div class="text-xs text-mut">@${esc(p.username)}</div>${p.bio ? `<div class="text-sm mt-1">${esc(p.bio)}</div>` : ''}</div></div>
    <div class="flex flex-wrap gap-2 mb-4 text-[11px]"><span class="tag slate">📍 ${p.location ? esc(p.location) : tx('অবস্থান দেওয়া নেই', 'Location not set')}</span>${p.occupation ? `<span class="tag slate">💼 ${esc(p.occupation)}</span>` : ''}</div>
    ${stLabel(p.status) ? `<div class="mb-3"><span class="tag rose !text-xs">${stLabel(p.status)}</span>${p.statusReason ? ` <span class="text-[11px] text-mut">${esc(p.statusReason)}</span>` : ''}</div>` : ''}
    ${hist}
    <div class="glass rounded-2xl p-3 mb-3"><div class="text-xs font-bold mb-2">${tx('সবার সাথে তার পরিশোধের রেকর্ড', 'His/her record with everyone')}</div><span class="tag ${g.c} !text-xs">${g.t}</span>
      ${deals ? `<div class="text-[11px] text-mut mt-2">${tx('মোট নিশ্চিত লেনদেন', 'Total confirmed deals')}: <b>${deals}</b> • ${tx('মোট ' + r.partners + ' জনের সাথে', 'with ' + r.partners + ' people')}</div>` : ''}
      ${r && r.bCount ? `<div class="text-[11px] font-bold mt-3 mb-1.5">⬇️ ${tx('ধার নিয়েছে', 'As borrower')}</div><div class="grid grid-cols-4 gap-2">${cell(r.bCount, tx('বার', 'Loans'))}${cell(on + '%', tx('সময়মতো', 'On time'), on >= 90 ? 'text-emerald-500' : on < 60 ? 'text-rose-500' : '')}${cell(rp + '%', tx('পরিশোধ', 'Repaid'))}${cell(r.bOverdue, tx('এখন বকেয়া', 'Overdue now'), r.bOverdue ? 'text-rose-500' : '')}</div><div class="text-[11px] text-mut mt-1.5">${tx('মোট ধার', 'Borrowed')}: ${money(r.bTotal)} • ${tx('পরিশোধ', 'Repaid')}: ${money(r.bPaid)} • ${tx('নিষ্পন্ন', 'Settled')}: ${r.bSettled}/${r.bCount}</div>` : ''}
      ${r && r.lCount ? `<div class="text-[11px] font-bold mt-3 mb-1.5">⬆️ ${tx('ধার দিয়েছে', 'As lender')}</div><div class="grid grid-cols-3 gap-2">${cell(r.lCount, tx('বার', 'Loans'))}${cell(money(r.lTotal), tx('মোট দিয়েছে', 'Total lent'))}${cell((lp || 0) + '%', tx('ফেরত পেয়েছে', 'Recovered'))}</div>` : ''}
      ${r && r.recent && r.recent.length ? `<div class="text-[11px] font-bold mt-3 mb-1.5">🕘 ${tx('সাম্প্রতিক লেনদেন (নাম ছাড়া)', 'Recent deals (names hidden)')}</div><div class="space-y-1">${r.recent.map(x => `<div class="flex justify-between gap-2 text-[11px]"><span>${x.d === 'b' ? '⬇️ ' + tx('নিয়েছে', 'Borrowed') : '⬆️ ' + tx('দিয়েছে', 'Lent')} <b class="mono">${money(x.a)}</b> <span class="text-mut">${esc(x.t)}</span></span><span class="${x.s === 'o' || x.l ? 'text-rose-500' : x.s === 's' ? 'text-emerald-500' : 'text-mut'}">${x.s === 's' ? (x.l ? tx('✔ নিষ্পন্ন (দেরিতে)', '✔ Settled (late)') : tx('✔ নিষ্পন্ন', '✔ Settled')) : x.s === 'o' ? tx('⏰ বকেয়া', '⏰ Overdue') : tx('চলমান', 'Active') + ' ' + money(x.p) + '/' + money(x.a)}</span></div>`).join('')}</div>` : ''}
      ${r && !deals ? `<p class="text-[11px] text-mut mt-2">${tx('এই ইউজারের এখনো কোনো দুই-পক্ষ-নিশ্চিত লেনদেন নেই।', 'This user has no two-sided confirmed transactions yet.')}</p>` : ''}
      ${!r ? `<p class="text-[11px] text-mut mt-2">${tx('ইউজার অ্যাপের নতুন ভার্সনে একবার লগইন করলেই রেকর্ড দেখা যাবে।', 'The record appears once this user opens the updated app.')}</p>` : ''}
      <p class="text-[10px] text-mut mt-2">${tx('এই ইউজারের সব মানুষের সাথে দুই-পক্ষ-নিশ্চিত হিসাব থেকে তৈরি (শুধু আপনার সাথে নয়)। কারও নাম দেখানো হয় না; ব্যক্তিগত হিসাব ধরা হয় না।', 'Built from all of this user’s two-sided confirmed deals with everyone (not just you). Other people’s names are hidden; personal entries are not counted.')}</p></div>
    ${uid !== me ? `<div class="flex gap-2"><button data-act="chat" data-uid="${uid}" class="btn flex-1 py-3">💬 ${tx('মেসেজ পাঠান', 'Send message')}</button><button data-act="report" data-uid="${uid}" class="ghost red py-3">🚩 ${tx('রিপোর্ট', 'Report')}</button></div>` : ''}`, 'viewprofile');
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
    openModal(`<div class="flex justify-between items-center mb-3"><div class="flex items-center gap-3 min-w-0"><button data-act="inbox" class="ghost sm" aria-label="back">←</button>${av(p.name, p.photo, 'sm')}<div class="min-w-0"><div class="font-extrabold truncate">${esc(p.name || '')}</div><div class="text-[11px] text-mut">@${esc(p.username || '')}</div></div></div><button data-act="close" class="ghost sm" aria-label="close">✕</button></div>
    <div id="chat-list" class="space-y-2 overflow-y-auto" style="max-height:50vh;min-height:150px"></div>
    <div class="flex gap-2 mt-3"><input id="chat-in" class="inp" maxlength="500" placeholder="${tx('মেসেজ লিখুন…', 'Type a message…')}" autocomplete="off"><button data-act="chatsend" data-uid="${uid}" class="btn" aria-label="send">➤</button></div>`, 'chat');
    chatList(); setTimeout(() => $('chat-in') && $('chat-in').focus(), 60);
  }
  async function sendMsg(uid) {
    const inp = $('chat-in'), text = inp ? inp.value.trim() : ''; if (!text || !uid) return; const me = get().me; inp.value = '';
    try { await addDoc(collection(db, 'messages'), { participants: [me, uid], from: me, to: uid, text: text.slice(0, 500), ts: Date.now(), read: false }); }
    catch { inp.value = text; toast(tx('মেসেজ পাঠানো যায়নি', 'Could not send message'), 'info'); }
  }
  const baseTitle = document.title.replace(/^\(\d+\) /, '');
  function badge() {
    const me = get().me, n = msgs.filter(m => m.to === me && !m.read).length;
    document.querySelectorAll('.ibadge').forEach(el => { el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', !n); });
    document.title = (n ? `(${n}) ` : '') + baseTitle;
  }
  function inboxBtn() {
    if ($('inbox-btn')) return; const tb = $('fp-btn') || document.querySelector('header [data-act="tools"]'); if (!tb) return;
    const b = document.createElement('button'); b.id = 'inbox-btn'; b.dataset.act = 'inbox'; b.className = 'ghost relative'; b.setAttribute('aria-label', 'inbox'); b.title = tx('ইনবক্স', 'Inbox');
    b.innerHTML = '💬<span class="ibadge hidden absolute -top-1.5 -right-1.5 bg-sky-500 text-white text-[10px] rounded-full min-w-[1.1rem] h-[1.1rem] px-0.5 flex items-center justify-center font-bold shadow-lg">0</span>'; tb.before(b); badge();
  }
  async function incoming(m) {
    if ($('chat-list') && chatUid === m.from) return; const u = await userDoc(m.from) || {};
    toast('💬 ' + (u.name || '?') + ': ' + m.text.slice(0, 60), 'info');
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(u.name || 'Haulat Tracker', { body: m.text.slice(0, 100), icon: '/icons/icon-192.png' });
  }
  async function drawInbox() {
    const box = $('inbox-list'); if (!box) return; const me = get().me, m = new Map();
    msgs.forEach(x => { const o = x.participants.find(q => q !== me); if (!o) return; const c = m.get(o) || { last: x, un: 0 }; if (x.ts > c.last.ts) c.last = x; if (x.to === me && !x.read) c.un++; m.set(o, c); });
    const rows = [...m.entries()].sort((a, b) => b[1].last.ts - a[1].last.ts), us = await Promise.all(rows.map(([id]) => userDoc(id)));
    if (!$('inbox-list')) return;
    box.innerHTML = rows.length ? rows.map(([id, c], i) => { const u = us[i] || {}; return `<button data-act="chat" data-uid="${id}" class="ghost w-full !justify-start gap-3 py-3 text-left">${av(u.name, u.photo, 'sm')}<div class="min-w-0 flex-1"><div class="flex justify-between gap-2"><span class="${c.un ? 'font-extrabold' : 'font-semibold'} text-sm truncate">${esc(u.name || '?')}</span><span class="text-[10px] text-mut shrink-0">${ago(c.last.ts)}</span></div><div class="text-[12px] truncate ${c.un ? 'font-bold' : 'text-mut'}">${c.last.from === me ? tx('আপনি: ', 'You: ') : ''}${esc(c.last.text)}</div></div>${c.un ? `<span class="bg-sky-500 text-white text-[10px] rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center font-bold">${c.un}</span>` : ''}</button>`; }).join('')
      : `<p class="text-center text-sm text-mut py-10">📭 ${tx('ইনবক্স খালি। কেউ মেসেজ পাঠালে এখানে দেখা যাবে।', 'Your inbox is empty. Messages will appear here.')}</p>`;
  }
  function inbox() {
    chatUid = null;
    openModal(`<div class="flex justify-between items-center mb-3"><h3 class="font-extrabold">💬 ${tx('ইনবক্স', 'Inbox')}</h3><div class="flex gap-2"><button data-act="newmsg" class="btn sm">✏️ ${tx('নতুন মেসেজ', 'New message')}</button><button data-act="close" class="ghost sm" aria-label="close">✕</button></div></div><div id="inbox-list" class="space-y-2 overflow-y-auto" style="max-height:60vh"></div>`, 'inbox');
    drawInbox();
  }

  /* ---------- find people ---------- */
  let fpTm, fpAct = 'viewp';
  function findBtn() {
    if ($('fp-btn')) return; const tb = document.querySelector('header [data-act="tools"]'); if (!tb) return;
    const b = document.createElement('button'); b.id = 'fp-btn'; b.dataset.act = 'people'; b.className = 'ghost'; b.textContent = '🔎'; b.setAttribute('aria-label', 'find people'); b.title = tx('মানুষ খুঁজুন', 'Find people'); tb.before(b);
  }
  function findPeople(act = 'viewp') {
    fpAct = act;
    openModal(`<div class="flex justify-between items-center mb-3"><h3 class="font-extrabold">${act === 'chat' ? '✏️ ' + tx('নতুন মেসেজ', 'New message') : '🔎 ' + tx('মানুষ খুঁজুন', 'Find people')}</h3><button data-act="close" class="ghost sm" aria-label="close">✕</button></div><input id="fp-in" class="inp" autocomplete="off" autocapitalize="none" placeholder="${tx('নাম বা @ইউজারনেম লিখুন', 'Type a name or @username')}"><div id="fp-res" class="space-y-2 mt-3"></div><p class="text-[11px] text-mut mt-3">${tx('কারও উপর ট্যাপ করলে তার প্রোফাইল ও পরিশোধের রেকর্ড দেখা যাবে।', 'Tap a person to see their profile and repayment record.')}</p>`, 'findp');
    setTimeout(() => $('fp-in') && $('fp-in').focus(), 60);
  }
  async function fpSearch() {
    const el = $('fp-in'), box = $('fp-res'); if (!el || !box) return;
    const q = el.value.trim().toLowerCase().replace(/^@/, ''); if (!q) { box.innerHTML = ''; return; }
    const run = f => getDocs(query(collection(db, 'users'), where(f, '>=', q), where(f, '<=', q + '\uf8ff'), limit(8)));
    try {
      const [a, b] = await Promise.all([run('usernameLower'), run('nameLower')]), m = new Map(); [...a.docs, ...b.docs].forEach(d => !d.data().hidden && !['banned', 'deleted'].includes(d.data().status) && m.set(d.id, d.data()));
      box.innerHTML = m.size ? [...m.entries()].filter(([id]) => fpAct !== 'chat' || id !== get().me).map(([id, u]) => `<button data-act="${fpAct}" data-uid="${id}" class="ghost w-full !justify-start gap-3 py-2.5 text-left">${av(u.name, u.photo, 'sm')}<div class="min-w-0"><div class="font-bold text-sm truncate">${esc(u.name)}</div><div class="text-[11px] text-mut">@${esc(u.username)}${u.location ? ' · 📍 ' + esc(u.location) : ''}</div></div></button>`).join('') : `<p class="text-xs text-mut text-center py-4">${tx('কাউকে পাওয়া যায়নি', 'No one found')}</p>`;
    } catch { box.innerHTML = `<p class="text-xs text-rose-400 text-center py-4">${tx('খুঁজতে সমস্যা হয়েছে', 'Search failed')}</p>`; }
  }
  document.addEventListener('input', e => { if (e.target.id === 'fp-in') { clearTimeout(fpTm); fpTm = setTimeout(fpSearch, 280); } });


  /* ---------- status (flag / freeze / ban) + admin + reports ---------- */
  let isAdmin = false, myStatus = 'active', myReason = '', unsubSt = null;
  const stLabel = s => ({ flagged: tx('🚩 অ্যাডমিন ফ্ল্যাগ করেছে', '🚩 Flagged by admin'), frozen: tx('🧊 অ্যাকাউন্ট ফ্রিজড', '🧊 Account frozen'), banned: tx('🚫 ব্যান করা হয়েছে', '🚫 Banned'), deleted: tx('🗑 মুছে ফেলা হয়েছে', '🗑 Deleted') }[s] || '');
  const REASONS = { notpay: ['টাকা ফেরত দিচ্ছে না', 'Not repaying money'], fake: ['ভুয়া/মিথ্যা হিসাব', 'False records'], scam: ['প্রতারণা', 'Scam / fraud'], harass: ['হয়রানি / অশালীন আচরণ', 'Harassment / abuse'], other: ['অন্যান্য', 'Other'] };
  const rLabel = k => (REASONS[k] || REASONS.other)[getLang() === 'bn' ? 0 : 1];

  function watchMe(me) {
    unsubSt = onSnapshot(doc(db, 'users', me), sn => { const d = sn.data() || {}; myStatus = d.status || 'active'; myReason = d.statusReason || ''; enforce(); }, () => {});
    getDoc(doc(db, 'admins', me)).then(sn => { isAdmin = sn.exists(); if (isAdmin) { updateDoc(doc(db, 'users', me), { hidden: true }).catch(() => {}); adminPanel(); } }).catch(() => {});
  }
  function enforce() {
    const wall = $('ban-wall'); let bar = $('stat-bar'), css = $('frz-css');
    if (myStatus === 'banned' || myStatus === 'deleted') {
      if (!wall) { const d = document.createElement('div'); d.id = 'ban-wall'; d.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 text-center'; d.style.background = 'var(--bg,#060913)';
        d.innerHTML = `<div class="glass rounded-3xl p-8 max-w-sm space-y-3"><div class="text-5xl">🚫</div><h2 class="text-xl font-extrabold">${myStatus === 'deleted' ? tx('আপনার অ্যাকাউন্ট মুছে ফেলা হয়েছে', 'Your account has been deleted') : tx('আপনার অ্যাকাউন্ট ব্যান করা হয়েছে', 'Your account has been banned')}</h2>${myReason ? `<p class="text-sm text-mut">${esc(myReason)}</p>` : ''}<button data-act="logout" class="btn w-full">${tx('লগআউট', 'Log out')}</button></div>`; document.body.appendChild(d); }
      return;
    }
    wall && wall.remove();
    if (myStatus === 'frozen' && !css) { css = document.createElement('style'); css.id = 'frz-css'; css.textContent = '#add-form,[data-act="pay"],[data-act="top"],[data-act="edit"],[data-act="del"],[data-act="accept"],[data-act="reject"],[data-act="remind"]{display:none!important}'; document.head.appendChild(css); }
    if (myStatus !== 'frozen' && css) css.remove();
    if (myStatus === 'active') { bar && bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'stat-bar'; bar.className = 'glass rounded-2xl p-3 mb-4 text-xs'; const st = $('stats'); st && st.before(bar); }
    bar.innerHTML = `<b>${stLabel(myStatus)}</b>${myStatus === 'frozen' ? ' — ' + tx('আপনি এখন নতুন হিসাব, পরিশোধ বা মেসেজ করতে পারবেন না।', 'You cannot add entries, make payments or send messages for now.') : ''}${myReason ? `<div class="text-mut mt-1">${esc(myReason)}</div>` : ''}`;
  }
  function adminBtn() {
    return; // admins use the full-screen console instead
    if (!isAdmin || $('adm-btn')) return; const anchor = $('fp-btn') || document.querySelector('header [data-act="tools"]'); if (!anchor) return;
    const b = document.createElement('button'); b.id = 'adm-btn'; b.dataset.act = 'admin'; b.className = 'ghost'; b.textContent = '🛡️'; b.title = 'Admin'; b.setAttribute('aria-label', 'admin'); anchor.before(b);
  }
  function reportForm(uid) {
    userDoc(uid).then(p => openModal(`<div class="flex justify-between items-center mb-3"><h3 class="font-extrabold">🚩 ${tx('রিপোর্ট করুন', 'Report user')}</h3><button data-act="close" class="ghost sm" aria-label="close">✕</button></div>
      <p class="text-sm mb-3">${esc((p || {}).name || '')} <span class="text-mut text-xs">@${esc((p || {}).username || '')}</span></p>
      <label class="lb">${tx('কারণ', 'Reason')}</label><select id="rp-reason" class="inp mb-3">${Object.keys(REASONS).map(k => `<option value="${k}">${rLabel(k)}</option>`).join('')}</select>
      <label class="lb">${tx('বিস্তারিত', 'Details')} <span class="text-mut">(${tx('সর্বোচ্চ ৫০০ অক্ষর', 'max 500 chars')})</span></label><textarea id="rp-text" rows="4" maxlength="500" class="inp mb-3" placeholder="${tx('কী ঘটেছে লিখুন (তারিখ, পরিমাণ ইত্যাদি)', 'What happened? (dates, amounts, etc.)')}"></textarea>
      <p class="text-[11px] text-mut mb-3">${tx('মিথ্যা রিপোর্ট করলে আপনার অ্যাকাউন্টের ব্যবস্থা নেওয়া হতে পারে।', 'False reports may lead to action against your account.')}</p>
      <button data-act="reportsend" data-uid="${uid}" class="btn w-full py-3">${tx('রিপোর্ট পাঠান', 'Send report')}</button>`, 'report'));
  }
  async function reportSend(uid) {
    const g = get(), me = g.me, tp = await userDoc(uid) || {}, reason = $('rp-reason').value, details = $('rp-text').value.trim().slice(0, 500);
    try { await setDoc(doc(db, 'reports', `${me}_${uid}`), { reporterUid: me, reporterName: g.profile.name, reporterUsername: g.profile.username, targetUid: uid, targetName: tp.name || '', targetUsername: tp.username || '', reason, details, status: 'open', createdAt: Date.now() }); closeModal(); toast(tx('রিপোর্ট পাঠানো হয়েছে। অ্যাডমিন দেখবেন।', 'Report sent. An admin will review it.'), 'ok'); }
    catch { toast(tx('রিপোর্ট পাঠানো যায়নি (আগেই রিপোর্ট করে থাকতে পারেন)', 'Could not send report (you may have already reported this user)'), 'info'); }
  }

  const uBtns = (uid, rid) => `<button data-act="viewp" data-uid="${uid}" class="ghost sm">👤</button><button data-act="admentries" data-uid="${uid}" class="ghost sm">👁 ${tx('বিস্তারিত', 'Details')}</button><button data-act="admset" data-uid="${uid}" data-v="flagged" data-rid="${rid || ''}" class="ghost sm">🚩 ${tx('ফ্ল্যাগ', 'Flag')}</button><button data-act="admset" data-uid="${uid}" data-v="frozen" data-rid="${rid || ''}" class="ghost sm">🧊 ${tx('ফ্রিজ', 'Freeze')}</button><button data-act="admset" data-uid="${uid}" data-v="banned" data-rid="${rid || ''}" class="ghost sm red">🚫 ${tx('ব্যান', 'Ban')}</button><button data-act="admset" data-uid="${uid}" data-v="active" data-rid="${rid || ''}" class="ghost sm">✅ ${tx('সক্রিয়', 'Restore')}</button>${rid ? `<button data-act="admdismiss" data-rid="${rid}" class="ghost sm">✖ ${tx('খারিজ', 'Dismiss')}</button>` : ''}<button data-act="admdel" data-uid="${uid}" class="ghost sm red">🗑 ${tx('মুছুন', 'Delete')}</button>`;
  let admUsers = [], admFilter = 'all';
  const admCss = () => { if ($('adm-css')) return; const st = document.createElement('style'); st.id = 'adm-css'; st.textContent = '.atab{padding:.45rem .9rem;border-radius:999px;font-size:13px;font-weight:600;opacity:.75;border:1px solid rgba(148,163,184,.3);background:transparent;color:inherit;cursor:pointer}.atab.on{background:linear-gradient(90deg,#10b981,#0ea5e9);color:#fff;opacity:1;border-color:transparent}'; document.head.appendChild(st); };
  function adminPanel() {
    closeModal(); admCss();
    if (!$('adm-console')) {
      const o = document.createElement('div'); o.id = 'adm-console'; o.className = 'fixed inset-0 overflow-y-auto'; o.style.cssText = 'z-index:40;background:var(--bg,#060913)';
      const tabs = [['overview', '📊 ' + tx('ওভারভিউ', 'Overview')], ['open', '🚩 ' + tx('রিপোর্ট', 'Reports')], ['done', '✔ ' + tx('নিষ্পন্ন', 'Resolved')], ['users', '👥 ' + tx('ইউজার', 'Users')], ['entries', '📒 ' + tx('সব হিসাব', 'All entries')], ['add', '➕ ' + tx('ইউজার যোগ', 'Add user')]];
      o.innerHTML = `<div class="max-w-4xl mx-auto p-4 sm:p-6"><div class="glass rounded-3xl p-4 flex items-center justify-between gap-3 mb-4"><div class="flex items-center gap-3"><span class="text-3xl">🛡️</span><div><div class="font-extrabold">Admin Console</div><div class="text-[11px] text-mut">${esc(get().profile.name || 'admin')}</div></div></div><div class="flex gap-2"><button data-act="inbox" class="ghost sm relative">💬 ${tx('ইনবক্স', 'Inbox')}<span class="ibadge hidden absolute -top-1.5 -right-1.5 bg-sky-500 text-white text-[10px] rounded-full min-w-[1.1rem] h-[1.1rem] px-0.5 flex items-center justify-center font-bold">0</span></button><button data-act="logout" class="ghost sm">⎋ ${tx('লগআউট', 'Logout')}</button></div></div>
        <div class="flex flex-wrap gap-2 mb-4">${tabs.map(([v, l]) => `<button data-act="admtab" data-v="${v}" class="atab">${l}</button>`).join('')}</div><div id="adm-body" class="space-y-3"></div></div>`;
      document.body.appendChild(o);
    }
    admTab(window.__admView || 'overview');
  }
  async function loadUsers() { const sn = await getDocs(query(collection(db, 'users'), limit(500))); admUsers = sn.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => !u.hidden); }
  const userRow = u => `<div class="glass rounded-2xl p-3 text-sm space-y-2"><div class="flex items-center gap-2">${av(u.name, u.photo, 'sm')}<div class="min-w-0"><b>${esc(u.name || '?')}</b> <span class="text-mut text-xs">@${esc(u.username || '')}</span> ${u.status && u.status !== 'active' ? `<span class="tag rose">${stLabel(u.status)}</span>` : ''}${u.status && u.status !== 'active' && u.statusReason ? `<div class="text-[11px] text-mut">${esc(u.statusReason)}</div>` : ''}</div></div>${u.status === 'deleted' ? '' : `<div class="flex flex-wrap gap-1.5">${uBtns(u.id, '')}</div>`}</div>`;
  function drawUsers() {
    const box = $('adm-list'); if (!box) return; const q = (($('adm-q') || {}).value || '').trim().toLowerCase().replace(/^@/, '');
    const rows = admUsers.filter(u => (admFilter === 'all' || (u.status || 'active') === admFilter) && (!q || (u.nameLower || '').includes(q) || (u.usernameLower || '').includes(q))).slice(0, 60);
    box.innerHTML = rows.length ? rows.map(userRow).join('') : `<p class="text-xs text-mut text-center py-6">${tx('কাউকে পাওয়া যায়নি', 'No users found')}</p>`;
  }
  async function admTab(v) {
    window.__admView = v; document.querySelectorAll('[data-act="admtab"]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const box = $('adm-body'); if (!box) return; box.innerHTML = `<p class="text-xs text-mut text-center py-6">…</p>`;
    try {
      if (v === 'overview') {
        await loadUsers(); const rs = await getDocs(query(collection(db, 'reports'), where('status', '==', 'open'), limit(200))), c = k => admUsers.filter(u => (u.status || 'active') === k).length;
        const card = (n, l, cls = '') => `<div class="glass rounded-2xl p-4 text-center"><div class="text-2xl font-extrabold mono ${cls}">${n}</div><div class="text-[11px] text-mut">${l}</div></div>`;
        box.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${card(admUsers.length, tx('মোট ইউজার', 'Total users'))}${card(c('active'), tx('সক্রিয়', 'Active'), 'text-emerald-500')}${card(rs.size, tx('নতুন রিপোর্ট', 'Open reports'), rs.size ? 'text-rose-500' : '')}${card(c('flagged'), '🚩 ' + tx('ফ্ল্যাগড', 'Flagged'))}${card(c('frozen'), '🧊 ' + tx('ফ্রিজড', 'Frozen'))}${card(c('banned'), '🚫 ' + tx('ব্যান্ড', 'Banned'))}${card(c('deleted'), '🗑 ' + tx('মুছে ফেলা', 'Deleted'))}</div>`; return;
      }
      if (v === 'users') {
        await loadUsers(); const chips = ['all', 'flagged', 'frozen', 'banned', 'deleted'];
        box.innerHTML = `<input id="adm-q" class="inp" autocapitalize="none" placeholder="${tx('নাম বা @ইউজারনেম', 'Name or @username')}"><div class="flex flex-wrap gap-1.5">${chips.map(k => `<button data-act="admfilter" data-v="${k}" class="atab ${admFilter === k ? 'on' : ''}">${k === 'all' ? tx('সব', 'All') : stLabel(k) || k}</button>`).join('')}</div><div id="adm-list" class="space-y-2"></div>`; drawUsers(); return;
      }
      if (v === 'add') {
        box.innerHTML = `<div class="glass rounded-2xl p-4 space-y-3"><h3 class="font-extrabold">➕ ${tx('নতুন ইউজার তৈরি', 'Create a new user')}</h3>
          <div><label class="lb">${tx('নাম', 'Name')}</label><input id="au-name" class="inp" maxlength="40"></div>
          <div><label class="lb">${tx('ইউজারনেম', 'Username')}</label><input id="au-user" class="inp" autocapitalize="none" placeholder="a-z 0-9 _ ."></div>
          <div><label class="lb">Email</label><input id="au-email" type="email" class="inp" autocapitalize="none"></div>
          <div><label class="lb">${tx('পাসওয়ার্ড (কমপক্ষে ৬)', 'Password (min 6)')}</label><input id="au-pass" type="text" class="inp" autocomplete="off"></div>
          <button data-act="admadd" class="btn w-full py-3">${tx('ইউজার তৈরি করুন', 'Create user')}</button><p class="text-[11px] text-mut">${tx('ইউজার এই ইমেইল-পাসওয়ার্ড দিয়ে লগইন করতে পারবে। পাসওয়ার্ডটি তাকে জানিয়ে দিন।', 'The user can log in with this email and password. Share the password with them.')}</p></div>`; return;
      }
      if (v === 'entries') {
        const es = await getDocs(query(collection(db, 'entries'), limit(100))), list = es.docs.map(d => [d.id, d.data()]).sort((x, y) => (y[1].date || '').localeCompare(x[1].date || ''));
        box.innerHTML = `<p class="text-[11px] text-mut">${tx('সর্বশেষ ১০০টি হিসাব', 'Latest 100 entries')}</p>` + (list.map(([id, e]) => eRow(id, e, '')).join('') || `<p class="text-xs text-mut text-center py-6">${tx('কোনো হিসাব নেই', 'No entries')}</p>`); return;
      }
      const sn = await getDocs(query(collection(db, 'reports'), where('status', 'in', v === 'open' ? ['open'] : ['resolved', 'dismissed']), limit(50)));
      const rows = sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
      box.innerHTML = rows.length ? rows.map(r => `<div class="glass rounded-2xl p-3 text-sm space-y-2"><div class="flex justify-between gap-2 flex-wrap"><div><b>${esc(r.targetName)}</b> <span class="text-mut text-xs">@${esc(r.targetUsername)}</span></div><span class="text-[10px] text-mut">${ago(r.createdAt)}</span></div>
        <div class="text-[11px] text-mut">${tx('রিপোর্টকারী', 'Reported by')}: ${esc(r.reporterName)} (@${esc(r.reporterUsername)})</div><span class="tag rose">${rLabel(r.reason)}</span>${r.details ? `<p class="text-xs">${esc(r.details)}</p>` : ''}
        ${r.status !== 'open' ? `<div class="text-[11px] text-mut">${r.status === 'dismissed' ? tx('খারিজ করা হয়েছে', 'Dismissed') : tx('ব্যবস্থা', 'Action') + ': ' + esc(r.action || '')}</div>` : ''}<div class="flex flex-wrap gap-1.5">${uBtns(r.targetUid, r.status === 'open' ? r.id : '')}</div></div>`).join('') : `<p class="text-xs text-mut text-center py-6">${tx('কোনো রিপোর্ট নেই', 'No reports')}</p>`;
    } catch (e) { box.innerHTML = `<p class="text-xs text-rose-400 text-center py-6">${esc(e.message)}</p>`; }
  }
  async function admSet(uid, status, rid) {
    const me = get().me, reason = status === 'active' ? '' : prompt(tx('কারণ লিখুন (ইউজার দেখতে পারবে)', 'Reason (the user will see this)'), ''); if (reason === null) return;
    await updateDoc(doc(db, 'users', uid), { status, statusReason: reason, statusAt: Date.now(), statusBy: me });
    if (rid) await updateDoc(doc(db, 'reports', rid), { status: 'resolved', action: status, resolvedBy: me, resolvedAt: Date.now() });
    notify(uid, '', 'message', { preview: status === 'active' ? tx('✅ আপনার অ্যাকাউন্ট আবার সক্রিয় করা হয়েছে', '✅ Your account has been restored') : stLabel(status) + (reason ? ': ' + reason : '') }).catch(() => {});
    toast(tx('আপডেট হয়েছে', 'Updated'), 'ok'); admTab(window.__admView || 'overview');
  }
  async function admDelete(uid) {
    const me = get().me; if (uid === me) return;
    if (prompt(tx('ইউজারকে মুছে ফেলতে DELETE লিখুন', 'Type DELETE to remove this user'), '') !== 'DELETE') return;
    const u = (await getDoc(doc(db, 'users', uid))).data() || {};
    if (u.usernameLower) await deleteDoc(doc(db, 'usernames', u.usernameLower)).catch(() => {});
    await deleteDoc(doc(db, 'private', uid)).catch(() => {});
    await updateDoc(doc(db, 'users', uid), { status: 'deleted', statusReason: tx('অ্যাডমিন অ্যাকাউন্ট মুছে ফেলেছে', 'Removed by admin'), statusAt: Date.now(), statusBy: me, name: 'Deleted user', nameLower: 'deleted user', username: 'deleted', usernameLower: 'deleted_' + uid.slice(0, 6), photo: '', bio: '', location: '', occupation: '', rep: null });
    toast(tx('ইউজার মুছে ফেলা হয়েছে', 'User deleted'), 'ok'); admTab(window.__admView || 'overview');
  }
  async function admAdd() {
    const name = $('au-name').value.trim(), un = $('au-user').value.trim().toLowerCase().replace(/^@/, ''), email = $('au-email').value.trim(), pw = $('au-pass').value;
    if (!name || !email || pw.length < 6 || !/^[a-z0-9_.]{3,20}$/.test(un)) return toast(tx('নাম, ইউজারনেম (৩-২০, a-z 0-9 _ .), ইমেইল ও ৬+ অক্ষরের পাসওয়ার্ড দিন', 'Enter name, username (3-20, a-z 0-9 _ .), email and a 6+ character password'), 'info');
    if ((await getDoc(doc(db, 'usernames', un))).exists()) return toast(tx('ইউজারনেমটি আগেই নেওয়া', 'Username already taken'), 'info');
    const sec = initializeApp(firebaseConfig, 'sec' + Date.now()), sa = getAuth(sec);
    let uid; try { uid = (await createUserWithEmailAndPassword(sa, email, pw)).user.uid; } finally { signOutSecondary(sa).catch(() => {}); }
    await setDoc(doc(db, 'usernames', un), { uid }); await setDoc(doc(db, 'users', uid), { uid, username: un, usernameLower: un, name, nameLower: name.toLowerCase() });
    toast(tx('ইউজার তৈরি হয়েছে', 'User created'), 'ok'); ['au-name', 'au-user', 'au-email', 'au-pass'].forEach(i => { $(i).value = ''; });
  }
  async function admDismiss(rid) { await updateDoc(doc(db, 'reports', rid), { status: 'dismissed', resolvedBy: get().me, resolvedAt: Date.now() }); toast(tx('খারিজ করা হয়েছে', 'Dismissed'), 'ok'); admTab(window.__admView || 'open'); }
  const kv = (k, v) => v ? `<div class="flex justify-between gap-3 text-xs"><span class="text-mut shrink-0">${k}</span><span class="text-right break-all">${esc(String(v))}</span></div>` : '';
  const eRow = (id, e, ctx) => {
    const rem = Math.max(0, rd((e.amount || 0) - (e.paid || 0))), od = e.status === 'accepted' && rem > 0 && e.dueDate && e.dueDate < today(), shared = (e.participants || []).length === 2;
    const who = shared ? `${esc(e.creatorName || '?')} ${e.type === 'lent' ? '→' : '←'} ${esc(e.otherName || '?')}` : `${esc(e.creatorName || '?')} (${tx('ব্যক্তিগত', 'personal')})`;
    return `<div class="glass rounded-2xl p-3 text-xs space-y-1.5"><div class="flex justify-between gap-2"><div class="min-w-0"><b>${who}</b><div class="text-mut">${e.type === 'lent' ? tx('ধার দিয়েছে', 'Lent') : tx('ধার নিয়েছে', 'Borrowed')} · ${esc(e.date || '')}${e.dueDate ? ' → ' + esc(e.dueDate) : ''} · ${esc(e.status || '')}</div>${e.note ? `<div class="text-mut">📝 ${esc(e.note)}</div>` : ''}</div><div class="text-right mono shrink-0"><div>${money(e.amount)}</div><div class="${od ? 'text-rose-500' : 'text-mut'}">${tx('বাকি', 'Due')} ${money(rem)}${od ? ' ⏰' : ''}</div></div></div><div class="flex gap-1.5"><button data-act="admeditE" data-id="${id}" data-uid="${ctx || ''}" class="ghost sm">✏️ ${tx('এডিট', 'Edit')}</button><button data-act="admdelE" data-id="${id}" data-uid="${ctx || ''}" class="ghost sm red">🗑 ${tx('মুছুন', 'Delete')}</button></div></div>`;
  };
  async function admUser(uid) {
    const [us, ps, a, b] = await Promise.all([getDoc(doc(db, 'users', uid)), getDoc(doc(db, 'private', uid)), getDocs(query(collection(db, 'entries'), where('creatorUid', '==', uid))), getDocs(query(collection(db, 'entries'), where('otherUid', '==', uid)))]);
    const p = us.data() || {}, pr = ps.exists() ? ps.data() : {}, r = p.rep || {}, m = new Map(); [...a.docs, ...b.docs].forEach(d => m.set(d.id, d.data()));
    const rows = [...m.entries()].sort((x, y) => (y[1].date || '').localeCompare(x[1].date || '')).map(([id, e]) => eRow(id, e, uid)).join('');
    openModal(`<div class="flex justify-between items-center mb-3"><button data-act="admin" class="ghost sm">← Admin</button><button data-act="close" class="ghost sm" aria-label="close">✕</button></div>
      <div class="flex items-center gap-3 mb-3">${av(p.name, p.photo, 'xl')}<div class="min-w-0"><div class="text-lg font-extrabold">${esc(p.name || '')}</div><div class="text-xs text-mut">@${esc(p.username || '')}</div>${stLabel(p.status) ? `<span class="tag rose">${stLabel(p.status)}</span>` : ''}</div></div>
      <div class="glass rounded-2xl p-3 mb-3 space-y-1.5">${kv('UID', uid)}${kv(tx('বায়ো', 'Bio'), p.bio)}${kv(tx('অবস্থান', 'Location'), p.location)}${kv(tx('পেশা', 'Occupation'), p.occupation)}${kv(tx('ফোন', 'Phone'), pr.phone)}${kv(tx('ঠিকানা', 'Address'), pr.address)}${kv(tx('জন্ম তারিখ', 'Birthday'), pr.dob)}${kv(tx('স্ট্যাটাসের কারণ', 'Status reason'), p.statusReason)}</div>
      <div class="glass rounded-2xl p-3 mb-3 text-xs">${tx('ধার নিয়েছে', 'Borrowed')}: <b>${r.bCount || 0}</b> (${money(r.bTotal || 0)}, ${tx('পরিশোধ', 'paid')} ${money(r.bPaid || 0)}) · ${tx('ধার দিয়েছে', 'Lent')}: <b>${r.lCount || 0}</b> (${money(r.lTotal || 0)}) · ${tx('বকেয়া', 'Overdue')}: <b>${r.bOverdue || 0}</b></div>
      <div class="flex flex-wrap gap-1.5 mb-4">${uBtns(uid, '')}<button data-act="chat" data-uid="${uid}" class="ghost sm">💬 ${tx('মেসেজ', 'Message')}</button><button data-act="admmsgs" data-uid="${uid}" class="ghost sm">📨 ${tx('তার মেসেজ', 'His messages')}</button><button data-act="admedit" data-uid="${uid}" class="ghost sm">✏️ ${tx('প্রোফাইল এডিট', 'Edit profile')}</button></div>
      <div class="text-xs font-bold mb-2">📒 ${tx('সব হিসাব', 'All entries')} (${m.size})</div><div class="space-y-2">${rows || `<p class="text-xs text-mut text-center py-6">${tx('কোনো হিসাব নেই', 'No entries')}</p>`}</div>`, 'admin');
  }
  const afterE = ctx => ctx ? admUser(ctx) : admTab('entries');
  async function admEditEntry(id, ctx) {
    const ref = doc(db, 'entries', id), e = (await getDoc(ref)).data(); if (!e) return;
    const amount = prompt(tx('মোট পরিমাণ', 'Total amount'), e.amount); if (amount === null) return;
    const paid = prompt(tx('এ পর্যন্ত পরিশোধিত', 'Paid so far'), e.paid || 0); if (paid === null) return;
    const due = prompt(tx('মেয়াদ (YYYY-MM-DD)', 'Due date (YYYY-MM-DD)'), e.dueDate || ''); if (due === null) return;
    const note = prompt(tx('নোট', 'Note'), e.note || ''); if (note === null) return;
    const A = Number(amount), P = Number(paid); if (!(A > 0) || P < 0 || P > A) return toast(tx('পরিমাণ সঠিক নয়', 'Invalid amounts'), 'info');
    await updateDoc(ref, { amount: A, paid: P, dueDate: due, note }); toast(tx('আপডেট হয়েছে', 'Updated'), 'ok'); afterE(ctx);
  }
  async function admDelEntry(id, ctx) { if (!confirm(tx('এই হিসাবটি স্থায়ীভাবে মুছে ফেলবেন?', 'Permanently delete this entry?'))) return; await deleteDoc(doc(db, 'entries', id)); toast(tx('মুছে ফেলা হয়েছে', 'Deleted'), 'ok'); afterE(ctx); }
  async function admMsgs(uid) {
    const sn = await getDocs(query(collection(db, 'messages'), where('participants', 'array-contains', uid))), ms = sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.ts - b.ts), names = {};
    await Promise.all([...new Set(ms.flatMap(x => x.participants))].map(async i => { const u = await userDoc(i); names[i] = (u && u.name) || i; }));
    openModal(`<div class="flex justify-between items-center mb-3"><button data-act="admentries" data-uid="${uid}" class="ghost sm">←</button><h3 class="font-extrabold">📨 ${tx('মেসেজ', 'Messages')} (${ms.length})</h3><button data-act="close" class="ghost sm" aria-label="close">✕</button></div><div class="space-y-2 overflow-y-auto" style="max-height:60vh">${ms.map(x => `<div class="glass rounded-2xl p-2.5 text-xs flex justify-between gap-2"><div class="min-w-0"><b>${esc(names[x.from])} → ${esc(names[x.to])}</b> <span class="text-mut">${ago(x.ts)}</span><div class="break-words">${esc(x.text)}</div></div><button data-act="admdelM" data-id="${x.id}" data-uid="${uid}" class="ghost sm red">🗑</button></div>`).join('') || `<p class="text-xs text-mut text-center py-6">${tx('কোনো মেসেজ নেই', 'No messages')}</p>`}</div>`, 'admin');
  }
  async function admDelMsg(id, uid) { await deleteDoc(doc(db, 'messages', id)); admMsgs(uid); }
  async function admEditUser(uid) {
    const p = (await getDoc(doc(db, 'users', uid))).data() || {}, pr = (await getDoc(doc(db, 'private', uid))).data() || {}, ask = (l, v) => prompt(l, v || '');
    const name = ask(tx('নাম', 'Name'), p.name); if (name === null || !name.trim()) return; const bio = ask('Bio', p.bio); if (bio === null) return;
    const location = ask(tx('অবস্থান', 'Location'), p.location); if (location === null) return; const occupation = ask(tx('পেশা', 'Occupation'), p.occupation); if (occupation === null) return;
    const phone = ask(tx('ফোন', 'Phone'), pr.phone); if (phone === null) return; const address = ask(tx('ঠিকানা', 'Address'), pr.address); if (address === null) return;
    await updateDoc(doc(db, 'users', uid), { name: name.trim(), nameLower: name.trim().toLowerCase(), bio, location, occupation }); await setDoc(doc(db, 'private', uid), { phone, address }, { merge: true });
    toast(tx('আপডেট হয়েছে', 'Updated'), 'ok'); admUser(uid);
  }
  document.addEventListener('input', e => { if (e.target.id === 'adm-q') drawUsers(); });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, d = b.dataset;
    if (a === 'logout') { const w = $('ban-wall'), c1 = $('adm-console'); w && w.remove(); c1 && c1.remove(); isAdmin = false; return; }
    try {
      if (a === 'report') reportForm(d.uid); else if (a === 'reportsend') await reportSend(d.uid); else if (a === 'admin') adminPanel(); else if (a === 'admtab') await admTab(d.v);
      else if (a === 'admset') await admSet(d.uid, d.v, d.rid); else if (a === 'admdismiss') await admDismiss(d.rid); else if (a === 'admentries') await admUser(d.uid); else if (a === 'admdel') await admDelete(d.uid); else if (a === 'admadd') await admAdd(); else if (a === 'admeditE') await admEditEntry(d.id, d.uid); else if (a === 'admdelE') await admDelEntry(d.id, d.uid); else if (a === 'admmsgs') await admMsgs(d.uid); else if (a === 'admdelM') await admDelMsg(d.id, d.uid); else if (a === 'admedit') await admEditUser(d.uid); else if (a === 'newmsg') findPeople('chat'); else if (a === 'admfilter') { admFilter = d.v; document.querySelectorAll('[data-act="admfilter"]').forEach(x => x.classList.toggle('on', x.dataset.v === admFilter)); drawUsers(); }
    } catch (err) { toast(err.message || 'Error', 'err'); }
  });

  return {
    onRender(all) { last = all; insights(); banner(); sync(); findBtn(); inboxBtn(); adminBtn(); if (!once) { once = true; remind(); tour(); } },
    selBtn(u) { try { let b = $('sel-prof'); if (!u) { b && b.remove(); return; } if (!b) { b = document.createElement('button'); b.id = 'sel-prof'; b.type = 'button'; b.dataset.act = 'viewp'; b.className = 'ghost sm mt-1.5'; $('sel-note').after(b); } b.dataset.uid = u.uid; b.textContent = '👤 ' + tx('প্রোফাইল ও রেকর্ড দেখুন', 'View profile & record'); } catch {} },
    toolsHtml: () => `<button data-act="people" class="ghost w-full !justify-start py-3">🔎 ${tx('মানুষ খুঁজুন (প্রোফাইল)', 'Find people (profiles)')}</button><button data-act="inbox" class="ghost w-full !justify-start py-3">💬 ${tx('মেসেজ', 'Messages')}</button><button data-act="stmt" class="ghost w-full !justify-start py-3">🧾 ${tx('স্টেটমেন্ট (PDF/প্রিন্ট)', 'Statement (PDF / Print)')}</button><button data-act="json" class="ghost w-full !justify-start py-3">💾 ${tx('আমার ডেটা ডাউনলোড (JSON)', 'Download my data (JSON)')}</button><button data-act="notifperm" class="ghost w-full !justify-start py-3">🔔 ${tx('ব্রাউজার রিমাইন্ডার চালু করুন', 'Enable browser reminders')}</button><button data-act="tour" class="ghost w-full !justify-start py-3">❓ ${tx('গাইড দেখুন', 'Show guide')}</button>`,
    profileTop() {
      const u = auth.currentUser, s = stats(), p = get().profile, since = u.metadata.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString(getLang() === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', year: 'numeric' }) : '—';
      const cell = (v, l) => `<div class="glass rounded-2xl p-2.5 text-center"><div class="font-extrabold mono">${v}</div><div class="text-[10px] text-mut">${l}</div></div>`;
      return `<div class="flex flex-wrap gap-2 mb-3 text-[11px]"><span class="tag sky">@${esc(p.username)}</span><span class="tag ${u.emailVerified ? 'sky' : 'slate'}">${u.emailVerified ? '✓ ' + tx('ভেরিফাইড', 'Verified') : '✉ ' + tx('আনভেরিফাইড', 'Unverified')}</span><span class="tag slate">📅 ${tx('সদস্য: ', 'Member since ')}${since}</span>${p.location ? `<span class="tag slate">📍 ${esc(p.location)}</span>` : ''}${p.occupation ? `<span class="tag slate">💼 ${esc(p.occupation)}</span>` : ''}</div>
      <div class="grid grid-cols-4 gap-2 mb-4">${cell(s.n, tx('মোট', 'Entries'))}${cell(s.active, tx('চলমান', 'Active'))}${cell(s.settled, tx('নিষ্পন্ন', 'Settled'))}${cell(s.rate + '%', tx('পরিশোধ', 'Repaid'))}</div>`;
    },
    profileFields: (p, priv) => `<div class="grid grid-cols-2 gap-3"><div><label class="lb">${tx('অবস্থান', 'Location')}</label><input id="p-loc" class="inp" maxlength="60" value="${esc(p.location || '')}"></div><div><label class="lb">${tx('পেশা', 'Occupation')}</label><input id="p-job" class="inp" maxlength="60" value="${esc(p.occupation || '')}"></div></div><div><label class="lb">${tx('জন্ম তারিখ', 'Birthday')} <span class="text-mut">(${tx('ব্যক্তিগত', 'private')})</span></label><input id="p-dob" type="date" class="inp" value="${esc(priv.dob || '')}"></div>`,
    profileAccount: () => `<div class="sect"><h4 class="font-bold text-sm mb-3">⚙️ ${tx('অ্যাকাউন্ট', 'Account')}</h4><div class="space-y-2.5">${auth.currentUser.emailVerified ? '' : `<button data-act="verify" class="ghost w-full !justify-start">✉️ ${tx('ইমেইল ভেরিফাই করুন', 'Verify email')}</button>`}<button data-act="json" class="ghost w-full !justify-start">💾 ${tx('ডেটা ডাউনলোড', 'Download my data')}</button><button data-act="delacct" class="ghost red w-full !justify-start">🗑 ${tx('অ্যাকাউন্ট মুছুন', 'Delete account')}</button><p class="text-[10px] text-mut break-all">UID: <code>${auth.currentUser.uid}</code></p><p class="text-[11px] text-mut"><a href="/privacy.html" class="underline">Privacy</a> · <a href="/terms.html" class="underline">Terms</a> · <a href="/help.html" class="underline">Help</a></p></div></div>`,
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
