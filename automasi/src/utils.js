const activities = [
    'test',
    'makan'
];

function getRandomActivity() {
    const randomIndex = Math.floor(Math.random() * activities.length);
    return activities[randomIndex];
}

function getRandomDelay(maxMinutes = 15) {
    const minutes = Math.floor(Math.random() * maxMinutes);
    const seconds = Math.floor(Math.random() * 60);
    return (minutes * 60 + seconds) * 1000;
}

// Daftar tanggal YYYY-MM-DD (inklusif) dari bulan YYYY-MM + rentang hari 1-31.
function buildBatchDates(monthValue, startDay, endDay) {
    if (!/^\d{4}-\d{2}$/.test(String(monthValue || ''))) {
        throw new Error('Bulan batch wajib diisi dengan format YYYY-MM.');
    }

    const start = Number(startDay);
    const end = Number(endDay);

    if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error('Tanggal awal dan tanggal akhir harus berupa angka bulat.');
    }

    if (start < 1 || start > 31 || end < 1 || end > 31) {
        throw new Error('Tanggal awal dan tanggal akhir harus berada dalam rentang 1–31.');
    }

    if (start > end) {
        throw new Error('Tanggal awal tidak boleh lebih besar dari tanggal akhir.');
    }

    const [year, month] = monthValue.split('-').map(Number);
    if (month < 1 || month > 12) {
        throw new Error('Bulan yang dipilih tidak valid.');
    }

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (start > daysInMonth || end > daysInMonth) {
        throw new Error(`Bulan ${monthValue} hanya memiliki ${daysInMonth} hari.`);
    }

    const dates = [];
    for (let day = start; day <= end; day += 1) {
        dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }

    return dates;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBatchDelay(value, fallback = 750) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(1000, Math.max(500, Math.round(parsed)));
}

// Proses tanggal satu per satu; satu gagal tidak menghentikan sisanya.
async function runSequentialBatch({ dates, delayMs = 750, processDate, onProgress = () => {} }) {
    if (!Array.isArray(dates) || dates.length === 0) {
        throw new Error('Daftar tanggal batch tidak boleh kosong.');
    }
    if (typeof processDate !== 'function') {
        throw new Error('processDate wajib berupa fungsi.');
    }

    const normalizedDelay = normalizeBatchDelay(delayMs);
    const summary = {
        total: dates.length,
        success: 0,
        failed: 0,
        failedDates: [],
        results: []
    };

    for (let index = 0; index < dates.length; index += 1) {
        const date = dates[index];
        const current = index + 1;

        await onProgress({ type: 'processing', date, current, total: dates.length });

        try {
            const value = await processDate(date, index, dates.length);
            summary.success += 1;
            summary.results.push({ date, success: true, value });
            await onProgress({ type: 'success', date, current, total: dates.length, value });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            summary.failed += 1;
            summary.failedDates.push(date);
            summary.results.push({ date, success: false, error: message });
            await onProgress({ type: 'failure', date, current, total: dates.length, error: message });
        }

        if (index < dates.length - 1) {
            await sleep(normalizedDelay);
        }
    }

    return summary;
}

module.exports = {
    getRandomActivity,
    getRandomDelay,
    buildBatchDates,
    sleep,
    normalizeBatchDelay,
    runSequentialBatch,
    activities
};
