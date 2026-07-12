// Secure, on-device storage for the JWT access token.
// expo-secure-store keeps it in the iOS Keychain / Android Keystore — never in
// AsyncStorage (plaintext) and never in JS memory alone (lost on reload).
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'sns.accessToken';

// All three are async — SecureStore has no synchronous API.
export const getToken = (): Promise<string | null> => SecureStore.getItemAsync(TOKEN_KEY);
export const setToken = (token: string): Promise<void> => SecureStore.setItemAsync(TOKEN_KEY, token);
export const clearToken = (): Promise<void> => SecureStore.deleteItemAsync(TOKEN_KEY);
