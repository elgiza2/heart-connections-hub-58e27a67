/**
 * @doc Heuristic router: decides whether a chat turn needs a full computer
 * (browser + terminal + files) instead of a plain model reply. Runs fully
 * client-side and is intentionally conservative — only clearly "do this on a
 * computer for me" requests are routed.
 */

const STRONG_EN = [
  /\bbrows(e|ing)\b.*\b(site|website|web|internet)\b/i,
  /\b(go to|open|visit|log in to|login to|sign in to)\b.*\b(https?:\/\/|www\.|\.com|\.net|\.org|website|site)\b/i,
  /\b(scrape|crawl|download)\b.*\b(site|website|page|data|files?)\b/i,
  /\b(run|execute)\b.*\b(script|command|terminal|shell|code|program)\b/i,
  /\b(book|order|buy|apply|fill (in|out)|submit)\b.*\b(form|ticket|flight|hotel|order|application)\b/i,
  /\b(build|create|generate)\b.*\b(project|repo|app|website|dashboard)\b.*\b(files?|zip|folder)\b/i,
  /\b(automate|automation)\b/i,
  /\bcomputer (use|task)\b/i,
];

const STRONG_AR = [
  /(افتح|ادخل|روح|زور|زر)\s+(الى|الي|على|علي|في|ع)?\s*(موقع|الموقع|المتصفح|كروم|رابط|لينك|صفح)/,
  /(سجل|اعمل|انشئ)\s*(لي|لى)?\s*(دخول|حساب|اكونت|اشتراك|تسجيل)/,
  /(تسجيل)\s*(دخول|حساب|جديد)/,
  /(نزل|حمل)\s+(الملف|ملفات|البيانات|الموقع|الصور|فيديو)/,
  /(شغل|نفذ)\s+(كود|سكربت|امر|برنامج|تيرمنال)/,
  /(اعمل|انشئ)\s+.*(ملف|مجلد|مشروع|سكربت)/,
  /(احجز|اشتري|اطلب|املا|امﻻ)\s+/,
  /(ابحث|دور)\s+.*(الانترنت|موقع|جوجل)/,
  /اتمت|اوتوميشن/,
  /(https?:\/\/|www\.)/i,
  /(سجل|سجلي|سجل\s*لي|ادخل|دخلني)\s*(لي|لنا)?\s*(ب|في|علي|على|الى|الي)?\s*(الحساب|حساب|الايميل|الموقع|المنصه|المنصة)/,
  /(الحساب|الايميل|الاكونت)\s*(ده|دا|هذا|التجريبي)/,
  /(استخدم|افتح|شغل)\s*(ال)?(كومبيوتر|كمبيوتر|متصفح|المتصفح|بروزر)/,
  /(كومبيوتر|كمبيوتر)\s*(سحابي|السحابي)?/,
  /(جرب|جربي|جرب\s*بنفسك|افحص)\s+.*(موقع|الموقع|الحساب|تسجيل)/,
  /(دخول|لوجين|login|log in|sign in)/i,
  /(بيانات|معلومات)\s*(الدخول|الحساب)/,
  /(الباسورد|كلمه السر|كلمة السر|باسوورد|password)/i,
  /(اشترك|سجلني|انشئ لي حساب)/,
];

/** Short "go ahead" replies that continue a previously proposed computer task. */
const AFFIRMATIONS =
  /^(تمام|تمام يلا|يلا|يلا بينا|ماشي|اوك|أوك|اوكي|ok|okay|go|go ahead|كمل|كملي|ابدا|ابدأ|نفذ|هيا|اه|ايوه|نعم|yes|sure|do it|proceed|start)[\s!.،؟]*$/i;

/** True when the message is only an affirmation (no new instruction). */
export function isAffirmation(text: string): boolean {
  const t = normalizeArabic((text || "").trim());
  return t.length <= 24 && AFFIRMATIONS.test(t);
}

/** Normalizes Arabic spelling variants (alef/yaa/taa marbuta, diacritics, tatweel). */
function normalizeArabic(input: string): string {
  return input
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ");
}

/**
 * True when the request should run on the Computer Agent.
 * `explicit` covers the @computer mention which always routes.
 */
export function shouldUseComputer(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (/(^|\s)@computer\b/i.test(t)) return true;
  if (t.length < 8) return false;
  // A message carrying credentials (email + something else) is always a
  // "do it for me on a real browser" request.
  const hasEmail = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(t);
  if (hasEmail && t.length > 12) return true;
  const ar = normalizeArabic(t);
  const hits =
    STRONG_EN.filter((r) => r.test(t)).length +
    STRONG_AR.filter((r) => r.test(ar) || r.test(t)).length;
  return hits > 0;
}

/** Strips the @computer mention so the provider never sees routing syntax. */
export function stripComputerMention(text: string): string {
  return (text || "").replace(/(^|\s)@computer\b/gi, " ").trim();
}
