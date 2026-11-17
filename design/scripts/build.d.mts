// Types for the parts of build.mjs that the app's build (design/vitePlugin.ts, pwa/vitePwa.ts) uses.

export interface FontFace {
  family: string;
  file: string;
  weight: string;
  style: string;
}

export interface Tokens {
  color: { themes: { id: string }[]; tokens: { name: string; value: string | Record<string, string> }[] };
  type: { fonts: FontFace[] };
}

export const DESIGN: string;
export const TOKENS_PATH: string;
export const CSS_PATH: string;
export function readTokens(): Tokens;
/** `fontBase` is the path from the stylesheet to design/system/. */
export function compile(tokens: Tokens, fontBase?: string): string;
/** A color token's literal value in one theme, following aliases. */
export function resolveColor(tokens: Tokens, name: string, theme: string): string;
