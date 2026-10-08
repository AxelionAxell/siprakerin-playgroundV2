// Client Supabase milik user aktif, disimpan per request via AsyncLocalStorage
// supaya session tidak tertukar saat banyak user memakai server bersamaan.
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

// Jalankan fn dengan client milik user ini.
function runWithClient(client, fn) {
    return storage.run({ client }, fn);
}

// Client aktif untuk request ini, atau null di luar web (mis. CLI).
function requestClient() {
    return storage.getStore()?.client || null;
}

module.exports = { runWithClient, requestClient };
