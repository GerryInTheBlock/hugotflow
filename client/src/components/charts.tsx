/**
 * Dashboard charts (Figma Dashboard 38:2327, Fig 14), drawn with react-native-svg so no chart library is needed:
 * the red "Hourly crowd density" area chart and the "Revenue comparison" grouped bars.
 */
import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

const GRID = "#3F3F46";
const LABEL = "#A1A1AA";
const RED = "#E3061B";

function useWidth(initial = 600) {
  const [w, setW] = useState(initial);
  return [w, (e: LayoutChangeEvent) => setW(Math.max(200, e.nativeEvent.layout.width))] as const;
}

/** A round number just above `max`, with 4 equal steps. */
function niceMax(max: number) {
  if (max <= 0) return 4;
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return step * 4;
}
const short = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace(".0k", "k") : String(Math.round(n * 10) / 10));

/** Smooth line through the points (Catmull-Rom turned into cubic Béziers). */
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

export function AreaChart({ points, height = 200 }: { points: { hour: number; avg_checkins: number }[]; height?: number }) {
  const [width, onLayout] = useWidth();
  const left = 34;
  const right = 12;
  const top = 8;
  const bottom = 24;
  const max = niceMax(Math.max(...points.map((p) => p.avg_checkins), 0));
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const first = points[0]?.hour ?? 5;
  const last = points[points.length - 1]?.hour ?? 22;
  const x = (h: number) => left + ((h - first) / Math.max(1, last - first)) * plotW;
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const pts = points.map((p) => [x(p.hour), y(p.avg_checkins)] as [number, number]);
  const line = smooth(pts);
  const area = line ? `${line} L${pts[pts.length - 1][0]},${top + plotH} L${pts[0][0]},${top + plotH} Z` : "";
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const xTicks = points.map((p) => p.hour).filter((h) => (h - first) % 4 === 0);

  return (
    <View onLayout={onLayout} accessibilityLabel="Average check-ins per hour">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="crowdFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={RED} stopOpacity={0.35} />
            <Stop offset="1" stopColor={RED} stopOpacity={0.05} />
          </LinearGradient>
        </Defs>
        {ticks.map((t) => (
          <Line key={t} x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
        ))}
        {ticks.map((t) => (
          <SvgText key={`l${t}`} x={left - 8} y={y(t) + 4} fill={LABEL} fontSize={10} textAnchor="end">
            {short(t)}
          </SvgText>
        ))}
        {area ? <Path d={area} fill="url(#crowdFill)" /> : null}
        {line ? <Path d={line} stroke={RED} strokeWidth={2} fill="none" /> : null}
        {xTicks.map((h) => (
          <SvgText key={`x${h}`} x={x(h)} y={height - 6} fill={LABEL} fontSize={10} textAnchor="middle">
            {hourLabel(h)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

export function BarChart({ data, height = 200 }: { data: { label: string; a: number; b: number }[]; height?: number }) {
  const [width, onLayout] = useWidth();
  const left = 52;
  const right = 12;
  const top = 8;
  const bottom = 24;
  const max = niceMax(Math.max(...data.flatMap((d) => [d.a, d.b]), 0));
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const y = (v: number) => top + plotH - (Math.max(0, v) / max) * plotH;
  const slot = plotW / Math.max(1, data.length);
  const bar = Math.min(26, slot / 4);
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);

  return (
    <View onLayout={onLayout} accessibilityLabel="Walk-in and subscription revenue per month">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="subFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FF3B3B" />
            <Stop offset="1" stopColor={RED} />
          </LinearGradient>
        </Defs>
        {ticks.map((t) => (
          <Line key={t} x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={t === 0 ? 1 : 0.5} />
        ))}
        {ticks.map((t) => (
          <SvgText key={`l${t}`} x={left - 8} y={y(t) + 4} fill={LABEL} fontSize={10} textAnchor="end">
            {short(t)}
          </SvgText>
        ))}
        {data.map((d, i) => {
          const cx = left + slot * i + slot / 2;
          return (
            <G key={d.label}>
              <Rect x={cx - bar - 3} y={y(d.a)} width={bar} height={top + plotH - y(d.a)} rx={3} fill="#52525B" />
              <Rect x={cx + 3} y={y(d.b)} width={bar} height={top + plotH - y(d.b)} rx={3} fill="url(#subFill)" />
              <SvgText x={cx} y={height - 6} fill={LABEL} fontSize={10} textAnchor="middle">
                {d.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View className="flex-row items-center gap-[10px]">
      {items.map((i) => (
        <View key={i.label} className="flex-row items-center gap-[6px]">
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i.color }} />
          <Text className="font-medium text-[10px] text-ink">{i.label}</Text>
        </View>
      ))}
    </View>
  );
}
