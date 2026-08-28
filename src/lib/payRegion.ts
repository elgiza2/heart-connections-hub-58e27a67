/**
 * @doc Billing region
 *
 * Chosen at sign-up: Arabic users are billed through Kashier (card +
 * e-wallets), everyone else through Dodo Payments. Stored locally and on the
 * auth user metadata so it survives across devices.
 */
export type PayRegion = "arab" | "global";

const KEY = "pay_region";

export function getPayRegion(): PayRegion | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    return v === "arab" || v === "global" ? v : null;
  } catch {
    return null;
  }
}

export function setPayRegion(region: PayRegion): void {
  try {
    localStorage.setItem(KEY, region);
  } catch {
    // ignore
  }
}

/** True when the account should use the Arabic (Kashier) payment gateways. */
export function isArabBilling(): boolean {
  return getPayRegion() === "arab";
}

/**
 * Best guess for a first-time visitor: Arabic browser language or an Arab
 * timezone → the Arabic (Kashier) edition, everyone else → global (Dodo).
 */
export function guessPayRegion(): PayRegion {
  if (typeof window === "undefined") return "global";
  try {
    const lang = (navigator.language || "").toLowerCase();
    if (lang.startsWith("ar")) return "arab";
    const langs = (navigator.languages || []).map((l) => l.toLowerCase());
    if (langs.some((l) => l.startsWith("ar"))) return "arab";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/^(Africa\/(Cairo|Algiers|Tunis|Tripoli|Khartoum|Casablanca)|Asia\/(Riyadh|Dubai|Kuwait|Qatar|Bahrain|Muscat|Baghdad|Amman|Beirut|Damascus|Aden|Gaza|Hebron))$/.test(tz))
      return "arab";
  } catch {
    // ignore
  }
  return "global";
}

/** Stored choice, or the automatic guess when the visitor never picked one. */
export function getPayRegionOrGuess(): PayRegion {
  return getPayRegion() ?? guessPayRegion();
}
