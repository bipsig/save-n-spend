// What VoiceOver says for an icon in a picker. Pure, so it's tested under node (lib/iconLabel.test.ts).

const NAMES: Record<string, string> = {
  fastfood: "Fast food",
  icecream: "Ice cream",
  tv: "TV",
  atm: "ATM",
  wifi: "Wi-Fi",
  more: "Other",
};

/** `"childCare"` → `"Child care"`; a few names are spelled out by hand. */
export const iconLabel = (name: string): string => {
  if (NAMES[name]) return NAMES[name];
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
