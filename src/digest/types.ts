// Plan morning-digest § 1. The contract every part of § 2 builds against; the reader comes after.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl.
export type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

// One row per job. Times keep the log's offset, never converted to UTC.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse: counted, never thrown
  counts: Record<RunStatus, number>; // log lines by status, bad lines excluded (§ 2c)
};

// `night` is YYYY-MM-DD; anything else, or no file for it, returns null (→ 404).
export type ReadNight = (runsDir: string, night: string) => Night | null;
