/** Replace C0/C1 control characters, which is where ANSI escape sequences start. */
export const stripControls = (s: string, with_ = "") => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, with_);

/**
 * Make text another player wrote safe to put in a terminal (or anywhere): drop C0/C1 control
 * characters (which carry ANSI escape sequences), bidi overrides and zero-width characters,
 * collapse whitespace, and cap the length.
 */
export function safeText(input: unknown, max = 64): string {
  const s = stripControls(String(input ?? ""), " ")
    .replace(/[​-‏‪-‮⁠-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...s].slice(0, max).join("");
}
