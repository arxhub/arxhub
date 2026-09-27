import { t } from '../i18n/messages'

// What the first device shows as "<device> is connecting". The joiner names itself, and the relay
// trusts nothing about it, so this is only a hint for the owner comparing the digits — which is why a
// rough guess from the user agent is enough, and why it never includes anything more identifying.
export function describeThisDevice(userAgent: string): string {
  const ua = userAgent.toLowerCase()
  if (ua.includes('iphone')) return 'iPhone'
  if (ua.includes('ipad')) return 'iPad'
  if (ua.includes('android')) return ua.includes('mobile') ? t('entry.device.androidPhone') : t('entry.device.androidTablet')
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'Mac'
  if (ua.includes('windows')) return t('entry.device.windows')
  if (ua.includes('cros')) return 'Chromebook'
  if (ua.includes('linux')) return t('entry.device.linux')
  return t('entry.device.unknown')
}
