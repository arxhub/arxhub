import { TemplateEngine } from '~/core/template-engine'

export class VentoTemplateEngine extends TemplateEngine {
  public render(template: string, data: unknown): Promise<string> {
    return Promise.resolve('')
  }
}
