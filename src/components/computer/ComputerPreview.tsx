import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { useLongRun } from "@/hooks/useLongRun";
import { clearActiveComputerRun, setActiveComputerRun } from "@/lib/computer/activeRun";

function formatElapsed(from?: string | null): string {
  if (!from) return "0m";
  const ms = Date.now() - Date.parse(from);
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Computer surface, split into clearly separate blocks:
 *   1. the live screen card (only while the task runs),
 *   2. the step / thinking trace (one live line, expandable to the full list),
 *   3. the final plain-text answer, rendered outside any card.
 */
export function ComputerPreview({
  runId,
  plan,
  onClose,
}: {
  runId: string;
  plan?: string[];
  onClose?: () => void;
}) {
  const { run, events, stop } = useLongRun(runId);
  const [control, setControl] = useState(false);
  const [openSteps, setOpenSteps] = useState(false);
  const [full, setFull] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const summarizedRef = useRef(false);
  const [, force] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const active = run?.status === "running" || run?.status === "queued" || run?.status === "paused";
  const finished = !!run && !active;
  const failed = run?.status === "error" || run?.status === "canceled";

  useEffect(() => {
    if (active) setActiveComputerRun(runId);
    else if (finished) clearActiveComputerRun(runId);
  }, [active, finished, runId]);
  useEffect(() => () => clearActiveComputerRun(runId), [runId]);
  useEffect(() => {
    if (finished) setFull(false);
  }, [finished]);

  const url = useMemo(() => {
    if (!run?.live_view_url || finished) return null;
    return control ? run.live_view_url : `${run.live_view_url}?view_only=true`;
  }, [run?.live_view_url, control, finished]);

  const rawOutput =
    (run?.result && (run.result.output as string | null)) ||
    (run?.status === "error" ? run?.error : null) ||
    null;

  // Model-written wrap-up, generated once when the run settles.
  useEffect(() => {
    if (!finished || summarizedRef.current || !run) return;
    summarizedRef.current = true;
    void (async () => {
      try {
        const { generateRunSummary } = await import("@/lib/computer/narration");
        const text = await generateRunSummary({
          task: run.goal || "",
          steps: events.map((e) => (e.detail ? `${e.title} — ${e.detail}` : e.title)),
          output: rawOutput,
          failed,
          conversationId: (run as { conversation_id?: string | null }).conversation_id ?? null,
        });
        if (text) setSummary(text);
      } catch {
        /* fall back to the raw output below */
      }
    })();
  }, [finished, run, events, rawOutput, failed]);

  const finalText =
    summary ||
    rawOutput ||
    (run?.status === "canceled" ? "تم إيقاف المهمة." : null);

  const lastStep = events.length ? events[events.length - 1] : null;
  const headline = active
    ? run?.status_text || lastStep?.title || "بيشغّل الكمبيوتر…"
    : run?.status === "error"
      ? "المهمة توقفت"
      : run?.status === "canceled"
        ? "تم الإيقاف"
        : "تم إكمال المهمة";

  const traceLines: string[] = events.length
    ? events.map((e) => (e.detail ? `${e.title} — ${e.detail}` : e.title))
    : (plan ?? []);

  return (
    <div className="flex flex-col gap-3">
      {/* 0 — plan, before any step arrives */}
      {active && !events.length && (plan?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5 border-s border-border/40 ps-3">
          {plan!.map((step, i) => (
            <div key={i} className="text-[12.5px] leading-relaxed text-muted-foreground">
              {step}
            </div>
          ))}
        </div>
      )}

      {/* 1 — live screen */}
      {!finished && (
        <div
          className={
            full
              ? "fixed inset-0 z-50 flex flex-col bg-background"
              : "overflow-hidden rounded-2xl border border-border/50 bg-card/40"
          }
        >
          <div className="flex items-center gap-2 px-3 py-2 text-[12px]">
            <span className="font-medium">حاسوب ميغسي</span>
            <span className="text-muted-foreground">{formatElapsed(run?.created_at)}</span>
            <button
              type="button"
              onClick={() => setControl((v) => !v)}
              className={`ms-auto rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                control
                  ? "bg-[var(--megsy-blue,#3b82f6)]/15 text-[var(--megsy-blue,#3b82f6)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {control ? "عرض فقط" : "السيطرة"}
            </button>
            <button
              type="button"
              onClick={() => setFull((v) => !v)}
              aria-label={full ? "تصغير" : "ملء الشاشة"}
              className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            >
              {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            {active && (
              <button
                type="button"
                onClick={() => void stop()}
                className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                إيقاف
              </button>
            )}
          </div>
          <div className={`relative w-full bg-black/80 ${full ? "flex-1" : "aspect-[16/10]"}`}>
            {url ? (
              <iframe
                key={url}
                src={url}
                title="Megsy Computer live view"
                className="absolute inset-0 h-full w-full border-0"
                allow="clipboard-read; clipboard-write"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center px-6 text-center text-[12px] text-white/60">
                {run?.error || "بيجهّز الشاشة…"}
              </div>
            )}
            {!control && url && <div className="absolute inset-0" aria-hidden />}
          </div>
          {/* current step, right under the screen */}
          {active && (
            <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--megsy-blue,#3b82f6)]" />
              <span className="truncate">{headline}</span>
              {events.length > 0 && (
                <span className="ms-auto shrink-0 tabular-nums opacity-60">
                  {events.length}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2 — steps / thinking */}
      <div>
        <div className="flex items-center gap-2 py-0.5">
          {active ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--megsy-blue,#3b82f6)]" />
          ) : run?.status === "done" ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
          )}
          <span
            className={`truncate text-[13px] ${
              active
                ? "ai-shimmer font-medium motion-reduce:animate-none"
                : "text-muted-foreground"
            }`}
            aria-live="polite"
          >
            {headline}
          </span>
          {traceLines.length > 0 && (
            <button
              type="button"
              onClick={() => setOpenSteps((v) => !v)}
              aria-expanded={openSteps}
              aria-label="خطوات التنفيذ"
              className="ms-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${openSteps ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>

        {openSteps && traceLines.length > 0 && (
          <div className="mt-1.5 max-h-72 overflow-y-auto">
            <div className="flex flex-col gap-2 border-s border-border/40 ps-3">
              {traceLines.map((line, i) => (
                <div
                  key={`${i}-${line.slice(0, 24)}`}
                  className="text-[12.5px] leading-relaxed text-muted-foreground"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3 — final answer, plain text outside any card */}
      {finished && finalText && (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
          {finalText}
        </p>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          إغلاق
        </button>
      )}
    </div>
  );
}

export default ComputerPreview;
