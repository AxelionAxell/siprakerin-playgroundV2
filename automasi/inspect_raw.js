const { login } = require('./src/auth');
const config = require('./src/config');

async function fetchAllTables() {
    try {
        console.log("Sedang login untuk mendapatkan token...");
        const session = await login();
        const token = session.token;

        if (!token) {
            console.error("Gagal mendapatkan token");
            return;
        }

        console.log("✓ Login berhasil\n");
        console.log("=".repeat(60));
        console.log("DAFTAR SEMUA TABEL DI DATABASE SUPABASE");
        console.log("=".repeat(60));

        // Fetch semua tabel dari schema public menggunakan PostgREST introspection
        const baseUrl = `${config.SUPABASE_URL}/rest/v1`;
        
        const headers = {
            'apikey': config.SUPABASE_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // PostgREST menyediakan endpoint root untuk introspection
        const response = await fetch(baseUrl, { 
            method: 'OPTIONS',
            headers 
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse header 'Allow' atau 'Access-Control-Allow-Methods' untuk mendapatkan daftar tabel
        // Alternatif: query information_schema jika ada akses
        
        // Cara lebih sederhana: coba fetch beberapa tabel umum
        const commonTables = [
            'daftar_siswa',
            'daftar_jurnal',
            'daftar_kelas',
            'daftar_industri',
            'daftar_izin',
            'daftar_nilai',
            'daftar_guru',
            'daftar_admin'
        ];

        console.log("\nMencoba fetch tabel-tabel umum...\n");

        const results = [];

        for (const tableName of commonTables) {
            try {
                const tableUrl = `${baseUrl}/${tableName}?limit=0`;
                const tableResponse = await fetch(tableUrl, { headers });
                
                if (tableResponse.ok) {
                    // Ambil header Content-Range untuk mengetahui jumlah row
                    const contentRange = tableResponse.headers.get('Content-Range');
                    let rowCount = 'Unknown';
                    
                    if (contentRange) {
                        // Format: "0-0/123" atau "*/123"
                        const match = contentRange.match(/\/(\d+)/);
                        if (match) {
                            rowCount = match[1];
                        }
                    }

                    results.push({
                        table: tableName,
                        status: '✓ EXISTS',
                        rows: rowCount
                    });
                } else if (tableResponse.status === 404) {
                    results.push({
                        table: tableName,
                        status: '✗ NOT FOUND',
                        rows: '-'
                    });
                } else {
                    results.push({
                        table: tableName,
                        status: `⚠ ERROR ${tableResponse.status}`,
                        rows: '-'
                    });
                }
            } catch (err) {
                results.push({
                    table: tableName,
                    status: '✗ ERROR',
                    rows: '-'
                });
            }
        }

        console.table(results);

        console.log("\n" + "=".repeat(60));
        console.log("RINGKASAN:");
        console.log("=".repeat(60));
        const existingTables = results.filter(r => r.status === '✓ EXISTS');
        const missingTables = results.filter(r => r.status === '✗ NOT FOUND');
        
        console.log(`\n✓ Tabel yang ada: ${existingTables.length}`);
        existingTables.forEach(t => console.log(`  - ${t.table} (${t.rows} rows)`));
        
        console.log(`\n✗ Tabel yang tidak ada: ${missingTables.length}`);
        missingTables.forEach(t => console.log(`  - ${t.table}`));

    } catch (err) {
        console.error("Error:", err.message);
    }
}

fetchAllTables();
