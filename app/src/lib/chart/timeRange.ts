// Time-range math shared by every chart and the layout-level range toggle.
//
// Given a named range ('1h' | '24h' | '7d' | '30d') and a reference timestamp,
// returns the half-open window [startMs, endMs) plus a suggested bucketMs for
// aggregating samples into fixed-width columns. Bucket sizes are picked so
// each window yields roughly 60–360 buckets: dense enough for smooth sparklines
// but coarse enough to keep rendering cheap.

export type TimeRange = '1h' | '24h' | '7d' | '30d';

export interface TimeWindow {
  /** Inclusive start of the window, in ms since epoch. */
  startMs: number;
  /** Exclusive end of the window (== now passed to the call), in ms since epoch. */
  endMs: number;
  /** Suggested bucket size in ms for aggregation. */
  bucketMs: number;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// span: total window duration; bucketMs: aggregation width.
// Monotonic in both span and bucketMs, which keeps chart detail roughly constant.
const RANGES: Record<TimeRange, { span: number; bucketMs: number }> = {
  '1h':  { span: 1 * HOUR,  bucketMs: 1 * MINUTE   }, //  60 buckets
  '24h': { span: 24 * HOUR, bucketMs: 5 * MINUTE   }, // 288 buckets
  '7d':  { span: 7 * DAY,   bucketMs: 30 * MINUTE  }, // 336 buckets
  '30d': { span: 30 * DAY,  bucketMs: 3 * HOUR     }  // 240 buckets
};

export function timeRangeWindow(range: TimeRange, now: number = Date.now()): TimeWindow {
  const { span, bucketMs } = RANGES[range];
  return {
    startMs: now - span,
    endMs: now,
    bucketMs
  };
}
