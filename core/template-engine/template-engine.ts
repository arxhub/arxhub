export abstract class TemplateEngine {
  public abstract render(template: string, data: Record<string, unknown>): Promise<string>
}
