import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(220 13% 91%)',
        muted: 'hsl(220 14% 96%)',
        'muted-foreground': 'hsl(220 9% 46%)',
        primary: 'hsl(221 83% 53%)',
        'primary-foreground': 'hsl(0 0% 98%)',
        destructive: 'hsl(0 72% 51%)',
        'destructive-foreground': 'hsl(0 0% 98%)',
      },
    },
  },
  plugins: [],
} satisfies Config
