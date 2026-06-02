import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

export function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-5">
      <div className="mb-4 flex items-center gap-3">
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {description && (
            <p className="text-xs text-text-muted">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

const inputBase =
  "rounded-md border bg-surface-2 px-3 py-1.5 text-sm text-text-primary outline-none transition-colors focus:ring-1 focus:ring-accent-blue";

/* ------------------------------------------------------------------ */
/*  Inputs                                                             */
/* ------------------------------------------------------------------ */

export function NumberInput({
  label,
  value,
  onChange,
  error,
  step,
  min,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  error?: string;
  step?: string;
  min?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step ?? "any"}
        min={min}
        onChange={(e) => {
          // Clearing the field yields parseFloat("") = NaN; coerce to 0 so NaN never enters the
          // form state (it would otherwise serialize to null on save and corrupt the config).
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className={`${inputBase} font-mono ${error ? "border-accent-red" : "border-border"}`}
      />
      {hint && !error && <span className="text-xs text-text-muted">{hint}</span>}
      {error && <span className="text-xs text-accent-red">{error}</span>}
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  hint?: string;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} border-border ${mono ? "font-mono" : ""}`}
      />
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  );
}

export function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} border-border`}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-left transition-colors hover:border-border-light"
    >
      <span>
        <span className="block text-sm text-text-primary">{label}</span>
        {description && (
          <span className="block text-xs text-text-muted">{description}</span>
        )}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-accent-blue" : "bg-surface-3"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Array editor (INCLUDE / EXCLUDE)                                   */
/* ------------------------------------------------------------------ */

export function ArrayEditor({
  label,
  description,
  values,
  onChange,
  uppercase = true,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (v: string[]) => void;
  uppercase?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = uppercase ? draft.trim().toUpperCase() : draft.trim();
    if (!v || values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  }

  function remove(v: string) {
    onChange(values.filter((x) => x !== v));
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-xs text-text-secondary">{label}</span>
        {description && (
          <p className="text-xs text-text-muted">{description}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs font-medium text-text-primary"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              className="text-text-muted hover:text-accent-red"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {values.length === 0 && (
          <span className="text-xs italic text-text-muted">None</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add coin…"
          className={`${inputBase} flex-1 border-border ${uppercase ? "uppercase" : ""}`}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-border-light"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Weight map editor (coin -> percent)                               */
/* ------------------------------------------------------------------ */

export function WeightEditor({
  weights,
  onChange,
}: {
  weights: Record<string, number>;
  onChange: (w: Record<string, number>) => void;
}) {
  const [coinDraft, setCoinDraft] = useState("");
  const [pctDraft, setPctDraft] = useState("");

  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, v]) => s + (Number(v) || 0), 0);

  function setOne(coin: string, pct: number) {
    onChange({ ...weights, [coin]: pct });
  }

  function remove(coin: string) {
    const next = { ...weights };
    delete next[coin];
    onChange(next);
  }

  function add() {
    const coin = coinDraft.trim().toUpperCase();
    const pct = parseFloat(pctDraft);
    if (!coin || weights[coin] !== undefined || !isFinite(pct)) return;
    onChange({ ...weights, [coin]: pct });
    setCoinDraft("");
    setPctDraft("");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">
        Fixed weight overrides (percent of portfolio). Coins not listed are
        weighted by market cap.{" "}
        <span className={total > 100 ? "text-accent-red" : ""}>
          Assigned: {total.toFixed(1)}%
        </span>
      </p>

      <div className="flex flex-col gap-2">
        {entries.map(([coin, pct]) => (
          <div key={coin} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-sm font-medium text-text-primary">
              {coin}
            </span>
            <input
              type="number"
              step="any"
              value={Number.isFinite(pct) ? pct : 0}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                setOne(coin, Number.isFinite(n) ? n : 0);
              }}
              className={`${inputBase} w-28 border-border font-mono`}
            />
            <span className="text-xs text-text-muted">%</span>
            <button
              type="button"
              onClick={() => remove(coin)}
              className="ml-auto text-text-muted hover:text-accent-red"
              aria-label={`Remove ${coin}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <span className="text-xs italic text-text-muted">
            No fixed weights configured
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <input
          value={coinDraft}
          onChange={(e) => setCoinDraft(e.target.value)}
          placeholder="Coin"
          className={`${inputBase} w-28 border-border uppercase`}
        />
        <input
          value={pctDraft}
          onChange={(e) => setPctDraft(e.target.value)}
          type="number"
          step="any"
          placeholder="%"
          className={`${inputBase} w-24 border-border font-mono`}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-border-light"
        >
          <Plus className="h-3.5 w-3.5" /> Add weight
        </button>
      </div>
    </div>
  );
}
