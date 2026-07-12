import { Stack } from "expo-router";

const AuthLayout = () => (
  <Stack
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: "#0C0A16" },
    }}
  />
);

export default AuthLayout;
