/** @type {import('tailwindcss').Config} */
module.exports = {
  // Arahkan ke SEMUA file .html dan .js di dalam folder public
  darkMode: 'class',
  content: ["./public/**/*.{html,js}", './src/input.css'], 
  // tailwind.config.js
  theme: {
    extend: {
      extend: {
        isolation: {
          isolate: 'isolate',
        },
        animation: {
            'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            'bounce-slow': 'bounce 2s infinite',
        },
      },
    },
  },
  plugins: [],
};
