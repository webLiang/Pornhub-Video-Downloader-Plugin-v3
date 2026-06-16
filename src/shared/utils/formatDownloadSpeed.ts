/**
 * Format download speed (bytes per second) for UI display.
 * Aligned with VDH main.js bitrate sampling and xc-chrome-plugin formatSpeed.
 */
export function formatDownloadSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '—';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

type SpeedSampleState = {
  lastBytes: number;
  lastTime: number;
  speedBps: number;
};

/**
 * Track per-task speed from monotonic byte counters (VDH: fetched_bytes_count delta / time).
 */
export class DownloadSpeedTracker {
  private readonly samples = new Map<string, SpeedSampleState>();

  /** Compute formatted speed; returns "—" until enough bytes/time have elapsed. */
  update(taskId: string, fetchedBytes: number, hideSpeed = false): string {
    if (hideSpeed || fetchedBytes <= 0) {
      return '—';
    }

    const now = Date.now();
    const state = this.samples.get(taskId);
    if (!state) {
      this.samples.set(taskId, { lastBytes: fetchedBytes, lastTime: now, speedBps: 0 });
      return '—';
    }

    const elapsed = now - state.lastTime;
    if (elapsed > 100) {
      const delta = fetchedBytes - state.lastBytes;
      state.speedBps = delta > 0 ? delta / (elapsed / 1000) : 0;
      state.lastBytes = fetchedBytes;
      state.lastTime = now;
    }

    return formatDownloadSpeed(state.speedBps);
  }

  clear(taskId: string): void {
    this.samples.delete(taskId);
  }
}
