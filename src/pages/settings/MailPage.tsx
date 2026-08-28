/** @doc Megsy Mail — clean mailbox: inbox, sent, spam, trash, full reader, compose, reply & AI explain. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Copy,
  CornerUpLeft,
  Forward,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
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

const FOLDERS: { key: MailFolder; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "sent", label: "Sent", icon: Send },
  { key: "spam", label: "Spam", icon: ShieldAlert },
  { key: "trash", label: "Trash", icon: Trash2 },
];

interface Draft {
  to: string;
  subject: string;
  text: string;
}

function initials(addr: string) {
  const name = (addr || "?").replace(/[<>]/g, "").split("@")[0];
  return (name.trim()[0] || "?").toUpperCase();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "2-digit", month: "short" });
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

  const Header = (
    <div className="rounded-3xl border border-foreground/10 bg-foreground/[0.03] p-4">
      <div className="flex items-center gap-3">
        <div className="grid place-items-center w-10 h-10 rounded-2xl bg-foreground/[0.06]">
          <Mail className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-foreground/50">{tx("Your Megsy address")}</p>
          <p className="text-[15px] font-medium truncate" dir="ltr">
            {box?.address ?? "…"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={tx("Copy address")}
          onClick={() => {
            if (!box) return;
            void navigator.clipboard.writeText(box.address);
            toast.success(tx("Copied"));
          }}
        >
          <Copy className="w-4 h-4" />
        </Button>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-foreground/55">
        {tx(
          "This inbox belongs to you and to Megsy. The assistant can send mail and read replies here when you ask it to sign up for a service or follow up on something.",
        )}
      </p>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={() => setDraft({ to: "", subject: "", text: "" })}>
          <Send className="w-4 h-4" />
          <span>{tx("New message")}</span>
        </Button>
        <Button variant="outline" size="icon" aria-label={tx("Refresh")} onClick={() => void refresh(folder)}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );

  const Tabs = (
    <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
      {FOLDERS.map((f) => {
        const Icon = f.icon;
        const active = folder === f.key;
        return (
          <button
            key={f.key}
            onClick={() => setFolder(f.key)}
            className={`inline-flex items-center gap-2 shrink-0 rounded-full px-3.5 py-2 text-[13px] border transition-colors ${
              active
                ? "bg-foreground/[0.08] border-foreground/20"
                : "bg-foreground/[0.02] border-foreground/10 hover:bg-foreground/[0.05]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{tx(f.label)}</span>
            {f.key === "inbox" && folder === "inbox" && unread > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 text-[11px]">{unread}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const List = (
    <div className="mt-4 rounded-3xl border border-foreground/10 overflow-hidden divide-y divide-foreground/[0.06]">
      {loading && (
        <div className="p-10 grid place-items-center text-foreground/50">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="p-10 text-center text-[13px] text-foreground/50">{tx("No messages here")}</p>
      )}
      {!loading &&
        items.map((m) => {
          const who = folder === "sent" ? m.to_address : m.from_name || m.from_address;
          return (
            <button
              key={m.id}
              onClick={() => void openMessage(m)}
              className="w-full text-start px-4 py-3 hover:bg-foreground/[0.03] transition-colors flex gap-3"
            >
              <span className="mt-0.5 grid place-items-center w-9 h-9 shrink-0 rounded-full bg-foreground/[0.07] text-[13px] font-semibold">
                {initials(folder === "sent" ? m.to_address : m.from_address)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {m.origin === "ai" && <Bot className="w-3.5 h-3.5 text-primary shrink-0" />}
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      m.is_read ? "text-foreground/70" : "font-semibold"
                    }`}
                  >
                    {who}
                  </span>
                  <span className="text-[11px] text-foreground/40 shrink-0">{fmtDate(m.created_at)}</span>
                </span>
                <span className={`mt-0.5 block truncate text-[13.5px] ${m.is_read ? "" : "font-semibold"}`}>
                  {m.subject || tx("(no subject)")}
                </span>
                <span className="block truncate text-[12px] text-foreground/50">{m.snippet}</span>
              </span>
            </button>
          );
        })}
    </div>
  );

  const Body = (
    <section className="pb-10">
      {Header}
      {Tabs}
      {List}
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
        <header className="mb-6 flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label={tx("Back")} onClick={() => navigate("/settings")}>
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          </Button>
          <h1 className="text-[28px] font-semibold tracking-tight">{tx("Mail")}</h1>
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
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/50 backdrop-blur-sm p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-foreground/10 bg-background p-5"
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
    body{margin:0;padding:0;font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#111;background:#fff;word-break:break-word}
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
      setHeight(Math.min(Math.max(d.h + 16, 120), 4000));
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
      className="mt-4 w-full rounded-2xl border border-foreground/10 bg-white"
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

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold leading-snug">{msg.subject || tx("(no subject)")}</h2>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-foreground/[0.07] text-[12px] font-semibold">
              {initials(msg.from_address)}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate" dir="ltr">
                {msg.from_name || msg.from_address}
              </p>
              <p className="text-[11.5px] text-foreground/50 truncate" dir="ltr">
                {tx("To")}: {msg.to_address} · {new Date(msg.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label={tx("Close")} onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {msg.body_html ? (
        <HtmlBody html={msg.body_html} />
      ) : (
        <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed">{msg.body_text}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onReply(msg)}>
          <CornerUpLeft className="w-4 h-4 rtl:rotate-180" />
          {tx("Reply")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onForward(msg)}>
          <Forward className="w-4 h-4 rtl:rotate-180" />
          {tx("Forward")}
        </Button>
        <Button variant="outline" size="sm" disabled={explaining} onClick={() => void explain()}>
          {explaining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {tx("Explain with AI")}
        </Button>
      </div>

      {explanation && (
        <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            {tx("Megsy's summary")}
          </p>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{explanation}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-foreground/10 pt-4">
        {folder !== "spam" && (
          <Button variant="ghost" size="sm" onClick={() => onAct(msg, "spam")}>
            {tx("Mark as spam")}
          </Button>
        )}
        {folder === "spam" && (
          <Button variant="ghost" size="sm" onClick={() => onAct(msg, "inbox")}>
            {tx("Not spam")}
          </Button>
        )}
        {folder !== "trash" ? (
          <Button variant="ghost" size="sm" onClick={() => onAct(msg, "trash")}>
            {tx("Move to trash")}
          </Button>
        ) : (
          <Button variant="destructive" size="sm" onClick={() => onAct(msg, "delete")}>
            {tx("Delete forever")}
          </Button>
        )}
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
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[17px] font-semibold">{tx("New message")}</h2>
        <Button variant="ghost" size="icon" aria-label={tx("Close")} onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <p className="mt-1 text-[12px] text-foreground/55">
        {tx("From")}: <span dir="ltr">{from}</span>
      </p>
      <div className="mt-4 space-y-3">
        <Input dir="ltr" placeholder={tx("To")} value={to} onChange={(e) => setTo(e.target.value)} />
        <Input placeholder={tx("Subject")} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          rows={9}
          placeholder={tx("Write your message…")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button className="w-full" disabled={busy || !to.trim()} onClick={() => void submit()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>{tx("Send")}</span>
        </Button>
      </div>
    </Sheet>
  );
}
