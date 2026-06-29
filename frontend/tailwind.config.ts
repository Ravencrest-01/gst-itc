import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      "colors": {
          "on-primary-container": "#95bff1",
          "secondary": "#0b61a1",
          "surface-bright": "#f9f9fd",
          "surface": "#f9f9fd",
          "on-tertiary-container": "#e9b268",
          "surface-dim": "#d9dade",
          "on-secondary": "#ffffff",
          "tertiary": "#4c2e00",
          "inverse-primary": "#a0cafc",
          "on-surface": "#1a1c1f",
          "primary-fixed-dim": "#a0cafc",
          "tertiary-fixed-dim": "#f5bc72",
          "surface-container-high": "#e8e8ec",
          "error": "#ba1a1a",
          "surface-container-lowest": "#ffffff",
          "secondary-fixed": "#d1e4ff",
          "on-tertiary": "#ffffff",
          "secondary-container": "#7cbaff",
          "on-error": "#ffffff",
          "primary-container": "#1f4e79",
          "surface-variant": "#e2e2e6",
          "primary": "#00375e",
          "on-secondary-fixed-variant": "#00497c",
          "on-primary": "#ffffff",
          "error-container": "#ffdad6",
          "on-error-container": "#93000a",
          "outline-variant": "#c2c7d0",
          "on-primary-fixed": "#001d35",
          "surface-container-low": "#f3f3f7",
          "background": "#f9f9fd",
          "on-secondary-container": "#004a7d",
          "tertiary-fixed": "#ffddb5",
          "on-tertiary-fixed-variant": "#643f00",
          "inverse-surface": "#2f3034",
          "primary-fixed": "#d1e4ff",
          "outline": "#72777f",
          "inverse-on-surface": "#f0f0f4",
          "on-surface-variant": "#42474f",
          "tertiary-container": "#6a4300",
          "surface-container": "#ededf2",
          "on-secondary-fixed": "#001d36",
          "on-background": "#1a1c1f",
          "surface-container-highest": "#e2e2e6",
          "on-tertiary-fixed": "#2a1800",
          "secondary-fixed-dim": "#9ecaff",
          "surface-tint": "#35618d",
          "on-primary-fixed-variant": "#184974"
      },
      "borderRadius": {
          "DEFAULT": "0.125rem",
          "lg": "0.25rem",
          "xl": "0.5rem",
          "full": "0.75rem"
      },
      "spacing": {
          "gutter": "12px",
          "container_margin": "24px",
          "sidebar_width": "240px",
          "table_cell_padding": "8px 12px",
          "topbar_height": "48px"
      },
      "fontFamily": {
          "data-tabular": ["Inter"],
          "label-caps": ["Inter"],
          "headline-lg": ["Inter"],
          "body-md": ["Inter"],
          "body-sm": ["Inter"],
          "headline-md": ["Inter"]
      },
      "fontSize": {
          "data-tabular": ["13px", { "lineHeight": "16px", "fontWeight": "500" }],
          "label-caps": ["11px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "700" }],
          "headline-lg": ["20px", { "lineHeight": "28px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
          "body-md": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
          "body-sm": ["12px", { "lineHeight": "18px", "fontWeight": "400" }],
          "headline-md": ["16px", { "lineHeight": "24px", "fontWeight": "600" }]
      }
    },
  },
  plugins: [],
}
export default config
