import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "rgb(var(--brand) / <alpha-value>)",
        "brand-contrast": "rgb(var(--brand-contrast) / <alpha-value>)",
      },
    },
  },
  plugins: [],
} satisfies Config;
