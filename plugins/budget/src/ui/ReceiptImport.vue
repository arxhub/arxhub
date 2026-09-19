<script setup lang="ts">
import { validation } from '@arxhub/errors'
import { Button, Icon, Input, Segmented } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { onBeforeUnmount, ref, watch } from 'vue'
import { BudgetExtension } from '../budget-extension'
import { fiscalQr, type ImportedReceipt, parseFiscalFields, parseFiscalQr, parseReceiptJson } from '../fiscal'
import type { FiscalReceipt } from '../model'
import { formatAmount } from '../money'
import BudgetFormField from './BudgetFormField.vue'
import { amountInput, errorMessage } from './budget-ui'

const props = defineProps<{
  active: boolean
  receipt: FiscalReceipt | null
  dirty?: boolean
  position?: { latitude: number; longitude: number } | null
  disabled?: boolean
}>()
const emit = defineEmits<{
  apply: [receipt: FiscalReceipt, imported: ImportedReceipt | null]
  clear: []
  dirty: [dirty: boolean]
  photo: [file: File]
}>()

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'md'
const glyphSize = touch ? 16 : 14
const cameraInput = ref<HTMLInputElement>()
const photoInput = ref<HTMLInputElement>()
const jsonInput = ref<HTMLInputElement>()
const qr = ref('')
const fn = ref('')
const fd = ref('')
const fp = ref('')
const issuedAt = ref('')
const receiptAmount = ref('')
const operation = ref('1')
const preview = ref<FiscalReceipt | null>(null)
const imported = ref<ImportedReceipt | null>(null)
const error = ref<string | null>(null)
const working = ref(false)
let run = 0
let controller: AbortController | null = null
let filling = false

const operationOptions = [
  { value: '1', label: 'Expense' },
  { value: '2', label: 'Refund income' },
]

watch(
  () => props.active,
  (active) => {
    if (!active) {
      cancelWork()
      return
    }
    if (!props.dirty) {
      fill(props.receipt)
      preview.value = props.receipt
      imported.value = null
    }
    error.value = null
  },
  { immediate: true },
)

watch(
  () => props.receipt,
  (receipt) => {
    if (props.active && !props.dirty) {
      fill(receipt)
      preview.value = receipt
      imported.value = null
    }
  },
)

watch(
  [qr, fn, fd, fp, issuedAt, receiptAmount, operation],
  () => {
    if (filling) return
    preview.value = null
    imported.value = null
    emit('dirty', true)
  },
  { flush: 'sync' },
)

function fill(receipt: FiscalReceipt | null): void {
  filling = true
  qr.value = receipt ? fiscalQr(receipt) : ''
  fn.value = receipt?.fn ?? ''
  fd.value = receipt?.fd ?? ''
  fp.value = receipt?.fp ?? ''
  issuedAt.value = receipt?.issuedAt ?? ''
  receiptAmount.value = receipt ? amountInput(receipt.total, 'RUB') : ''
  operation.value = String(receipt?.operation ?? 1)
  filling = false
}

function cancelWork(): void {
  run++
  controller?.abort()
  controller = null
  working.value = false
}

onBeforeUnmount(cancelWork)

function supported(receipt: FiscalReceipt): FiscalReceipt {
  if (receipt.operation !== 1 && receipt.operation !== 2) {
    throw validation('Only purchase and purchase return receipts can be imported.')
  }
  return receipt
}

function parseQrText(raw: string): void {
  error.value = null
  try {
    const receipt = supported(parseFiscalQr(raw))
    fill(receipt)
    preview.value = receipt
    imported.value = null
    emit('dirty', true)
  } catch (cause) {
    error.value = errorMessage(cause)
  }
}

function reviewManual(): void {
  error.value = null
  try {
    const receipt = supported(
      parseFiscalFields({
        fn: fn.value,
        fd: fd.value,
        fp: fp.value,
        issuedAt: issuedAt.value,
        amount: receiptAmount.value,
        operation: operation.value,
      }),
    )
    preview.value = receipt
    imported.value = null
    emit('dirty', true)
  } catch (cause) {
    error.value = errorMessage(cause)
  }
}

function choose(input: HTMLInputElement | undefined): void {
  input?.click()
}

async function scanSelected(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  cancelWork()
  const current = ++run
  const activeController = new AbortController()
  controller = activeController
  working.value = true
  error.value = null
  try {
    const raw = await budget.scanReceiptPhoto(file, { signal: activeController.signal })
    if (current !== run || !props.active) return
    if (!raw) throw validation('No fiscal QR code was found in this image.')
    qr.value = raw
    parseQrText(raw)
    if (!error.value) emit('photo', file)
  } catch (cause) {
    if (current === run && !activeController.signal.aborted) error.value = errorMessage(cause)
  } finally {
    if (current === run) {
      working.value = false
      controller = null
    }
  }
}

async function importJson(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const current = ++run
  working.value = true
  error.value = null
  try {
    if (file.size > 4 * 1024 * 1024) throw validation('Receipt JSON files can be up to 4 MB.')
    const value: unknown = JSON.parse(await file.text())
    if (current !== run || !props.active) return
    const result = parseReceiptJson(value, preview.value ?? undefined)
    supported(result.fiscalReceipt)
    fill(result.fiscalReceipt)
    preview.value = result.fiscalReceipt
    imported.value = result
    emit('dirty', true)
  } catch (cause) {
    if (current === run) error.value = errorMessage(cause)
  } finally {
    if (current === run) working.value = false
  }
}

async function getDetails(): Promise<void> {
  if (!preview.value) return
  cancelWork()
  const current = ++run
  const activeController = new AbortController()
  controller = activeController
  working.value = true
  error.value = null
  try {
    const position = props.position ?? (await budget.locate({ signal: activeController.signal }))
    if (current !== run || !props.active) return
    const result = await budget.lookupReceipt(preview.value, { signal: activeController.signal, position })
    if (current !== run || !props.active) return
    imported.value = result
  } catch (cause) {
    if (current === run && !activeController.signal.aborted) error.value = errorMessage(cause)
  } finally {
    if (current === run) {
      working.value = false
      controller = null
    }
  }
}

function apply(): void {
  if (preview.value) emit('apply', preview.value, imported.value)
}

function clear(): void {
  cancelWork()
  filling = true
  qr.value = ''
  filling = false
  fill(null)
  preview.value = null
  imported.value = null
  error.value = null
  emit('clear')
}
</script>

<template>
  <section class="receipt" :class="{ touch }" aria-labelledby="fiscal-receipt-heading">
    <div>
      <h3 id="fiscal-receipt-heading">Fiscal receipt</h3>
      <p>Optional. Scan its QR, paste the QR text, or enter the fiscal details.</p>
    </div>

    <input ref="cameraInput" type="file" accept="image/*" capture="environment" aria-label="Scan receipt QR with camera" hidden @change="scanSelected" />
    <input ref="photoInput" type="file" accept="image/*" aria-label="Scan receipt QR from photo" hidden @change="scanSelected" />
    <input ref="jsonInput" type="file" accept="application/json,.json" aria-label="Import receipt JSON" hidden @change="importJson" />
    <div class="receipt-actions">
      <Button :size="buttonSize" variant="secondary" :disabled="disabled || working" @click="choose(cameraInput)">
        <Icon name="lu:scan-line" :size="glyphSize" />
        Scan QR
      </Button>
      <Button :size="buttonSize" variant="secondary" :disabled="disabled || working" @click="choose(photoInput)">Choose QR photo</Button>
      <Button :size="buttonSize" variant="secondary" :disabled="disabled || working" @click="choose(jsonInput)">Import JSON</Button>
    </div>

    <BudgetFormField label="Receipt QR text" for-id="budget-receipt-qr" hint="Paste the text encoded in the QR">
      <div class="with-action">
        <Input id="budget-receipt-qr" v-model="qr" autocomplete="off" placeholder="t=…&amp;s=…&amp;fn=…" :disabled="disabled || working" />
        <Button :size="buttonSize" variant="secondary" :disabled="disabled || working || !qr.trim()" @click="parseQrText(qr)">Read QR</Button>
      </div>
    </BudgetFormField>

    <div class="fiscal-fields">
      <BudgetFormField label="FN" for-id="budget-receipt-fn"><Input id="budget-receipt-fn" v-model="fn" inputmode="numeric" :disabled="disabled || working" /></BudgetFormField>
      <BudgetFormField label="FD" for-id="budget-receipt-fd"><Input id="budget-receipt-fd" v-model="fd" inputmode="numeric" :disabled="disabled || working" /></BudgetFormField>
      <BudgetFormField label="FP" for-id="budget-receipt-fp"><Input id="budget-receipt-fp" v-model="fp" inputmode="numeric" :disabled="disabled || working" /></BudgetFormField>
    </div>
    <BudgetFormField label="Receipt date and time" for-id="budget-receipt-issued-at">
      <Input id="budget-receipt-issued-at" v-model="issuedAt" type="datetime-local" :disabled="disabled || working" />
    </BudgetFormField>
    <div class="fiscal-fields two">
      <BudgetFormField label="Receipt total, RUB" for-id="budget-receipt-total">
        <Input id="budget-receipt-total" v-model="receiptAmount" inputmode="decimal" placeholder="0.00" :disabled="disabled || working" />
      </BudgetFormField>
      <BudgetFormField label="Operation">
        <Segmented
          :model-value="operation"
          :options="operationOptions"
          aria-label="Receipt operation"
          stretch
          :disabled="disabled || working"
          @update:model-value="operation = $event ?? '1'"
        />
      </BudgetFormField>
    </div>
    <div class="manual-actions">
      <Button :size="buttonSize" variant="secondary" :disabled="disabled || working" @click="reviewManual">Review fiscal details</Button>
      <Button v-if="dirty || receipt" :size="buttonSize" variant="danger" :disabled="disabled || working" @click="clear">
        Remove fiscal receipt
      </Button>
    </div>

    <p v-if="dirty" class="draft-warning" role="status">These fiscal changes are not applied yet. Review them and use the receipt before saving.</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div v-if="preview" class="preview" aria-label="Receipt preview">
      <div>
        <strong>{{ imported?.merchantName || 'Fiscal receipt' }}</strong>
        <span>{{ formatAmount(preview.total, 'RUB') }} · {{ preview.issuedAt.replace('T', ' ') }}</span>
        <span v-if="imported?.address">{{ imported.address }}</span>
        <span>FN {{ preview.fn }} · FD {{ preview.fd }} · FP {{ preview.fp }}</span>
      </div>
      <ul v-if="imported" class="receipt-items">
        <li v-for="item in imported.items" :key="item.id">
          <span>{{ item.name }} × {{ item.quantity }}</span><strong>{{ formatAmount(item.total, 'RUB') }}</strong>
        </li>
      </ul>
      <p v-else>Fiscal details are ready. Receipt items require configured receipt access or a receipt JSON file.</p>
      <div class="preview-actions">
        <Button :size="buttonSize" variant="secondary" :disabled="disabled || working" @click="getDetails">
          {{ working ? 'Getting details…' : 'Get receipt details' }}
        </Button>
        <Button :size="buttonSize" :disabled="disabled || working" @click="apply">Use receipt</Button>
      </div>
      <p class="fns-note">Getting receipt details sends the fiscal details and your current location to the Federal Tax Service.</p>
    </div>
  </section>
</template>

<style scoped>
.receipt {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h3,
.receipt p {
  margin: 0;
}

h3 {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.receipt > div:first-child p,
.preview span,
.preview > p,
.fns-note {
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

.receipt-actions,
.manual-actions,
.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.with-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.fiscal-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.fiscal-fields.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.draft-warning,
.form-error {
  padding: 8px 12px;
  border: 1px solid var(--warning-6);
  border-radius: var(--radius-sm);
  background: var(--warning-2);
  color: var(--warning-11);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.form-error {
  border-color: var(--danger-6);
  background: var(--danger-2);
  color: var(--danger-11);
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
}

.preview > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.receipt-items {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  gap: 4px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.receipt-items li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.receipt-items span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.receipt-items strong {
  flex-shrink: 0;
}

.receipt.touch .with-action,
.receipt.touch .fiscal-fields,
.receipt.touch .fiscal-fields.two {
  grid-template-columns: minmax(0, 1fr);
}
</style>
