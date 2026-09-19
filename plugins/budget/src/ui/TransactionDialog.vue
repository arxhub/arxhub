<script setup lang="ts">
import { Button, Dialog, Dropdown, Icon, Input, MenuItem, Segmented } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { type ComponentPublicInstance, computed, nextTick, ref, watch } from 'vue'
import { BudgetExtension } from '../budget-extension'
import type { ImportedReceipt } from '../fiscal'
import type { BudgetAttachment, BudgetTransaction, FiscalReceipt, TransactionKind } from '../model'
import { formatAmount, parseAmount } from '../money'
import { nearestKnownPlace } from '../places'
import BudgetFormField from './BudgetFormField.vue'
import { accountCurrency, amountInput, errorMessage, localDate } from './budget-ui'
import PurchaseItemsEditor from './PurchaseItemsEditor.vue'
import { itemsSubtotal, type PurchaseItemDraft, purchaseItemDraft, purchaseItems } from './purchase-draft'
import ReceiptImport from './ReceiptImport.vue'
import ReceiptPhotosEditor from './ReceiptPhotosEditor.vue'

const props = defineProps<{ open: boolean; previous?: BudgetTransaction }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>()

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'md'
const kind = ref<TransactionKind>('expense')
const accountId = ref('')
const categoryId = ref('')
const placeId = ref('')
const amount = ref('')
const date = ref(localDate())
const note = ref('')
const itemDrafts = ref<PurchaseItemDraft[]>([])
const existingAttachments = ref<BudgetAttachment[]>([])
const removedAttachments = ref<BudgetAttachment[]>([])
const photoFiles = ref<File[]>([])
const fiscalReceipt = ref<FiscalReceipt | null>(null)
const receiptDirty = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const amountElement = ref<ComponentPublicInstance | null>(null)
const locationState = ref<'idle' | 'locating' | 'matched' | 'selected' | 'choose' | 'unavailable'>('idle')
const currentLocation = ref<{ latitude: number; longitude: number; accuracy: number } | null>(null)
const addingPlace = ref(false)
const newPlaceName = ref('')
const savingPlace = ref(false)
const receiptOpen = ref(false)
const detailsOpen = ref(false)
const uploaded = new Map<File, BudgetAttachment>()
let locationController: AbortController | null = null
let locationRun = 0
let resetting = false
let rememberedAccountId = ''
const rememberedCategoryIds: Partial<Record<TransactionKind, string>> = {}

const kindOptions = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
]
const accounts = computed(() => budget.data.value.accounts)
const categories = computed(() => budget.data.value.categories.filter((entry) => entry.kind === kind.value))
const places = computed(() => budget.data.value.places)
const account = computed(() => accounts.value.find((entry) => entry.id === accountId.value))
const category = computed(() => categories.value.find((entry) => entry.id === categoryId.value))
const place = computed(() => places.value.find((entry) => entry.id === placeId.value))
const currency = computed(() => account.value?.currency ?? 'RUB')
const ready = computed(() => !!account.value && !!category.value)
const dialogTitle = computed(() => (props.previous ? 'Edit transaction' : 'New transaction'))
const detailsSummary = computed(() =>
  [kind.value === 'expense' ? 'Expense' : 'Income', account.value?.name, category.value?.name, date.value].filter(Boolean).join(' · '),
)
const subtotal = computed(() => itemsSubtotal(itemDrafts.value, currency.value))
const enteredAmount = computed(() => {
  try {
    const value = parseAmount(amount.value, currency.value)
    return value > 0 ? value : null
  } catch {
    return null
  }
})
const subtotalMismatch = computed(
  () => itemDrafts.value.length > 0 && subtotal.value !== null && enteredAmount.value !== null && subtotal.value !== enteredAmount.value,
)

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      cancelLocation()
      return
    }
    resetting = true
    const previous = props.previous
    kind.value = previous?.kind ?? 'expense'
    const latest = latestTransaction(kind.value)
    accountId.value = previous?.accountId ?? sensibleId(rememberedAccountId, accounts.value) ?? latest?.accountId ?? accounts.value[0]?.id ?? ''
    categoryId.value =
      previous?.categoryId ??
      sensibleId(rememberedCategoryIds[kind.value] ?? '', categories.value) ??
      latest?.categoryId ??
      categories.value[0]?.id ??
      ''
    placeId.value = previous?.placeId ?? ''
    const valueCurrency = previous ? accountCurrency(budget.data.value, previous.accountId) : currency.value
    amount.value = previous ? amountInput(previous.amount, valueCurrency) : ''
    date.value = previous?.date ?? localDate()
    note.value = previous?.note ?? ''
    itemDrafts.value = previous?.items.map((item) => purchaseItemDraft(item, valueCurrency)) ?? []
    existingAttachments.value = [...(previous?.attachments ?? [])]
    removedAttachments.value = []
    photoFiles.value = []
    fiscalReceipt.value = previous?.fiscalReceipt ?? null
    receiptDirty.value = false
    locationState.value = previous?.placeId ? 'selected' : 'idle'
    currentLocation.value = null
    addingPlace.value = false
    newPlaceName.value = ''
    receiptOpen.value = !!previous?.fiscalReceipt || !!previous?.attachments.length
    detailsOpen.value = false
    error.value = null
    resetting = false
    if (!previous && kind.value === 'expense') void findNearbyPlace()
    await nextTick()
    const input = amountElement.value?.$el
    if (input instanceof HTMLInputElement) input.focus()
  },
)

watch(kind, (next) => {
  if (resetting) return
  if (!categories.value.some((entry) => entry.id === categoryId.value)) {
    const latest = latestTransaction(next)
    categoryId.value = sensibleId(rememberedCategoryIds[next] ?? '', categories.value) ?? latest?.categoryId ?? categories.value[0]?.id ?? ''
  }
  if (!props.previous && next === 'expense' && !placeId.value) void findNearbyPlace()
  if (next === 'income') cancelLocation()
})

function sensibleId<T extends { id: string }>(id: string, values: readonly T[]): string | undefined {
  return values.some((entry) => entry.id === id) ? id : undefined
}

function latestTransaction(transactionKind: TransactionKind): BudgetTransaction | undefined {
  return budget.data.value.transactions.reduce<BudgetTransaction | undefined>((latest, entry) => {
    if (entry.kind !== transactionKind) return latest
    return !latest || entry.date >= latest.date ? entry : latest
  }, undefined)
}

function cancelLocation(): void {
  locationRun++
  locationController?.abort()
  locationController = null
  if (locationState.value === 'locating') locationState.value = 'idle'
}

async function findNearbyPlace(): Promise<void> {
  cancelLocation()
  const run = ++locationRun
  const controller = new AbortController()
  locationController = controller
  locationState.value = 'locating'
  try {
    const point = await budget.locate({ signal: controller.signal })
    if (run !== locationRun || !props.open) return
    currentLocation.value = point
    const match = nearestKnownPlace(point, places.value)
    if (match) {
      placeId.value = match.place.id
      locationState.value = 'matched'
    } else {
      placeId.value = ''
      locationState.value = 'choose'
    }
  } catch (cause) {
    if (run !== locationRun || controller.signal.aborted) return
    arxhub.logger.info('[budget] current place was not available', cause)
    locationState.value = 'unavailable'
  } finally {
    if (run === locationRun) locationController = null
  }
}

async function saveInlinePlace(): Promise<void> {
  cancelLocation()
  const name = newPlaceName.value.trim()
  if (!name) {
    error.value = 'Enter a place name.'
    return
  }
  try {
    savingPlace.value = true
    error.value = null
    const saved = await budget.savePlace({
      name,
      latitude: currentLocation.value?.latitude ?? null,
      longitude: currentLocation.value?.longitude ?? null,
    })
    placeId.value = saved.id
    addingPlace.value = false
    locationState.value = 'selected'
  } catch (cause) {
    arxhub.logger.error('[budget] could not save place', cause)
    error.value = errorMessage(cause)
  } finally {
    savingPlace.value = false
  }
}

function choosePlace(id: string): void {
  cancelLocation()
  placeId.value = id
  locationState.value = 'selected'
}

function toggleAddingPlace(): void {
  cancelLocation()
  addingPlace.value = !addingPlace.value
}

function removeExistingPhoto(attachment: BudgetAttachment): void {
  existingAttachments.value = existingAttachments.value.filter((entry) => entry.id !== attachment.id)
  removedAttachments.value.push(attachment)
}

function updatePhotoFiles(files: File[]): void {
  for (const [file, attachment] of uploaded) {
    if (files.includes(file)) continue
    uploaded.delete(file)
    void discardPhoto(attachment)
  }
  photoFiles.value = files
}

function addScannedPhoto(file: File): void {
  if (!photoFiles.value.includes(file)) photoFiles.value = [...photoFiles.value, file]
}

async function discardPhoto(attachment: BudgetAttachment): Promise<void> {
  try {
    await budget.discardReceiptPhoto(attachment)
  } catch (cause) {
    arxhub.logger.warn('[budget] could not discard unused receipt photo', cause)
  }
}

async function discardUploaded(): Promise<void> {
  const attachments = [...uploaded.values()]
  uploaded.clear()
  await Promise.all(attachments.map(discardPhoto))
}

function handleOpen(open: boolean): void {
  if (open) {
    emit('update:open', true)
    return
  }
  if (saving.value) return
  cancelLocation()
  void discardUploaded()
  emit('update:open', false)
}

function applyReceipt(receipt: FiscalReceipt, imported: ImportedReceipt | null): void {
  error.value = null
  const rubAccount = account.value?.currency === 'RUB' ? account.value : accounts.value.find((entry) => entry.currency === 'RUB')
  if (!rubAccount) {
    error.value = 'A fiscal receipt needs a RUB account. Create one before using this receipt.'
    return
  }
  accountId.value = rubAccount.id
  kind.value = receipt.operation === 1 ? 'expense' : 'income'
  categoryId.value =
    sensibleId(rememberedCategoryIds[kind.value] ?? '', categories.value) ??
    latestTransaction(kind.value)?.categoryId ??
    categories.value[0]?.id ??
    ''
  amount.value = amountInput(receipt.total, 'RUB')
  date.value = receipt.issuedAt.slice(0, 10)
  fiscalReceipt.value = receipt
  receiptDirty.value = false
  if (imported) {
    itemDrafts.value = imported.items.map((item) => purchaseItemDraft(item, 'RUB'))
    if (!note.value.trim()) note.value = imported.merchantName
    if (!placeId.value) {
      cancelLocation()
      addingPlace.value = true
      newPlaceName.value = imported.merchantName
    }
  }
}

function clearFiscalReceipt(): void {
  fiscalReceipt.value = null
  receiptDirty.value = false
  error.value = null
}

async function save(): Promise<void> {
  error.value = null
  if (receiptDirty.value) {
    receiptOpen.value = true
    error.value = 'Review and use the changed fiscal details, or remove the fiscal receipt before saving.'
    return
  }
  if (!account.value) {
    error.value = 'Choose an account.'
    return
  }
  if (!category.value) {
    error.value = `Create or choose an ${kind.value} category.`
    return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
    error.value = 'Choose a valid date.'
    return
  }
  if (!props.previous && kind.value === 'expense' && !place.value) {
    error.value = 'Choose a saved place or add this place before saving the purchase.'
    return
  }

  try {
    const minor = parseAmount(amount.value, currency.value)
    if (minor <= 0) {
      error.value = 'Amount must be greater than zero.'
      return
    }
    const items = purchaseItems(itemDrafts.value, currency.value)
    if (fiscalReceipt.value && (currency.value !== 'RUB' || fiscalReceipt.value.total !== minor)) {
      error.value = 'The account must use RUB and the amount must match the fiscal receipt total.'
      return
    }
    saving.value = true
    for (const file of photoFiles.value) {
      if (!uploaded.has(file)) uploaded.set(file, await budget.addReceiptPhoto(file))
    }
    const attachments = [
      ...existingAttachments.value,
      ...photoFiles.value.map((file) => uploaded.get(file)).filter((entry): entry is BudgetAttachment => !!entry),
    ]
    await budget.saveTransaction(
      {
        accountId: account.value.id,
        categoryId: category.value.id,
        kind: kind.value,
        amount: minor,
        date: date.value,
        note: note.value.trim(),
        placeId: place.value?.id ?? null,
        items,
        attachments,
        fiscalReceipt: fiscalReceipt.value,
      },
      props.previous,
    )
    rememberedAccountId = account.value.id
    rememberedCategoryIds[kind.value] = category.value.id
    uploaded.clear()
    await Promise.all(removedAttachments.value.map(discardPhoto))
    removedAttachments.value = []
    emit('update:open', false)
    emit('saved')
  } catch (cause) {
    arxhub.logger.error('[budget] could not save transaction', cause)
    error.value = errorMessage(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :open="open"
    :title="dialogTitle"
    size="lg"
    :close-on-escape="!saving"
    :close-on-interact-outside="!saving"
    @update:open="handleOpen"
  >
    <form id="budget-transaction-form" class="form" :class="{ touch }" @submit.prevent="save">
      <BudgetFormField label="Amount" for-id="budget-transaction-amount">
        <div class="amount-control">
          <Input
            id="budget-transaction-amount"
            ref="amountElement"
            v-model="amount"
            class="amount-input"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.00"
            :disabled="saving"
          />
          <span class="currency">{{ currency }}</span>
        </div>
      </BudgetFormField>

      <BudgetFormField :label="kind === 'expense' && !previous ? 'Place (required)' : 'Place'">
        <div class="place-actions">
          <Dropdown>
            <template #trigger>
              <Button class="choice" variant="secondary" :size="buttonSize" :disabled="saving || places.length === 0" aria-label="Place">
                <span>{{ place?.name ?? 'Choose place' }}</span>
                <Icon name="lu:chevron-down" :size="touch ? 16 : 14" />
              </Button>
            </template>
            <MenuItem v-for="entry in places" :key="entry.id" :value="entry.id" @select="choosePlace(entry.id)">{{ entry.name }}</MenuItem>
          </Dropdown>
          <Button :size="buttonSize" variant="secondary" :disabled="saving || locationState === 'locating'" @click="findNearbyPlace">
            {{ locationState === 'locating' ? 'Locating…' : 'Use nearby' }}
          </Button>
          <Button :size="buttonSize" variant="secondary" :disabled="saving" @click="toggleAddingPlace">Add place</Button>
        </div>
        <p v-if="locationState === 'matched' && place" class="choice-hint">Recognized {{ place.name }} nearby.</p>
        <p v-else-if="locationState === 'choose'" class="choice-hint">No saved place is nearby. Choose one or add the current place.</p>
        <p v-else-if="locationState === 'unavailable'" class="choice-hint">Location is unavailable. Choose a place or add one by name.</p>
        <div v-if="addingPlace" class="inline-place">
          <Input v-model="newPlaceName" aria-label="New place name" autocomplete="off" placeholder="Place name" :disabled="saving || savingPlace" />
          <Button :size="buttonSize" variant="secondary" :disabled="saving || savingPlace" @click="saveInlinePlace">
            {{ savingPlace ? 'Saving…' : 'Save place' }}
          </Button>
        </div>
      </BudgetFormField>

      <p v-if="subtotalMismatch" class="mismatch" role="status">
        Items add up to {{ formatAmount(subtotal ?? 0, currency) }}, while the transaction amount is {{ formatAmount(enteredAmount ?? 0, currency) }}.
      </p>
      <PurchaseItemsEditor v-model="itemDrafts" :currency="currency" :disabled="saving" />
      <Button class="receipt-toggle" :size="buttonSize" variant="secondary" :active="receiptOpen" @click="receiptOpen = !receiptOpen">
        <Icon name="lu:receipt-text" :size="touch ? 16 : 14" />
        {{ receiptOpen ? 'Hide receipt and photos' : 'Add receipt or photo' }}
      </Button>
      <div v-show="receiptOpen" class="receipt-details">
        <ReceiptPhotosEditor
          :existing="existingAttachments"
          :files="photoFiles"
          :disabled="saving"
          @update:files="updatePhotoFiles"
          @remove-existing="removeExistingPhoto"
        />
        <ReceiptImport
          :active="open"
          :receipt="fiscalReceipt"
          :dirty="receiptDirty"
          :position="currentLocation"
          :disabled="saving"
          @apply="applyReceipt"
          @clear="clearFiscalReceipt"
          @dirty="receiptDirty = $event"
          @photo="addScannedPhoto"
        />
      </div>

      <Button class="details-toggle" :size="buttonSize" variant="secondary" :active="detailsOpen" @click="detailsOpen = !detailsOpen">
        <span class="details-toggle-copy">
          <strong>{{ detailsOpen ? 'Hide transaction details' : 'Transaction details' }}</strong>
          <span>{{ detailsSummary }}</span>
        </span>
        <Icon :name="detailsOpen ? 'lu:chevron-up' : 'lu:chevron-down'" :size="touch ? 16 : 14" />
      </Button>
      <section v-if="detailsOpen" class="transaction-details" aria-label="Transaction details">
        <BudgetFormField label="Type">
          <Segmented
            :model-value="kind"
            :options="kindOptions"
            aria-label="Transaction type"
            stretch
            :disabled="saving"
            @update:model-value="kind = $event as TransactionKind"
          />
        </BudgetFormField>

        <div class="field-grid">
          <BudgetFormField label="Account">
            <Dropdown>
              <template #trigger>
                <Button
                  class="choice"
                  variant="secondary"
                  :size="buttonSize"
                  :disabled="saving || accounts.length === 0"
                  aria-label="Account"
                >
                  <span>{{ account?.name ?? 'Choose account' }}</span>
                  <span v-if="account" class="choice-meta">{{ account.currency }}</span>
                  <Icon name="lu:chevron-down" :size="touch ? 16 : 14" />
                </Button>
              </template>
              <MenuItem v-for="entry in accounts" :key="entry.id" :value="entry.id" @select="accountId = entry.id">
                <span class="menu-name">{{ entry.name }}</span><span class="menu-meta">{{ entry.currency }}</span>
              </MenuItem>
            </Dropdown>
            <p v-if="accounts.length === 0" class="choice-hint">Create an account before adding a transaction.</p>
          </BudgetFormField>

          <BudgetFormField label="Category">
            <Dropdown>
              <template #trigger>
                <Button
                  class="choice"
                  variant="secondary"
                  :size="buttonSize"
                  :disabled="saving || categories.length === 0"
                  aria-label="Category"
                >
                  <span>{{ category?.name ?? `Choose ${kind} category` }}</span>
                  <Icon name="lu:chevron-down" :size="touch ? 16 : 14" />
                </Button>
              </template>
              <MenuItem v-for="entry in categories" :key="entry.id" :value="entry.id" @select="categoryId = entry.id">{{ entry.name }}</MenuItem>
            </Dropdown>
            <p v-if="categories.length === 0" class="choice-hint">Create an {{ kind }} category before adding this transaction.</p>
          </BudgetFormField>
        </div>

        <BudgetFormField label="Date" for-id="budget-transaction-date">
          <Input id="budget-transaction-date" v-model="date" type="date" :disabled="saving" />
        </BudgetFormField>

        <BudgetFormField label="Note" for-id="budget-transaction-note" hint="Optional">
          <Input id="budget-transaction-note" v-model="note" autocomplete="off" placeholder="What was this for?" :disabled="saving" />
        </BudgetFormField>
      </section>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <Button :size="buttonSize" variant="secondary" :disabled="saving" @click="handleOpen(false)">Cancel</Button>
      <Button :size="buttonSize" type="submit" form="budget-transaction-form" :disabled="saving || !ready">
        {{ saving ? 'Saving…' : previous ? 'Save transaction' : kind === 'expense' ? 'Save purchase' : 'Save income' }}
      </Button>
    </template>
  </Dialog>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form.touch .field-grid {
  grid-template-columns: minmax(0, 1fr);
}

.choice {
  width: 100%;
  justify-content: flex-start;
}

.form.touch .choice {
  min-height: var(--size-xl);
}

.choice > :last-child {
  margin-left: auto;
}

.choice > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.choice-meta,
.menu-meta,
.currency {
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.menu-name {
  flex: 1;
}

.menu-meta {
  margin-left: auto;
}

.choice-hint {
  margin: 0;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.amount-control,
.place-actions,
.inline-place {
  display: flex;
  align-items: center;
  gap: 8px;
}

.amount-input,
.place-actions > :first-child,
.inline-place > :first-child {
  flex: 1;
  width: auto;
  min-width: 0;
}

.receipt-toggle {
  align-self: flex-start;
}

.receipt-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.details-toggle {
  width: 100%;
  justify-content: space-between;
  text-align: left;
}

.details-toggle-copy {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.form.touch .details-toggle-copy {
  align-items: flex-start;
  flex-direction: column;
  gap: 4px;
}

.details-toggle-copy strong {
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
}

.details-toggle-copy span {
  overflow: hidden;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transaction-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 12px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
}

.form.touch .place-actions,
.form.touch .inline-place {
  align-items: stretch;
  flex-direction: column;
}

.mismatch,
.form-error {
  margin: 0;
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
</style>
