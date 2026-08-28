/** @doc Megsy Mail — editorial mail client: hero inbox header, grouped list, full-bleed reader, compose, AI explain. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  CornerUpLeft,
  Forward,
  Inbox,
  Loader2,
  PenLine,
  RefreshCw,
  Search as SearchIcon,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import DesktopSettingsLayout from "@/components/settings/DesktopSettingsLayout";
import ProfileGlassShell from "@/components/profile/ProfileGlassShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { translateExactText, useUserLang } from "@/lib/authI18n";
import { explainMail } from "@/lib/mail/explainMail";
import {
  deleteForever,
  ensureMailbox,
  listMail,
  pollInbox,
  markRead,
  moveTo,
  sendMail,
  type MailFolder,
  type MailMessage,
  type Mailbox,
} from "@/lib/mail/mailClient";

const FOLDERS: { key: MailFolder; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "sent", label: "Sent" },
  { key: "spam", label: "Spam" },
  { key: "trash", label: "Trash" },
];

interface Draft {
  to: string;
  subject: string;
  text: string;
}

function displayName(name: string | null | undefined, addr: string) {
  const n = (name || "").trim();
  if (n) return n;
  return (addr || "?").replace(/[<>]/g, "").split("@")[0];
}

function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[1][0] : "";
  return (a + b).toUpperCase();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear ? { day: "numeric", month: "short" } : { year: "numeric", month: "short" });
}

/** Groups messages into Today / This week / Earlier buckets. */
function bucketOf(iso: string): "Today" | "This week" | "Earlier" {
  const d = new Date(iso).getTime();
  const now = Date.now();
  if (new Date(iso).toDateString() === new Date().toDateString()) return "Today";
  if (now - d < 7 * 864e5) return "This week";
  return "Earlier";
}

export default function MailPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const lang = useUserLang();
  const tx = useCallback((s: string) => translateExactText(s, lang), [lang]);

  const [box, setBox] = useState<Mailbox | null>(null);
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [items, setItems] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<MailMessage | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureMailbox()
      .then((b) => alive && setBox(b))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async (f: MailFolder) => {
    setLoading(true);
    try {
      if (f === "inbox" || f === "spam") await pollInbox();
      setItems(await listMail(f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (box) void refresh(folder);
  }, [box, folder, refresh]);

  const unread = useMemo(() => items.filter((m) => !m.is_read).length, [items]);

  const openMessage = async (m: MailMessage) => {
    setOpen(m);
    if (!m.is_read) {
      await markRead(m.id);
      setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)));
    }
  };

  const act = async (m: MailMessage, target: MailFolder | "delete") => {
    if (target === "delete") await deleteForever(m.id);
    else await moveTo(m.id, target);
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    setOpen(null);
    toast.success(tx(target === "delete" ? "Deleted" : "Moved"));
  };

  const reply = (m: MailMessage) => {
    setOpen(null);
    setDraft({
      to: m.from_address,
      subject: m.subject.toLowerCase().startsWith("re:") ? m.subject : `Re: ${m.subject}`,
      text: `\n\n---\n${m.from_address}:\n${m.body_text}`,
    });
  };

  const forward = (m: MailMessage) => {
    setOpen(null);
    setDraft({
      to: "",
      subject: m.subject.toLowerCase().startsWith("fwd:") ? m.subject : `Fwd: ${m.subject}`,
      text: `\n\n--- ${tx("Forwarded message")} ---\n${tx("From")}: ${m.from_address}\n\n${m.body_text}`,
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((m) =>
      [m.subject, m.snippet, m.from_address, m.from_name, m.to_address]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, query]);

  const groups = useMemo(() => {
    const out: { label: string; rows: MailMessage[] }[] = [];
    for (const m of visible) {
      const b = bucketOf(m.created_at);
      const last = out[out.length - 1];
      if (last && last.label === b) last.rows.push(m);
      else out.push({ label: b, rows: [m] });
    }
    return out;
  }, [visible]);

  const copyAddress = () => {
    if (!box) return;
    void navigator.clipboard.writeText(box.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  /* ── Hero: dark editorial card with the address and live counts ── */
  const Hero = (
    <div className="relative overflow-hidden rounded-[26px] bg-foreground px-5 py-5 text-background">
      <span
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-20 h-52 w-52 rounded-full bg-background/10 blur-2xl"
      />
      <div className="relative flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-background/15">
          <span className="contents">
            <Inbox className="h-4 w-4" />
          </span>
        </span>
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] opacity-60">{tx("Megsy Mail")}</p>
      </div>

      <button
        type="button"
        onClick={copyAddress}
        className="group relative mt-4 flex w-full items-center gap-2 text-start"
        aria-label={tx("Copy address")}
      >
        <span className="min-w-0 flex-1 truncate text-[19px] font-semibold tracking-tight" dir="ltr">
          {box?.address ?? "…"}
        </span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-background/15 transition-colors group-hover:bg-background/25">
          <span className="contents">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </span>
        </span>
      </button>

      <div className="relative mt-5 flex items-center gap-6">
        <Stat value={unread} label={tx("Unread")} />
        <span className="h-8 w-px bg-background/20" />
        <Stat value={items.length} label={tx("Messages")} />
        <span className="h-8 w-px bg-background/20" />
        <Stat value={items.filter((m) => m.origin === "ai").length} label={tx("From Megsy")} />
      </div>
    </div>
  );

  /* ── Search + folders on one quiet control row ── */
  const Controls = (
    <div className="space-y-3">
      <div className="flex h-11 items-center gap-2.5 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.03] px-3.5 focus-within:border-foreground/20">
        <SearchIcon className="h-4 w-4 shrink-0 text-foreground/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tx("Search email")}
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-foreground/35"
        />
        {query && (
          <button type="button" aria-label={tx("Clear")} onClick={() => setQuery("")} className="shrink-0">
            <span className="contents">
              <X className="h-4 w-4 text-foreground/35" />
            </span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {FOLDERS.map((f) => {
          const active = folder === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFolder(f.key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "bg-foreground/[0.05] text-foreground/55 hover:bg-foreground/[0.09] hover:text-foreground/80"
              }`}
            >
              {tx(f.label)}
              {f.key === "inbox" && unread > 0 && <span className="ms-1.5 tabular-nums opacity-70">{unread}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  /* ── List: date-grouped rows on a single soft surface ── */
  const List = (
    <div className="mt-5">
      {loading && (
        <div className="grid place-items-center py-20 text-foreground/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="grid place-items-center gap-2 py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-foreground/35">
            <span className="contents">
              <Inbox className="h-5 w-5" />
            </span>
          </span>
          <p className="text-[13.5px] text-foreground/45">{tx("No messages here")}</p>
        </div>
      )}

      {!loading &&
        groups.map((g) => (
          <section key={g.label} className="mb-5">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/35">
              {tx(g.label)}
            </p>
            <div className="overflow-hidden rounded-[22px] border border-foreground/[0.07] bg-foreground/[0.02]">
              {g.rows.map((m, i) => {
                const addr = folder === "sent" ? m.to_address : m.from_address;
                const who = displayName(folder === "sent" ? null : m.from_name, addr);
                return (
                  <button
                    key={m.id}
                    onClick={() => void openMessage(m)}
                    className={`flex w-full gap-3 px-4 py-3.5 text-start transition-colors hover:bg-foreground/[0.04] ${
                      i > 0 ? "border-t border-foreground/[0.06]" : ""
                    }`}
                  >
                    <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-foreground/[0.07] text-[11.5px] font-bold text-foreground/70">
                      {initials(who)}
                      {!m.is_read && (
                        <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate text-[14px] ${
                            m.is_read ? "font-medium text-foreground/70" : "font-bold text-foreground"
                          }`}
                        >
                          {who}
                        </span>
                        {m.origin === "ai" && <Bot className="h-3.5 w-3.5 shrink-0 self-center text-foreground/35" />}
                        <span className="shrink-0 text-[11px] tabular-nums text-foreground/35">
                          {fmtDate(m.created_at)}
                        </span>
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-[13.5px] ${
                          m.is_read ? "text-foreground/65" : "font-semibold text-foreground"
                        }`}
                      >
                        {m.subject || tx("(no subject)")}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-foreground/40">{m.snippet}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );

  const Body = (
    <section className="pb-28">
      {Hero}
      <div className="mt-5">{Controls}</div>
      {List}

      <button
        type="button"
        onClick={() => setDraft({ to: "", subject: "", text: "" })}
        className="fixed bottom-24 end-5 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background shadow-xl shadow-foreground/25 transition-transform hover:scale-[1.03] md:bottom-8"
      >
        <span className="contents">
          <PenLine className="h-4 w-4" />
        </span>
        <span>{tx("Compose")}</span>
      </button>

      {open && (
        <MessageView
          msg={open}
          tx={tx}
          onClose={() => setOpen(null)}
          onAct={act}
          onReply={reply}
          onForward={forward}
          folder={folder}
        />
      )}
      {draft && (
        <Composer
          tx={tx}
          from={box?.address ?? ""}
          draft={draft}
          onClose={() => setDraft(null)}
          onSent={() => {
            setDraft(null);
            void refresh(folder);
          }}
        />
      )}
    </section>
  );

  const RefreshBtn = (
    <button
      type="button"
      aria-label={tx("Refresh")}
      onClick={() => void refresh(folder)}
      className="grid h-10 w-10 place-items-center rounded-full border border-foreground/10 bg-foreground/[0.03] text-foreground/55 transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
    >
      <span className="contents">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      </span>
    </button>
  );

  if (isMobile) {
    return (
      <ProfileGlassShell
        title={tx("Mail")}
        subtitle={tx("Your own Megsy inbox")}
        onBack={() => (window.history.length > 1 ? window.history.back() : navigate("/settings"))}
      >
        <div className="mb-3 flex justify-end">{RefreshBtn}</div>
        {Body}
      </ProfileGlassShell>
    );
  }
  return (
    <DesktopSettingsLayout>
      <div className="mx-auto w-full max-w-2xl px-4 md:px-0">
        <header className="mb-6 flex items-center gap-3">
          <BackButton label={tx("Back")} onClick={() => navigate("/settings")} />
          <h1 className="min-w-0 flex-1 text-[24px] font-semibold leading-tight tracking-tight">{tx("Mail")}</h1>
          {RefreshBtn}
        </header>
        {Body}
      </div>
    </DesktopSettingsLayout>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-[20px] font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] opacity-60">{label}</p>
    </div>
  );
}

/** Unified, clearly visible back button used across the mail experience. */
function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-foreground/10 bg-foreground/[0.04] text-foreground/70 shadow-sm transition-all hover:border-foreground/20 hover:bg-foreground/[0.08] hover:text-foreground active:scale-95"
    >
      <span className="contents">
        <ArrowLeft className="h-[18px] w-[18px] rtl:rotate-180" />
      </span>
    </button>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Rendered in a portal: settings pages apply global CSS that collapses
  // icon-bearing controls, and the overlay must escape that scope.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/45 backdrop-blur-[3px] sm:place-items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-foreground/10 bg-background shadow-2xl sm:max-w-2xl sm:rounded-[26px]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** HTML bodies render inside a sandboxed iframe so remote markup can never touch the app. */
function HtmlBody({ html }: { html: string }) {
  const [height, setHeight] = useState(240);
  const frameId = useMemo(() => `mail-${Math.random().toString(36).slice(2)}`, []);

  // Remote scripts are stripped; the frame is origin-less and only reports its height.
  const safe = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/ on[a-z]+=("[^"]*"|'[^']*')/gi, "");
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>
    body{margin:0;padding:0;font:15px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#111;background:#fff;word-break:break-word}
    img{max-width:100%;height:auto}table{max-width:100%}
  </style></head><body>${safe}<script>
    (function(){var s=function(){parent.postMessage({t:"mail-h",id:${JSON.stringify(frameId)},h:document.documentElement.scrollHeight},"*")};
    s();window.addEventListener("load",s);[100,500,1200,2500].forEach(function(d){setTimeout(s,d)});
    if(window.ResizeObserver)new ResizeObserver(s).observe(document.body);})();
  <\/script></body></html>`;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { t?: string; id?: string; h?: number } | null;
      if (!d || d.t !== "mail-h" || d.id !== frameId || !d.h) return;
      setHeight(Math.min(Math.max(d.h + 16, 120), 6000));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [frameId]);

  return (
    <iframe
      title="message"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height }}
      className="w-full rounded-xl bg-white"
    />
  );
}

function MessageView({
  msg,
  tx,
  onClose,
  onAct,
  onReply,
  onForward,
  folder,
}: {
  msg: MailMessage;
  tx: (s: string) => string;
  onClose: () => void;
  onAct: (m: MailMessage, target: MailFolder | "delete") => void;
  onReply: (m: MailMessage) => void;
  onForward: (m: MailMessage) => void;
  folder: MailFolder;
}) {
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  const explain = async () => {
    setExplaining(true);
    try {
      const out = await explainMail({
        subject: msg.subject,
        from: msg.from_address,
        body: msg.body_text || msg.body_html?.replace(/<[^>]+>/g, " ") || "",
      });
      setExplanation(out || tx("No explanation available"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setExplaining(false);
    }
  };

  const who = displayName(msg.from_name, msg.from_address);

  return (
    <Sheet onClose={onClose}>
      {/* Toolbar: back + folder context + destructive actions */}
      <div className="flex items-center gap-2 border-b border-foreground/[0.08] bg-background/95 px-4 py-3 backdrop-blur">
        <BackButton label={tx("Back")} onClick={onClose} />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground/70">
          {tx(FOLDERS.find((f) => f.key === folder)?.label ?? "Inbox")}
        </p>
        <button
          type="button"
          onClick={() => onAct(msg, folder === "spam" ? "inbox" : "spam")}
          className="rounded-full border border-foreground/10 px-3 py-1.5 text-[12px] font-medium text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          {tx(folder === "spam" ? "Not spam" : "Mark as spam")}
        </button>
        <button
          type="button"
          aria-label={tx(folder === "trash" ? "Delete forever" : "Move to trash")}
          onClick={() => onAct(msg, folder === "trash" ? "delete" : "trash")}
          className="grid h-9 w-9 place-items-center rounded-full text-foreground/45 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <span className="contents">
            <Trash2 className="h-4 w-4" />
          </span>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/35">
          {new Date(msg.created_at).toLocaleString()}
        </p>
        <h2 className="mt-2 text-[24px] font-bold leading-tight tracking-tight">
          {msg.subject || tx("(no subject)")}
        </h2>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.02] px-3.5 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-foreground/[0.07] text-[12px] font-bold text-foreground/70">
            {initials(who)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold" dir="ltr">
              {who}
            </p>
            <p className="truncate text-[11.5px] text-foreground/45" dir="ltr">
              {msg.from_address}
            </p>
          </div>
        </div>

        <div className="mt-6">
          {msg.body_html ? (
            <HtmlBody html={msg.body_html} />
          ) : (
            <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-foreground/85">{msg.body_text}</p>
          )}
        </div>

        {explanation && (
          <div className="mt-6 rounded-[22px] border border-primary/20 bg-primary/[0.06] p-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-primary">
              <span className="contents">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              {tx("Megsy's summary")}
            </p>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{explanation}</p>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 border-t border-foreground/[0.08] px-4 py-3">
        <button
          type="button"
          onClick={() => onReply(msg)}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[13.5px] font-semibold text-background transition-opacity hover:opacity-90"
        >
          <span className="contents">
            <CornerUpLeft className="h-4 w-4 rtl:rotate-180" />
          </span>
          {tx("Reply")}
        </button>
        <button
          type="button"
          onClick={() => onForward(msg)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-foreground/12 px-4 text-[13.5px] text-foreground/75 transition-colors hover:bg-foreground/[0.05]"
        >
          <span className="contents">
            <Forward className="h-4 w-4 rtl:rotate-180" />
          </span>
          <span className="hidden sm:inline">{tx("Forward")}</span>
        </button>
        <button
          type="button"
          disabled={explaining}
          onClick={() => void explain()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-primary/25 bg-primary/[0.06] px-4 text-[13.5px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          <span className="contents">
            {explaining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </span>
          <span className="hidden sm:inline">{tx("Explain with AI")}</span>
        </button>
      </div>
    </Sheet>
  );
}

function Composer({
  tx,
  from,
  draft,
  onClose,
  onSent,
}: {
  tx: (s: string) => string;
  from: string;
  draft: Draft;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [text, setText] = useState(draft.text);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await sendMail({ to, subject, text });
      toast.success(
        res.status === "queued"
          ? tx("Queued — external delivery starts once the domain is connected")
          : tx("Message sent"),
      );
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center gap-2 border-b border-foreground/[0.08] px-4 py-3">
        <button
          type="button"
          aria-label={tx("Close")}
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full border border-foreground/10 bg-foreground/[0.04] text-foreground/60 transition-colors hover:bg-foreground/[0.08]"
        >
          <span className="contents">
            <X className="h-4 w-4" />
          </span>
        </button>
        <h2 className="flex-1 text-[15px] font-semibold">{tx("New message")}</h2>
        <button
          type="button"
          disabled={busy || !to.trim()}
          onClick={() => void submit()}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <span className="contents">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:rotate-180" />}
          </span>
          <span>{tx("Send")}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-3 border-b border-foreground/[0.07] py-2.5">
          <span className="w-16 shrink-0 text-[12px] font-medium uppercase tracking-wide text-foreground/35">
            {tx("From")}
          </span>
          <span className="min-w-0 truncate text-[13.5px] text-foreground/70" dir="ltr">
            {from}
          </span>
        </div>
        <div className="flex items-center gap-3 border-b border-foreground/[0.07] py-1">
          <span className="w-16 shrink-0 text-[12px] font-medium uppercase tracking-wide text-foreground/35">
            {tx("To")}
          </span>
          <Input
            dir="ltr"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 flex-1 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-3 border-b border-foreground/[0.07] py-1">
          <span className="w-16 shrink-0 text-[12px] font-medium uppercase tracking-wide text-foreground/35">
            {tx("Subject")}
          </span>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-10 flex-1 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          />
        </div>
        <Textarea
          rows={12}
          placeholder={tx("Write your message…")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-3 resize-none border-0 bg-transparent px-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
        />
      </div>
    </Sheet>
  );
}
