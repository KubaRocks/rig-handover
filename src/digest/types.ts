// Plan morning-digest § 1. The contract every part of § 2 starts from: keep these names.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job for a night, built from runs/<night>.jsonl.
export type DigestRow = {
  job: string;
  owner: string | null; // null kept; views show '—'
  runs: number; // lines for this job
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus;
  lastError: string | null; // error of the last line for this job, or null
  firstAt: string; // 'at' exactly as in the log (keep the offset)
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job (plain string compare)
  badLines: number; // lines that did not parse or failed validation; blank lines ignored
  counts: { ok: number; retry: number; fail: number }; // per line, over parsed lines
};

// Returns null when runs/<night>.jsonl does not exist (or night is not YYYY-MM-DD).
// Empty file → rows []. Implemented by readNight in ./read.ts.
export type ReadNight = (runsDir: string, night: string) => Night | null;
