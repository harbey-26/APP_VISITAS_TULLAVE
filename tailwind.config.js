/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                brand: {
                    50: '#fef2f2',
                    100: '#fee2e2',
                    200: '#fecaca',
                    300: '#fca5a5',
                    400: '#f87171',
                    500: '#ef4444',
                    600: '#e31c25', // Tu Llave Red
                    700: '#b91c1c',
                    800: '#991b1b',
                    900: '#7f1d1d',
                }
            },
            boxShadow: {
                card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
                'card-hover': '0 4px 12px rgba(16, 24, 40, 0.08), 0 2px 4px rgba(16, 24, 40, 0.04)',
            },
            keyframes: {
                'slide-up': {
                    from: { opacity: '0', transform: 'translateY(12px)' },
                    to:   { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    from: { opacity: '0', transform: 'translateY(6px)' },
                    to:   { opacity: '1', transform: 'translateY(0)' },
                },
                shimmer: {
                    '100%': { transform: 'translateX(100%)' },
                },
                // SlideToConfirm — pista de "desliza para confirmar"
                nudge: {
                    '0%, 100%': { transform: 'translateX(0)' },
                    '50%':      { transform: 'translateX(4px)' },
                },
                pop: {
                    '0%':   { transform: 'scale(0.5)', opacity: '0' },
                    '60%':  { transform: 'scale(1.12)', opacity: '1' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                ripple: {
                    '0%':   { transform: 'scale(1)', opacity: '0.5' },
                    '100%': { transform: 'scale(2.4)', opacity: '0' },
                },
            },
            animation: {
                'slide-up': 'slide-up 0.2s ease-out',
                'fade-in':  'fade-in 0.25s ease-out',
                shimmer:    'shimmer 1.6s infinite',
                nudge:      'nudge 1.8s ease-in-out infinite',
                pop:        'pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
                ripple:     'ripple 0.7s ease-out forwards',
            },
        },
    },
    plugins: [],
}
