// References:
// - https://github.com/apache/couchdb-nano/blob/main/lib/nano.d.ts#L1698
// - https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/pouchdb-find/index.d.ts#L4
// 

export namespace MangoQuery {
  export interface ConditionOperators<T> {
    // Match fields "less than" this value.
    $lt?: T

    // Match fields "greater than" this value.
    $gt?: T

    // Match fields "less than or equal to" this value.
    $lte?: T

    // Match fields "greater than or equal to" this value.
    $gte?: T

    // Match fields equal to this value.
    $eq?: T

    // Match fields not equal to this value.
    $ne?: T

    // True if the field should exist, false otherwise.
    $exists?: boolean

    // Match fields of a specific type.
    $type?: 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object'

    // The document field must exist in the list provided.
    $in?: T[]

    // The document field must not exist in the list provided.
    $nin?: T[]

    // Special condition to match the length of an array field. Non-array fields cannot match.
    $size?: number

    // Matches documents where (field % Divisor == Remainder) is true.
    // Only applies when the document field is an integer.
    $mod?: [divisor: number, remainder: number]

    // A PCRE-compatible regular expression pattern to match against the document field. Only matches string fields.
    $regex?: string

    // Matches an array value if it contains all the elements of the argument array.
    $all?: T[]

    // Matches if any element in an array field matches the specified query criteria.
    $elemMatch?: ConditionOperators<T>
  }

  export interface CombinationOperators<T> {
    // Matches if all the selectors in the array match.
    $and?: Selector<T>[]

    // Matches if any of the selectors in the array match.
    $or?: Selector<T>[]

    // Matches if the given selector does not match.
    $not?: Selector<T>

    // Matches if none of the selectors in the array match.
    $nor?: Selector<T>[]
  }

  // biome-ignore format: Hand formatting is more readable
  export type Selector<T> = 
    & { _id?: string | CombinationOperators<T> }
    & { [P in keyof T]?: Selector<T[P]> | ConditionOperators<T[P]> | CombinationOperators<T[P]> }

  export interface FindRequest<T extends object = object> {
    selector: Selector<T>
    fields?: (keyof T | '_id' | '_rev')[]
    sort?: Array<keyof T | { [P in keyof T]?: 'asc' | 'desc' } | string>
    limit?: number
    skip?: number
    index?: string | [string, string]
  }
}
