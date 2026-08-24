import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["SF Pro Rounded", "ui-rounded", "Nunito", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
