/**
 * RegionStage — first onboarding panel.
 *
 * The visitor picks the edition they belong to. This is NOT just a UI language
 * switch: it also decides the billing gateway used for every future checkout
 * (Kashier — Vodafone Cash / local wallets / EGP cards — for the Arabic
 * edition, Dodo Payments — international cards & wallets — for the global one).
 */
import { CreditCard, Globe, Smartphone, Wallet } from "lucide-react";
import type { PayRegion } from "@/lib/payRegion";

type Option = {
  id: PayRegion;
  title: string;
  subtitle: string;
  dir: "rtl" | "ltr";
  methods: { icon: typeof Wallet; label: string }[];
};

const OPTIONS: Option[] = [
  {
    id: "arab",
    title: "النسخة العربية",
    subtitle: "واجهة عربية بالكامل وطرق دفع محلية",
    dir: "rtl",
    methods: [
      { icon: Smartphone, label: "فودافون كاش" },
      { icon: Wallet, label: "المحافظ الإلكترونية" },
      { icon: CreditCard, label: "فيزا / ماستركارد بالجنيه" },
    ],
  },
  {
    id: "global",
    title: "Global edition",
    subtitle: "English interface with worldwide payment methods",
    dir: "ltr",
    methods: [
      { icon: CreditCard, label: "Visa / Mastercard / Amex" },
      { icon: Wallet, label: "Apple Pay & Google Pay" },
      { icon: Globe, label: "International currencies" },
    ],
  },
];

export default function RegionStage({
  value,
  onChange,
}: {
  value: PayRegion;
  onChange: (region: PayRegion) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {OPTIONS.map((opt, i) => {
        const on = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            dir={opt.dir}
            onClick={() => onChange(opt.id)}
            className={`fs-up ${on ? "fs-glass fs-glass-selected" : "fs-glass"}`}
            style={{
              animationDelay: `${0.18 + i * 0.06}s`,
              textAlign: opt.dir === "rtl" ? "right" : "left",
              borderRadius: 22,
              padding: "18px 18px",
              color: "#fff",
              cursor: "pointer",
              outline: on ? "1.5px solid rgba(255,255,255,0.55)" : "none",
            }}
          >
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>
              {opt.title}
            </div>
            <div
              style={{
                fontSize: 13.5,
                color: "rgba(255,255,255,0.68)",
                marginTop: 4,
                lineHeight: 1.45,
              }}
            >
              {opt.subtitle}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 14,
                justifyContent: opt.dir === "rtl" ? "flex-start" : "flex-start",
              }}
            >
              {opt.methods.map((m) => (
                <span
                  key={m.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: 999,
                    padding: "7px 11px",
                    fontSize: 12.5,
                    color: "rgba(255,255,255,0.86)",
                    background: "rgba(255,255,255,0.10)",
                  }}
                >
                  <m.icon size={14} strokeWidth={1.8} />
                  {m.label}
                </span>
              ))}
            </div>
          </button>
        );
      })}
      <p
        className="fs-up"
        style={{
          animationDelay: "0.34s",
          fontSize: 12.5,
          color: "rgba(255,255,255,0.6)",
          textAlign: "center",
          lineHeight: 1.5,
          marginTop: 2,
        }}
      >
        يحدد اختيارك لغة الموقع وطرق الدفع المتاحة لك · This sets your language and
        available payment methods
      </p>
    </div>
  );
}
