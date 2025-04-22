import { Bundler } from './bundler'

export class ESBuildBundler extends Bundler {
  build(moduleType: string): Promise<void> {
    throw new Error('Method not implemented.')
  }
}
