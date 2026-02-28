import { createToaster } from '@ark-ui/vue'

export const toaster = createToaster({
  placement: 'top-end',
  duration: 5000,
  max: 5,
})
