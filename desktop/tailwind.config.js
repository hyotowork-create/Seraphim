/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Seraphim UI 팔레트 (운영자 화면: 어두운 콘솔 톤)
        panel: '#1b1e27',
        panel2: '#232733',
        line: '#333846',
        accent: '#5b8cff'
      }
    }
  },
  plugins: []
}
