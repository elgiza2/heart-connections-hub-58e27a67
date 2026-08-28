/** @doc Megsy Mail — minimal mail client (Superhuman/Apple Mail feel): inbox, sent, spam, trash, reader, compose, AI explain. */
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
  Loader2,
  PenLine,
  RefreshCw,
  Search as SearchIcon,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import DesktopSettingsLayout from "@/components/settings/DesktopSettingsLayout";
import ProfileGlassShell from "@/components/profile/ProfileGlassShell";
import { Button } from "@/components/ui/button";
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

  const copyAddress = () => {
    if (!box) return;
    void navigator.clipboard.writeText(box.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  /* ── Address bar: one quiet line, no heavy card ── */
  const AddressBar = (
    <button
      type="button"
      onClick={copyAddress}
      className="group flex w-full items-center gap-2 text-start"
      aria-label={tx("Copy address")}
    >
      <span className="min-w-0 truncate text-[13px] text-foreground/55" dir="ltr">
        {box?.address ?? "…"}
      </span>
      <span className="shrink-0 text-foreground/35 transition-colors group-hover:text-foreground/70">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </span>
    </button>
  );

  /* ── Search: hairline field, no chrome ── */
  const Search = (
    <div className="flex h-10 items-center gap-2.5 rounded-xl bg-foreground/[0.045] px-3.5">
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
  );

  /* ── Folders: text-only segmented rail ── */
  const Tabs = (
    <div className="flex items-center gap-5 overflow-x-auto no-scrollbar border-b border-foreground/[0.08]">
      {FOLDERS.map((f) => {
        const active = folder === f.key;
        return (
          <button
            key={f.key}
            onClick={() => setFolder(f.key)}
            className={`relative shrink-0 pb-2.5 text-[13.5px] transition-colors ${
              active ? "text-foreground" : "text-foreground/45 hover:text-foreground/70"
            }`}
          >
            <span className={active ? "font-semibold" : ""}>{tx(f.label)}</span>
            {f.key === "inbox" && unread > 0 && (
              <span className="ms-1.5 text-[11.5px] tabular-nums text-foreground/40">{unread}</span>
            )}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-foreground" />
            )}
          </button>
        );
      })}
    </div>
  );

  /* ── List: airy rows, hairline dividers, quiet typography ── */
  const List = (
    <div>
      {loading && (
        <div className="grid place-items-center py-16 text-foreground/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {!loading && visible.length === 0 && (
        <p className="py-16 text-center text-[13.5px] text-foreground/40">{tx("No messages here")}</p>
      )}
      {!loading &&
        visible.map((m) => {
          const addr = folder === "sent" ? m.to_address : m.from_address;
          const who = displayName(folder === "sent" ? null : m.from_name, addr);
          return (
            <button
              key={m.id}
              onClick={() => void openMessage(m)}
              className="group flex w-full gap-3 border-b border-foreground/[0.06] py-3.5 text-start transition-colors hover:bg-foreground/[0.025]"
            >
              <span className="relative mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-[11px] font-semibold text-foreground/70">
                {initials(who)}
                {!m.is_read && (
                  <span className="absolute -start-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-[14px] ${
                      m.is_read ? "font-medium text-foreground/75" : "font-semibold text-foreground"
                    }`}
                  >
                    {who}
                  </span>
                  {m.origin === "ai" && <Bot className="h-3.5 w-3.5 shrink-0 self-center text-foreground/35" />}
                  <span className="shrink-0 text-[11.5px] tabular-nums text-foreground/35">
                    {fmtDate(m.created_at)}
                  </span>
                </span>
                <span
                  className={`mt-0.5 block truncate text-[13.5px] ${
                    m.is_read ? "text-foreground/70" : "font-medium text-foreground"
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
  );

  const Body = (
    <section className="pb-24">
      <div className="space-y-3.5">
        {AddressBar}
        {Search}
        {Tabs}
      </div>
      {List}

      {/* Compose: floating, single primary action */}
      <button
        type="button"
        onClick={() => setDraft({ to: "", subject: "", text: "" })}
        className="fixed bottom-24 end-5 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background shadow-lg shadow-foreground/20 transition-transform hover:scale-[1.03] md:bottom-8"
      >
        <PenLine className="h-4 w-4" />
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
      className="grid h-9 w-9 place-items-center rounded-full text-foreground/50 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
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
        <div className="mb-1 flex justify-end">{RefreshBtn}</div>
        {Body}
      </ProfileGlassShell>
    );
  }
  return (
    <DesktopSettingsLayout>
      <div className="mx-auto w-full max-w-2xl px-4 md:px-0">
        <header className="mb-6 flex items-center gap-3">
          <BackButton label={tx("Back")} onClick={() => navigate("/settings")} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-semibold leading-tight tracking-tight">{tx("Mail")}</h1>
            <p className="truncate text-[12.5px] text-foreground/45" dir="ltr">
              {box?.address ?? "…"}
            </p>
          </div>
          {RefreshBtn}
        </header>
        {Body}
      </div>
    </DesktopSettingsLayout>
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
      <ArrowLeft className="h-[18px] w-[18px] rtl:rotate-180" />
    </button>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Rendered in a portal: settings pages apply global CSS that collapses
  // icon-bearing controls, and the overlay must escape that scope.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/40 backdrop-blur-[2px] sm:place-items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-foreground/10 bg-background sm:max-w-2xl sm:rounded-[24px]"
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
      {/* Sticky toolbar */}
      <div className="flex items-center gap-1 border-b border-foreground/[0.08] px-3 py-2">
        <button
          type="button"
          aria-label={tx("Close")}
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/[0.06]"
        >
          <span className="contents">
            <X className="h-4 w-4" />
          </span>
        </button>
        <div className="flex-1" />
        {folder !== "spam" ? (
          <button
            type="button"
            onClick={() => onAct(msg, "spam")}
            className="rounded-full px-3 py-1.5 text-[12.5px] text-foreground/55 transition-colors hover:bg-foreground/[0.06]"
          >
            {tx("Mark as spam")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onAct(msg, "inbox")}
            className="rounded-full px-3 py-1.5 text-[12.5px] text-foreground/55 transition-colors hover:bg-foreground/[0.06]"
          >
            {tx("Not spam")}
          </button>
        )}
        {folder !== "trash" ? (
          <button
            type="button"
            onClick={() => onAct(msg, "trash")}
            className="rounded-full px-3 py-1.5 text-[12.5px] text-foreground/55 transition-colors hover:bg-foreground/[0.06]"
          >
            {tx("Move to trash")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onAct(msg, "delete")}
            className="rounded-full px-3 py-1.5 text-[12.5px] text-destructive transition-colors hover:bg-destructive/10"
          >
            {tx("Delete forever")}
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        <h2 className="text-[21px] font-semibold leading-snug tracking-tight">
          {msg.subject || tx("(no subject)")}
        </h2>

        <div className="mt-3.5 flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-[12px] font-semibold text-foreground/70">
            {initials(who)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium" dir="ltr">
              {who}
            </p>
            <p className="truncate text-[11.5px] text-foreground/45" dir="ltr">
              {msg.from_address}
            </p>
          </div>
          <span className="shrink-0 text-[11.5px] text-foreground/40">
            {new Date(msg.created_at).toLocaleString()}
          </span>
        </div>

        <div className="my-5 h-px bg-foreground/[0.08]" />

        {msg.body_html ? (
          <HtmlBody html={msg.body_html} />
        ) : (
          <p className="whitespace-pre-wrap text-[14.5px] leading-[1.75]">{msg.body_text}</p>
        )}

        {explanation && (
          <div className="mt-6 rounded-2xl bg-foreground/[0.04] p-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-foreground/60">
              <Sparkles className="h-3.5 w-3.5" />
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
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[13.5px] font-semibold text-background transition-opacity hover:opacity-90"
        >
          <CornerUpLeft className="h-4 w-4 rtl:rotate-180" />
          {tx("Reply")}
        </button>
        <button
          type="button"
          onClick={() => onForward(msg)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-foreground/12 px-4 text-[13.5px] text-foreground/75 transition-colors hover:bg-foreground/[0.05]"
        >
          <Forward className="h-4 w-4 rtl:rotate-180" />
          {tx("Forward")}
        </button>
        <button
          type="button"
          disabled={explaining}
          onClick={() => void explain()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-foreground/12 px-4 text-[13.5px] text-foreground/75 transition-colors hover:bg-foreground/[0.05] disabled:opacity-60"
        >
          {explaining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
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
      <div className="flex items-center gap-2 border-b border-foreground/[0.08] px-4 py-2.5">
        <button
          type="button"
          aria-label={tx("Close")}
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/[0.06]"
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
          className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span>{tx("Send")}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-3 border-b border-foreground/[0.07] py-2.5">
          <span className="w-14 shrink-0 text-[12.5px] text-foreground/40">{tx("From")}</span>
          <span className="min-w-0 truncate text-[13.5px] text-foreground/70" dir="ltr">
            {from}
          </span>
        </div>
        <div className="flex items-center gap-3 border-b border-foreground/[0.07] py-1">
          <span className="w-14 shrink-0 text-[12.5px] text-foreground/40">{tx("To")}</span>
          <Input
            dir="ltr"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 flex-1 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-3 border-b border-foreground/[0.07] py-1">
          <span className="w-14 shrink-0 text-[12.5px] text-foreground/40">{tx("Subject")}</span>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-9 flex-1 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          />
        </div>
        <Textarea
          rows={12}
          placeholder={tx("Write your message…")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-3 resize-none border-0 bg-transparent px-0 text-[14.5px] leading-relaxed shadow-none focus-visible:ring-0"
        />
      </div>
    </Sheet>
  );
}
