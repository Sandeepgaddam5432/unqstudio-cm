import { BarChart3, BookOpen, Bot, Kanban, LayoutTemplate, Puzzle, ShoppingBag, Square, User } from 'lucide-react'

const map = { square: Square, layout: LayoutTemplate, chart: BarChart3, user: User, cart: ShoppingBag, bot: Bot, kanban: Kanban, book: BookOpen, puzzle: Puzzle }
export function TemplateIcon({ name, size = 14 }: { name: string; size?: number }) {
  const I = map[name as keyof typeof map] ?? Square
  return <I size={size} />
}
