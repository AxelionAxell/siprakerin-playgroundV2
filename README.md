# Siprakerin Playground V2

Versi ini mempertahankan struktur project lama dan mekanisme request Supabase yang sudah ada, lalu menambahkan tampilan dashboard baru, **Batch Attendance**, **halaman login multi-user**, dan **UI berbahasa Indonesia**.

```text
siprakerinplayground-main/
├── automasi/
│   ├── index.js
│   ├── inspect_raw.js
│   ├── package.json
│   ├── src/
│   │   ├── auth.js          # login lama (CLI) + loginAs/createUserClient (web multi-user)
│   │   ├── config.js        # SUPABASE_URL/KEY wajib; kredensial .env opsional (CLI saja)
│   │   ├── journal.js       # memakai Supabase client milik user yang login (per-request)
│   │   ├── requestContext.js# AsyncLocalStorage: client aktif per request
│   │   └── utils.js         # ditambah helper rentang dan sequential batch
│   └── test/
│       └── batch.test.js
├── ui/
│   ├── public/
│   │   └── output.css       # CSS hasil build, sudah disertakan
│   ├── src/
│   │   └── input.css        # design system dan responsive UI
│   ├── views/
│   │   ├── index.ejs        # seluruh UI baru tetap pada view lama (Bahasa Indonesia)
│   │   └── login.ejs        # halaman login
│   ├── server.js            # session login + route lama + route batch
│   ├── package.json
│   └── tailwind.config.js
├── .env.example
└── README.md
```

## Login multi-user

- Buka `http://localhost:3000` → otomatis diarahkan ke halaman **login**.
- Isi **username** (tanpa `@siprakerin.com`, sudah ditempel otomatis) dan **kata sandi**.
- Setiap user login dengan akunnya sendiri; data siswa, jurnal, dan riwayat yang tampil
  selalu milik user yang login — tidak tercampur antar user.
- Sesi berlaku 12 jam. Tombol **keluar** ada di pojok kanan atas.
- `.env` kini hanya wajib berisi `SUPABASE_URL` dan `SUPABASE_KEY`.
  `USER_EMAIL`/`USER_PASSWORD`/`ID_SISWA`/`ID_KELAS`/`ID_INDUSTRI` bersifat opsional
  dan hanya dipakai mode CLI automasi (`node automasi/index.js`).

## Yang tetap dipertahankan

- Login tetap memakai `automasi/src/auth.js`.
- Supabase client, session, dan token tetap memakai logic lama.
- Fetch student details dan history tetap memakai `automasi/src/journal.js`.
- Insert jurnal tetap melalui fungsi lama berikut:

```js
submitJournal(null, kegiatan, studentIds, keterangan, tanggal, izinLanjutan);
```

- Endpoint/table, payload, duplicate check, izin lanjutan, dan upload foto tidak diganti.
- Route form lama `POST /submit` tetap tersedia.
- Mode **Single Date** tetap tersedia pada menu Attendance.

## Batch Attendance

Batch menerima:

- Bulan (`YYYY-MM`)
- Hari mulai (`1–31`)
- Hari akhir (`1–31`)
- Status
- Kegiatan
- Delay 500–1000 ms
- Surat izin opsional

Daftar tanggal dibentuk oleh `buildBatchDates()` di `automasi/src/utils.js`, lalu dijalankan oleh `runSequentialBatch()`.

Setiap tanggal menunggu request sebelumnya selesai:

```js
for (let index = 0; index < dates.length; index += 1) {
    try {
        await processDate(dates[index]);
    } catch (error) {
        // Dicatat sebagai gagal, kemudian lanjut ke tanggal berikutnya.
    }

    await sleep(delayMs);
}
```

`processDate()` pada server tetap memanggil `submitJournal()` lama. Batch tidak memakai `Promise.all` dan tidak membuat endpoint Supabase baru.

Progress dikirim oleh server sebagai **NDJSON stream**, sehingga halaman dapat memperbarui status setelah setiap tanggal selesai:

```text
[3/10] Mengirim absensi tanggal 2026-07-03...
✓ Berhasil
```

Jika gagal:

```text
[4/10] Mengirim absensi tanggal 2026-07-04...
✗ Gagal: alasan error
```

Setelah selesai, UI menampilkan total, jumlah berhasil, jumlah gagal, dan daftar tanggal gagal.

## Validasi

- Hari mulai dan akhir harus berupa angka bulat.
- Hari harus berada pada rentang 1–31.
- Hari mulai tidak boleh lebih besar dari hari akhir.
- Hari harus tersedia pada bulan yang dipilih, misalnya 31 Februari ditolak.
- Batas bawah tanggal (`2026-01-05`) tetap dipertahankan; tidak ada batas maksimal tanggal.
- Kegiatan wajib diisi.
- Status hanya dapat berupa `hadir`, `izin`, atau `libur`.

## UI Baru

Satu halaman EJS lama kini menyediakan:

- Dashboard
- Single Date Attendance
- Batch Attendance dengan progress dan execution grid
- History dengan pencarian dan filter
- Live System Logs dengan pencarian, clear, dan export
- Sidebar desktop dan drawer mobile
- Toast berhasil/gagal
- Responsive layout

## Setup

### 1. Install dependency

```bash
cd automasi
npm install

cd ../ui
npm install
```

### 2. Buat `.env` pada root project

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
USER_EMAIL=your_email@example.com
USER_PASSWORD=your_password

# Opsional jika data kelas/industri tidak dapat difetch otomatis
ID_SISWA=
ID_KELAS=
ID_INDUSTRI=
```

### 3. Build CSS

File `ui/public/output.css` sudah disertakan di ZIP hasil implementasi. Jika mengubah styling:

```bash
cd ui
npm run build:css
```

Untuk watch mode:

```bash
npm run watch:css
```

### 4. Jalankan server

```bash
cd ui
npm run dev
```

Buka:

```text
http://localhost:3000
```

## Test

```bash
cd automasi
npm test
```

Test mencakup:

- Rentang inklusif dan urut
- Validasi 1–31
- Validasi awal ≤ akhir
- Validasi jumlah hari dalam bulan
- Normalisasi delay
- Sequential execution
- Continue-on-error dan failed date summary

## File utama yang berubah

### `automasi/src/utils.js`

Menambahkan helper tanggal, delay, dan sequential batch. Tidak berisi endpoint maupun autentikasi.

### `ui/server.js`

Menambahkan shared function `processJournalSubmission()` agar Single Date dan Batch Date memakai request lama yang sama. Menambahkan route:

- `POST /api/submit` untuk UI Single Date berbasis fetch
- `POST /api/batch-submit` untuk stream Batch Attendance
- `GET /api/status`
- `POST /api/logs/clear`

Route dan fitur lama tidak dihapus.

### `ui/views/index.ejs`

Mengganti tampilan lama menjadi dashboard multi-view dalam file EJS yang sama.

### `ui/src/input.css`

Menambahkan design system Indigo, card layout, terminal, progress indicator, status badge, dan responsive states.
