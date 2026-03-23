/**
 * Helpers for predictable OPFS filenames per download-queue task and explicit cache eviction.
 */

export async function removeOpfsFileByName(fileName: string): Promise<void> {
  if (!fileName || typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return;
  }
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(fileName);
  } catch {
    // ignore missing file or permission errors
  }
}

/**
 * Stable OPFS filename for a task id (safe for FileSystemHandle names).
 */
export function buildOpfsFileNameForTask(taskId: string, format: 'm3u8' | 'mp4' | 'webm'): string {
  const safe = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = format === 'm3u8' ? 'ts' : format === 'webm' ? 'webm' : 'mp4';
  return `vd-ext-${safe}.${ext}`;
}
