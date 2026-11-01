import tokens from "./tokens.json";

export const colors = tokens.colors;

/** Screen background: deep red glow at the top fading to near-black (Figma "Dark theme"). */
export const backgroundGradient = {
  colors: [colors["bg-top"], colors["bg-mid"], colors.bg] as const,
  locations: [0, 0.38, 1] as const,
};

/** Primary action gradient, left to right. */
export const brandGradient = [colors["brand-light"], colors["brand-dark"]] as const;

/** Red glow under primary buttons and selected chips. */
export const brandGlow = {
  shadowColor: "#FF1F2D",
  shadowOpacity: 0.35,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 4 },
  elevation: 8,
};
