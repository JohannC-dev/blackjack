export function motionDuration(normal: number, reduced: number) {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? reduced
    : normal;
}
