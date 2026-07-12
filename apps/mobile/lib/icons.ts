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
  chevronLeft: 'chevron-left',
  settings: 'settings',
  eye: 'visibility',
  eyeOff: 'visibility-off',
  trophy: 'emoji-events',

  // Spending categories
  food: 'restaurant',
  shopping: 'shopping-bag',
  transport: 'directions-car',
  bills: 'receipt-long',
  entertainment: 'movie',
  health: 'favorite',
  income: 'trending-up',        // up-trend (was a $ glyph — clashed with ₹)
  savings: 'savings',           // piggy — goals
  wallet: 'account-balance-wallet', // savings summary tile
  expenses: 'trending-down',
  investments: 'show-chart',    // market line (was dollar bills)
  healthPulse: 'monitor-heart', // finance health score

  receipt: "receipt",
  date: "calendar-month",
  clock: "schedule",
  location: "location-pin",

  //budget
  budgetOk: "check-circle",
  budgetWarning: "pending-actions",
  budgetOver: "warning",

  // Assistant
  chat: 'chat-bubble-outline',

  // More / settings hub
  help: 'help-outline',
  logout: 'logout',
  star: 'star-border',

  // Add Transaction numpad
  backspace: 'backspace',
} satisfies Record<string, GlyphName>

export type IconName = keyof typeof iconMap;