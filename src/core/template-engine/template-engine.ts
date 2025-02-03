export abstract class TemplateEngine {
  public abstract render(template: string, data: unknown): Promise<string>
}
