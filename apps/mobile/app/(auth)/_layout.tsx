import { Stack } from "expo-router";
import { colors } from "@/theme";

const AuthLayout = () => (
  <Stack
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.bg },
    }}
  />
);

export default AuthLayout;
