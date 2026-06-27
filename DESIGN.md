# Design

## Visual Direction

`yyb-auth-console` follows the Image reference set: a white product-admin shell with a fixed left navigation, compact top bar, green current-selection accents, dense tables, forms, and status tags. It intentionally removes the reference images' top KPI card rows and interface documentation page.

## Palette

Use OKLCH tokens only.

- Background: pure white
- App rail: near-white neutral
- Surface: white panels with subtle borders
- Ink: dark neutral text
- Muted: readable blue-gray secondary text
- Primary: green/olive for current nav, primary buttons, success states
- Accent: blue for scan/in-progress states
- Danger: red for failures
- Warning: amber for waiting/expired states

## Typography

Use one system sans stack for all UI text. Product typography is fixed-size and dense: 12px labels, 14px body/table text, 16px compact headings, 20px page titles. No display font and no fluid heading scale.

## Layout

- Desktop: 248px sidebar, sticky top bar, full-height app shell
- Main content: max-width 1440px with 24px padding
- Pages start directly with task content, not metric cards
- Mobile/tablet: sidebar becomes a horizontal navigation strip and tables scroll horizontally

## Components

- Buttons: 6px radius, icon + label, clear loading/disabled states
- Panels: 8px radius, border only, no heavy shadow
- Inputs/selects: 6px radius, stable height, visible focus
- Tables: compact rows, masked sensitive values, action buttons
- Status tags: text + dot, semantic color, not color-only
- Drawers/details: inline side panel, not blocking modal-first UI

## Motion

Motion is limited to hover, focus, panel reveal, QR/status updates, and button loading feedback. Durations stay between 150ms and 220ms. Reduced motion disables transforms.
