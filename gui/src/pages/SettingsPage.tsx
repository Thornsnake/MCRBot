import { useMemo, useState } from "react";
import {
  Bell,
  Clock,
  KeyRound,
  Lock,
  Save,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useConfig, useUpdateConfig } from "../api/hooks/useConfig";
import { extractApiError } from "../api/client";
import type { BotConfig, DiscordPostConfig } from "../api/types";
import { useToast } from "../lib/useToast";
import { ToastStack } from "../components/common/Toast";
import ChangePassword from "../components/config/ChangePassword";
import {
  ArrayEditor,
  FieldGrid,
  NumberInput,
  SectionCard,
  TextInput,
  Toggle,
  WeightEditor,
} from "../components/config/fields";

const POST_LABELS: Record<keyof DiscordPostConfig, string> = {
  INVEST: "Invest",
  REBALANCE_MARKET_CAP: "Rebalance (market cap)",
  REBALANCE_OVERPERFORMERS: "Rebalance (overperformers)",
  TRAILING_STOP: "Trailing stop",
  ARMED: "Armed",
  CONTINUE: "Continue",
};

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export default function SettingsPage() {
  const { data: config, isLoading } = useConfig();
  const updateConfig = useUpdateConfig();
  const { toasts, push, remove } = useToast();

  const [form, setForm] = useState<BotConfig | null>(null);
  // Track whether the user typed a new key/secret so we only send changed creds.
  const [apiKeyDraft, setApiKeyDraft] = useState<string | null>(null);
  const [secretDraft, setSecretDraft] = useState<string | null>(null);

  // Re-initialise the editable form whenever a freshly fetched config arrives (initial load and the
  // refetch after a save). Done during render via an identity guard rather than an effect, per the
  // React "you might not need an effect" guidance.
  const [syncedConfig, setSyncedConfig] = useState<BotConfig | null>(null);
  if (config && config !== syncedConfig) {
    setSyncedConfig(config);
    setForm(deepClone(config));
    setApiKeyDraft(null);
    setSecretDraft(null);
  }

  const allowConfig = config?.GUI?.ALLOW_CONFIG ?? true;

  const isDirty = useMemo(() => {
    if (!config || !form) return false;
    if (apiKeyDraft !== null || secretDraft !== null) return true;
    // Compare without the read-only flags / credential fields.
    const strip = (c: BotConfig) => {
      const clone = deepClone(c);
      delete clone.APIKEY_SET;
      delete clone.SECRET_SET;
      clone.APIKEY = "";
      clone.SECRET = "";
      return clone;
    };
    return JSON.stringify(strip(form)) !== JSON.stringify(strip(config));
  }, [form, config, apiKeyDraft, secretDraft]);

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-text-muted">
        Loading configuration…
      </div>
    );
  }

  /* ---- typed setters --------------------------------------------- */

  function set<K extends keyof BotConfig>(key: K, value: BotConfig[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setSchedule(key: keyof BotConfig["SCHEDULE"], value: string) {
    setForm((prev) =>
      prev ? { ...prev, SCHEDULE: { ...prev.SCHEDULE, [key]: value } } : prev,
    );
  }

  function setTrailing(key: keyof BotConfig["TRAILING_STOP"], value: number | boolean) {
    setForm((prev) =>
      prev
        ? { ...prev, TRAILING_STOP: { ...prev.TRAILING_STOP, [key]: value } }
        : prev,
    );
  }

  function setGui(key: keyof BotConfig["GUI"], value: string | number | boolean) {
    setForm((prev) =>
      prev ? { ...prev, GUI: { ...prev.GUI, [key]: value } } : prev,
    );
  }

  function setDiscord<K extends keyof BotConfig["WEBHOOKS"]["DISCORD"]>(
    key: K,
    value: BotConfig["WEBHOOKS"]["DISCORD"][K],
  ) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            WEBHOOKS: {
              ...prev.WEBHOOKS,
              DISCORD: { ...prev.WEBHOOKS.DISCORD, [key]: value },
            },
          }
        : prev,
    );
  }

  function setDiscordPost(key: keyof DiscordPostConfig, value: boolean) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            WEBHOOKS: {
              ...prev.WEBHOOKS,
              DISCORD: {
                ...prev.WEBHOOKS.DISCORD,
                POST: { ...prev.WEBHOOKS.DISCORD.POST, [key]: value },
              },
            },
          }
        : prev,
    );
  }

  /* ---- save ------------------------------------------------------ */

  function handleSave() {
    if (!form) return;

    // Build the payload: full config minus read-only flags and untouched creds.
    const payload = deepClone(form);
    delete payload.APIKEY_SET;
    delete payload.SECRET_SET;

    // Only include credentials the user actually changed.
    if (apiKeyDraft !== null) {
      payload.APIKEY = apiKeyDraft;
    } else {
      delete (payload as Partial<BotConfig>).APIKEY;
    }
    if (secretDraft !== null) {
      payload.SECRET = secretDraft;
    } else {
      delete (payload as Partial<BotConfig>).SECRET;
    }

    updateConfig.mutate(payload, {
      onSuccess: (res) => {
        push("Configuration saved.", "success");
        for (const w of res.warnings ?? []) push(w, "warning");
        setApiKeyDraft(null);
        setSecretDraft(null);
      },
      onError: (err) => {
        push(extractApiError(err, "Failed to save configuration"), "error");
      },
    });
  }

  const discord = form.WEBHOOKS.DISCORD;

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
          <p className="text-sm text-text-muted">
            Bot configuration — applied live on the next cycle
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateConfig.isPending || !isDirty || !allowConfig}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-blue/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {updateConfig.isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {!allowConfig && (
        <div className="rounded-lg border border-accent-yellow/30 bg-accent-yellow/10 px-4 py-3 text-sm text-accent-yellow">
          Configuration editing is disabled (GUI.ALLOW_CONFIG = false). Changes
          cannot be saved.
        </div>
      )}

      {/* Credentials */}
      <SectionCard
        title="API Credentials"
        description="Crypto.com Exchange API key & secret, plus CoinGecko key"
        icon={<KeyRound className="h-4 w-4" />}
      >
        <FieldGrid>
          <TextInput
            label="API Key"
            value={apiKeyDraft ?? form.APIKEY}
            onChange={(v) => setApiKeyDraft(v)}
            placeholder={form.APIKEY_SET ? "Key is set" : "Not set"}
            mono
            hint={form.APIKEY_SET ? "Leave masked value to keep current key" : "No key set"}
          />
          <TextInput
            label="API Secret"
            value={secretDraft ?? (form.SECRET_SET ? "********" : "")}
            onChange={(v) => setSecretDraft(v)}
            type="password"
            placeholder={form.SECRET_SET ? "Secret is set" : "Not set"}
            hint={form.SECRET_SET ? "Leave blank to keep current secret" : "No secret set"}
          />
          <TextInput
            label="CoinGecko API Key"
            value={form.COINGECKO_API_KEY}
            onChange={(v) => set("COINGECKO_API_KEY", v)}
            mono
            placeholder="Optional"
          />
        </FieldGrid>
      </SectionCard>

      {/* Strategy */}
      <SectionCard
        title="Strategy"
        description="Market-cap rebalancing parameters"
        icon={<SlidersHorizontal className="h-4 w-4" />}
      >
        <FieldGrid>
          <TextInput
            label="Quote Currency"
            value={form.QUOTE}
            onChange={(v) => set("QUOTE", v.toUpperCase())}
            mono
            hint="e.g. USD, USDT"
          />
          <NumberInput
            label="Investment per cycle"
            value={form.INVESTMENT}
            onChange={(v) => set("INVESTMENT", v)}
            step="0.01"
            min={0}
            hint="Amount in quote currency"
          />
          <NumberInput
            label="Top N coins"
            value={form.TOP}
            onChange={(v) => set("TOP", Math.round(v))}
            step="1"
            min={1}
            hint="Market-cap rank cutoff"
          />
          <NumberInput
            label="Removal grace (hours)"
            value={form.REMOVAL}
            onChange={(v) => set("REMOVAL", v)}
            step="1"
            min={0}
            hint="Hours before dropped coins are sold"
          />
          <NumberInput
            label="Rebalance threshold (%)"
            value={form.THRESHOLD}
            onChange={(v) => set("THRESHOLD", v)}
            step="0.1"
            min={0}
            hint="Deviation needed to trigger a rebalance"
          />
        </FieldGrid>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ArrayEditor
            label="Include"
            description="Always hold these coins regardless of rank"
            values={form.INCLUDE}
            onChange={(v) => set("INCLUDE", v)}
          />
          <ArrayEditor
            label="Exclude"
            description="Never hold these coins"
            values={form.EXCLUDE}
            onChange={(v) => set("EXCLUDE", v)}
          />
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Fixed Weights
          </h3>
          <WeightEditor
            weights={form.WEIGHT}
            onChange={(w) => set("WEIGHT", w)}
          />
        </div>
      </SectionCard>

      {/* Schedules */}
      <SectionCard
        title="Schedules"
        description="Cron expressions controlling when the bot runs"
        icon={<Clock className="h-4 w-4" />}
      >
        <FieldGrid>
          <TextInput
            label="Trailing stop check"
            value={form.SCHEDULE.TRAILING_STOP}
            onChange={(v) => setSchedule("TRAILING_STOP", v)}
            mono
          />
          <TextInput
            label="Investing"
            value={form.SCHEDULE.INVESTING}
            onChange={(v) => setSchedule("INVESTING", v)}
            mono
          />
          <TextInput
            label="Rebalance"
            value={form.SCHEDULE.REBALANCE}
            onChange={(v) => setSchedule("REBALANCE", v)}
            mono
          />
        </FieldGrid>
      </SectionCard>

      {/* Trailing stop */}
      <SectionCard
        title="Trailing Stop"
        description="Protect profits by exiting to cash after a drawdown"
        icon={<Shield className="h-4 w-4" />}
      >
        <div className="mb-4">
          <Toggle
            label="Enable trailing stop"
            description="Arm once minimum profit is reached"
            checked={form.TRAILING_STOP.ACTIVE}
            onChange={(v) => setTrailing("ACTIVE", v)}
          />
        </div>
        <FieldGrid>
          <NumberInput
            label="Min profit (%)"
            value={form.TRAILING_STOP.MIN_PROFIT}
            onChange={(v) => setTrailing("MIN_PROFIT", v)}
            step="0.1"
            min={0}
            hint="Profit needed before arming"
          />
          <NumberInput
            label="Max drop (%)"
            value={form.TRAILING_STOP.MAX_DROP}
            onChange={(v) => setTrailing("MAX_DROP", v)}
            step="0.1"
            min={0}
            hint="Drawdown from ATH that triggers exit"
          />
          <NumberInput
            label="Resume after (hours)"
            value={form.TRAILING_STOP.RESUME}
            onChange={(v) => setTrailing("RESUME", v)}
            step="1"
            min={0}
            hint="Cooldown before re-entering"
          />
        </FieldGrid>
      </SectionCard>

      {/* Webhooks */}
      <SectionCard
        title="Discord Webhook"
        description="Notifications posted to a Discord channel"
        icon={<Bell className="h-4 w-4" />}
      >
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Toggle
            label="Enable Discord notifications"
            checked={discord.ACTIVE}
            onChange={(v) => setDiscord("ACTIVE", v)}
          />
          <TextInput
            label="Webhook URL"
            value={discord.URL}
            onChange={(v) => setDiscord("URL", v)}
            mono
            placeholder="https://discord.com/api/webhooks/…"
          />
        </div>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Post events
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(POST_LABELS) as (keyof DiscordPostConfig)[]).map(
            (key) => (
              <Toggle
                key={key}
                label={POST_LABELS[key]}
                checked={discord.POST[key]}
                onChange={(v) => setDiscordPost(key, v)}
              />
            ),
          )}
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <TextInput
            label="Idle message"
            value={form.IDLE_MESSAGE}
            onChange={(v) => set("IDLE_MESSAGE", v)}
          />
        </div>
      </SectionCard>

      {/* System + GUI */}
      <SectionCard
        title="System"
        description="Updates, dry-run, and dashboard server settings"
        icon={<SettingsIcon className="h-4 w-4" />}
      >
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Toggle
            label="Dry run"
            description="Simulate trades without executing"
            checked={form.DRY}
            onChange={(v) => set("DRY", v)}
          />
          <Toggle
            label="Auto update"
            description="Pull and apply bot updates automatically"
            checked={form.AUTO_UPDATE}
            onChange={(v) => set("AUTO_UPDATE", v)}
          />
          <Toggle
            label="GUI active"
            description="Serve this dashboard"
            checked={form.GUI.ACTIVE}
            onChange={(v) => setGui("ACTIVE", v)}
          />
          <Toggle
            label="Allow config editing"
            description="Permit changes from this dashboard"
            checked={form.GUI.ALLOW_CONFIG}
            onChange={(v) => setGui("ALLOW_CONFIG", v)}
          />
        </div>
        <FieldGrid>
          <TextInput
            label="GUI host"
            value={form.GUI.HOST}
            onChange={(v) => setGui("HOST", v)}
            mono
          />
          <NumberInput
            label="GUI port"
            value={form.GUI.PORT}
            onChange={(v) => setGui("PORT", Math.round(v))}
            step="1"
            min={1}
          />
          <NumberInput
            label="Poll interval (s)"
            value={form.GUI.POLL_INTERVAL}
            onChange={(v) => setGui("POLL_INTERVAL", Math.round(v))}
            step="1"
            min={20}
            hint="Live heatmap refresh rate (min 20s)"
          />
        </FieldGrid>
      </SectionCard>

      {/* Security */}
      <SectionCard
        title="Security"
        description="Change your dashboard password"
        icon={<Lock className="h-4 w-4" />}
      >
        <ChangePassword onResult={(m, t) => push(m, t)} />
      </SectionCard>

      <ToastStack toasts={toasts} onClose={remove} />
    </div>
  );
}
