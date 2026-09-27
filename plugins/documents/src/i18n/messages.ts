import { defineMessages } from '@arxhub/i18n'
import { en } from './en'
import { ru } from './ru'

export const messages = defineMessages('documents', en, ru)
export const { t } = messages
