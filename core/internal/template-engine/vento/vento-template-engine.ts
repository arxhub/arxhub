import vento from '@third-party/vento'
import { TemplateEngine } from "~/core/template-engine"

export class VentoTemplateEngine extends TemplateEngine {
  private readonly vento: ReturnType<typeof vento>

  public constructor() {
    super()
    this.vento = vento({})
  }

  public override async render(template: string, data: Record<string, unknown>): Promise<string> {
    const { content } = await this.vento.runString(template, data)
    return content
  }
}
