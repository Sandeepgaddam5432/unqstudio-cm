export interface Template {
  id: string
  name: string
  description: string
  icon: string
  tags: string[]
  files: Record<string, string>
}
