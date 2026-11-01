/**
 * Phones don't scan entry passes (the front-desk laptop does), so the native build shows a note.
 * The web build is QrScanner.web.tsx (laptop camera + jsQR).
 */
import { Text, View } from "react-native";

export type QrScannerProps = {
  active: boolean;
  onCode: (text: string) => void;
  onStatus?: (status: "off" | "starting" | "on" | "error", message?: string) => void;
  /** Shown as a button inside the camera box when the camera is off or failed. */
  onTurnOn?: () => void;
  /** Change it to start the camera again after an error (e.g. after allowing camera access). */
  retryKey?: number;
};

export function QrScanner(_props: QrScannerProps) {
  return (
    <View className="h-[300px] items-center justify-center rounded-[15px] bg-line p-6">
      <Text className="text-center font-medium text-xs text-ink-2">Scanning works on the front-desk laptop (web console).</Text>
    </View>
  );
}

export function Viewfinder(_props: { live: boolean }) {
  return null;
}
