# نظام MCP جديد + Clerk للتكاملات و Sign in with Apple

## خلاصة الريسرش

- **أحدث MCP spec: 2026-07-28**. أهم التغييرات مقارنة بالموجود عندنا:
  - إلغاء الـ sessions على مستوى البروتوكول وحذف هيدر `Mcp-Session-Id` من Streamable HTTP.
  - Streamable HTTP اتغيّر سلوكه (توافق خلفي مطلوب) — POST واحد للرسائل مع `Accept: application/json, text/event-stream`.
  - هيدر `MCP-Protocol-Version` مع كل ريكوست، وتفاوض إضافات (extensions).
  - `tools/list` وباقي قوائم صارت endpoints بترقيم صفحات (cursor).
  - **Elicitation**: السيرفر يطلب مدخلات إضافية من المستخدم أثناء تنفيذ أداة.
  - **OAuth 2.1** كامل: `WWW-Authenticate` → protected-resource metadata → authorization-server metadata → DCR أو CIMD، مع PKCE.
- **Clerk**: `getUserOauthAccessToken()` في الباك إند يجيب توكن المزوّد على نيابة المستخدم (أساس التكاملات)، و`user.createExternalAccount` من الفرونت لربط تطبيق جديد، و Apple كـ social connection للويب (محتاج Services ID + مفتاح في لوحة Apple، والتفعيل من لوحة Clerk).

## القرارات المتفق عليها

- Supabase Auth يفضل نظام الحساب الأساسي. Clerk للتكاملات + زر Apple فقط.
- طبقة MCP جديدة كاملة (registry + runtime + UI) بدل الحالية.

## 1) طبقة MCP الجديدة (2026-07-28)

**قاعدة البيانات** (migration واحدة):
- توسيع `mcp_connections`: `protocol_version`, `tools` (jsonb فيه الاسم + الوصف + input schema + annotations), `auth_mode` (none/headers/oauth), `oauth` (jsonb: issuer, client_id, tokens, scopes), `capabilities`, `last_probed_at`.
- جدول `mcp_tool_approvals`: موافقات المستخدم على الأدوات الحساسة (لكل سيرفر/أداة، مرة واحدة أو دائمًا).
- جدول `mcp_call_log`: سجل نداءات الأدوات (سيرفر، أداة، مدة، حالة، خطأ) لعرضه في الواجهة.
- RLS: كل صف مقصور على صاحبه + GRANTs مطلوبة.

**الرَنتايم** (`api/mcp.ts` — نفس نمط دوال `api/*` الحالية، مش edge function جديدة):
- كلاينت MCP نظيف في `src/lib/mcp/protocol.ts` (يشتغل سيرفر-سايد): `initialize` → `tools/list` بترقيم صفحات → `tools/call`، بدون session id، مع `MCP-Protocol-Version` و`Accept` الصحيحين، fallback للسبيك القديم لو السيرفر رجّع 4xx على السبيك الجديد.
- OAuth: عند 401 يقرأ `WWW-Authenticate`، يجيب metadata، يعمل تسجيل عميل ديناميكي، يرجّع `authUrl` للفرونت، وendpoint للكولباك يخزّن التوكنات ويجدّدها (refresh) تلقائيًا.
- أكشنات: `connect`, `probe`, `list`, `call`, `disconnect`, `oauth_callback`.
- أمان: https فقط، منع الـ redirects، التوكنات مخزّنة على صف المستخدم ولا تُرسل للموديل أبدًا، وكل نداء يتحقق من هوية المستخدم من توكن Supabase.

**دمج في المحادثة**:
- `src/lib/mcp/registry.ts` يبني قائمة أدوات المستخدم المفعّلة (بالـ schemas) ويحقنها في `turnContext`.
- تنفيذ فعلي للأدوات: لما الموديل يطلب أداة MCP، ننفّذها عبر `api/mcp.ts` ونرجّع النتيجة للمحادثة، مع بطاقة أداة في الشات (اسم الأداة، المدخلات، النتيجة).
- Elicitation: لو السيرفر طلب مدخلات، تظهر بطاقة صغيرة في المحادثة للمستخدم يكمّلها.
- موافقة قبل الأدوات المدمّرة (`destructiveHint`) عبر `mcp_tool_approvals`.

**الواجهة**:
- إعادة كتابة `src/pages/settings/McpSettingsPage.tsx` و`src/components/chat/integrations/CustomMcpList.tsx` على الطبقة الجديدة: إضافة سيرفر (URL + none/headers/OAuth)، حالة الاتصال، قائمة الأدوات بأوصافها وبادجات (قراءة فقط / يعدّل بيانات)، تشغيل أداة تجريبيًا، سجل النداءات، تفعيل/إيقاف/حذف.
- بدون أي أسماء مزوّدين في الواجهة (القاعدة الحالية).

## 2) Clerk للتكاملات

- تثبيت `@clerk/clerk-react` + `ClerkProvider` حول التطبيق بمفتاح `VITE_CLERK_PUBLISHABLE_KEY`.
- تبويب التكاملات يعرض تطبيقات Clerk المتصلة من `user.externalAccounts`، والربط بـ `user.createExternalAccount` (نافذة OAuth)، وفصل الاتصال من نفس الشاشة.
- `api/clerk-tokens.ts`: يتحقق من هوية المستخدم، ويستخدم `CLERK_SECRET_KEY` مع `getUserOauthAccessToken` ليجيب توكن المزوّد ويستخدمه سيرفر-سايد فقط (لا يرجع للفرونت أبدًا).
- ربط حساب Clerk بحساب Supabase الحالي في جدول `clerk_links` (supabase user_id ↔ clerk user_id) لتفضل كل بيانات المستخدم الحالية كما هي.
- التكاملات المتاحة تُعرض من `integrationsData` الحالية، وتتحوّل تدريجيًا للتوكنات القادمة من Clerk.

## 3) Sign in with Apple عبر Clerk

- زر «المتابعة بـ Apple» في صفحة الدخول ينفّذ `signIn.authenticateWithRedirect({ strategy: "oauth_apple" })` من Clerk.
- بعد الرجوع: صفحة كولباك تأخذ توكن جلسة Clerk وتناديه على `api/clerk-bridge.ts` الذي:
  1. يتحقق من التوكن بمفاتيح Clerk العامة (JWKS).
  2. يطابق/ينشئ مستخدم Supabase بنفس الإيميل الموثّق (صلاحيات إدارية سيرفر-سايد فقط).
  3. يرجّع جلسة Supabase للمتصفح، فيدخل المستخدم بحساب Supabase عادي وكل الجداول والسياسات تشتغل كما هي.
- المستخدم الحالي بنفس الإيميل يُربط بحسابه بدل إنشاء حساب مكرر.

## المطلوب منك

- إضافة سيكرتس: `VITE_CLERK_PUBLISHABLE_KEY` و `CLERK_SECRET_KEY` (هطلبهم كـ Secrets عند التنفيذ).
- تفعيل Apple في لوحة Clerk (Services ID + Key من حساب Apple Developer) وإضافة دومين الموقع في Clerk.

## تفاصيل تقنية مختصرة

- كل الشغل السيرفر-سايد في `api/*.ts` (نفس نمط المشروع)، بدون إنشاء edge functions جديدة.
- توكنات MCP و Clerk لا تُرسل للفرونت ولا لسياق الموديل.
- الطبقة القديمة (`crawl-url` بأكشنات `mcp_*`) تفضل شغّالة كـ fallback لحين تحويل كل السيرفرات، وبعدها تُشال من الواجهة.
