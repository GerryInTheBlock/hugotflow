// Colors and type come from the Figma page "Dark theme · Hugot Gym".
const { colors } = require("./src/theme/tokens.json");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // The app is dark-only. "class" stops NativeWind throwing when the browser changes the page's color scheme.
  darkMode: "class",
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ["Poppins_400Regular"],
        regular: ["Poppins_400Regular"],
        medium: ["Poppins_500Medium"],
        semibold: ["Poppins_600SemiBold"],
        bold: ["Poppins_700Bold"],
        extrabold: ["Poppins_800ExtraBold"],
        "extrabold-italic": ["Poppins_800ExtraBold_Italic"],
        black: ["Poppins_900Black"],
        "black-italic": ["Poppins_900Black_Italic"],
      },
      borderRadius: { card: "25px", field: "10px", chip: "5px" },
    },
  },
  plugins: [],
};
