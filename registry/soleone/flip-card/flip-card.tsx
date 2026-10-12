"use client"

import { animate, motion, useMotionValue, useInView, useReducedMotion, useTransform } from "motion/react"
import { RotateCcw } from "lucide-react"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react"
import { Sheen, grain } from "@/components/soleone/material/sheen"
import { springEasing } from "./spring-easing"

// A card that deals itself onto the table, tilts toward the pointer, catches the light, sinks when
// pressed and flips over. What is printed on it is up to the caller: `front` and `back` are any content,
// with FlipCardLayer floating parts of it above the surface and FlipCardTurn as the flip button.

// Every knob that shapes how the card feels. Springs are { stiffness, damping } so motion can hand
// velocity from one to the next when an interaction interrupts another (hover -> press -> release).
export type FlipCardTuning = {
  tiltMax: number // degrees at the card edge
  perspective: number // px; lower is more dramatic
  depth: number // px the top layer floats above the card
  hoverScale: number
  pressScale: number
  glare: number // 0..1
  rim: number // 0..1
  rimWidth: number // px; 0.5 is one device pixel on 2x screens
  followStiffness: number // tilt while the pointer is on the card: snappy
  followDamping: number
  releaseStiffness: number // tilt settling after the pointer leaves: softer, a little wobble
  releaseDamping: number
  pressStiffness: number
  pressDamping: number
  flipStiffness: number
  flipDamping: number
  flipLift: number // extra scale at the middle of a flip
  dealStagger: number // seconds between cards
  dealStiffness: number
  dealDamping: number
  flip: boolean
}

export const defaultFlipCardTuning: FlipCardTuning = {
  tiltMax: 5,
  perspective: 900,
  depth: 36,
  hoverScale: 1.025,
  pressScale: 0.975,
  glare: 0.55,
  rim: 0.7,
  rimWidth: 0.5,
  followStiffness: 320,
  followDamping: 26,
  releaseStiffness: 170,
  releaseDamping: 11,
  pressStiffness: 700,
  pressDamping: 30,
  flipStiffness: 150,
  flipDamping: 16,
  flipLift: 0.08,
  dealStagger: 0.07,
  dealStiffness: 210,
  dealDamping: 19,
  flip: true,
}

const spring = (stiffness: number, damping: number) => ({ type: "spring" as const, stiffness, damping })
const easeOutQuint = [0.22, 1, 0.36, 1] as const

// Which cards in a grid show their back, and how to cheer each one, by index. Shared so a flip can tell
// when it completed a row: a full row of backs on a grid three or more wide gets a quick wave.
type Row = { backs: Set<number>; cheers: Map<number, (delay: number) => void> }
const grids = new WeakMap<Element, Row>()
const rowOf = (grid: Element) => {
  let row = grids.get(grid)
  if (!row) grids.set(grid, (row = { backs: new Set(), cheers: new Map() }))
  return row
}

// Deterministic so server and client agree; a dealt hand never lands perfectly square.
const dealAngle = (index: number) => ((index * 37) % 17) - 8

// The drop shadow is a gradient, not a blurred element: a CSS blur filter renders a full-size offscreen
// surface every frame, and a box-shadow leaves a hole under the card. This falls off like the blur it replaced.
const softShadow =
  "radial-gradient(closest-side, rgb(0 0 0 / 1) 0%, rgb(0 0 0 / 1) 40%, rgb(0 0 0 / 0.5) 71%, rgb(0 0 0 / 0.2) 88%, transparent 100%)"

type FlipCardContextValue = { tuning: FlipCardTuning; turns: number; turn: () => void; reduced: boolean }
const FlipCardContext = createContext<FlipCardContextValue | null>(null)

function useFlipCard() {
  const context = useContext(FlipCardContext)
  if (!context) throw new Error("FlipCardLayer and FlipCardTurn must be used inside <FlipCard>")
  return context
}

export function FlipCard({
  index,
  tint = "var(--primary)",
  tintEnd,
  tuning,
  onHoverChange,
  front,
  back,
}: {
  /** Position in the grid: staggers the deal, angles the card as it lands, and finds its row. */
  index: number
  /** Any CSS color; the surface is tinted from the theme's card color toward it. */
  tint?: string
  /** A second color the surface shades toward at the bottom; defaults to the tint. */
  tintEnd?: string
  tuning?: Partial<FlipCardTuning>
  /** The pointer came onto or left the card, for example to play and pause a video on it. */
  onHoverChange?: (hovered: boolean) => void
  front: ReactNode
  back: ReactNode
}) {
  const t = { ...defaultFlipCardTuning, ...tuning }
  const reduced = useReducedMotion() ?? false
  const dealRef = useRef<HTMLDivElement>(null)
  const hitRef = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)
  const hovered = useRef(false)
  // A touch has no hover: a sideways drag tilts the card instead (up and down still scroll the page).
  const touch = useRef({ x: 0, y: 0, tilting: false })
  const [turns, setTurns] = useState(0)
  // Four flips in quick succession earn a bonus spin; each one adds a full turn on top of the flips.
  const flips = useRef<number[]>([])
  const bonusSpins = useRef(0)

  // Pointer position on the card, 0..1. Springs keep the glare from snapping when the pointer jumps.
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  // -1 pressed into the table, 0 resting, 1 lifted toward the viewer. Drives scale and shadow together.
  const lift = useMotionValue(0)
  const shine = useMotionValue(0)
  const flip = useMotionValue(0)
  const hop = useMotionValue(0)

  const tiltMax = reduced ? 0 : t.tiltMax

  // Tilt is derived from the pointer, so one spring per axis drives tilt, glare and rim together.
  const rx = useTransform(py, (v) => (0.5 - v) * 2 * tiltMax)
  const ry = useTransform(px, (v) => (v - 0.5) * 2 * tiltMax)

  const flipArc = useTransform(flip, (deg) => Math.abs(Math.sin((deg * Math.PI) / 180)))
  const rotateY = useTransform([ry, flip], ([tilt, turn]: number[]) => tilt + turn)
  const scale = useTransform([lift, flipArc], ([l, arc]: number[]) => {
    const base = l >= 0 ? 1 + l * (t.hoverScale - 1) : 1 + l * (1 - t.pressScale)
    return base * (1 + arc * t.flipLift)
  })

  // A light sits above and slightly toward the viewer: tilt pushes the shadow the other way,
  // lifting softens and drops it, pressing pulls it tight under the card.
  const shadowX = useTransform(ry, (deg) => -deg * 1.6)
  const shadowY = useTransform([lift, rx, flipArc], ([l, deg, arc]: number[]) => 12 + l * 14 + deg * 0.8 + arc * 22)
  const shadowScaleX = useTransform([lift, flipArc], ([l, arc]: number[]) => (1 + l * 0.04) * (1 - arc * 0.55))
  const shadowOpacity = useTransform([lift, flipArc], ([l, arc]: number[]) => 0.38 - l * 0.08 - arc * 0.12)

  // Glare and rim move by transform only, so following the pointer never repaints a gradient.
  // The glare layer is twice the card's size, so a 50% shift of itself is one card width.
  const glareX = useTransform(px, (v) => `${(v - 0.5) * 50}%`)
  const glareY = useTransform(py, (v) => `${(v - 0.5) * 50}%`)
  const rimAngle = useTransform([px, py], ([x, y]: number[]) => (Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI + 90)
  const rimOpacity = useTransform(shine, [0, 1], [0.25, 1])
  const sheen = { glareX, glareY, rimAngle, shine, rimOpacity, glare: t.glare, rim: t.rim, rimWidth: t.rimWidth }

  const follow = spring(t.followStiffness, t.followDamping)
  const release = spring(t.releaseStiffness, t.releaseDamping)
  const press = spring(t.pressStiffness, t.pressDamping)
  // Popping back up after a press is the same spring with less damping, so it overshoots.
  const pop = spring(t.pressStiffness * 0.6, t.pressDamping * 0.45)

  const aim = (event: PointerEvent) => {
    const rect = hitRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    animate(px, x, follow)
    animate(py, y, follow)
  }

  const onEnter = (event: PointerEvent) => {
    hovered.current = true
    animate(shine, 1, { duration: 0.35, ease: easeOutQuint })
    if (!pressed.current) animate(lift, 1, follow)
    onHoverChange?.(true)
    if (event.pointerType !== "touch") aim(event)
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return aim(event)
    const { current } = touch
    if (!current.tilting) {
      const dx = event.clientX - current.x
      const dy = event.clientY - current.y
      // Wait until it is clearly sideways, so the start of a scroll never twitches the card.
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return
      // From here it is a hover: the card lifts toward the finger instead of staying pressed in.
      current.tilting = true
      pressed.current = false
      animate(lift, 1, follow)
    }
    aim(event)
  }

  const onLeave = () => {
    hovered.current = false
    pressed.current = false
    animate(shine, 0, { duration: 0.6, ease: easeOutQuint })
    animate(lift, 0, release)
    animate(px, 0.5, release)
    animate(py, 0.5, release)
    onHoverChange?.(false)
  }

  const onDown = (event: PointerEvent) => {
    touch.current = { x: event.clientX, y: event.clientY, tilting: false }
    pressed.current = true
    animate(lift, -1, press)
  }

  const onUp = () => {
    if (!pressed.current) return
    pressed.current = false
    animate(lift, hovered.current ? 1 : 0, pop)
  }

  const turn = () => {
    const now = performance.now()
    flips.current = [...flips.current.filter((at) => now - at < 2000), now]
    if (flips.current.length >= 4) {
      flips.current = []
      bonusSpins.current += 1
    }
    const next = turns + 1
    setTurns(next)
    animate(flip, next * 180 + bonusSpins.current * 360, reduced ? { duration: 0 } : spring(t.flipStiffness, t.flipDamping))

    const grid = dealRef.current?.parentElement
    if (!grid) return
    const { backs, cheers } = rowOf(grid)
    if (next % 2 === 0) {
      backs.delete(index)
      return
    }
    backs.add(index)
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length
    if (reduced || columns < 3) return
    const start = index - (index % columns)
    const row = Array.from({ length: columns }, (_, i) => start + i)
    // Starts once the last card has mostly turned, then rolls across the row.
    if (row.every((i) => backs.has(i))) row.forEach((i, order) => cheers.get(i)?.(0.25 + order * 0.07))
  }

  useEffect(() => {
    const grid = dealRef.current?.parentElement
    if (!grid) return
    const { backs, cheers } = rowOf(grid)
    cheers.set(index, (delay) => {
      animate(hop, [0, -16, 0], { duration: 0.4, delay, times: [0, 0.35, 1], ease: ["easeOut", "easeIn"] })
      animate(shine, [shine.get(), 1, hovered.current ? 1 : 0], { duration: 0.5, delay })
    })
    return () => {
      cheers.delete(index)
      backs.delete(index)
    }
  }, [index, hop, shine])

  const onClick = (event: React.MouseEvent) => {
    if (!t.flip || touch.current.tilting || (event.target as HTMLElement).closest("a, button")) return
    turn()
  }

  // Each row deals as it scrolls into view, so only cards within a row (up to three) wait on each other.
  // The deal is a CSS transition, not a JS spring: transform and opacity then run on the compositor and
  // the card, with all its 3D layers, is not repainted every frame while it flies in.
  const dealt = useInView(dealRef, { once: true, amount: 0.25 })
  const dealDelay = (index % 3) * t.dealStagger * 1000
  const deal = springEasing(t.dealStiffness, t.dealDamping)
  const showingBack = turns % 2 === 1
  const surface: CSSProperties = {
    // Tinted from the theme's card color, so every theme gets its own take on the card's tint.
    background: `linear-gradient(160deg, color-mix(in oklch, var(--card) 86%, var(--tint)) 0%, var(--card) 55%, color-mix(in oklch, var(--card) 80%, color-mix(in oklch, var(--tint-end, var(--tint)), black 20%)) 100%)`,
  }

  return (
    <FlipCardContext value={{ tuning: t, turns, turn, reduced }}>
      <div
        ref={dealRef}
        // Cards off screen are skipped entirely (no layout, paint or 3D layers). That clips to the box, so the
        // padding gives the shadow and tilt room, with a matching negative margin to keep the grid layout.
        // Only the card itself takes pointer events, or the padding would cover its neighbors.
        // With reduced motion the card skips the flight and just appears; that is CSS, not a branch on
        // useReducedMotion, which the server cannot know, so the style the server renders always hydrates.
        className="pointer-events-none relative -m-28 p-28 [contain-intrinsic-height:auto_440px] [content-visibility:auto] motion-reduce:transform-none! motion-reduce:transition-none!"
        style={
          {
            "--tint": tint,
            ...(tintEnd ? { "--tint-end": tintEnd } : {}),
            opacity: dealt ? 1 : 0,
            transform: dealt ? "none" : `translateY(140px) rotate(${dealAngle(index)}deg) scale(0.86)`,
            transition: dealt
              ? `transform ${deal.duration}ms ${deal.easing} ${dealDelay}ms, opacity 300ms cubic-bezier(0.22, 1, 0.36, 1) ${dealDelay}ms`
              : "none",
          } as CSSProperties
        }
      >
        {/* Sized from the card, not the padded wrapper: a shadow reaching past the gap would paint over the
            neighbor, because each wrapper is its own stacking context and later cards paint on top. Lighter on
            light themes, where black reads as dirt. Its own layer, so moving or fading it never repaints. */}
        <div aria-hidden className="pointer-events-none absolute inset-28 opacity-45 dark:opacity-100">
          <motion.div
            className="absolute -inset-x-3 top-[12%] -bottom-10 will-change-[transform,opacity]"
            style={{ x: shadowX, y: shadowY, scaleX: shadowScaleX, opacity: shadowOpacity, background: softShadow }}
          />
        </div>

        <div
          ref={hitRef}
          className="pointer-events-auto relative cursor-pointer touch-pan-y select-none"
          style={{ perspective: t.perspective }}
          onPointerEnter={onEnter}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={onLeave}
          onClick={onClick}
        >
          {/* Scaling during a flip or press makes Chrome re-raster every layer of the card each frame. On touch
              screens the hint pins the raster scale instead; on desktop it would soften the hover scale. */}
          <motion.div
            className="relative transform-3d pointer-coarse:will-change-transform"
            style={{ y: hop, rotateX: rx, rotateY, scale }}
          >
            <Face className="relative" style={surface} hidden={showingBack}>
              {front}
              <Sheen {...sheen} />
            </Face>
            <Face className="absolute inset-0" style={{ ...surface, transform: "rotateY(180deg)" }} hidden={!showingBack}>
              {back}
              <Sheen {...sheen} />
            </Face>
          </motion.div>
        </div>
      </div>
    </FlipCardContext>
  )
}

/** A part of a face floating `depth` (0..1) of the way up to the card's top layer. */
export function FlipCardLayer({
  depth,
  className,
  children,
}: {
  depth: number
  className?: string
  children: ReactNode
}) {
  const { tuning } = useFlipCard()
  return (
    <div className={className} style={{ transform: `translateZ(${tuning.depth * depth}px)` }}>
      {children}
    </div>
  )
}

/** The flip button. Renders nothing when the card's tuning turns flipping off. */
export function FlipCardTurn({ "aria-label": label }: { "aria-label": string }) {
  const { tuning, turns, turn, reduced } = useFlipCard()
  if (!tuning.flip) return null
  return (
    <button
      type="button"
      onClick={turn}
      aria-label={label}
      className="ml-auto grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
    >
      {/* The arrow turns half a turn counterclockwise with every flip, so each face always shows it the same way.
          It waits until the incoming face is turned toward the viewer, or the turn would finish out of sight. */}
      <motion.span
        className="block"
        animate={{ rotate: turns * -180 }}
        transition={reduced ? { duration: 0 } : { ...spring(400, 22), delay: 0.2 }}
      >
        <RotateCcw className="size-4" />
      </motion.span>
    </button>
  )
}

// One side of the card. Every descendant hides its backface too: with preserve-3d each layer
// is its own plane, so hiding only the face would let its floating layers show through the back.
function Face({
  children,
  className,
  style,
  hidden,
}: {
  children: ReactNode
  className: string
  style: CSSProperties
  hidden: boolean
}) {
  return (
    <div
      aria-hidden={hidden}
      inert={hidden}
      className={`${className} flex flex-col rounded-3xl border border-black/[0.07] backface-hidden transform-3d dark:border-white/10 [&_*]:backface-hidden`}
      style={style}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-7 mix-blend-multiply dark:opacity-12 dark:mix-blend-screen"
        style={{ backgroundImage: grain }}
      />
      {children}
    </div>
  )
}
