/**
 * Icons exported from the Figma file "UI" (assets/icons). Each PNG is a white-on-transparent
 * mask, tinted here the same way Figma tints it ("Icon color" layer).
 */
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { colors } from "@/theme";

const sources = {
  "add-circle": require("../../assets/icons/add-circle.png"),
  "arrow-right": require("../../assets/icons/arrow-right.png"),
  back: require("../../assets/icons/back.png"),
  barbell: require("../../assets/icons/barbell.png"),
  bell: require("../../assets/icons/bell.png"),
  "bell-outline": require("../../assets/icons/bell-outline.png"),
  "check-mark": require("../../assets/icons/check-mark.png"),
  "checked-user": require("../../assets/icons/checked-user.png"),
  dumbbell: require("../../assets/icons/dumbbell.png"),
  forward: require("../../assets/icons/forward.png"),
  "high-priority": require("../../assets/icons/high-priority.png"),
  "line-chart": require("../../assets/icons/line-chart.png"),
  "nav-attendance": require("../../assets/icons/nav-attendance.png"),
  "nav-dashboard": require("../../assets/icons/nav-dashboard.png"),
  "nav-engine": require("../../assets/icons/nav-engine.png"),
  "nav-equipment": require("../../assets/icons/nav-equipment.png"),
  "nav-members": require("../../assets/icons/nav-members.png"),
  "nav-payments": require("../../assets/icons/nav-payments.png"),
  "nav-reports": require("../../assets/icons/nav-reports.png"),
  "nav-settings": require("../../assets/icons/nav-settings.png"),
  plus: require("../../assets/icons/plus.png"),
  "push-notification": require("../../assets/icons/push-notification.png"),
  "qr-code": require("../../assets/icons/qr-code.png"),
  "qr-code-large": require("../../assets/icons/qr-code-large.png"),
  refresh: require("../../assets/icons/refresh.png"),
  search: require("../../assets/icons/search.png"),
  staff: require("../../assets/icons/staff.png"),
  "standing-man": require("../../assets/icons/standing-man.png"),
  ticket: require("../../assets/icons/ticket.png"),
  "toggle-on": require("../../assets/icons/toggle-on.png"),
  weightlifting: require("../../assets/icons/weightlifting.png"),
} as const;

export type IconName = keyof typeof sources;

export function Icon({
  name,
  size = 25,
  color = colors.icon,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  // Figma's back button reuses its "Right" arrow turned 180°.
  const turn = name === "back" ? { transform: [{ rotate: "180deg" }] } : null;
  return (
    <Image
      source={sources[name]}
      style={[{ width: size, height: size, tintColor: color }, turn, style]}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
