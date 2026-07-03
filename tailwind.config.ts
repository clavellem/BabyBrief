import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        linen: "#f7f2ea",
        ink: "#232725",
        sage: "#87a68a",
        peach: "#e9a178",
        skysoft: "#8aa9c4"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(35, 39, 37, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
