export interface LimitWindow {
  usedPercentage: number;
  /** Epoch milliseconds. */
  resetsAt: number;
}

export interface Limits {
  /** The 5-hour window; null when unknown. */
  session: LimitWindow | null;
  weekly: LimitWindow | null;
}

/** Is limit tracking (our status line in Claude's settings.json) set up? */
export type TrackingStatus = 'enabled' | 'off' | 'other' | 'unreadable';

export interface ProjectTokens {
  project: string;
  tokens: number;
}

/** What /api/usage (and POST /api/usage/enable) returns. */
export interface UsagePayload {
  tracking: TrackingStatus;
  limits: Limits;
  /** This week's tokens, highest first. */
  projects: ProjectTokens[];
}
