/** @doc Megsy Mail — full mailbox page: inbox, spam, sent, trash + compose. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Copy,
  Inbox,
  Loader2,
  Mail,
  Send,
  ShieldAlert,
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
import {
  deleteForever,
  ensureMailbox,
  listMail,
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
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureMailbox()
      .then((b) => alive && setBox(b))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(
    async (f: MailFolder) => {
      setLoading(true);
      try {
        setItems(await listMail(f));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (box) void refresh(folder);
  }, [box, folder, refresh]);

  const unread = useMemo(
    () => items.filter((m) => !m.is_read && folder === "inbox").length,
    [items, folder],
  );

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

  const Header = (
    <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
      <div className="flex items-center gap-3">
        <div className="grid place-items-center w-10 h-10 rounded-xl bg-foreground/[0.06]">
          <Mail className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-foreground/50">{tx("Your Megsy address")}</p>
          <p className="text-[15px] font-medium truncate">{box?.address ?? "…"}</p>
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
      <Button className="mt-3 w-full" onClick={() => setComposing(true)}>
        <Send className="w-4 h-4" />
        <span>{tx("New message")}</span>
      </Button>
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
            {f.key === "inbox" && unread > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 text-[11px]">{unread}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const List = (
    <div className="mt-4 rounded-2xl border border-foreground/10 overflow-hidden divide-y divide-foreground/[0.06]">
      {loading && (
        <div className="p-8 grid place-items-center text-foreground/50">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="p-8 text-center text-[13px] text-foreground/50">{tx("No messages here")}</p>
      )}
      {!loading &&
        items.map((m) => (
          <button
            key={m.id}
            onClick={() => void openMessage(m)}
            className="w-full text-start px-4 py-3 hover:bg-foreground/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2">
              {m.origin === "ai" && <Bot className="w-3.5 h-3.5 text-primary shrink-0" />}
              <p
                className={`min-w-0 flex-1 truncate text-[13px] ${
                  m.is_read ? "text-foreground/70" : "font-semibold"
                }`}
              >
                {folder === "sent" ? m.to_address : m.from_address}
              </p>
              <span className="text-[11px] text-foreground/40 shrink-0">
                {new Date(m.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[13.5px]">{m.subject || tx("(no subject)")}</p>
            <p className="truncate text-[12px] text-foreground/50">{m.snippet}</p>
          </button>
        ))}
    </div>
  );

  const Body = (
    <section className="pb-10">
      {Header}
      {Tabs}
      {List}
      {open && (
        <MessageView msg={open} tx={tx} onClose={() => setOpen(null)} onAct={act} folder={folder} />
      )}
      {composing && (
        <Composer
          tx={tx}
          from={box?.address ?? ""}
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
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
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/50 p-0 sm:p-6" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-foreground/10 bg-background p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function MessageView({
  msg,
  tx,
  onClose,
  onAct,
  folder,
}: {
  msg: MailMessage;
  tx: (s: string) => string;
  onClose: () => void;
  onAct: (m: MailMessage, target: MailFolder | "delete") => void;
  folder: MailFolder;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold">{msg.subject || tx("(no subject)")}</h2>
          <p className="mt-1 text-[12px] text-foreground/55 truncate">
            {msg.from_address} → {msg.to_address}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={tx("Close")} onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed">{msg.body_text}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {folder !== "spam" && (
          <Button variant="outline" size="sm" onClick={() => onAct(msg, "spam")}>
            {tx("Mark as spam")}
          </Button>
        )}
        {folder === "spam" && (
          <Button variant="outline" size="sm" onClick={() => onAct(msg, "inbox")}>
            {tx("Not spam")}
          </Button>
        )}
        {folder !== "trash" ? (
          <Button variant="outline" size="sm" onClick={() => onAct(msg, "trash")}>
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
  onClose,
  onSent,
}: {
  tx: (s: string) => string;
  from: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
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
        {tx("From")}: {from}
      </p>
      <div className="mt-4 space-y-3">
        <Input placeholder={tx("To")} value={to} onChange={(e) => setTo(e.target.value)} />
        <Input placeholder={tx("Subject")} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          rows={7}
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
