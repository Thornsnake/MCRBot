interface StatusDotProps {
  connected: boolean;
  label?: string;
  size?: "sm" | "md";
  pulse?: boolean;
}

export default function StatusDot({
  connected,
  label,
  size = "sm",
  pulse = false,
}: StatusDotProps) {
  const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  const color = connected ? "bg-accent-green" : "bg-accent-red";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-flex shrink-0">
        {connected && pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60`}
          />
        )}
        <span className={`${dotSize} ${color} rounded-full`} />
      </span>
      {label && <span className="text-xs text-text-secondary">{label}</span>}
    </span>
  );
}
