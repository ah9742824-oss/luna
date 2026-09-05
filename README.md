# LUNA Café — نواة موقع أعمال قابلة لإعادة الاستخدام (Reusable Business Website Core)

هذا ليس موقع كافيه واحد فقط — إنه **Backend Core متعدد الأعمال (Multi-Business)** قابل لإعادة الاستخدام بالكامل، مع **Frontend** خاص بأول عميل حقيقي: **LUNA Café**. نفس الـ Backend مصمم ليخدم عملاء مستقبليين آخرين (مطعم، متجر، مخبز...) بواجهات مختلفة تماماً، دون تكرار منطق العمل أو الأمان.

```text
Reusable Backend Core
        │
        ├── LUNA Café       (موجود فعلاً)
        ├── Restaurant       (مستقبلي — نفس الـ Backend)
        ├── Bakery           (مستقبلي — نفس الـ Backend)
        ├── Store            (مستقبلي — نفس الـ Backend)
        └── أي عميل آخر
```

> **الحالة الحالية:** المشروع بُني على 9 مراحل (Phases) حقيقية ومُختبرة بالكامل — لا مرحلة "افتراضية". كل مرحلة انتهت باختبارات آلية فعلية ناجحة. راجع قسم "الحالة الفعلية لكل ميزة" أدناه للتمييز الصريح بين ما يعمل فعلاً، وما يحتاج إعداد إضافي (مثل حساب Paymob حقيقي)، وما لم يُختبر بعد على بيئة حية.

---

## 1. البنية التقنية (Architecture)

```text
                         GITHUB
                            │
              ┌─────────────┴─────────────┐
              │                           │
       backend/ (Repo واحد، مشترك)   frontend/ (نموذج يُستنسخ لكل عميل)
              │                           │
              ▼                           ▼
    CLOUDFLARE WORKERS             CLOUDFLARE PAGES
              │                           │
              │      REST API واحد       │
              └─────────────┬─────────────┘
                            │
                            ▼
                         SUPABASE
                 ┌────────────────────┐
                 │ PostgreSQL         │
                 │ Storage            │
                 └────────────────────┘
```

- **Backend**: Cloudflare Workers + Hyperdrive (اتصال بقاعدة بيانات Postgres) + Supabase PostgreSQL. REST API واحد يخدم كل الأعمال (businesses) المسجّلة، مع عزل بيانات كامل بين كل عمل وآخر عبر `business_id` في كل استعلام (الطبقة الأساسية)، و Row Level Security كطبقة دفاع إضافية.
- **Frontend**: React + Vite، عربي/إنجليزي RTL/LTR، PWA حقيقي. كل عميل يحصل على نسخة frontend خاصة به (`VITE_BUSINESS_SLUG`)، تتحدث مع نفس الـ Backend عبر رأس `X-Business-Slug`.
- **قاعدة البيانات**: Supabase PostgreSQL، مع migrations مرقّمة (`backend/database/migrations/0001` → `0005`) تُطبَّق بالترتيب عبر `npm run migrate`.
- **المصادقة**: نظامان منفصلان تماماً — أدمن/فريق العمل (`profiles` + JWT) وعملاء (`customers` + JWT من نوع مختلف لا يمكن استخدامه مكان الآخر). RBAC كامل بأربعة أدوار.
- **الطلبات والدفع**: حساب الأسعار من السيرفر فقط، idempotency حقيقي، بنية دفع حقيقية (Cash يعمل بالكامل، Paymob بمحوّل حقيقي جاهز للاعتماد الفعلي).

## 2. التوثيق الكامل

| الملف | المحتوى |
|---|---|
| [`API.md`](./API.md) | مرجع كامل لكل مسارات الـ REST API الفعلية (الطريقة، الصلاحيات، الطلب، الرد) |
| [`DATABASE.md`](./DATABASE.md) | بنية قاعدة البيانات، الجداول، القيود، استراتيجية RLS، سجل الـ migrations |
| [`SECURITY.md`](./SECURITY.md) | النموذج الأمني الكامل، وما تم التحقق منه فعلياً مقابل ما يحتاج بيئة حية |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | خطوات النشر العملية الكاملة (GitHub → Supabase → Cloudflare) + قائمة تحقق إنتاجية |
| [`CLIENT_SETUP.md`](./CLIENT_SETUP.md) | كيفية إضافة عميل جديد على نفس الـ Backend خطوة بخطوة |
| `backend/README.md` | تفاصيل تشغيلية إضافية (رفع الصور، الدفع، إعادة تعيين كلمة المرور، Rate limiting) |

## 3. البدء السريع (محلياً)

### Backend
```bash
cd backend
cp .env.example .env        # واملأ القيم الحقيقية (JWT_SECRET, SUPABASE_DB_URL, ...)
npm install
npm run migrate              # يطبّق كل الـ migrations بالترتيب (0001 → 0005)
npm run seed                 # بيانات LUNA Café التجريبية + حساب أدمن (غير هدّام أبداً)
npm run dev                  # wrangler dev
```

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev                  # vite dev server
```

للنشر الفعلي راجع [`DEPLOYMENT.md`](./DEPLOYMENT.md). لإضافة عميل جديد راجع [`CLIENT_SETUP.md`](./CLIENT_SETUP.md).

## 4. الاختبارات

```bash
cd backend
npm test    # 5 مجموعات اختبارات حقيقية (pg-mem) — 223 فحصاً، صفر فشل
```

الاختبارات تغطي: schema والـ migrations، عزل البيانات بين الأعمال (قراءة/تعديل/حذف)، RBAC الكامل لكل الأدوار الأربعة، حساب الأسعار من السيرفر ومنع التلاعب بالسعر، idempotency الطلبات، توقيع HMAC الحقيقي لـ webhook الدفع وحماية إعادة التشغيل (replay)، أمان إعادة تعيين كلمة المرور، فصل توكن الأدمن عن توكن العميل، CORS. راجع [`SECURITY.md`](./SECURITY.md) للتفاصيل الكاملة، بما فيها ما هو "تم التحقق محلياً" مقابل ما يحتاج بيئة Supabase/Cloudflare حية.

## 5. الحالة الفعلية لكل ميزة

| الميزة | الحالة |
|---|---|
| تعدد الأعمال، عزل البيانات، RBAC | **✅ Implemented** — مُختبر بالكامل |
| الطلبات (سلة، دفع نقدي، تتبع، ضيف/عميل مسجل) | **✅ Implemented** — مُختبر بالكامل |
| لوحة تحكم الأدمن (منتجات، طلبات، عملاء، فريق عمل، صور) | **✅ Implemented** |
| رفع الصور الحقيقي (Supabase Storage) | **✅ Implemented** — يحتاج `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` وBucket حقيقي (**Integration Required**) |
| الدفع النقدي (Cash) | **✅ Implemented** بالكامل |
| الدفع الإلكتروني (Paymob) | **✅ Implemented** (محوّل حقيقي + تحقق HMAC حقيقي) لكن **Pending Live Verification** — لم يُختبر بحساب Paymob حقيقي (راجع `backend/README.md` §20) |
| إعادة تعيين كلمة المرور (أدمن + عميل) | **✅ Implemented** بالكامل (توكن مشفّر، استخدام واحد، منع تعداد الحسابات) — إرسال البريد **Integration Required** (`RESEND_API_KEY`) |
| عربي/إنجليزي RTL/LTR | **✅ Implemented** لتجربة العميل الكاملة؛ لوحة الأدمن عربي فقط (قرار نطاق مقصود) |
| PWA (Manifest, Service Worker, Offline shell) | **✅ Implemented** ومبني بشكل صحيح — **Pending Live Verification** على متصفح/جهاز حقيقي |
| QR للقائمة | **✅ Implemented** (توليد حقيقي عبر مكتبة `qrcode`) |
| SEO (meta, canonical, sitemap, robots, structured data) | **✅ Implemented** |
| Row Level Security | **✅ Implemented** (سياسات حقيقية، `FORCE`) — **Pending Live Verification** على Supabase حقيقي (راجع `SECURITY.md` §4) |
| Rate limiting | **✅ Implemented** (Cloudflare Rate Limiting binding، fail-open) — **Pending Live Verification**، يحتاج إعداد Cloudflare فعلي |
| CORS متعدد الأصول | **✅ Implemented** ومُختبر محلياً — **Pending Live Verification** على متصفح حقيقي |
| فروع متعددة لكل عمل، POS، مخزون كامل، ولاء | **🔮 Future** — لم تُبنَ عمداً (خارج نطاق الـ MVP حسب المواصفة) |
| تسجيل تقييم من العميل مباشرة (بدون أدمن) | **🔮 Future** — حالياً فقط الأدمن يضيف تقييمات؛ العرض العام يعمل |
| أداة داخلية لإنشاء عميل جديد تلقائياً | **🔮 Future** — العملية حالياً يدوية موثّقة في `CLIENT_SETUP.md` (~15 دقيقة) |

**الخلاصة**: كل منطق العمل والأمان مبني ومُختبر فعلياً (223 فحصاً آلياً، صفر فشل). ما تبقى قبل اعتباره "مُتحقق للإنتاج" هو نفس الشيء المتكرر في الجدول أعلاه — نشر فعلي على حسابات Cloudflare/Supabase/Paymob/Resend حقيقية، وهو ما لا تملكه بيئة التطوير التي بُني فيها هذا المشروع.
