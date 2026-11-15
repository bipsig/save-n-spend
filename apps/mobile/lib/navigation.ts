import { router } from "expo-router";

// A screen opened straight from a link or a cold-start notification has nothing behind it,
// and `router.back()` there does nothing at all.
export const goBackOrHome = (): void => {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)");
};
