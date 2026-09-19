<script setup lang="ts">
import { Button, Dialog, Input } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { ref, watch } from 'vue'
import { BudgetExtension } from '../budget-extension'
import type { BudgetPlace } from '../model'
import BudgetFormField from './BudgetFormField.vue'
import { errorMessage } from './budget-ui'

const props = defineProps<{
  open: boolean
  previous?: BudgetPlace
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  saved: [place: BudgetPlace]
}>()

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'md'
const name = ref('')
const latitude = ref('')
const longitude = ref('')
const error = ref<string | null>(null)
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.previous?.name ?? ''
    latitude.value = props.previous?.latitude == null ? '' : String(props.previous.latitude)
    longitude.value = props.previous?.longitude == null ? '' : String(props.previous.longitude)
    error.value = null
  },
)

function coordinates(): Pick<BudgetPlace, 'latitude' | 'longitude'> | null {
  const latitudeText = latitude.value.trim()
  const longitudeText = longitude.value.trim()
  if (!latitudeText && !longitudeText) return { latitude: null, longitude: null }
  if (!latitudeText || !longitudeText) {
    error.value = 'Enter both latitude and longitude, or leave both empty.'
    return null
  }
  const parsedLatitude = Number(latitudeText.replace(',', '.'))
  const parsedLongitude = Number(longitudeText.replace(',', '.'))
  if (!Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90) {
    error.value = 'Latitude must be between -90 and 90.'
    return null
  }
  if (!Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180) {
    error.value = 'Longitude must be between -180 and 180.'
    return null
  }
  return { latitude: parsedLatitude, longitude: parsedLongitude }
}

async function save(): Promise<void> {
  error.value = null
  const normalizedName = name.value.trim()
  if (!normalizedName) {
    error.value = 'Enter a place name.'
    return
  }
  const point = coordinates()
  if (!point) return

  try {
    saving.value = true
    const place = await budget.savePlace({ name: normalizedName, ...point }, props.previous)
    emit('update:open', false)
    emit('saved', place)
  } catch (cause) {
    arxhub.logger.error('[budget] could not save place', cause)
    error.value = errorMessage(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :open="open"
    :title="previous ? 'Edit place' : 'New place'"
    size="sm"
    :close-on-escape="!saving"
    :close-on-interact-outside="!saving"
    @update:open="emit('update:open', $event)"
  >
    <form id="budget-place-form" class="form" @submit.prevent="save">
      <BudgetFormField label="Name" for-id="budget-place-name">
        <Input id="budget-place-name" v-model="name" autocomplete="off" placeholder="Corner shop" :disabled="saving" />
      </BudgetFormField>
      <div class="coordinates">
        <BudgetFormField label="Latitude" for-id="budget-place-latitude" hint="Optional">
          <Input id="budget-place-latitude" v-model="latitude" inputmode="decimal" autocomplete="off" placeholder="54.7104" :disabled="saving" />
        </BudgetFormField>
        <BudgetFormField label="Longitude" for-id="budget-place-longitude" hint="Optional">
          <Input id="budget-place-longitude" v-model="longitude" inputmode="decimal" autocomplete="off" placeholder="20.4522" :disabled="saving" />
        </BudgetFormField>
      </div>
      <p class="hint">Coordinates let new purchases recognize this place nearby.</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <Button :size="buttonSize" variant="secondary" :disabled="saving" @click="emit('update:open', false)">Cancel</Button>
      <Button :size="buttonSize" type="submit" form="budget-place-form" :disabled="saving">
        {{ saving ? 'Saving…' : 'Save place' }}
      </Button>
    </template>
  </Dialog>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.coordinates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.hint,
.form-error {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.hint {
  color: var(--gray-11);
}

.form-error {
  padding: 8px 12px;
  border: 1px solid var(--danger-6);
  border-radius: var(--radius-sm);
  background: var(--danger-2);
  color: var(--danger-11);
}
</style>
