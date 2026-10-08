
const cron = require('node-cron');
const { login } = require('./src/auth');
const { getStudentDetails, submitJournal, checkKemarinIzin } = require('./src/journal');
const { getRandomActivity, getRandomDelay } = require('./src/utils');

async function runTask() {
    console.log('Starting daily journal automation task...');

    // 1. Random Delay
    const delay = getRandomDelay();
    console.log(`Waiting for ${delay / 1000} seconds before execution...`);

    // await new Promise(resolve => setTimeout(resolve, delay));
    console.log('Skipping delay for testing...');

    try {
        // 2. Login
        const { user } = await login();
        // Note: supabase client maintains the session in memory for subsequent calls in this process

        // 3. Get Details
        const studentIds = await getStudentDetails(user);

        // 4. Generate Activity
        const activity = getRandomActivity();

        // 5. Auto-detect izin lanjutan (meniru logika platform asli siprakerin.com)
        //    Platform cek: apakah jurnal kemarin berketerangan 'izin'?
        //    Jika iya → toggle izin lanjutan tersedia (di sini kita set otomatis = true)
        //    Jika tidak → submit biasa tanpa izin lanjutan
        //
        //    CATATAN: Keterangan jurnal hari ini ditentukan di bawah.
        //    Ganti 'hadir' dengan 'izin' jika ingin submit izin, dan set izinLanjutan sesuai.
        const keterangan = 'hadir'; // Ganti ke 'izin' jika mau izin

        let izinLanjutan = false;
        if (keterangan === 'izin') {
            const today = new Date().toISOString().split('T')[0];
            izinLanjutan = await checkKemarinIzin(studentIds.id_siswa, today);
            console.log(`[izin] Auto-detect izin lanjutan: ${izinLanjutan ? 'AKTIF (kemarin izin)' : 'nonaktif (kemarin bukan izin)'}`);
        }

        // 6. Submit
        await submitJournal(null, activity, studentIds, keterangan, null, izinLanjutan);

    } catch (error) {
        console.error('Task failed:', error);
    }
}

// Schedule: 16:00, Monday to Friday
// CRON Syntax: Minute Hour DayMonth Month DayWeek
console.log('Scheduler started. Waiting for 16:00 M-F...');
cron.schedule('0 16 * * 1-5', () => {
    runTask();
}, {
    scheduled: true,
    timezone: "Asia/Jakarta"
});

// For testing purposes (uncomment to run immediately on start)
runTask();
