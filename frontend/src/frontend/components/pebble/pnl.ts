// src/frontend/components/pebble/pnl.ts

/**
 * The colour a gain or a loss is written in.
 *
 * Semantic, and deliberately neither accent: green up, red down, grey at zero.
 * Orange means "you can press this" and purple means "this is a chart", so
 * neither can also mean "you made money".
 */
export function pnlClass(value: number): string {
  if (value > 0) {
    return "text-pb-up";
  }
  if (value < 0) {
    return "text-pb-down";
  }
  return "text-pb-flat";
}
