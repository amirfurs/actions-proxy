const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

export function normalizeArabic(input: string): string {
  let s = (input || "").trim();
  if (!s) return "";

  // Normalize whitespace first
  s = s.replace(/\s+/g, " ");

  // Remove tatweel and diacritics
  s = s.replace(TATWEEL, "").replace(ARABIC_DIACRITICS, "");

  // Normalize Arabic/Persian variants
  s = s
    // Alef / hamza variants -> alef
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    // Waw hamza -> waw
    .replace(/\u0624/g, "\u0648")
    // Yeh hamza / alef maksura -> yeh
    .replace(/[\u0626\u0649\u06CC]/g, "\u064A")
    // Persian kaf -> Arabic kaf
    .replace(/\u06A9/g, "\u0643")
    // Teh marbuta -> heh (match-friendly)
    .replace(/\u0629/g, "\u0647");

  // Strip common punctuation variants
  s = s.replace(/[ـ•·،,.;:!؟?"'()[\]{}<>]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

export function normalizeArabicKey(input: string): string {
  return normalizeArabic(input).replace(/\s+/g, "");
}
