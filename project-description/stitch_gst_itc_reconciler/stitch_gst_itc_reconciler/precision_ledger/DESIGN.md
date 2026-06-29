---
name: Precision Ledger
colors:
  surface: '#f9f9fd'
  surface-dim: '#d9dade'
  surface-bright: '#f9f9fd'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f7'
  surface-container: '#ededf2'
  surface-container-high: '#e8e8ec'
  surface-container-highest: '#e2e2e6'
  on-surface: '#1a1c1f'
  on-surface-variant: '#42474f'
  inverse-surface: '#2f3034'
  inverse-on-surface: '#f0f0f4'
  outline: '#72777f'
  outline-variant: '#c2c7d0'
  surface-tint: '#35618d'
  primary: '#00375e'
  on-primary: '#ffffff'
  primary-container: '#1f4e79'
  on-primary-container: '#95bff1'
  inverse-primary: '#a0cafc'
  secondary: '#0b61a1'
  on-secondary: '#ffffff'
  secondary-container: '#7cbaff'
  on-secondary-container: '#004a7d'
  tertiary: '#4c2e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#6a4300'
  on-tertiary-container: '#e9b268'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d1e4ff'
  primary-fixed-dim: '#a0cafc'
  on-primary-fixed: '#001d35'
  on-primary-fixed-variant: '#184974'
  secondary-fixed: '#d1e4ff'
  secondary-fixed-dim: '#9ecaff'
  on-secondary-fixed: '#001d36'
  on-secondary-fixed-variant: '#00497c'
  tertiary-fixed: '#ffddb5'
  tertiary-fixed-dim: '#f5bc72'
  on-tertiary-fixed: '#2a1800'
  on-tertiary-fixed-variant: '#643f00'
  background: '#f9f9fd'
  on-background: '#1a1c1f'
  surface-variant: '#e2e2e6'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  data-tabular:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar_width: 240px
  topbar_height: 48px
  gutter: 12px
  table_cell_padding: 8px 12px
  container_margin: 24px
---

## Brand & Style
The design system is engineered for high-stakes financial accuracy and professional trust. It adopts a **Functional Minimalism** approach, prioritizing data density and legibility over decorative flair. The aesthetic is "boring on purpose" to minimize cognitive load during complex tax reconciliation tasks.

The system targets Indian Chartered Accountants and tax professionals who require a tool that feels like a natural extension of their professional rigor. It avoids all trends—no gradients, glassmorphism, or expressive motion—instead focusing on a structured, utilitarian interface that emphasizes clarity, hierarchy, and precision.

## Colors
The palette is rooted in corporate reliability. The primary blue (#1F4E79) is used for core navigation and branding, while the secondary blue (#2E75B6) identifies primary actions. 

The background uses a cool light grey (#F5F7FA) to provide a neutral canvas for white data surfaces. Status colors are intentional and muted, designed to guide the eye toward reconciliation anomalies without creating visual alarm. 
- **Matched/Eligible:** Forest Green
- **Mismatch/Review:** Deep Amber
- **Missing/Blocked:** Madder Red
- **Deferred/Missing in Books:** Slate Grey

## Typography
Inter is used across the entire design system for its exceptional legibility and neutral tone. To support the Indian financial context, all currency and numeric values must utilize **Tabular Figures** (`tnum`) to ensure vertical alignment in tables.

Typography is scaled down to accommodate data density. Headers are modest, and the primary data font is 13px/14px. Labels for metadata use a bold, all-caps 11px style to differentiate from editable data. Currency formatting follows the Indian numbering system (Lakhs/Crores) and must always be right-aligned in columns.

## Layout & Spacing
The layout uses a **Fixed Grid** model. A permanent sidebar (240px) on the left houses the primary navigation, while a slim top bar (48px) provides global filters and user actions.

The workspace prioritizes vertical real estate for large datasets. Spacing is tight (8px/12px increments) to maximize the "above the fold" information. Tables utilize sticky headers and horizontal scrolling for wide datasets. Content reflow on smaller screens is handled by hiding non-essential columns rather than wrapping content, maintaining the integrity of the data rows.

## Elevation & Depth
This design system rejects shadows in favor of **Structural Outlines**. Depth is communicated through 1px borders (#E3E8EF) and background color shifts.
- **Level 0 (Background):** #F5F7FA (The application canvas)
- **Level 1 (Surface):** #FFFFFF with 1px solid border (Main content cards, tables)
- **Level 2 (Inlay):** #F8FAFC (Search bars, header rows within a card)

Hover states on interactive rows use a subtle tint (#F1F5F9) rather than an elevation lift.

## Shapes
The shape language is conservative and geometric. A universal border radius of **4px to 6px** is applied to buttons, input fields, and containers. This creates a professional, organized look that aligns with the structured nature of accounting. Status chips use a strict 4px radius to remain compact and rectangular, avoiding the "pill" shape common in social applications.

## Components
- **Data Tables:** The core component. Must feature 1px internal borders, zebra-striping (Light Grey #F9FAFB), and right-aligned numeric columns. Headers are sticky with a slightly darker grey background.
- **KPI Cards:** Flat white surfaces with a 1px border. Value is prominently displayed in the primary blue, with a small label above it. No icons or charts unless strictly necessary for trend analysis.
- **Status Chips:** Small, rectangular (4px radius). Use muted background tints of the status colors with dark text for contrast. (e.g., Green tint background with #2E7D46 text).
- **Buttons:** Primary buttons are #1F4E79 with white text. Secondary buttons are white with #E3E8EF borders. Compact height (32px) for table actions.
- **Form Inputs:** 1px #E3E8EF borders, 4px radius. Focused state uses a 1px #2E75B6 border. No drop shadows on focus.
- **Sidebar:** Dark navy (#1F4E79) or white with subtle borders. Icons must be simple, 20px line-art, paired with 13px labels.