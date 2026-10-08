const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const dotenv = require('dotenv');

const { loginAs, createUserClient } = require('../automasi/src/auth');
const { runWithClient } = require('../automasi/src/requestContext');
const {
    getStudentDetails,
    submitJournal,
    getJournalHistory,
    deleteJournal,
    updateJournal,
    checkKemarinIzin,
    getLastIzinFoto,
    getYesterdayDate,
    uploadFotoIzin
} = require('../automasi/src/journal');
const {
    buildBatchDates,
    normalizeBatchDelay,
    runSequentialBatch
} = require('../automasi/src/utils');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg',
            'image/png',
            'image/jpg',
            'image/webp',
            'application/pdf'
        ];

        if (allowed.includes(file.mimetype)) {
            cb(null, true);
            return;
        }

        cb(new Error('Format file tidak didukung. Gunakan JPG, PNG, WebP, atau PDF.'));
    }
});

const app = express();
const port = Number(process.env.PORT || 3000);
const MIN_JOURNAL_DATE = '2026-01-05';
// Tidak ada batas maksimal tanggal — jurnal boleh dibuat untuk tanggal berapa pun ke depan.
const LOGIN_EMAIL_DOMAIN = 'siprakerin.com';

// --- LOGGING SYSTEM ---
const MAX_LOGS = 200;
let systemLogs = [];

function addLog(type, message, metadata = {}) {
    const now = new Date();
    const log = {
        id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
        timestamp: now.toISOString(),
        time: now.toLocaleTimeString('id-ID'),
        type,
        message,
        ...metadata
    };

    systemLogs.push(log);
    if (systemLogs.length > MAX_LOGS) {
        systemLogs = systemLogs.slice(-MAX_LOGS);
    }

    console.log(`[${log.type}] ${log.message}`);
    return log;
}

addLog('INFO', 'Server dimulai...');

// --- SESSION (LOGIN) ---
// Penyimpanan session: Redis (jika REDIS_URL diisi, mis. Upstash di Vercel)
// atau memory bawaan (mode lokal). Di serverless (Vercel), memory TIDAK
// dibagikan antar instance sehingga session harus di Redis agar login stabil.
let sessionStore;
// Cari URL Redis dari env apa pun yang tersedia (mendukung custom prefix
// dari integrasi Vercel/Upstash, mis. STORAGE_REDIS_URL).
function findRedisUrl() {
    if (process.env.REDIS_URL) return process.env.REDIS_URL;
    if (process.env.UPSTASH_REDIS_URL) return process.env.UPSTASH_REDIS_URL;
    const key = Object.keys(process.env).find((k) => /_REDIS_URL$/i.test(k));
    return key ? process.env[key] : null;
}

// URL dari Vercel KV/Upstash berskema redis:// (plaintext) tapi servernya
// WAJIB TLS — tanpa rediss:// koneksi ditolak dan sesi rusak diam-diam.
function normalizeRedisUrl(url) {
    if (url && /^redis:\/\//i.test(url) && /upstash\.io/i.test(url)) {
        return url.replace(/^redis:\/\//i, 'rediss://');
    }
    return url;
}

const redisUrl = normalizeRedisUrl(findRedisUrl());
if (redisUrl) {
    try {
        const Redis = require('ioredis');
        const { RedisStore } = require('connect-redis');
        const redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 2,
            enableReadyCheck: true,
            connectTimeout: 8000
        });
        redisClient.on('error', (err) => addLog('ERROR', `Redis error: ${err.message}`));
        sessionStore = new RedisStore({ client: redisClient });
        addLog('INFO', 'Session store: Redis.');
    } catch (err) {
        addLog('ERROR', `Gagal init Redis, fallback ke memory: ${err.message}`);
    }
} else {
    addLog('INFO', 'Session store: memory (mode lokal).');
}

app.use(session({
    secret: process.env.SESSION_SECRET || 'siprakerin-playground-secret',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        httpOnly: true,
        maxAge: 12 * 60 * 60 * 1000 // 12 jam
    }
}));

// Siapkan client Supabase milik user yang login untuk request ini.
async function attachUserContext(req, res, next) {
    const sessUser = req.session && req.session.user;

    if (!sessUser) {
        return next();
    }

    try {
        const client = createUserClient();
        const { error } = await client.auth.setSession({
            access_token: sessUser.token,
            refresh_token: sessUser.refreshToken
        });

        if (error) {
            throw error;
        }

        await runWithClient(client, () => next());
    } catch (err) {
        addLog('WARN', `Sesi ${sessUser.email} kedaluwarsa, diminta login ulang.`);
        req.session.destroy(() => {});

        if (req.path.startsWith('/api/')) {
            return res.status(401).json({
                success: false,
                error: 'Sesi kedaluwarsa. Silakan login ulang.',
                redirect: '/login'
            });
        }

        return res.redirect('/login');
    }
}

// Tolak akses jika belum login.
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user || !req.session.user.student) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({
                success: false,
                error: 'Belum login. Silakan login terlebih dahulu.',
                redirect: '/login'
            });
        }

        return res.redirect('/login');
    }

    return next();
}

function emptyStudent() {
    return {
        id_siswa: '',
        id_kelas: '',
        id_industri: '',
        nama_kelas: '',
        nama_industri: '',
        nama: '',
        nis: '',
        keahlian: ''
    };
}

function renderIndex(req, res, options = {}) {
    const student = (req.session && req.session.user && req.session.user.student) || emptyStudent();

    res.render('index', {
        defaults: student,
        username: (req.session && req.session.user && req.session.user.username) || '',
        message: options.message || null,
        error: options.error || null,
        logs: systemLogs,
        supabaseUrl: process.env.SUPABASE_URL,
        activeView: options.activeView || 'dashboard',
        minJournalDate: MIN_JOURNAL_DATE,
        maxJournalDate: null
    });
}

function getStudentIds(req) {
    const student = req.session.user.student;
    const studentIds = {
        id_siswa: student.id_siswa,
        id_kelas: student.id_kelas,
        id_industri: student.id_industri
    };

    if (!studentIds.id_siswa || !studentIds.id_kelas || !studentIds.id_industri) {
        throw new Error('Data siswa belum lengkap. Coba logout lalu login ulang.');
    }

    return studentIds;
}

function validateJournalInput({ kegiatan, keterangan, tanggal }) {
    if (!String(kegiatan || '').trim()) {
        throw new Error('Mohon isi kegiatan.');
    }

    const validKeterangan = ['hadir', 'libur', 'izin'];
    if (!validKeterangan.includes(keterangan)) {
        throw new Error('Keterangan tidak valid. Pilih hadir, libur, atau izin.');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tanggal || ''))) {
        throw new Error('Tanggal wajib diisi dengan format YYYY-MM-DD.');
    }

    if (tanggal < MIN_JOURNAL_DATE) {
        throw new Error('Tanggal terlalu lama. Jurnal hanya dapat dibuat mulai dari 5 Januari 2026.');
    }
}

async function processJournalSubmission(req, {
    kegiatan,
    keterangan,
    tanggal,
    file = null,
    uploadProvidedFile = true
}) {
    validateJournalInput({ kegiatan, keterangan, tanggal });

    const studentIds = getStudentIds(req);
    let izinLanjutan = false;

    if (keterangan === 'izin') {
        izinLanjutan = await checkKemarinIzin(studentIds.id_siswa, tanggal);
        addLog(
            'INFO',
            `Izin lanjutan ${izinLanjutan ? 'aktif' : 'nonaktif'} untuk ${tanggal}.`,
            { date: tanggal }
        );
    }

    // Fungsi request lama tetap menjadi satu-satunya jalur insert jurnal.
    const submittedData = await submitJournal(
        null,
        kegiatan,
        studentIds,
        keterangan,
        tanggal,
        izinLanjutan
    );

    if (
        keterangan === 'izin' &&
        file &&
        uploadProvidedFile &&
        submittedData &&
        submittedData[0]
    ) {
        const newJurnalId = submittedData[0].id_jurnal;
        const { fotoPath } = await uploadFotoIzin(
            newJurnalId,
            studentIds.id_siswa,
            file.buffer,
            file.originalname,
            file.mimetype
        );
        submittedData[0].foto = fotoPath;
    }

    return {
        data: submittedData,
        izinLanjutan,
        uploadedFile: Boolean(file && uploadProvidedFile)
    };
}

async function loadJournalHistory(req, limit = 100) {
    const sessUser = req.session.user;
    if (!sessUser || !sessUser.student.id_siswa) return [];
    return getJournalHistory(sessUser.token, sessUser.student.id_siswa, { page: 1, limit });
}

// --- MIDDLEWARE ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(attachUserContext);

// --- LOGIN / LOGOUT ---
app.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/');
    }

    res.render('login', { error: null, username: '' });
});

app.post('/login', async (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/');
    }

    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
        return res.render('login', { error: 'Isi username dan kata sandi terlebih dahulu.', username });
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        return res.render('login', { error: 'Username hanya boleh berisi huruf, angka, titik, strip, dan underscore.', username });
    }

    const email = `${username}@${LOGIN_EMAIL_DOMAIN}`;

    try {
        addLog('AUTH', `Percobaan login untuk ${email}...`);
        const { client, token, refreshToken, user } = await loginAs(email, password);

        // Selalu ambil data milik user yang login (abaikan override .env).
        const details = await runWithClient(
            client,
            () => getStudentDetails(user, { allowEnvOverride: false })
        );

        req.session.user = {
            id: user.id,
            email,
            username,
            token,
            refreshToken,
            student: {
                id_siswa: details.id_siswa || '',
                id_kelas: details.id_kelas || '',
                id_industri: details.id_industri || '',
                nama_kelas: details.nama_kelas || '',
                nama_industri: details.nama_industri || '',
                nama: details.nama || '',
                nis: details.nis || '',
                keahlian: details.keahlian || ''
            }
        };

        addLog('AUTH', `Login berhasil: ${details.nama || email}.`);
        return res.redirect('/?view=dashboard');
    } catch (error) {
        addLog('WARN', `Login gagal untuk ${email}: ${error.message}`);
        return res.render('login', { error: error.message, username });
    }
});

app.get('/logout', (req, res) => {
    const email = req.session && req.session.user ? req.session.user.email : 'pengguna';

    req.session.destroy(() => {
        addLog('AUTH', `Logout: ${email}.`);
        res.redirect('/login');
    });
});

// --- STATUS & LOG ROUTES ---
app.get('/api/status', requireAuth, (req, res) => {
    const student = req.session.user.student;

    res.json({
        ready: true,
        error: null,
        student: {
            nama: student.nama,
            nis: student.nis,
            kelas: student.nama_kelas,
            industri: student.nama_industri,
            keahlian: student.keahlian
        },
        dateBounds: {
            min: MIN_JOURNAL_DATE,
            max: null
        }
    });
});

app.get('/api/logs', requireAuth, (req, res) => res.json(systemLogs));

app.post('/api/logs/clear', requireAuth, (req, res) => {
    systemLogs = [];
    addLog('INFO', 'Log sistem dibersihkan oleh pengguna.');
    res.json({ success: true });
});

// --- JOURNAL DATA ROUTES ---
app.get('/api/journals', requireAuth, async (req, res) => {
    try {
        const requestedLimit = Math.min(1000, Math.max(1, Number(req.query.limit || 100)));
        const freshJournals = await loadJournalHistory(req, requestedLimit);

        const journals = freshJournals.map((journal) => ({
            id: journal.id_jurnal,
            tanggal: journal.tanggal,
            kegiatan: journal.kegiatan,
            keterangan: journal.keterangan,
            foto: journal.foto || null,
            created_at: journal.created_at
        }));

        const permissions = freshJournals
            .filter((journal) => journal.keterangan === 'izin')
            .map((journal) => ({
                id_jurnal: journal.id_jurnal,
                tanggal: journal.tanggal,
                alasan: journal.kegiatan,
                foto: journal.foto || null,
                created_at: journal.created_at
            }));

        res.json({ journals, permissions });
    } catch (error) {
        addLog('ERROR', `Gagal mengambil jurnal: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/check-kemarin-izin', requireAuth, async (req, res) => {
    try {
        const tanggal = req.query.tanggal || new Date().toISOString().split('T')[0];
        const kemarin = getYesterdayDate(tanggal);
        const idSiswa = req.session.user.student.id_siswa;
        const isKemarinIzin = await checkKemarinIzin(idSiswa, tanggal);
        const fotoKemarin = isKemarinIzin
            ? await getLastIzinFoto(idSiswa, tanggal)
            : null;

        res.json({
            tanggal_dicek: kemarin,
            tanggal_submit: tanggal,
            is_kemarin_izin: isKemarinIzin,
            izin_lanjutan_tersedia: isKemarinIzin,
            foto_kemarin_ada: Boolean(fotoKemarin),
            foto_kemarin_path: fotoKemarin || null
        });
    } catch (error) {
        addLog('ERROR', `check-kemarin-izin error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// --- UI ---
app.get('/', requireAuth, (req, res) => {
    renderIndex(req, res, { activeView: req.query.view || 'dashboard' });
});

// Route lama tetap dipertahankan.
app.post('/submit', requireAuth, upload.single('foto_izin'), async (req, res) => {
    try {
        addLog('INFO', `Memproses absensi tunggal untuk ${req.body.tanggal || 'tanggal tidak diketahui'}...`);
        await processJournalSubmission(req, {
            kegiatan: req.body.kegiatan,
            keterangan: req.body.keterangan,
            tanggal: req.body.tanggal,
            file: req.file,
            uploadProvidedFile: true
        });
        addLog('SUCCESS', `Jurnal ${req.body.tanggal} berhasil dikirim.`, { date: req.body.tanggal });
        renderIndex(req, res, {
            message: `Jurnal tanggal ${req.body.tanggal} berhasil dikirim.`,
            activeView: 'attendance'
        });
    } catch (error) {
        addLog('ERROR', `Submit error: ${error.message}`, { date: req.body.tanggal });
        renderIndex(req, res, { error: error.message, activeView: 'attendance' });
    }
});

// Versi JSON untuk UI baru. Mekanisme insert tetap memakai processJournalSubmission -> submitJournal.
app.post('/api/submit', requireAuth, upload.single('foto_izin'), async (req, res) => {
    try {
        addLog('INFO', `Memproses absensi tunggal untuk ${req.body.tanggal || 'tanggal tidak diketahui'}...`);
        const result = await processJournalSubmission(req, {
            kegiatan: req.body.kegiatan,
            keterangan: req.body.keterangan,
            tanggal: req.body.tanggal,
            file: req.file,
            uploadProvidedFile: true
        });
        addLog('SUCCESS', `Jurnal ${req.body.tanggal} berhasil dikirim.`, { date: req.body.tanggal });
        res.json({
            success: true,
            message: `Jurnal tanggal ${req.body.tanggal} berhasil dikirim.`,
            result
        });
    } catch (error) {
        addLog('ERROR', `Submit error: ${error.message}`, { date: req.body.tanggal });
        res.status(400).json({ success: false, error: error.message });
    }
});

// Batch diproses sequential dan dikirim sebagai NDJSON agar UI menerima progress per tanggal.
app.post('/api/batch-submit', requireAuth, upload.single('foto_izin'), async (req, res) => {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (event) => {
        if (!res.writableEnded) {
            res.write(`${JSON.stringify(event)}\n`);
        }
    };

    try {
        const dates = buildBatchDates(
            req.body.batch_month,
            req.body.start_day,
            req.body.end_day
        );
        const delayMs = normalizeBatchDelay(req.body.delay_ms);
        const kegiatan = String(req.body.kegiatan || '').trim();
        const keterangan = req.body.keterangan;

        // Validasi field bersama dan batas tanggal sebelum loop dimulai.
        dates.forEach((tanggal) => validateJournalInput({ kegiatan, keterangan, tanggal }));
        getStudentIds(req);

        let providedFileUploaded = false;

        addLog('BATCH', `Batch dimulai untuk ${dates[0]} sampai ${dates[dates.length - 1]} (${dates.length} tanggal).`);
        sendEvent({
            type: 'start',
            total: dates.length,
            dates,
            delayMs
        });

        const summary = await runSequentialBatch({
            dates,
            delayMs,
            processDate: async (tanggal) => {
                const shouldUploadFile = Boolean(req.file && !providedFileUploaded);
                const result = await processJournalSubmission(req, {
                    kegiatan,
                    keterangan,
                    tanggal,
                    file: req.file,
                    uploadProvidedFile: shouldUploadFile
                });

                if (shouldUploadFile && result.uploadedFile) {
                    providedFileUploaded = true;
                }

                return result;
            },
            onProgress: (event) => {
                if (event.type === 'processing') {
                    addLog('BATCH', `[${event.current}/${event.total}] Mengirim absensi tanggal ${event.date}...`, { date: event.date });
                    sendEvent({
                        ...event,
                        message: `[${event.current}/${event.total}] Mengirim absensi tanggal ${event.date}...`
                    });
                    return;
                }

                if (event.type === 'success') {
                    addLog('SUCCESS', `[${event.current}/${event.total}] ${event.date} berhasil.`, { date: event.date });
                    sendEvent({ ...event, message: 'Berhasil', value: undefined });
                    return;
                }

                addLog('ERROR', `[${event.current}/${event.total}] ${event.date} gagal: ${event.error}`, { date: event.date });
                sendEvent({ ...event, message: `Gagal: ${event.error}` });
            }
        });

        // Nilai return API disederhanakan agar tidak mengirim objek Supabase berulang di summary.
        summary.results = summary.results.map(({ date, success, error }) => ({ date, success, error }));

        addLog(
            'BATCH',
            `Batch selesai. Total ${summary.total}, berhasil ${summary.success}, gagal ${summary.failed}.`
        );
        sendEvent({ type: 'complete', summary });
        res.end();
    } catch (error) {
        addLog('ERROR', `Validasi batch gagal: ${error.message}`);
        sendEvent({ type: 'fatal', error: error.message });
        res.end();
    }
});

app.delete('/api/journal/:id', requireAuth, async (req, res) => {
    try {
        await deleteJournal(req.params.id);
        addLog('SUCCESS', `Jurnal ${req.params.id} berhasil dihapus.`);
        res.json({ success: true, message: 'Jurnal berhasil dihapus.' });
    } catch (error) {
        addLog('ERROR', `Delete error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.patch('/api/journal/:id', requireAuth, async (req, res) => {
    try {
        const result = await updateJournal(req.params.id, req.body);
        addLog('SUCCESS', `Jurnal ${req.params.id} berhasil diperbarui.`);
        res.json({ success: true, message: 'Jurnal berhasil diperbarui.', data: result });
    } catch (error) {
        addLog('ERROR', `Update error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.use((error, req, res, next) => {
    if (!error) return next();
    addLog('ERROR', error.message);

    if (req.path.startsWith('/api/')) {
        return res.status(400).json({ success: false, error: error.message });
    }

    if (req.session && req.session.user) {
        return renderIndex(req, res.status(400), { error: error.message, activeView: 'attendance' });
    }

    return res.redirect('/login');
});

// Di Vercel (serverless) app di-export tanpa listen — Vercel yang mengatur servernya.
if (!process.env.VERCEL) {
    app.listen(port, () => {
        addLog('READY', `Server UI berjalan di http://localhost:${port}`);
        addLog('INFO', 'Silakan login lewat halaman /login untuk memakai aplikasi.');
    });
}

module.exports = app;
