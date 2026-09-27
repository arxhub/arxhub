import { AppError, type GenericAppError } from '@arxhub/errors'
import type { ParamsOf } from '@arxhub/i18n'
import { en } from './i18n/en'

type BudgetErrorCode = keyof typeof en.errors

// The status the generic factory this replaced gave each refusal: 400 for what the person entered, 500 for
// a state the budget is in.
const STATUS: Record<BudgetErrorCode, 400 | 500> = {
  BudgetReceiptServerInvalid: 400,
  BudgetReceiptServerOrigin: 400,
  BudgetReceiptServerMissing: 500,
  BudgetReceiptServerOutdated: 500,
  BudgetReceiptLookupUnavailable: 500,
  BudgetIdentityMissing: 500,
  BudgetLocationRequired: 500,
  BudgetEntryChanged: 400,
  BudgetNotReady: 500,
  BudgetUpdateContention: 500,
  BudgetAccountCurrencyLocked: 400,
  BudgetCategoryKindLocked: 400,
  BudgetAccountInUse: 400,
  BudgetCategoryInUse: 400,
  BudgetPlaceInUse: 400,
  BudgetLocationUnavailable: 500,
  BudgetDeviceLocationUnavailable: 400,
  BudgetInvalidLocation: 400,
  BudgetQrUnavailable: 500,
  BudgetPhotoNotReady: 500,
  BudgetPhotosUnavailable: 500,
  BudgetPhotoEmpty: 400,
  BudgetPhotoTooLarge: 400,
  BudgetPhotoType: 400,
  BudgetPhotoContent: 400,
  BudgetQrTooLong: 400,
  BudgetQrInvalidUrl: 400,
  BudgetQrField: 400,
  BudgetQrDateTime: 400,
  BudgetInvalidOperation: 400,
  BudgetUnsupportedOperation: 400,
  BudgetNoQr: 400,
  BudgetJsonTooLarge: 400,
  BudgetReceiptNoTimezone: 400,
  BudgetReceiptTimestampMismatch: 400,
  BudgetReceiptMismatch: 400,
  BudgetReceiptItemCount: 400,
  BudgetReceiptItemQuantity: 400,
  BudgetReceiptTotals: 400,
  BudgetItemName: 400,
  BudgetItemPriceNegative: 400,
  BudgetQuantityInvalid: 400,
  BudgetQuantityZero: 400,
  BudgetAmountInvalid: 400,
  BudgetAmountPrecision: 400,
  BudgetCurrencyInvalid: 400,
  BudgetConflictCopies: 500,
  BudgetReceiptJsonInvalid: 400,
  BudgetReceiptFieldInvalid: 400,
  BudgetReceiptNumberAsString: 400,
  BudgetReceiptTimestampInvalid: 400,
  BudgetPhotoPathInvalid: 400,
  BudgetPhotoSizeMismatch: 500,
}

// One code per refusal a person can meet, so the catalog can say it in their language (describeError keys
// on the code). The body keeps the English entry — logs, HTTP and tests read it. Only the plain catalog
// data is imported here, never the reactive i18n runtime: fiscal and money checks also run on the headless
// server, which bundles no Vue.
export function budgetError<C extends BudgetErrorCode>(code: C, ...rest: ParamsOf<(typeof en.errors)[C]['message']>): AppError {
  const params: Record<string, string | number> = (rest[0] as Record<string, string | number> | undefined) ?? {}
  const { title, message } = en.errors[code] as { title: string; message: string | { one: string; other: string } }
  const form =
    typeof message === 'string' ? message : new Intl.PluralRules('en').select(Number(params.count)) === 'one' ? message.one : message.other
  const text = form.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : whole))
  return new AppError<GenericAppError>({ ...params, code, statusCode: STATUS[code], title, message: text })
}
