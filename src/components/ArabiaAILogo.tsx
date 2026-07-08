export function ArabiaAILogo({
  size = "md",
  variant = "dark",
}: {
  size?: "sm" | "md" | "lg";
  variant?: "dark" | "light";
}) {
  const box =
    size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-12 w-12 rounded-xl" : "h-10 w-10 rounded-xl";
  const icon = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  const text =
    size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-lg";

  const titleColor = variant === "light" ? "text-slate-900" : "text-white";
  const subtitleColor =
    variant === "light" ? "text-emerald-600" : "text-emerald-400/90";

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`flex shrink-0 items-center justify-center bg-emerald-500 ${box}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`${icon} text-white`}
          aria-hidden
        >
          <path
            d="M12 2l1.8 5.4L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.6L12 2z"
            fill="currentColor"
          />
          <path
            d="M18 14l.9 2.7L22 17.5l-2.6.9L18 21l-.9-2.6L14.5 17.5l2.6-.8L18 14z"
            fill="currentColor"
            opacity="0.85"
          />
        </svg>
      </div>
      <div>
        <p className={`font-bold tracking-tight ${titleColor} ${text}`}>
          Arabia AI
        </p>
        {size !== "sm" && (
          <p
            className={`text-[10px] font-medium uppercase tracking-wider ${subtitleColor}`}
          >
            Commerce Portal
          </p>
        )}
      </div>
    </div>
  );
}
