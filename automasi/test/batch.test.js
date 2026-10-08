const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildBatchDates,
    normalizeBatchDelay,
    runSequentialBatch
} = require('../src/utils');

test('membuat rentang tanggal secara inklusif dan berurutan', () => {
    assert.deepEqual(buildBatchDates('2026-07', 1, 3), [
        '2026-07-01',
        '2026-07-02',
        '2026-07-03'
    ]);
});

test('menolak tanggal awal yang lebih besar dari tanggal akhir', () => {
    assert.throws(
        () => buildBatchDates('2026-07', 10, 1),
        /tidak boleh lebih besar/
    );
});

test('menolak hari di luar rentang 1-31', () => {
    assert.throws(() => buildBatchDates('2026-07', 0, 10), /1–31/);
    assert.throws(() => buildBatchDates('2026-07', 1, 32), /1–31/);
});

test('menolak tanggal yang tidak tersedia pada bulan terpilih', () => {
    assert.throws(
        () => buildBatchDates('2026-02', 28, 31),
        /hanya memiliki 28 hari/
    );
});

test('delay batch selalu dibatasi antara 500 dan 1000 ms', () => {
    assert.equal(normalizeBatchDelay(100), 500);
    assert.equal(normalizeBatchDelay(750), 750);
    assert.equal(normalizeBatchDelay(2000), 1000);
    assert.equal(normalizeBatchDelay('invalid'), 750);
});


test('batch diproses sequential dan tetap lanjut setelah satu tanggal gagal', async () => {
    const order = [];
    let active = 0;
    let maxActive = 0;

    const summary = await runSequentialBatch({
        dates: ['2026-07-01', '2026-07-02', '2026-07-03'],
        delayMs: 500,
        processDate: async (date) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            order.push(date);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
            if (date === '2026-07-02') throw new Error('simulasi error');
            return date;
        }
    });

    assert.deepEqual(order, ['2026-07-01', '2026-07-02', '2026-07-03']);
    assert.equal(maxActive, 1);
    assert.equal(summary.total, 3);
    assert.equal(summary.success, 2);
    assert.equal(summary.failed, 1);
    assert.deepEqual(summary.failedDates, ['2026-07-02']);
});
