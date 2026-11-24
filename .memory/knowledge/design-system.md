# Design Standards & System

Design system and visual styling standards for `fit-gen-v2`. All styles are implemented
exclusively through global CSS in `src/css/` by the `styler` agent.

---

## 1. Core Principles

- **Single CSS entrypoint**: `main.jsx` imports `src/css/index.css`.
  - `src/css/index.css` `@import`s `./utils.css` and `./animations.css`.
  - Components **MUST NOT** import CSS files directly.
- **No inline styles**: Always define or use classes. Never use `style={{ ... }}` on JSX elements.
- **No hardcoded colors**: Never write `#fff`, `#000`, `rgb(...)`, or hex values inside components or custom rules. Always use CSS custom properties (`var(--...)`).
- **Framework policy**: Plain custom CSS only. No utility framework libraries (no Tailwind, Bootstrap, Emotion, or CSS Modules).

---

## 2. Root Design Tokens (`:root`)

Defined in `src/css/utils.css`:

### Color Palette
| Token | Value | Purpose |
| :--- | :--- | :--- |
| `--bg-app` | `#0a0a0a` | App background |
| `--bg-card` | `#171717` | Card and sheet backgrounds |
| `--bg-input` | `#000000` | Input field backgrounds |
| `--bg-muted` | `#262626` | Secondary / muted surface fill |
| `--border-color` | `#262626` | Default borders and dividers |
| `--border-highlight` | `#f59e0b` | Active / focused borders |
| `--primary` | `#f59e0b` | Primary accent color (amber) |
| `--primary-rgb` | `245, 158, 11` | Primary color channels for rgba opacity |
| `--text-main` | `#e5e5e5` | Primary readable text |
| `--text-muted` | `#adadad` | Secondary / placeholder / subtitle text |
| `--text-dark` | `#292929` | Text used over bright primary backgrounds |
| `--danger` | `#ef4444` | Errors, deletions, destructive actions |
| `--success` | `#10b981` | Success states, completions, checkmarks |

### Layout & Sizing Tokens
| Token | Value | Purpose |
| :--- | :--- | :--- |
| `--radius` | `4px` | Standard border radius for cards, inputs, and buttons |
| `--safe-top` | `3rem` | Top notch/status-bar safe area padding (Capacitor/iOS) |
| `--safe-bottom` | `4.2rem` | Bottom bar safe area padding |
| `--nav-height` | `6.5rem` | Fixed bottom navigation bar height |

---

## 3. Typography & Unit Scaling

- **Root Font Size**:
  ```css
  html {
    font-size: 62.5%; /* 1rem = 10px */
  }
  ```
- **Scale Reference**:
  - `0.8rem` = 8px (micro badges, small metadata)
  - `1.0rem` = 10px (`.text-base`, standard base size)
  - `1.2rem` = 12px (`.text-sm`)
  - `1.4rem` = 14px (`.text-md`, body text)
  - `1.6rem` = 16px (`.text-lg`, card headers)
  - `2.0rem` = 20px (`.text-xl`, section titles)
  - `2.4rem` = 24px (`.text-2xl`, view headers)
  - `3.2rem` = 32px (`.text-3xl`, hero / stat numbers)
- **Font Families**:
  - Main: `var(--font-family-main)` (system-ui stack)
  - Secondary: `var(--font-family-secondary)`

---

## 4. Class Organization & Placement

1. **Utility Classes (`src/css/utils.css`)**:
   - Spacing: `.p-1`, `.p-2`, `.m-2`, `.gap-1`, `.gap-2`
   - Flexbox: `.flex`, `.flex-col`, `.items-center`, `.justify-between`, `.justify-center`
   - Typography utilities: `.text-primary`, `.text-muted`, `.text-error`, `.text-success`, `.text-bold`
   - Grid: `.grid`, `.grid-cols-2`, `.grid-cols-3`
   - *Rule*: Only use utility classes that already exist in `src/css/utils.css`. If a new general utility is required, add it to `utils.css`.

2. **Component Classes (`src/css/index.css`)**:
   - Structural & domain components:
     - `.app-container`: App viewport container
     - `.content-area`: Scrollable main view (`.has-nav` variant for screens with bottom nav)
     - `.card`: Standard surfaced container with `--border-color` and `--radius`
     - `.button`, `.btn-primary`, `.btn-secondary`, `.btn-danger`: Button variants
     - `.input`: Text inputs, number pickers, search fields
     - `.view-container`: View wrapper
     - `.alert-error`: Inline error banner
     - `.rest-timer-overlay`: Timer overlay

---

## 5. Mobile & Safe Area Rules (Capacitor)

Because `fit-gen-v2` deploys to mobile via Capacitor:
- Use `var(--safe-top)` and `var(--safe-bottom)` for fixed headers, navigation, and bottom action bars.
- Never use `100vh` on scroll containers; use flexbox filling `.content-area` with `-webkit-overflow-scrolling: touch;`.
- Interactive targets (buttons, list row selectors) must maintain a minimum touch target height of at least `4.4rem` (44px).
