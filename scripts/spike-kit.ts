// Shared bits for the spike scripts: PASS/FAIL checks and the room type that keeps spike fires
// out of real play.

export const SPIKE_TYPE = "watchfire-spike";

let failures = 0;

/** Print PASS or FAIL for one check. */
export function expect(what: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
}

/** Print the summary and exit non-zero if any check failed. */
export function finish(): never {
  console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}
