"use client"

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react"
import { Feather } from "lucide-react"
import { useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode, type SubmitEvent } from "react"
import { grain } from "@/components/soleone/material/sheen"

// A letter that folds itself into a paper plane and flies off when it is sent. What is written on it is up
// to the caller: `children` draws the page from the draft, once live (the form) and three more times
// read-only while it folds, so the copies have to look the same as the live page.

export type LetterResult = { ok: true } | { ok: false; error: string }

type Draft = Record<string, string>

export type LetterPage<D extends Draft> = {
  draft: D
  /** True for the form itself; false for the copies the fold draws, which must not repeat its ids. */
  live: boolean
  /** Props for an input or textarea bound to one field of the draft. */
  field: (name: keyof D & string) => {
    name: string
    value: string
    onChange?: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
    readOnly: boolean
  }
  /** Why the last send failed, on the live page only. */
  error: string | null
  /** Waiting on delivery without motion, where there is no fold to watch. */
  pending: boolean
}

const easeInOutCubic = [0.65, 0, 0.35, 1] as const
const easeOutQuint = [0.22, 1, 0.36, 1] as const
// Keeps speeding up until it is gone, so the letter is thrown off the page rather than slid.
const easeInQuart = [0.5, 0, 0.75, 0] as const

const radius = 12
// The outside is the top third turned over, so the sheet's rounded top corners end up at its bottom.
const outsideRadius = `0 0 ${radius}px ${radius}px`

// Tinted from the theme's card color like the project cards, with the brand color washed into one corner.
const paper: CSSProperties = {
  background:
    "linear-gradient(160deg, color-mix(in oklch, var(--card) 90%, var(--primary)) 0%, var(--card) 55%, color-mix(in oklch, var(--card) 94%, var(--foreground)) 100%)",
}
const paperBack: CSSProperties = { background: "color-mix(in oklch, var(--card) 92%, var(--foreground))" }

// The underside of the paper, showing where a corner is folded over the outside.
const paperCrease: CSSProperties = { background: "color-mix(in oklch, var(--card) 84%, var(--foreground))" }

export function Letter<D extends Draft>({
  initial,
  deliver,
  sender,
  recipient,
  stamp,
  hiddenFields,
  sent,
  children,
}: {
  /** The fields of the draft and what they start with. */
  initial: D
  /** Posts the form. It starts as soon as the letter is sent; the fold only waits for it at the postmark. */
  deliver: (form: FormData) => Promise<LetterResult>
  /** Who the envelope says it is from. */
  sender: (draft: D) => string
  /** Who the envelope is addressed to. */
  recipient: { name: string; place?: string }
  stamp?: { icon?: ReactNode; label?: string }
  /** Rendered once inside the form after the page, for honeypots and hidden inputs. */
  hiddenFields?: ReactNode
  /** What takes the letter's place once it has flown off. */
  sent: (letter: { draft: D; writeAnother: () => void }) => ReactNode
  children: (page: LetterPage<D>) => ReactNode
}) {
  const reduced = useReducedMotion() ?? false
  const [draft, setDraft] = useState(initial)
  const [phase, setPhase] = useState<"writing" | "sending" | "sent">("writing")
  // Where the sheet folds: a third and two thirds down, and its full height.
  const [folds, setFolds] = useState<[number, number, number] | null>(null)
  // Folded in thirds it is a stack of three panels; from then on it is one flat strip that folds into a plane.
  const [shape, setShape] = useState<"thirds" | "plane">("thirds")
  const [postedOn, setPostedOn] = useState("")
  const [round, setRound] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Only without motion: there is no fold to watch while the letter is on its way.
  const [pending, setPending] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Degrees each outer third has turned over the middle one.
  const bottomFold = useMotionValue(0)
  const topFold = useMotionValue(0)
  // Degrees each right corner has turned in toward the middle line.
  const topCorner = useMotionValue(0)
  const bottomCorner = useMotionValue(0)
  const postmark = useMotionValue(0)
  const waves = useMotionValue(0)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useMotionValue(0)
  const scale = useMotionValue(1)

  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    // Posted right away; the fold plays while it travels and only waits for the answer at the postmark.
    const posted = deliver(new FormData(event.currentTarget)).catch(
      (): LetterResult => ({ ok: false, error: "The mail couldn't be sent. Check your connection and try again." }),
    )
    setError(null)
    setPostedOn(new Date().toLocaleDateString("en", { month: "short", day: "numeric" }))
    const sheet = sheetRef.current
    if (reduced || !sheet) {
      setPending(true)
      const result = await posted
      setPending(false)
      return result.ok ? setPhase("sent") : setError(result.error)
    }

    const height = sheet.offsetHeight
    setFolds([Math.round(height / 3), Math.round((height * 2) / 3), height])
    setPhase("sending")
    const { left, width } = sheet.getBoundingClientRect()

    const fold = { duration: 0.46, ease: easeInOutCubic }
    await Promise.all([animate(bottomFold, 180, fold), animate(topFold, -180, { ...fold, delay: 0.28 })])

    // Both right corners fold in to the middle line, pointing the nose the way it is about to fly.
    setShape("plane")
    const corner = { duration: 0.4, ease: easeInOutCubic }
    await Promise.all([animate(topCorner, -180, corner), animate(bottomCorner, 180, { ...corner, delay: 0.16 })])

    const result = await posted
    if (!result.ok) return returnToSender(result.error)

    // The postmark lands with a little press into the desk, then the wavy lines are dragged out behind it.
    await Promise.all([
      animate(postmark, 1, { duration: 0.3, ease: easeOutQuint }),
      animate(waves, 1, { duration: 0.2, delay: 0.14, ease: "easeOut" }),
      animate(scale, [1, 0.96, 1], { duration: 0.34, times: [0, 0.35, 1], ease: "easeOut" }),
    ])

    // A short wind-up, drawn back with the nose dipped, before the throw.
    const windUp = { duration: 0.24, ease: easeOutQuint }
    await Promise.all([animate(x, -14, windUp), animate(y, 4, windUp), animate(rotate, 2, windUp)])

    const flight = { duration: 0.62, ease: easeInQuart }
    await Promise.all([
      animate(x, window.innerWidth - left + width * 0.4, flight),
      // Rising on a gentler curve than it travels, so the path bends upward as it speeds off, nose up.
      animate(y, -90, { duration: 0.62, ease: [0.4, 0, 1, 1] }),
      animate(rotate, -8, flight),
      animate(scale, 0.88, flight),
    ])
    setPhase("sent")
  }

  // Undoes the folds in reverse, back to the open letter with everything still written on it.
  async function returnToSender(message: string) {
    const unfold = { duration: 0.36, ease: easeInOutCubic }
    await Promise.all([animate(bottomCorner, 0, unfold), animate(topCorner, 0, { ...unfold, delay: 0.12 })])
    setShape("thirds")
    await Promise.all([animate(topFold, 0, unfold), animate(bottomFold, 0, { ...unfold, delay: 0.22 })])
    setFolds(null)
    setPhase("writing")
    setError(message)
  }

  function writeAnother() {
    for (const value of [bottomFold, topFold, topCorner, bottomCorner, postmark, waves, x, y, rotate]) value.jump(0)
    scale.jump(1)
    setDraft(Object.fromEntries(Object.keys(initial).map((key) => [key, ""])) as D)
    setFolds(null)
    setShape("thirds")
    setPhase("writing")
    setRound(round + 1)
    // A fresh sheet: the pen goes back to its first field.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("textarea, input:not([tabindex='-1'])")?.focus())
  }

  const sheet = (live: boolean) => (
    <Sheet sheetRef={live ? sheetRef : undefined}>
      {children({
        draft,
        live,
        field: (name) => ({
          name,
          value: draft[name],
          onChange: live
            ? (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setDraft((current) => ({ ...current, [name]: event.target.value }))
            : undefined,
          readOnly: !live,
        }),
        error: live ? error : null,
        pending: live && pending,
      })}
    </Sheet>
  )

  // Its right end is kept clear for the plane's nose, so the corners never fold over the stamp.
  const envelope = folds && (
    <Envelope
      from={sender(draft)}
      recipient={recipient}
      stamp={stamp}
      postedOn={postedOn}
      postmark={postmark}
      waves={waves}
      nose={folds[0] / 2}
    />
  )

  return (
    <div className="relative">
      <motion.form
        ref={formRef}
        key={round}
        onSubmit={send}
        inert={phase !== "writing"}
        className={phase === "writing" ? undefined : "invisible"}
        // A fresh sheet is laid down on the desk; the first one is just there.
        initial={round ? { opacity: 0, y: 28, rotate: -2 } : false}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.6, ease: easeOutQuint }}
      >
        {sheet(true)}
        {hiddenFields}
      </motion.form>

      {phase === "sending" && folds && (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ perspective: 1400 }}>
          <motion.div className="relative size-full transform-3d" style={{ x, y, rotate, scale }}>
            {shape === "thirds" ? (
              <>
                <Panel from={0} to={folds[0]} angle={topFold} origin="bottom" z={2} back={envelope}>
                  {sheet(false)}
                </Panel>
                {/* Hidden once the bottom third covers it: Chrome draws the textarea in it on its own layer,
                    and the 3D sorting let that peek out past the top third as it lands. */}
                <Panel from={folds[0]} to={folds[1]} coveredBy={bottomFold} className="shadow-fold">
                  {sheet(false)}
                </Panel>
                <Panel from={folds[1]} to={folds[2]} angle={bottomFold} origin="top" z={1} back={<div className="size-full" style={{ ...paperBack, borderRadius: `${radius}px ${radius}px 0 0` }} />}>
                  {sheet(false)}
                </Panel>
              </>
            ) : (
              // The top third, turned over, now lies exactly where the plane strip starts.
              <Plane top={folds[0]} height={folds[0]} topCorner={topCorner} bottomCorner={bottomCorner}>
                {envelope}
              </Plane>
            )}
          </motion.div>
        </div>
      )}

      <div aria-live="polite">
        {phase === "sent" && (
          <motion.div
            className="absolute inset-0 flex flex-col items-start justify-center gap-3 border border-dashed border-foreground/15 p-8"
            style={{ borderRadius: radius }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeOutQuint, delay: reduced ? 0 : 0.1 }}
          >
            {sent({ draft, writeAnother })}
          </motion.div>
        )}
      </div>
    </div>
  )
}

// The page itself. The fold renders it three more times, read-only, each clipped to its third.
function Sheet({ sheetRef, children }: { sheetRef?: React.Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div
      ref={sheetRef}
      className="relative border border-black/[0.07] p-7 shadow-paper sm:p-9 dark:border-white/10"
      style={{ ...paper, borderRadius: radius }}
    >
      <Grain />
      {children}
    </div>
  )
}

// One third of the folding sheet. The front shows its slice of the letter; the back is blank paper, or the
// envelope side for the top third, which ends up outermost. Without an angle it stays flat (the middle third).
function Panel({
  from,
  to,
  angle,
  origin = "center",
  z = 0,
  back,
  coveredBy,
  className,
  children,
}: {
  from: number
  to: number
  angle?: MotionValue<number>
  origin?: "top" | "bottom" | "center"
  z?: number
  back?: ReactNode
  // A fold that lies flat over this whole side once it has turned all the way.
  coveredBy?: MotionValue<number>
  className?: string
  children: ReactNode
}) {
  const still = useMotionValue(0)
  const turn = angle ?? still
  // Paper darkens as it turns away from the light, brightest flat on the desk.
  const shade = useTransform(turn, (deg) => Math.abs(Math.sin((deg * Math.PI) / 180)) * 0.22)
  const shown = useTransform(coveredBy ?? still, (deg) => (Math.abs(deg) >= 180 ? 0 : 1))

  return (
    <motion.div
      className="absolute inset-x-0 transform-3d"
      style={{ top: from, height: to - from, rotateX: turn, z, transformOrigin: `50% ${origin === "center" ? "50%" : origin}` }}
    >
      <motion.div className={`absolute inset-0 overflow-hidden backface-hidden ${className ?? ""}`} style={{ opacity: shown }}>
        <div className="absolute inset-x-0" style={{ top: -from }}>
          {children}
        </div>
        <motion.div className="absolute inset-0 bg-black" style={{ opacity: shade }} />
      </motion.div>
      {back && <div className="absolute inset-0 backface-hidden [transform:rotateX(180deg)]">{back}</div>}
    </motion.div>
  )
}

// After the thirds the letter is one flat strip, outside up. The right end is cut down to a point and each
// cut-off corner folds over on top of it, along the diagonal from the strip's edge to its middle line.
function Plane({
  top,
  height,
  topCorner,
  bottomCorner,
  children,
}: {
  top: number
  height: number
  topCorner: MotionValue<number>
  bottomCorner: MotionValue<number>
  children: ReactNode
}) {
  const tip = `calc(100% - ${height / 2}px)`

  return (
    // Lifted as far as the top third was, so the swap from the panels is seamless.
    <div className="absolute inset-x-0 transform-3d" style={{ top, height, transform: "translateZ(2px)" }}>
      {/* Its own element for the shadow: a filter on the strip would flatten the corners' 3D. */}
      <div className="absolute inset-0 drop-shadow-envelope">
        <div className="absolute inset-0" style={{ clipPath: `polygon(0 0, ${tip} 0, 100% 50%, ${tip} 100%, 0 100%)` }}>
          {children}
        </div>
      </div>
      <Corner angle={topCorner} side="top" size={height / 2} />
      <Corner angle={bottomCorner} side="bottom" size={height / 2} />
    </div>
  )
}

// One corner of the nose: a square at the strip's end, cut to a triangle along its diagonal, turning about that
// diagonal. The back is the other half of the square, where the corner lands, turned away by the same half turn so
// it comes face up exactly as the corner arrives. The triangles are masks, not clip paths: Chrome stops drawing a
// clipped element once it turns in 3D.
const corners = {
  top: {
    axis: "1, 1, 0",
    origin: "0 0",
    front: "linear-gradient(to top right, transparent 50%, #000 50%)",
    back: "linear-gradient(to bottom left, transparent 50%, #000 50%)",
    radius: "0",
  },
  bottom: {
    axis: "1, -1, 0",
    origin: "0 100%",
    front: "linear-gradient(to bottom right, transparent 50%, #000 50%)",
    back: "linear-gradient(to top left, transparent 50%, #000 50%)",
    radius: `0 0 ${radius}px 0`,
  },
}

function Corner({ angle, side, size }: { angle: MotionValue<number>; side: "top" | "bottom"; size: number }) {
  const { axis, origin, front, back, radius: cornerRadius } = corners[side]
  const transform = useTransform(angle, (deg) => `translateZ(1px) rotate3d(${axis}, ${deg}deg)`)
  const shade = useTransform(angle, (deg) => Math.abs(Math.sin((deg * Math.PI) / 180)) * 0.22)

  return (
    <motion.div
      className="absolute right-0 transform-3d"
      style={{ [side]: 0, width: size, height: size, transform, transformOrigin: origin }}
    >
      <div className="absolute inset-0 backface-hidden" style={{ ...paperBack, borderRadius: cornerRadius, maskImage: front }}>
        <Grain />
        <motion.div className="absolute inset-0 bg-black" style={{ opacity: shade }} />
      </div>
      <div
        className="absolute inset-0 backface-hidden"
        style={{ ...paperCrease, maskImage: back, transformOrigin: origin, transform: `rotate3d(${axis}, 180deg)` }}
      >
        <Grain />
      </div>
    </motion.div>
  )
}

// The outside of the folded letter: who it is from, who it is for, a stamp and the postmark.
function Envelope({
  from,
  recipient,
  stamp,
  postedOn,
  postmark,
  waves,
  nose,
}: {
  from: string
  recipient: { name: string; place?: string }
  stamp?: { icon?: ReactNode; label?: string }
  postedOn: string
  postmark: MotionValue<number>
  waves: MotionValue<number>
  nose: number
}) {
  const opacity = useTransform(postmark, [0, 1], [0, 0.7])
  const markScale = useTransform(postmark, [0, 1], [1.6, 1])
  // Revealed from the circle outward, as if dragged off the stamp.
  const clipPath = useTransform(waves, (v) => `inset(0 0 0 ${(1 - v) * 100}%)`)

  return (
    <div
      className="relative flex size-full flex-col justify-between overflow-hidden p-5 sm:p-6"
      style={{ ...paperBack, borderRadius: outsideRadius, paddingRight: nose + 8 }}
    >
      <Grain />
      <div className="relative flex items-start justify-between gap-4">
        <div className="truncate text-2xs font-medium tracking-wider text-muted-foreground uppercase">From {from}</div>
        <div className="relative shrink-0">
          <Stamp icon={stamp?.icon} label={stamp?.label} />
          <div className="absolute top-5 -left-20 -rotate-12 text-foreground">
            {/* Presses down around the center of the circle. */}
            <motion.div style={{ opacity, scale: markScale, originX: 86 / 112, originY: 0.5 }}>
              <Postmark date={postedOn} />
            </motion.div>
            <motion.div className="absolute top-0 left-0 opacity-70" style={{ clipPath }}>
              <Waves />
            </motion.div>
          </div>
        </div>
      </div>
      <div className="relative">
        <div className="text-lg leading-tight font-semibold tracking-tight">{recipient.name}</div>
        {recipient.place && <div className="text-sm text-muted-foreground">{recipient.place}</div>}
      </div>
    </div>
  )
}

// Perforated edge: a grid of holes centered on the border, with a solid block masking them out of the middle.
// Width and height are multiples of the 6px hole spacing, so the holes meet evenly at every corner.
const perforated: CSSProperties = {
  background: "color-mix(in oklch, var(--card), white 75%)",
  maskImage: "linear-gradient(#000 0 0), radial-gradient(circle, transparent 1.9px, #000 2.3px)",
  maskSize: "calc(100% - 6px) calc(100% - 6px), 6px 6px",
  maskPosition: "center, -3px -3px",
  maskRepeat: "no-repeat, repeat",
}

function Stamp({ icon = <Feather className="size-4" />, label }: { icon?: ReactNode; label?: string }) {
  return (
    // The stamp is drawn to its perforation mask in px, so it keeps px of its own.
    // oxlint-disable-next-line shadcn/no-arbitrary-values
    <div className="h-[60px] w-[48px] p-[5px] drop-shadow-[0_1px_1px_rgb(0_0_0/0.15)]" style={perforated}>
      <div
        className="flex size-full flex-col items-center justify-center gap-1 text-primary-foreground"
        style={{ background: "linear-gradient(160deg, var(--primary), color-mix(in oklch, var(--primary), black 28%))" }}
      >
        {icon}
        {/* oxlint-disable-next-line shadcn/no-arbitrary-values */}
        {label && <span className="text-[6px] font-semibold tracking-[0.15em] uppercase">{label}</span>}
      </div>
    </div>
  )
}

function Postmark({ date }: { date: string }) {
  return (
    <svg width="112" height="52" viewBox="0 0 112 52" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="86" cy="26" r="23" />
      <circle cx="86" cy="26" r="18" strokeWidth="0.75" />
      <text x="86" y="29.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="10" fontWeight="600">
        {date.toUpperCase()}
      </text>
    </svg>
  )
}

// Shares the postmark's coordinates (and its top left corner), so the lines sit where they were drawn together with it.
function Waves() {
  return (
    <svg width="60" height="52" viewBox="0 0 60 52" fill="none" stroke="currentColor" strokeWidth="1.5">
      {[16, 26, 36].map((lineY) => (
        <path key={lineY} d={`M2 ${lineY} q7 -5 14 0 t14 0 t14 0 t14 0`} />
      ))}
    </svg>
  )
}

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-7 mix-blend-multiply dark:opacity-12 dark:mix-blend-screen"
      style={{ backgroundImage: grain, borderRadius: "inherit" }}
    />
  )
}
