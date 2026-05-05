import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--cx-border))',
        muted: 'hsl(var(--cx-muted))',
        'muted-foreground': 'hsl(var(--cx-muted-foreground))',
        primary: 'hsl(var(--cx-primary))',
        'primary-foreground': 'hsl(var(--cx-primary-foreground))',
        destructive: 'hsl(var(--cx-destructive))',
        'destructive-foreground': 'hsl(var(--cx-destructive-foreground))',
      },
    },
  },
  plugins: [],
} satisfies Config
