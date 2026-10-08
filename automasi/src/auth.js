
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

// Client Supabase terpisah per user web, supaya session tidak tertukar.
function createUserClient() {
    return createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
}

// Login dari halaman web. Mengembalikan client + session milik user tersebut.
async function loginAs(email, password) {
    const client = createUserClient();

    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
        throw new Error(terjemahkanErrorAuth(error));
    }

    if (!data?.session || !data?.user) {
        throw new Error('Login gagal: server tidak mengembalikan session.');
    }

    return {
        client,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: data.user
    };
}

// Terjemahkan error auth Supabase ke Bahasa Indonesia.
function terjemahkanErrorAuth(error) {
    const message = String(error?.message || '');

    if (/invalid login credentials/i.test(message)) {
        return 'Username atau kata sandi salah. Periksa kembali lalu coba lagi.';
    }
    if (/email not confirmed/i.test(message)) {
        return 'Akun ini belum dikonfirmasi. Hubungi admin.';
    }
    if (/too many requests|rate limit/i.test(message)) {
        return 'Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.';
    }

    return `Login gagal: ${message}`;
}

async function login() {
    if (!config.USER_EMAIL || !config.USER_PASSWORD) {
        throw new Error('USER_EMAIL dan USER_PASSWORD belum diisi di .env (khusus mode CLI automasi).');
    }
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: config.USER_EMAIL,
            password: config.USER_PASSWORD,
        });

        if (error) {
            throw error;
        }

        // Kembalikan token + user (berisi UUID).
        return {
            token: data.session.access_token,
            user: data.user
        };
    } catch (error) {
        console.error('Login gagal:', error.message);
        throw error;
    }
}

module.exports = { login, loginAs, createUserClient, supabase };