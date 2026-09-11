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
  chevronDown: 'expand-more',
  chevronUp: 'expand-less',
  // Reorder controls. Arrows rather than chevrons: a chevron on a row already means
  // "opens", and these move it.
  arrowUp: 'arrow-upward',
  arrowDown: 'arrow-downward',
  reorder: 'swap-vert',
  settings: 'settings',
  eye: 'visibility',
  eyeOff: 'visibility-off',
  trophy: 'emoji-events',
  delete: 'delete',
  edit: 'edit',
  download: 'file-download',

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
  shield: 'shield',             // the safety-buffer pillar of the health score

  // Cold-start gate — the server waking up, and the server not answering at all.
  cloudSync: 'cloud-sync',
  cloudOff: 'cloud-off',

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

  // Settings rows (spec §10) — one glyph per row, so a row is recognisable
  // before its label is read.
  person: 'person',
  lock: 'lock',
  fingerprint: 'fingerprint',
  key: 'vpn-key',
  timer: 'timer',
  privacy: 'privacy-tip',
  policy: 'policy',
  info: 'info-outline',
  notificationsOn: 'notifications-active',
  alarm: 'alarm',
  flag: 'flag',
  summary: 'summarize',
  category: 'category',
  check: 'check',

  // Add Transaction numpad
  backspace: 'backspace',

  // Category icon library — the extra glyphs offered in the icon picker.
  fastfood: 'fastfood',
  cafe: 'local-cafe',
  bar: 'local-bar',
  pizza: 'local-pizza',
  cake: 'cake',
  groceries: 'local-grocery-store',
  icecream: 'icecream',
  cart: 'shopping-cart',
  clothing: 'checkroom',
  diamond: 'diamond',
  gift: 'card-giftcard',
  store: 'store',
  devices: 'devices',
  laptop: 'laptop',
  smartphone: 'smartphone',
  watch: 'watch',
  fuel: 'local-gas-station',
  bus: 'directions-bus',
  train: 'train',
  flight: 'flight',
  taxi: 'local-taxi',
  bike: 'directions-bike',
  scooter: 'two-wheeler',
  parking: 'local-parking',
  subway: 'directions-subway',
  apartment: 'apartment',
  bed: 'king-bed',
  sofa: 'weekend',
  chair: 'chair',
  lightbulb: 'lightbulb',
  bolt: 'bolt',
  water: 'water-drop',
  wifi: 'wifi',
  router: 'router',
  cleaning: 'cleaning-services',
  tools: 'build',
  handyman: 'handyman',
  music: 'music-note',
  headphones: 'headphones',
  gaming: 'sports-esports',
  tv: 'tv',
  book: 'menu-book',
  camera: 'camera-alt',
  celebration: 'celebration',
  sports: 'sports-soccer',
  fitness: 'fitness-center',
  spa: 'spa',
  pool: 'pool',
  beach: 'beach-access',
  hotel: 'hotel',
  medical: 'medical-services',
  hospital: 'local-hospital',
  medication: 'medication',
  pets: 'pets',
  childCare: 'child-care',
  school: 'school',
  bank: 'account-balance',
  card: 'credit-card',
  payments: 'payments',
  rupee: 'currency-rupee',
  atm: 'local-atm',
  work: 'work',
  business: 'business-center',
  donation: 'volunteer-activism',
  park: 'park',
  flower: 'local-florist',
} satisfies Record<string, GlyphName>

export type IconName = keyof typeof iconMap;

// The curated set offered in icon pickers (new category, new goal, …) — the
// meaningful, category-flavoured glyphs, grouped by theme, not the nav/action ones.
export const PICKER_ICONS: IconName[] = [
  // Food & drink
  "food", "fastfood", "cafe", "bar", "pizza", "cake", "groceries", "icecream",
  // Shopping
  "shopping", "cart", "clothing", "diamond", "gift", "store", "devices", "laptop", "smartphone", "watch",
  // Transport
  "transport", "fuel", "bus", "train", "flight", "taxi", "bike", "scooter", "parking", "subway",
  // Home & bills
  "home", "apartment", "bed", "sofa", "chair", "lightbulb", "bolt", "water", "wifi", "router",
  "cleaning", "tools", "handyman", "bills", "receipt",
  // Leisure
  "entertainment", "music", "headphones", "gaming", "tv", "book", "camera",
  "celebration", "sports", "fitness", "spa", "pool", "beach", "hotel",
  // Health & learning
  "health", "medical", "hospital", "medication", "pets", "childCare", "school",
  // Money & work
  "savings", "bank", "wallet", "card", "payments", "rupee", "atm", "income", "investments",
  "work", "business", "donation",
  // Misc
  "trophy", "star", "park", "flower", "more",
];