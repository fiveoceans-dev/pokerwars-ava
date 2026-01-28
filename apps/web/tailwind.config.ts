import type { Config } from "tailwindcss";
import daisyui from "daisyui";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkTheme: "dark",
  daisyui: {
    themes: [
      {
        dark: {
          primary: "#0A0A0A",
          "primary-content": "#E5E5E5",
          secondary: "#0f2342", // deep dark blue secondary
          "secondary-content": "#e5e5e5",
          accent: "#f7d63c",
          "accent-content": "#0A0A0A",
          neutral: "#1A1A1A",
          "neutral-content": "#E5E5E5",
          "base-100": "#0A0A0A",
          "base-200": "#1A1A1A",
          "base-300": "#2A2A2A",
          "base-content": "#E5E5E5",
          info: "#f7d63c",
          success: "#23c28f",
          warning: "#f7d63c",
          error: "#f97316",
          ".bg-gradient-modal": {
            background: "#1A1A1A",
          },
          ".bg-modal": {
            background: "linear-gradient(90deg,#0A0A0A 0%, #1A1A1A 100%)",
          },
          ".modal-border": {
            border: "1px solid #6E54FF",
          },
          ".bg-gradient-nav": {
            "background-image":
              "linear-gradient(90deg,#f7d63c 0%,#eec42b 100%)",
          },
          ".bg-main": {
            background:
              "radial-gradient(at 50% 0%, rgba(37, 99, 235, 0.16), rgba(12, 23, 44, 0.85) 60%), #05070d",
          },
          ".bg-underline": {
            background: "#2A2A2A",
          },
          ".bg-container": {
            background: "#1A1A1A",
          },
          ".bg-btn-wallet": {
            "background-image":
              "linear-gradient(180deg,#f7d63c 0%, #eec42b 100%)",
          },
          ".bg-input": {
            background: "rgba(255, 255, 255, 0.07)",
          },
          ".bg-component": {
            background:
              "linear-gradient(113deg,rgba(10,10,10,0.6) 20.48%,rgba(26,26,26,0.6) 99.67%)",
          },
          ".bg-function": {
            background: "rgba(247,214,60,0.2)",
          },
          ".text-function": {
            color: "rgb(133 232 168)",
          },
          ".text-network": {
            color: "rgb(133 232 168)",
          },
          "--rounded-btn": "9999rem",
          ".tooltip": {
            "--tooltip-tail": "6px",
            "--tooltip-color": "#f7d63c",
          },
          ".link": {
            textUnderlineOffset: "2px",
          },
          ".link:hover": {
            opacity: "80%",
          },
          ".contract-content": {
            background:
              "linear-gradient(113.34deg, rgba(10,10,10,0.6) 20.48%, rgba(26,26,26,0.6) 99.67%)",
          },
        },
      },
    ],
  },
  theme: {
    extend: {
      boxShadow: {
        center: "0 0 12px -2px rgb(0 0 0 / 0.05)",
        neon: "0 0 15px 0 rgba(133,232,168,0.7)",
        "neon-hover": "0 0 20px 0 rgba(133,232,168,0.7)",
        "neon-blue": "0 0 10px 0 rgba(133,232,168,0.7)", // aligned to accent
      },
      keyframes: {
        flip: {
          "0%": { transform: "rotateY(90deg)", opacity: "0" },
          "100%": { transform: "rotateY(0deg)", opacity: "1" },
        },
      },
      animation: {
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        flip: "flip 0.6s ease-out forwards",
      },
      backgroundImage: {
        "gradient-dark": "linear-gradient(90deg,#f7d63c 0%, #eec42b 100%)",
        "gradient-vertical": "linear-gradient(180deg,#f7d63c 0%, #eec42b 100%)",
        "gradient-icon": "linear-gradient(90deg,#f7d63c 0%, #eec42b 100%)",
      },
      colors: {
        primary: "#0A0A0A",
        accent: "rgb(133 232 168)",
        secondary: "#2f9c68", // tone aligned to accent
        highlight: "#4bd086", // bright accent companion
        ethereal: "#85e8a8", // softened accent for gradients
        background: "#0A192F", // Midnight Blue
        border: "#2A2A2A",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        "serif-renaissance": ["Cinzel", "serif"],
        "serif-body": ["Lora", "serif"],
      },
    },
  },
  plugins: [daisyui],
};

export default config;
