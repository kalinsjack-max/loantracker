# হাওলাত ট্র্যাকার (Firebase + GitHub + Vercel)

## ফোল্ডার স্ট্রাকচার
```
haulat-tracker/
├─ index.html            ← পুরো UI
├─ js/app.js             ← সব লজিক (login, username, entry, notification)
├─ js/firebase-config.js ← ⚠️ এখানে আপনার Firebase কনফিগ বসাবেন
├─ firestore.rules       ← Firestore Security Rules (Firebase Console-এ paste করবেন)
└─ README.md
```

## ধাপ ১: Firebase প্রজেক্ট
1. https://console.firebase.google.com → **Add project** → নাম দিন (যেমন `haulat-tracker`) → Create।
2. বাম মেনু **Build → Authentication → Get started → Sign-in method**:
   - **Email/Password** → Enable → Save
   - **Google** → Enable → support email দিন → Save
3. **Build → Firestore Database → Create database** → Location বেছে নিন (যেমন `asia-south1`) → **Production mode** → Enable।
4. Firestore-এর **Rules** ট্যাবে গিয়ে সব মুছে `firestore.rules` ফাইলের পুরো লেখা paste করুন → **Publish**।
5. **Project settings (⚙️) → General → Your apps → `</>` (Web)** → App nickname দিন → Register।
   যে `firebaseConfig` দেখাবে সেটার মান `js/firebase-config.js`-এ বসান।

## ধাপ ২: GitHub
```bash
cd haulat-tracker
git init
git add .
git commit -m "Haulat Tracker"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/haulat-tracker.git
git push -u origin main
```

## ধাপ ৩: Vercel
1. https://vercel.com → **Add New → Project** → GitHub রিপো Import করুন।
2. Framework Preset: **Other**। Build Command ও Output Directory ফাঁকা রাখুন। **Deploy**।
3. Deploy শেষে পাওয়া ডোমেইন (যেমন `haulat-tracker.vercel.app`) কপি করুন।

## ধাপ ৪: Firebase-এ ডোমেইন Authorize করুন (খুব জরুরি, নাহলে Google login কাজ করবে না)
Firebase Console → **Authentication → Settings → Authorized domains → Add domain** → আপনার `xxx.vercel.app` বসান।

## ধাপ ৫: টেস্ট
- দুটি আলাদা ব্রাউজার/ডিভাইসে দুটি অ্যাকাউন্ট খুলুন (`rafi`, `tanvir`)।
- rafi নতুন হিসাব যোগ করে "tanvir" লিখে সার্চ করে সিলেক্ট করুন → tanvir-এর 🔔-এ নোটিফিকেশন যাবে।
- accept করার আগে rafi-র কাছে ⏳ Pending দেখাবে; tanvir Accept করলে Pending চলে যাবে এবং মোট হিসাবে যোগ হবে।

## ফিচার তালিকা
- Email/Password + Google লগইন, পাসওয়ার্ড রিসেট
- ইউনিক ইউজারনেম (অ্যাকাউন্ট খোলার সময় বাধ্যতামূলক; নেওয়া থাকলে অন্যটি দিতে হয়), পরে প্রোফাইল থেকে বদলানো যায়
- নাম/ইউজারনেম দিয়ে ইউজার সার্চ করে সিলেক্ট; না সিলেক্ট করলে ব্যক্তিগত হিসাব
- রিয়েল-টাইম নোটিফিকেশন (🔔 + টোস্ট): নতুন অনুরোধ, accept/reject, পরিশোধ, মুছে ফেলা
- Pending → Accept/Reject ওয়ার্কফ্লো (Accept না হওয়া পর্যন্ত মোট হিসাবে ধরা হয় না)
- আংশিক পরিশোধ + পেমেন্ট লগ, ফেরতের তারিখ ও Overdue ব্যাজ
- সব ডিভাইসে ক্লাউড সিঙ্ক (Firestore), Light/Dark থিম

## সমস্যা হলে
- **"Missing or insufficient permissions"** → Rules publish হয়নি বা ভুল paste হয়েছে।
- **Google login popup error** → ধাপ ৪ করা হয়নি।
- **সব ফাঁকা/লোড হয় না** → `firebase-config.js`-এর মান ঠিক আছে কিনা দেখুন, ব্রাউজার Console (F12) দেখুন।
