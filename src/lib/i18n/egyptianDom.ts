import { EGYPTIAN_DICT } from "./egyptianDict";
import { EGYPTIAN_EXTRA } from "./egyptianExtra";

const DICT: Record<string, string> = { ...EGYPTIAN_DICT, ...EGYPTIAN_EXTRA };


/**
 * Zero-network Egyptian Arabic DOM pass.
 *
 * The dictionary is bundled (plain object literal), so translation is a pure
 * in-memory hash lookup. Nothing is fetched, nothing is parsed at runtime.
 * The pass only ever runs while the user language is `ar-eg`.
 */

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "CODE",
  "PRE",
  "SVG",
  "CANVAS",
  "TEXTAREA",
  "IFRAME",
]);

const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;

const lookup = (raw: string): string | null => {
  const text = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > 400) return null;
  // Skip pure numbers / symbols — nothing to translate.
  if (!/[A-Za-z]/.test(text)) return null;
  const hit = DICT[text];
  if (hit) return hit;
  // Try without a trailing punctuation mark.
  const stripped = text.replace(/[.:!?]+$/, "");
  if (stripped !== text && DICT[stripped]) return DICT[stripped];
  return null;
};

const translateNode = (node: Text) => {
  const parent = node.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return;
  if (parent.closest("[data-no-translate], [translate='no']")) return;
  const original = node.nodeValue || "";
  const hit = lookup(original);
  if (!hit) return;
  // Preserve the surrounding whitespace so inline layouts stay intact.
  const lead = original.match(/^\s*/)?.[0] ?? "";
  const tail = original.match(/\s*$/)?.[0] ?? "";
  node.nodeValue = `${lead}${hit}${tail}`;
};

const translateAttrs = (el: Element) => {
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    const hit = lookup(value);
    if (hit) el.setAttribute(attr, hit);
  }
};

const walk = (root: Node) => {
  if (root.nodeType === Node.TEXT_NODE) {
    translateNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (SKIP_TAGS.has(el.tagName)) return;

  translateAttrs(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    texts.push(current as Text);
    current = walker.nextNode();
  }
  for (const t of texts) translateNode(t);
  el.querySelectorAll("[placeholder], [aria-label], [title], [alt]").forEach(translateAttrs);
};

let observer: MutationObserver | null = null;
let queued: Node[] = [];
let scheduled = false;

const flush = () => {
  scheduled = false;
  const batch = queued;
  queued = [];
  observer?.disconnect();
  for (const node of batch) {
    if (node.isConnected) walk(node);
  }
  observe();
};

const schedule = () => {
  if (scheduled) return;
  scheduled = true;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (idle) idle(flush);
  else setTimeout(flush, 32);
};

const observe = () => {
  observer?.observe(document.body, { childList: true, subtree: true, characterData: true });
};

export const startEgyptianDom = () => {
  if (typeof document === "undefined" || observer) return;
  walk(document.body);
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") queued.push(record.target);
      else record.addedNodes.forEach((n) => queued.push(n));
    }
    if (queued.length) schedule();
  });
  observe();
};

export const stopEgyptianDom = () => {
  observer?.disconnect();
  observer = null;
  queued = [];
};
