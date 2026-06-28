import { MaterialIcons } from '@expo/vector-icons';

type GlyphName = keyof typeof MaterialIcons.glyphMap

export const iconMap = {
  // Tabs / nav
  home: 'home',
  activity: 'swap-horiz',
  insights: 'bar-chart',
  more: 'menu',

  // Header / actions
  bell: 'notifications-none',
  search: 'search',
  add: 'add',
  close: 'close',
  chevronRight: 'chevron-right',
  settings: 'settings',
  trophy: 'emoji-events',

  // Spending categories
  food: 'restaurant',
  shopping: 'shopping-bag',
  transport: 'directions-car',
  bills: 'receipt-long',
  entertainment: 'movie',
  health: 'favorite',
  income: 'attach-money',
  savings: 'savings',

  // Assistant
  chat: 'chat-bubble-outline',
} satisfies Record<string, GlyphName>

export type IconName = keyof typeof iconMap;