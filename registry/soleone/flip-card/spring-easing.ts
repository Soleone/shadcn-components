export function springEasing(stiffness: number, damping: number, mass = 1) {
  // A spring sampled into a CSS linear() easing. A transition with this easing runs on the compositor,
  // so it stays smooth while the main thread is busy hydrating or decoding, which a JS-driven spring is not.
  const omega = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  const decay = zeta * omega

  // Displacement from rest as a fraction of the distance travelled, 1 at t=0 and 0 once settled.
  const offset = (t: number) => {
    if (zeta < 1) {
      const damped = omega * Math.sqrt(1 - zeta * zeta)
      return Math.exp(-decay * t) * (Math.cos(damped * t) + (decay / damped) * Math.sin(damped * t))
    }
    return Math.exp(-omega * t) * (1 + omega * t)
  }

  // Settled once the swing stays under half a percent: take the last frame (of 60 per second) that is still above it.
  let settle = 1 / 60
  for (let t = 0; t < 4; t += 1 / 60) if (Math.abs(offset(t)) > 0.005) settle = t + 1 / 60

  const steps = Math.max(12, Math.round(settle * 60))
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * settle
    return +(1 - offset(t)).toFixed(4)
  })
  points[points.length - 1] = 1

  return { duration: Math.round(settle * 1000), easing: `linear(${points.join(", ")})` }
}
