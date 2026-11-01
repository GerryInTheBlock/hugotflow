import "../../global.css";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  Poppins_800ExtraBold_Italic,
  Poppins_900Black,
  Poppins_900Black_Italic,
  useFonts,
} from "@expo-google-fonts/poppins";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Installable web app (web builds only, not during development so dev bundles are never cached):
 * the service worker in public/sw.js lets the front-desk laptop open the console with no internet.
 */
function registerOfflineApp() {
  if (Platform.OS !== "web" || __DEV__ || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest.json";
    document.head.appendChild(link);
  }
  navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("[offline] service worker not registered", e));
}
registerOfflineApp();

/** Saves files loaded before the worker took over (app bundle, fonts), so one visit is enough to work offline. */
function saveLoadedFiles() {
  if (Platform.OS !== "web" || __DEV__ || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then(() => {
      const files = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin) && !u.includes("/sw.js"));
      return caches.open("hugotflow-v1").then((c) => Promise.allSettled(files.map((f) => c.add(f))));
    })
    .catch(() => {});
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Poppins_800ExtraBold_Italic,
    Poppins_900Black,
    Poppins_900Black_Italic,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
    if (fontsLoaded) saveLoadedFiles();
  }, [fontsLoaded, fontError]);

  // A font that fails to load (offline, not yet saved) falls back to the system font instead of a blank screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
