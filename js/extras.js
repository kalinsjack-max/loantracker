/* Extra features: insights, reminders, PWA, statement, profile extras, account tools */
import { sendEmailVerification, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function initExtras(c) {
  const { auth, db, esc, money, getLang, toast, openModal, closeModal, signOut, get } = c;
  const tx = (bn, en) => getLang() === 'bn' ? bn : en;
  const today = () => new Date().toISOString().slice(0, 10);
  const $ = id => document.getElementById(id);
  let last = [], once = false;

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

  return {
    onRender(all) { last = all; insights(); banner(); if (!once) { once = true; remind(); tour(); } },
    toolsHtml: () => `<button data-act="stmt" class="ghost w-full !justify-start py-3">🧾 ${tx('স্টেটমেন্ট (PDF/প্রিন্ট)', 'Statement (PDF / Print)')}</button><button data-act="json" class="ghost w-full !justify-start py-3">💾 ${tx('আমার ডেটা ডাউনলোড (JSON)', 'Download my data (JSON)')}</button><button data-act="notifperm" class="ghost w-full !justify-start py-3">🔔 ${tx('ব্রাউজার রিমাইন্ডার চালু করুন', 'Enable browser reminders')}</button><button data-act="tour" class="ghost w-full !justify-start py-3">❓ ${tx('গাইড দেখুন', 'Show guide')}</button>`,
    profileTop() {
      const u = auth.currentUser, s = stats(), p = get().profile, since = u.metadata.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString(getLang() === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', year: 'numeric' }) : '—';
      const cell = (v, l) => `<div class="glass rounded-2xl p-2.5 text-center"><div class="font-extrabold mono">${v}</div><div class="text-[10px] text-mut">${l}</div></div>`;
      return `<div class="flex flex-wrap gap-2 mb-3 text-[11px]"><span class="tag sky">@${esc(p.username)}</span><span class="tag ${u.emailVerified ? 'sky' : 'slate'}">${u.emailVerified ? '✓ ' + tx('ভেরিফাইড', 'Verified') : '✉ ' + tx('আনভেরিফাইড', 'Unverified')}</span><span class="tag slate">📅 ${tx('সদস্য: ', 'Member since ')}${since}</span>${p.location ? `<span class="tag slate">📍 ${esc(p.location)}</span>` : ''}${p.occupation ? `<span class="tag slate">💼 ${esc(p.occupation)}</span>` : ''}</div>
      <div class="grid grid-cols-4 gap-2 mb-4">${cell(s.n, tx('মোট', 'Entries'))}${cell(s.active, tx('চলমান', 'Active'))}${cell(s.settled, tx('নিষ্পন্ন', 'Settled'))}${cell(s.rate + '%', tx('পরিশোধ', 'Repaid'))}</div>`;
    },
    profileFields: (p, priv) => `<div class="grid grid-cols-2 gap-3"><div><label class="lb">${tx('অবস্থান', 'Location')}</label><input id="p-loc" class="inp" maxlength="60" value="${esc(p.location || '')}"></div><div><label class="lb">${tx('পেশা', 'Occupation')}</label><input id="p-job" class="inp" maxlength="60" value="${esc(p.occupation || '')}"></div></div><div><label class="lb">${tx('জন্ম তারিখ', 'Birthday')} <span class="text-mut">(${tx('ব্যক্তিগত', 'private')})</span></label><input id="p-dob" type="date" class="inp" value="${esc(priv.dob || '')}"></div>`,
    profileAccount: () => `<div class="sect"><h4 class="font-bold text-sm mb-3">⚙️ ${tx('অ্যাকাউন্ট', 'Account')}</h4><div class="space-y-2.5">${auth.currentUser.emailVerified ? '' : `<button data-act="verify" class="ghost w-full !justify-start">✉️ ${tx('ইমেইল ভেরিফাই করুন', 'Verify email')}</button>`}<button data-act="json" class="ghost w-full !justify-start">💾 ${tx('ডেটা ডাউনলোড', 'Download my data')}</button><button data-act="delacct" class="ghost red w-full !justify-start">🗑 ${tx('অ্যাকাউন্ট মুছুন', 'Delete account')}</button><p class="text-[11px] text-mut"><a href="/privacy.html" class="underline">Privacy</a> · <a href="/terms.html" class="underline">Terms</a> · <a href="/help.html" class="underline">Help</a></p></div></div>`,
    async act(a) {
      const u = auth.currentUser, g = get();
      if (a === 'stmt') { closeModal(); statement(); }
      if (a === 'tour') { localStorage.removeItem('haulat_tour'); closeModal(); tour(); }
      if (a === 'notifperm') { const r = 'Notification' in window ? await Notification.requestPermission() : 'denied'; toast(r === 'granted' ? tx('রিমাইন্ডার চালু', 'Reminders enabled') : tx('অনুমতি পাওয়া যায়নি', 'Permission not granted'), r === 'granted' ? 'ok' : 'info'); }
      if (a === 'verify') { try { await sendEmailVerification(u); toast(tx('ভেরিফিকেশন মেইল পাঠানো হয়েছে', 'Verification email sent'), 'ok'); } catch { toast(tx('কিছুক্ষণ পরে চেষ্টা করুন', 'Try again later'), 'info'); } }
      if (a === 'json') { const b = new Blob([JSON.stringify({ profile: g.profile, private: g.priv, entries: g.entries }, null, 2)], { type: 'application/json' }), l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = `haulat-data-${today()}.json`; l.click(); URL.revokeObjectURL(l.href); }
      if (a === 'delacct') { if (prompt(tx('নিশ্চিত করতে DELETE লিখুন', 'Type DELETE to confirm')) !== 'DELETE') return;
        try { await deleteDoc(doc(db, 'private', u.uid)); await deleteDoc(doc(db, 'users', u.uid)); await deleteUser(u); location.reload(); }
        catch { toast(tx('নিরাপত্তার জন্য আবার লগইন করে চেষ্টা করুন', 'Please log in again, then retry'), 'info'); } }
    }
  };
}
