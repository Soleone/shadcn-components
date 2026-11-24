"use client"

import { cn } from "cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/soleone/tooltip/tooltip"
import { ClaudeLogo, OpenAILogo } from "./logos"

/** A usage window: the percent of it left, and when it resets in epoch ms; no reset before its first use. */
export type UsageWindow = { left: number; resets?: number }

export type UsageProvider = "claude" | "openai"

// Brand colors stay fixed across themes. OpenAI's mark is monochrome, so it takes the surrounding text color:
// foreground on the page, background inside the inverted tooltip.
const PROVIDERS = {
  claude: { name: "Claude", color: "#D97757", Logo: ClaudeLogo },
  openai: { name: "OpenAI", color: "currentColor", Logo: OpenAILogo },
}

const WARN_AT = 20
const MINUTE = 60_000

/**
 * One provider's usage as a ring: the outline is what's left of the 7-day window, the number what's
 * left of the 5-hour window. The tooltip has both resets.
 */
export function UsageRing({
  provider,
  fiveHour,
  sevenDay,
  className,
}: {
  provider: UsageProvider
  fiveHour: UsageWindow
  sevenDay: UsageWindow
  className?: string
}) {
  const { name, color, Logo } = PROVIDERS[provider]
  // An empty week leaves nothing to spend in the next 5 hours either.
  const usable = sevenDay.left <= 0 ? 0 : fiveHour.left
  const ink = usable <= 0 ? "var(--destructive)" : usable <= WARN_AT ? "var(--warning)" : "var(--foreground)"
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={0} />}
        aria-label={`${name}: ${fiveHour.left}% of 5 hours and ${sevenDay.left}% of 7 days left`}
        className={cn("inline-flex cursor-default select-none rounded-full", className)}
      >
        <svg width={28} height={28} viewBox="0 0 36 36" aria-hidden>
          <circle cx={18} cy={18} r={15.6} fill="none" stroke="var(--border)" strokeWidth={3} />
          {sevenDay.left > 0 && (
            <circle
              cx={18}
              cy={18}
              r={15.6}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${sevenDay.left} 100`}
              transform="rotate(-90 18 18)"
            />
          )}
          {/* Capped at 99 so the number never needs a third digit; the tooltip has the exact value. */}
          <text
            x={18}
            y={18}
            dy="0.36em"
            textAnchor="middle"
            fontSize={14}
            fill={ink}
            className="font-mono font-semibold tabular-nums"
          >
            {Math.min(99, Math.round(usable))}
          </text>
        </svg>
      </TooltipTrigger>
      <TooltipContent className="block">
        <div className="mb-1 flex items-center gap-1.5 font-semibold">
          <Logo className="size-3.5" style={{ color }} />
          {name}
        </div>
        <div className="grid grid-cols-[auto_auto_auto] gap-x-2 whitespace-nowrap">
          <Row label="5 hours" window={fiveHour} />
          <Row label="7 days" window={sevenDay} withDay />
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function Row({ label, window, withDay }: { label: string; window: UsageWindow; withDay?: boolean }) {
  return (
    <>
      <span className="opacity-70">{label}</span>
      <span className="text-right font-mono tabular-nums">
        {window.left <= 0 ? "empty" : `${Math.round(window.left)}% left`}
      </span>
      <span className="opacity-70">
        {window.resets === undefined
          ? "starts on first use"
          : `resets ${clock(window.resets, withDay)} · in ${until(window.resets)}`}
      </span>
    </>
  )
}

function clock(at: number, withDay?: boolean) {
  return new Date(at).toLocaleString(undefined, {
    ...(withDay && { weekday: "short" }),
    hour: "numeric",
    minute: "2-digit",
  })
}

function until(at: number) {
  const minutes = Math.max(0, Math.round((at - Date.now()) / MINUTE))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = String(minutes % 60).padStart(2, "0")
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${rest}m` : `${minutes}m`
}
