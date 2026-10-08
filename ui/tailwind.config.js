/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './views/**/*.ejs',
        './server.js'
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace']
            }
        }
    },
    plugins: []
};
