/** @doc Megsy Mail — iOS-style mail client: floating pill headers, soft cards, grouped list, reader & composer sheets. */
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
  MoreHorizontal,
  Paperclip,
  PenLine,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Send,
  Sparkles,
  SquarePen,
  Trash2,
  Type as TypeIcon,
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

/** Groups messages into Today / Yesterday / This week / Earlier buckets. */
function bucketOf(iso: string): "Today" | "Yesterday" | "This week" | "Earlier" {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now.getTime() - 864e5);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  if (now.getTime() - d.getTime() < 7 * 864e5) return "This week";
  return "Earlier";
}

/* ── iOS-style shared primitives ───────────────────────────────── */

/** Circular floating control used in every mail header. */
function RoundBtn({
  label,
  onClick,
  children,
  tone = "plain",
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  tone?: "plain" | "accent";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      // Settings pages force a 16px radius on buttons; keep these perfectly round.
      style={{ borderRadius: 9999 }}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-all active:scale-95 disabled:opacity-40 ${
        tone === "accent"
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
          : "bg-card text-foreground/75 shadow-[0_1px_3px_hsl(var(--foreground)/0.08)] hover:text-foreground"
      }`}
    >
      <span className="contents">{children}</span>
    </button>
  );
}

/** Centered pill title of the iOS header. */
function PillTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[62%] items-center gap-2 truncate rounded-full bg-card px-5 py-2.5 text-[15px] font-semibold shadow-[0_1px_3px_hsl(var(--foreground)/0.08)]">
      {children}
    </div>
  );
}

function IosHeader({
  left,
  title,
  right,
}: {
  left: React.ReactNode;
  title: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      {left}
      <div className="min-w-0 flex-1">{title}</div>
      {right}
    </div>
  );
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
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState<MailMessage | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
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

  /**
   * Paint the stored messages first, then fetch new mail in the background —
   * IMAP polling takes seconds and must never block the list from rendering.
   */
  const refresh = useCallback(async (f: MailFolder) => {
    setLoading(true);
    try {
      setItems(await listMail(f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    if (f !== "inbox" && f !== "spam") return;
    setSyncing(true);
    try {
      await pollInbox();
      setItems(await listMail(f));
    } catch {
      /* background sync failures stay silent */
    } finally {
      setSyncing(false);
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

  const activeFolder = FOLDERS.find((f) => f.key === folder)?.label ?? "Inbox";

  /* ── Header: ••• / folder pill / search ── */
  const Header = (
    <IosHeader
      left={
        <RoundBtn label={tx("Refresh")} onClick={() => void refresh(folder)}>
          {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <RefreshCw className="h-[18px] w-[18px]" />}
        </RoundBtn>
      }
      title={
        <PillTitle>
          {unread > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          <span className="truncate">{tx(activeFolder)}</span>
        </PillTitle>
      }
      right={
        <RoundBtn label={tx("Search email")} onClick={() => setSearching((s) => !s)}>
          {searching ? <X className="h-[18px] w-[18px]" /> : <SearchIcon className="h-[18px] w-[18px]" />}
        </RoundBtn>
      }
    />
  );

  /* ── Address card + optional search field ── */
  const Meta = (
    <div className="mt-3 space-y-2.5">
      <button
        type="button"
        onClick={copyAddress}
        className="flex w-full items-center gap-3 rounded-[20px] bg-card px-4 py-3 text-start shadow-[0_1px_3px_hsl(var(--foreground)/0.07)] transition-transform active:scale-[0.99]"
        aria-label={tx("Copy address")}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-foreground/60">
          <span className="contents">
            <Inbox className="h-[17px] w-[17px]" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-foreground/40">
            {tx("Your Megsy address")}
          </span>
          <span className="block truncate text-[14px] font-semibold" dir="ltr">
            {box?.address ?? "…"}
          </span>
        </span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground/[0.05] text-foreground/55">
          <span className="contents">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</span>
        </span>
      </button>

      {searching && (
        <div className="flex h-11 items-center gap-2.5 rounded-[20px] bg-card px-4 shadow-[0_1px_3px_hsl(var(--foreground)/0.07)]">
          <SearchIcon className="h-4 w-4 shrink-0 text-foreground/35" />
          <input
            autoFocus
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
      )}
    </div>
  );

  /* ── List: date-grouped rows on white cards ── */
  const List = (
    <div className="mt-4">
      {loading && (
        <div className="grid place-items-center py-20 text-foreground/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="grid place-items-center gap-2 py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-card text-foreground/35 shadow-[0_1px_3px_hsl(var(--foreground)/0.07)]">
            <span className="contents">
              <Inbox className="h-5 w-5" />
            </span>
          </span>
          <p className="text-[13.5px] text-foreground/45">{tx("No messages here")}</p>
        </div>
      )}

      {!loading &&
        groups.map((g) => (
          <section key={g.label} className="mb-4">
            <p className="mb-1.5 px-2 text-[13px] font-semibold text-foreground/45">{tx(g.label)}</p>
            <div className="overflow-hidden rounded-[22px] bg-card shadow-[0_1px_3px_hsl(var(--foreground)/0.07)]">
              {g.rows.map((m, i) => {
                const addr = folder === "sent" ? m.to_address : m.from_address;
                const who = displayName(folder === "sent" ? null : m.from_name, addr);
                return (
                  <button
                    key={m.id}
                    onClick={() => void openMessage(m)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors hover:bg-foreground/[0.03]"
                  >
                    <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-[12px] font-bold text-foreground/70">
                      {initials(who)}
                      {!m.is_read && (
                        <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate text-[15px] ${
                            m.is_read ? "font-medium text-foreground/75" : "font-bold text-foreground"
                          }`}
                        >
                          {who}
                        </span>
                        {m.origin === "ai" && <Bot className="h-3.5 w-3.5 shrink-0 text-foreground/35" />}
                        <span className="shrink-0 text-[12px] tabular-nums text-foreground/40">
                          {fmtDate(m.created_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13.5px] text-foreground/45">
                        {m.snippet || m.subject || tx("(no subject)")}
                      </span>
                    </span>
                    {i < 0 && null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );

  const Body = (
    <section className="-mx-1 pb-32">
      {Header}
      {Meta}
      {List}

      {/* iOS floating tab dock + compose FAB */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4 md:bottom-8">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-card/95 p-1.5 shadow-[0_8px_28px_hsl(var(--foreground)/0.14)] backdrop-blur">
            {FOLDERS.map((f) => {
              const active = folder === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFolder(f.key)}
                  className={`rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                    active ? "bg-primary/10 text-primary" : "text-foreground/50 hover:text-foreground/80"
                  }`}
                >
                  {tx(f.label)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={tx("Compose")}
            onClick={() => setDraft({ to: "", subject: "", text: "" })}
            className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
          >
            <span className="contents">
              <Plus className="h-5 w-5" />
            </span>
          </button>
        </div>
      </div>

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

  if (isMobile) {
    return (
      <ProfileGlassShell
        title={tx("Mail")}
        subtitle={tx("Your own Megsy inbox")}
        onBack={() => (window.history.length > 1 ? window.history.back() : navigate("/settings"))}
      >
        {Body}
      </ProfileGlassShell>
    );
  }
  return (
    <DesktopSettingsLayout>
      <div className="mx-auto w-full max-w-2xl px-4 md:px-0">
        <header className="mb-4 flex items-center gap-3">
          <RoundBtn label={tx("Back")} onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-[18px] w-[18px] rtl:rotate-180" />
          </RoundBtn>
          <h1 className="min-w-0 flex-1 text-[24px] font-semibold leading-tight tracking-tight">{tx("Mail")}</h1>
        </header>
        {Body}
      </div>
    </DesktopSettingsLayout>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Rendered in a portal: settings pages apply global CSS that collapses
  // icon-bearing controls, and the overlay must escape that scope.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/35 backdrop-blur-[3px] sm:place-items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-[30px] bg-muted shadow-2xl sm:max-w-2xl sm:rounded-[30px]"
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
  const [more, setMore] = useState(false);

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
      <div className="px-3 pt-3">
        <IosHeader
          left={
            <RoundBtn label={tx("Back")} onClick={onClose}>
              <ArrowLeft className="h-[18px] w-[18px] rtl:rotate-180" />
            </RoundBtn>
          }
          title={
            <PillTitle>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-[10px] font-bold text-foreground/70">
                {initials(who)}
              </span>
              <span className="truncate" dir="ltr">
                {who}
              </span>
            </PillTitle>
          }
          right={
            <RoundBtn
              label={tx(folder === "trash" ? "Delete forever" : "Move to trash")}
              onClick={() => onAct(msg, folder === "trash" ? "delete" : "trash")}
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </RoundBtn>
          }
        />
      </div>

      {/* Subject / To card */}
      <div className="px-4 pt-3">
        <div className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_hsl(var(--foreground)/0.07)]">
          <div className="flex gap-2 px-4 py-3">
            <span className="shrink-0 text-[14px] font-semibold">{tx("Subject")}:</span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-foreground/75">
              {msg.subject || tx("(no subject)")}
            </span>
          </div>
          <div className="h-px bg-foreground/[0.06]" />
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="shrink-0 text-[14px] font-semibold">{tx("From")}:</span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-foreground/75" dir="ltr">
              {msg.from_address}
            </span>
          </div>
        </div>
      </div>

      {/* Body card */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <div className="rounded-[20px] bg-card p-4 shadow-[0_1px_3px_hsl(var(--foreground)/0.07)]">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-foreground/35">
            {new Date(msg.created_at).toLocaleString()}
          </p>
          {msg.body_html ? (
            <HtmlBody html={msg.body_html} />
          ) : (
            <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-foreground/85">{msg.body_text}</p>
          )}

          {explanation && (
            <div className="mt-5 rounded-[18px] bg-primary/[0.07] p-4">
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
      </div>

      {/* iOS action bar: big Reply pill + circular actions */}
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-1">
        <button
          type="button"
          onClick={() => onReply(msg)}
          className="inline-flex h-13 min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-[0.98]"
        >
          <span className="contents">
            <CornerUpLeft className="h-[18px] w-[18px] rtl:rotate-180" />
          </span>
          {tx("Reply")}
        </button>
        <button
          type="button"
          aria-label={tx("Forward")}
          onClick={() => onForward(msg)}
          className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-card text-foreground/70 shadow-[0_1px_3px_hsl(var(--foreground)/0.08)] transition-transform active:scale-95"
        >
          <span className="contents">
            <Forward className="h-[18px] w-[18px] rtl:rotate-180" />
          </span>
        </button>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label={tx("More")}
            onClick={() => setMore((v) => !v)}
            className="grid h-[52px] w-[52px] place-items-center rounded-full bg-card text-foreground/70 shadow-[0_1px_3px_hsl(var(--foreground)/0.08)] transition-transform active:scale-95"
          >
            <span className="contents">
              <MoreHorizontal className="h-[18px] w-[18px]" />
            </span>
          </button>
          {more && (
            <div className="absolute bottom-[60px] end-0 w-56 overflow-hidden rounded-[18px] bg-card p-1 shadow-[0_12px_36px_hsl(var(--foreground)/0.18)]">
              <button
                type="button"
                disabled={explaining}
                onClick={() => {
                  setMore(false);
                  void explain();
                }}
                className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-start text-[14px] font-medium text-primary transition-colors hover:bg-primary/[0.07] disabled:opacity-60"
              >
                <span className="contents">
                  {explaining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </span>
                {tx("Explain with AI")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMore(false);
                  onAct(msg, folder === "spam" ? "inbox" : "spam");
                }}
                className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-start text-[14px] font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.05]"
              >
                <span className="contents">
                  <Inbox className="h-4 w-4" />
                </span>
                {tx(folder === "spam" ? "Not spam" : "Mark as spam")}
              </button>
            </div>
          )}
        </div>
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
      <div className="px-3 pt-3">
        <IosHeader
          left={
            <RoundBtn label={tx("Close")} onClick={onClose}>
              <ArrowLeft className="h-[18px] w-[18px] rtl:rotate-180" />
            </RoundBtn>
          }
          title={
            <PillTitle>
              <span className="truncate">{tx("Compose")}</span>
            </PillTitle>
          }
          right={
            <RoundBtn label={tx("New message")}>
              <SquarePen className="h-[18px] w-[18px]" />
            </RoundBtn>
          }
        />
      </div>

      {/* Recipients card */}
      <div className="px-4 pt-3">
        <div className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_3px_hsl(var(--foreground)/0.07)]">
          <div className="flex items-center gap-2 px-4">
            <span className="shrink-0 text-[14px] font-semibold">{tx("To")}:</span>
            <Input
              dir="ltr"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com"
              className="h-12 flex-1 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="h-px bg-foreground/[0.06]" />
          <div className="flex items-center gap-2 px-4">
            <span className="shrink-0 text-[14px] font-semibold">{tx("Subject")}:</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-12 flex-1 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <p className="mt-2 px-2 text-[11.5px] text-foreground/40" dir="ltr">
          {from}
        </p>
      </div>

      {/* Body card with iOS toolbar */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
        <div className="flex min-h-[320px] flex-col rounded-[22px] bg-card p-4 shadow-[0_1px_3px_hsl(var(--foreground)/0.07)]">
          <Textarea
            rows={10}
            placeholder={tx("Write your message…")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[200px] flex-1 resize-none border-0 bg-transparent px-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-0 rounded-full bg-foreground/[0.04] px-1 py-1 text-foreground/65">
              <span className="grid h-9 w-9 place-items-center rounded-full">
                <span className="contents">
                  <Paperclip className="h-[17px] w-[17px]" />
                </span>
              </span>
              <span className="h-5 w-px bg-foreground/10" />
              <span className="grid h-9 w-9 place-items-center rounded-full">
                <span className="contents">
                  <TypeIcon className="h-[17px] w-[17px]" />
                </span>
              </span>
              <span className="h-5 w-px bg-foreground/10" />
              <span className="grid h-9 w-9 place-items-center rounded-full">
                <span className="contents">
                  <PenLine className="h-[17px] w-[17px]" />
                </span>
              </span>
            </div>
            <button
              type="button"
              disabled={busy || !to.trim()}
              onClick={() => void submit()}
              aria-label={tx("Send")}
              className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 disabled:opacity-40"
            >
              <span className="contents">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 rtl:rotate-180" />}
              </span>
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
