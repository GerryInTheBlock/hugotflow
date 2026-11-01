/**
 * Laptop camera QR scanner for the web console (Figma "Attendance" → Scan entry pass).
 * Reads frames from getUserMedia, decodes them with jsQR, and reports each new code once
 * (the same code is ignored for 4 s so one scan is one check-in).
 * The viewfinder (corner brackets, scan line, hint) is drawn in code over the live picture.
 */
import jsQR from "jsqr";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Toggle } from "../console";
import type { QrScannerProps } from "./QrScanner";

export type { QrScannerProps } from "./QrScanner";

export function Viewfinder({ live }: { live: boolean }) {
  const corner = { position: "absolute" as const, width: 30, height: 30, borderColor: "#FAFAFA" };
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 304, height: 274, maxWidth: "90%", backgroundColor: live ? "transparent" : "#000000", alignItems: "center", justifyContent: "flex-end", paddingBottom: 8 }}>
        <View style={{ position: "absolute", top: 13, left: 34, right: 34, bottom: 34 }}>
          <View style={[corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }]} />
          <View style={[corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }]} />
          <View style={[corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
          <View style={[corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }]} />
          <View style={{ position: "absolute", top: "50%", left: 10, right: 10, height: 2, backgroundColor: "#FAFAFA", opacity: 0.9 }} />
        </View>
        <Text className="font-medium text-[13px] text-ink" style={{ textShadowColor: "#000", textShadowRadius: 4 }}>
          Position the member QR inside the frame
        </Text>
      </View>
    </View>
  );
}

export function QrScanner({ active, onCode, onStatus, onTurnOn, retryKey }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const [status, setStatus] = useState<"off" | "starting" | "on" | "error">("off");
  const [message, setMessage] = useState<string | null>(null);
  const [label, setLabel] = useState("Front Camera");
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const report = useCallback(
    (s: typeof status, m?: string) => {
      setStatus(s);
      setMessage(m ?? null);
      onStatus?.(s, m);
    },
    [onStatus],
  );

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        report("error", "This browser cannot use the camera. Use the code box or a USB scanner.");
        return;
      }
      report("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const name = track?.label.replace(/\s*\([^)]*\)\s*$/, "") ?? "";
        setLabel(name && name.length <= 40 ? name : "Front Camera");
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(!!caps.torch);
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        report("on");
        const tick = () => {
          if (stopped) return;
          if (ctx && video.readyState >= 2 && video.videoWidth) {
            // Read a smaller copy of the frame: a phone QR held up to the laptop is still large enough, and it keeps older laptops fast.
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            const now = Date.now();
            if (found?.data && !(lastRef.current && lastRef.current.text === found.data && now - lastRef.current.at < 4000)) {
              lastRef.current = { text: found.data, at: now };
              onCode(found.data);
            }
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch (e) {
        const name = (e as { name?: string }).name;
        report(
          "error",
          name === "NotAllowedError"
            ? "Camera permission was blocked. Allow the camera for this site, or use the code box / USB scanner."
            : name === "NotFoundError"
              ? "No camera found on this laptop. Use the code box or a USB scanner."
              : `Camera could not start (${name ?? "unknown error"}).`,
        );
      }
    }

    if (active) start();
    else report("off");
    return stop;
  }, [active, onCode, report, retryKey]);

  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    track.applyConstraints({ advanced: [{ torch } as MediaTrackConstraintSet] }).catch(() => setTorch(false));
  }, [torch, torchSupported]);

  return (
    <View className="gap-[10px]">
      <View className="h-[300px] overflow-hidden rounded-[15px] bg-line">
        {createElement("video", {
          ref: videoRef,
          muted: true,
          playsInline: true,
          style: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: status === "on" ? "block" : "none" },
        })}
        <Viewfinder live={status === "on"} />
        {status === "starting" ? (
          <Text className="absolute bottom-3 self-center font-medium text-xs text-ink-2">Starting camera…</Text>
        ) : null}
        {(status === "off" || status === "error") && onTurnOn ? (
          <Pressable onPress={onTurnOn} className="absolute bottom-3 self-center rounded-field bg-white/[0.12] px-4 py-2">
            <Text className="font-bold text-xs text-ink">{status === "error" ? "Try again" : "Turn on camera"}</Text>
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row items-center gap-[25px]">
        <View className="flex-row items-center gap-[5px] px-[10px] py-[5px]">
          <Text className="font-medium text-xs text-ink-2">Camera:</Text>
          <Text className="font-extrabold text-xs text-ink">{status === "on" ? label : status === "error" ? "Not available" : "Off"}</Text>
        </View>
        <View className="flex-row items-center gap-[5px] px-[10px] py-[5px]">
          <Text className="font-medium text-xs text-ink-2">Torch</Text>
          <Toggle value={torch} onChange={setTorch} disabled={!torchSupported} />
        </View>
      </View>
      {message ? <Text className="font-medium text-[11px] text-danger-ink">{message}</Text> : null}
    </View>
  );
}
