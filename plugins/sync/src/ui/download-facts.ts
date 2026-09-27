import { formatBytes, formatNumber } from '@arxhub/i18n'
import type { FetchProgress } from '@arxhub/sync'
import { t } from '../i18n/messages'

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
    documents: t('download.of', { done: formatNumber(filesDone), total: formatNumber(filesTotal) }),
    downloaded: t('download.of', { done: formatBytes(bytesDone), total: formatBytes(bytesTotal) }),
    cloud: formatBytes(cloudBytes),
  }
}
