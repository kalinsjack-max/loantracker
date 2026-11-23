/**
 * Sends the real phone push (FCM) for a new notification or chat message - no Firebase Blaze plan needed.
 * The website / Android app call this right after they create the Firestore document.
 * Needs ONE Vercel environment variable:  FIREBASE_SERVICE_ACCOUNT  (the whole service-account JSON).
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const str = (v) => (v === undefined || v === null ? '' : String(v));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { idToken, kind, id } = body;
    if (!idToken || !id) return res.status(400).json({ error: 'missing fields' });
    const { uid } = await admin.auth().verifyIdToken(idToken); // only a logged-in user can trigger a push
    const db = admin.firestore();
    let toUid;
    let data;

    if (kind === 'chat') {
      const m = (await db.collection('messages').doc(id).get()).data();
      if (!m || m.from !== uid) return res.status(403).json({ error: 'not yours' });
      const u = (await db.collection('users').doc(uid).get()).data() || {};
      toUid = m.to;
      data = { notifId: 'msg_' + id, kind: 'chat', fromUid: uid, name: str(u.name), text: str(m.text).slice(0, 200) };
    } else {
      const n = (await db.collection('notifications').doc(id).get()).data();
      if (!n || n.fromUid !== uid) return res.status(403).json({ error: 'not yours' });
      const d = n.data || {};
      toUid = n.toUid;
      data = {
        notifId: id, kind: str(n.kind), entryId: str(n.entryId), fromUid: uid,
        name: str(d.name), username: str(d.username), amount: str(d.amount), type: str(d.type),
        dir: str(d.dir), rem: str(d.rem), tot: str(d.tot), payId: str(d.payId), preview: str(d.preview),
      };
    }

    const t = await db.collection('fcmTokens').where('uid', '==', toUid).get();
    if (t.empty) return res.status(200).json({ sent: 0 });
    const tokens = t.docs.map((d) => d.id);
    const r = await admin.messaging().sendEachForMulticast({ tokens, data, android: { priority: 'high' } });

    const dead = [];
    r.responses.forEach((x, i) => {
      const c = x.error && x.error.code;
      if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') dead.push(tokens[i]);
    });
    await Promise.all(dead.map((tk) => db.collection('fcmTokens').doc(tk).delete()));
    return res.status(200).json({ sent: r.successCount });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
