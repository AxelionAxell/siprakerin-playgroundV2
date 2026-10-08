const dotenv = require('dotenv');
const path = require('path');

// Load env from root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const requiredEnv = [
    'SUPABASE_URL',
    'SUPABASE_KEY'
];

const config = {};

requiredEnv.forEach((key) => {
    if (!process.env[key]) {
        console.error(`Dibutuhkan variabel key: ${key}`);
        process.exit(1);
    }
    config[key] = process.env[key];
});

// Kredensial .env hanya dipakai mode CLI automasi (opsional).
// Mode web memakai halaman login, jadi boleh dikosongkan.
config.USER_EMAIL = process.env.USER_EMAIL || '';
config.USER_PASSWORD = process.env.USER_PASSWORD || '';

// Optional overrides
config.ID_SISWA = process.env.ID_SISWA;
config.ID_KELAS = process.env.ID_KELAS;
config.ID_INDUSTRI = process.env.ID_INDUSTRI;

module.exports = config;
