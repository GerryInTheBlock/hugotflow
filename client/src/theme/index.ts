import tokens from "./tokens.json";

export const colors = tokens.colors;

/** Screen background: plain white (Figma "Light theme · Hugot Gym": no gradients). Kept as a gradient type so screens need no change. */
export const backgroundGradient = {
  colors: [colors["bg-top"], colors["bg-mid"], colors.bg] as const,
  locations: [0, 0.38, 1] as const,
};

/** Primary actions are flat brand red, as in Figma (both stops the same colour). */
export const brandGradient = [colors.brand, colors.brand] as const;

/** No glow under primary buttons in the flat light theme (kept so existing styles still apply). */
export const brandGlow = {
  shadowColor: "#FF1F2D",
  shadowOpacity: 0,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 4 },
  elevation: 0,
};
