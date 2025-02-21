import { ArxHub } from '~/core/arxhub'
import { Plugin } from '~/core/plugin'

export class StoragePlugin implements Plugin<ArxHub> {
  readonly name: string = 'storage'

  apply(target: ArxHub): void {
  }
}
