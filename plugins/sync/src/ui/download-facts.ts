import { formatBytes } from '@arxhub/stdlib/format/bytes'
import type { FetchProgress } from '@arxhub/sync'

export interface DownloadFacts {
  // 0–100, for the bar.
  percent: number
  documents: string
  downloaded: string
  cloud: string
}

// The download screen's three lines. Before the first read-out there is nothing to count yet, which is
// said as a dash rather than as "0 of 0" — the second reads as an empty vault.
export function downloadFacts(progress: FetchProgress | null): DownloadFacts {
  if (progress == null) return { percent: 0, documents: '—', downloaded: '—', cloud: '—' }
  const { filesDone, filesTotal, bytesDone, bytesTotal, cloudBytes } = progress
  // Bytes when the manifest knows them; files when it does not (an old manifest without sizes).
  const percent = bytesTotal > 0 ? (bytesDone / bytesTotal) * 100 : filesTotal > 0 ? (filesDone / filesTotal) * 100 : 100
  return {
    percent: Math.min(100, Math.round(percent)),
    documents: `${filesDone.toLocaleString('en-US')} of ${filesTotal.toLocaleString('en-US')}`,
    downloaded: `${formatBytes(bytesDone)} of ${formatBytes(bytesTotal)}`,
    cloud: formatBytes(cloudBytes),
  }
}
