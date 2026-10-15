// database.js - Pengurusan Pangkalan Data Sistem PPPB / APC
// Menggunakan SQLite bawaan rasmi Node.js 22 (node:sqlite)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_PATH = path.join(__dirname, 'data_pppb.sqlite');
const db = new DatabaseSync(DB_PATH);

// Aktifkan foreign keys & WAL mode untuk prestasi terbaik
try {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
} catch (e) {
  console.warn('Pragma warning:', e.message);
}

// Inisialisasi jadual-jadual
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS practitioners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ic_no TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      office_phone TEXT,
      email TEXT,
      home_address TEXT,
      practice_type TEXT DEFAULT 'Freelance',
      principal_practice_name TEXT,
      principal_practice_address TEXT,
      other_practice_places TEXT,
      signature_data TEXT,
      ic_document TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Migrasi selamat untuk menambah kolum tempat amalan lain jika belum ada
  try { db.exec('ALTER TABLE practitioners ADD COLUMN other_practice_1 TEXT;'); } catch(e) {}
  try { db.exec('ALTER TABLE practitioners ADD COLUMN other_practice_2 TEXT;'); } catch(e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_no TEXT UNIQUE NOT NULL,
      practitioner_id INTEGER NOT NULL,
      submission_year INTEGER NOT NULL,
      submission_batch TEXT,
      status TEXT NOT NULL DEFAULT 'Baru',
      notes TEXT,
      total_apc_count INTEGER DEFAULT 1,
      apc_official_fee REAL DEFAULT 50.0,
      service_fee REAL DEFAULT 50.0,
      total_fee REAL NOT NULL,
      payment_status TEXT DEFAULT 'Belum Bayar',
      payment_method TEXT DEFAULT 'Pindahan Bank / DuitNow',
      payment_reference TEXT,
      payment_receipt TEXT,
      payment_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS application_apc_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      practitioner_id INTEGER NOT NULL,
      discipline TEXT NOT NULL,
      subdiscipline TEXT,
      registration_no TEXT,
      current_expiry_date TEXT,
      new_expiry_date TEXT,
      old_apc_document TEXT,
      status TEXT DEFAULT 'Aktif',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS practitioner_apc_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      practitioner_id INTEGER NOT NULL,
      discipline TEXT NOT NULL,
      subdiscipline TEXT,
      registration_no TEXT,
      current_expiry_date TEXT,
      new_expiry_date TEXT,
      status TEXT DEFAULT 'Aktif',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      expires_at TEXT
    );
  `);

  // Tetapan asal (Default Settings)
  const defaultSettings = [
    { key: 'business_name', value: 'Ar Rahmah Wellness' },
    { key: 'service_name', value: 'Perkhidmatan Pembaharuan APC (PPPB) MPTK' },
    { key: 'default_service_fee', value: '0.00' },
    { key: 'apc_unit_fee', value: '150.00' },
    { key: 'bank_name', value: 'CIMB' },
    { key: 'bank_account_no', value: '7002907528' },
    { key: 'bank_account_holder', value: 'Muhamad Hafiz bin Ab Ghani' },
    { key: 'admin_whatsapp', value: '60193393290' },
    { key: 'announcement', value: 'Sila lengkapkan maklumat dan muat naik resit bayaran serta dokumen berkaitan.' },
    { key: 'reminder_template', value: 'Salam Tuan/Puan {NAMA}, peringatan mesra bahawa perakuan APC ({BIDANG}) anda akan tamat tempoh pada {TARIKH_LUPUT}. Sila klik pautan ini untuk memperbaharui sekarang secara online: {PAUTAN_BORANG}. Terima kasih - Ar Rahmah Wellness' },
    { key: 'qr1_title', value: 'CIMB DuitNow QR' },
    { key: 'qr1_image', value: '' },
    { key: 'qr1_holder', value: 'Muhamad Hafiz bin Ab Ghani' },
    { key: 'qr1_note', value: 'Semua Bank & e-Wallet disokong' },
    { key: 'qr2_title', value: "Touch 'n Go eWallet" },
    { key: 'qr2_image', value: '' },
    { key: 'qr2_holder', value: 'Muhamad Hafiz bin Ab Ghani' },
    { key: 'qr2_note', value: 'Imbas menggunakan aplikasi TNG eWallet' },
    { key: 'qr3_title', value: 'BigPay / Pilihan Lain' },
    { key: 'qr3_image', value: '' },
    { key: 'qr3_holder', value: '' },
    { key: 'qr3_note', value: '' },
    { key: 'renewal_window_days', value: '30' },
    { key: 'enforce_renewal_window', value: '1' }
  ];

  const checkStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

  for (const item of defaultSettings) {
    const existing = checkStmt.get(item.key);
    if (!existing) {
      insertStmt.run(item.key, item.value);
    }
  }

  // Migrasi automatik: Tukar tetapan lama (Maybank / RM50) kepada tetapan rasmi CIMB & Yuran Bersatu RM150
  const curBank = checkStmt.get('bank_name');
  if (curBank && curBank.value === 'Maybank') {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('CIMB', 'bank_name');
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('7002907528', 'bank_account_no');
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('Muhamad Hafiz bin Ab Ghani', 'bank_account_holder');
  }
  const curApcFee = checkStmt.get('apc_unit_fee');
  if (curApcFee && curApcFee.value === '50.00') {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('150.00', 'apc_unit_fee');
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('0.00', 'default_service_fee');
  }

  // Inisialisasi Kredensial Pentadbir Asal (admin / admin123) jika belum wujud
  if (!checkStmt.get('admin_username')) {
    insertStmt.run('admin_username', 'admin');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
    insertStmt.run('admin_password_salt', salt);
    insertStmt.run('admin_password_hash', hash);
  }
}


// Format IC tanpa sengkang/ruang untuk konsistensi
function cleanIC(ic) {
  if (!ic) return '';
  return String(ic).replace(/[^0-9]/g, '');
}

// Generate No Rujukan Unik (cth: PPPB-2026-0001)
function generateReferenceNo(year) {
  const currentYear = year || new Date().getFullYear();
  const countRow = db.prepare('SELECT COUNT(*) as count FROM applications WHERE submission_year = ?').get(currentYear);
  const count = (countRow ? countRow.count : 0) + 1;
  const padded = String(count).padStart(4, '0');
  return `PPPB-${currentYear}-${padded}`;
}

// Get or Create Practitioner by IC
function upsertPractitioner(data) {
  const clean = cleanIC(data.ic_no);
  if (!clean) throw new Error('No Kad Pengenalan diperlukan');

  const existing = db.prepare('SELECT * FROM practitioners WHERE ic_no = ?').get(clean);

  if (existing) {
    const updateStmt = db.prepare(`
      UPDATE practitioners SET
        full_name = ?,
        phone = ?,
        office_phone = ?,
        email = ?,
        home_address = ?,
        practice_type = ?,
        principal_practice_name = ?,
        principal_practice_address = ?,
        other_practice_places = ?,
        other_practice_1 = ?,
        other_practice_2 = ?,
        signature_data = COALESCE(?, signature_data),
        ic_document = COALESCE(?, ic_document),
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `);

    updateStmt.run(
      data.full_name || existing.full_name,
      data.phone || existing.phone,
      data.office_phone !== undefined ? data.office_phone : (existing.office_phone || ''),
      data.email !== undefined ? data.email : (existing.email || ''),
      data.home_address || existing.home_address || '',
      data.practice_type || existing.practice_type || 'Freelance',
      data.principal_practice_name !== undefined ? data.principal_practice_name : (existing.principal_practice_name || ''),
      data.principal_practice_address !== undefined ? data.principal_practice_address : (existing.principal_practice_address || ''),
      data.other_practice_places !== undefined ? data.other_practice_places : (existing.other_practice_places || ''),
      data.other_practice_1 !== undefined ? data.other_practice_1 : (existing.other_practice_1 || ''),
      data.other_practice_2 !== undefined ? data.other_practice_2 : (existing.other_practice_2 || ''),
      data.signature_data || null,
      data.ic_document || null,
      existing.id
    );

    return db.prepare('SELECT * FROM practitioners WHERE id = ?').get(existing.id);
  } else {
    const insertStmt = db.prepare(`
      INSERT INTO practitioners (
        ic_no, full_name, phone, office_phone, email, home_address,
        practice_type, principal_practice_name, principal_practice_address,
        other_practice_places, other_practice_1, other_practice_2, signature_data, ic_document
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = insertStmt.run(
      clean,
      data.full_name,
      data.phone,
      data.office_phone || '',
      data.email || '',
      data.home_address || '',
      data.practice_type || 'Freelance',
      data.principal_practice_name || '',
      data.principal_practice_address || '',
      data.other_practice_places || '',
      data.other_practice_1 || '',
      data.other_practice_2 || '',
      data.signature_data || '',
      data.ic_document || ''
    );

    return db.prepare('SELECT * FROM practitioners WHERE id = ?').get(res.lastInsertRowid);
  }
}

// Dapatkan maklumat penuh pengamal berserta semua APC dan sejarah permohonan
function getPractitionerWithDetails(id) {
  const p = db.prepare('SELECT * FROM practitioners WHERE id = ?').get(id);
  if (!p) return null;

  const apcItems = db.prepare(`
    SELECT * FROM application_apc_items WHERE practitioner_id = ? ORDER BY id DESC
  `).all(id);

  const directApcItems = db.prepare(`
    SELECT * FROM practitioner_apc_records WHERE practitioner_id = ? ORDER BY id DESC
  `).all(id);

  const discMap = new Map();
  for (const item of apcItems) {
    if (!discMap.has(item.discipline)) {
      discMap.set(item.discipline, item);
    }
  }
  for (const item of directApcItems) {
    if (!discMap.has(item.discipline)) {
      discMap.set(item.discipline, item);
    }
  }
  p.apc_items = Array.from(discMap.values());

  const apps = db.prepare(`
    SELECT a.*, (SELECT GROUP_CONCAT(discipline, ', ') FROM application_apc_items WHERE application_id = a.id) as disciplines
    FROM applications a
    WHERE a.practitioner_id = ?
    ORDER BY a.submission_year DESC, a.id DESC
  `).all(id);
  p.applications = apps;

  return p;
}

// Kemaskini Profil Pengamal dan APC mereka secara langsung dari Admin Dashboard
function updatePractitionerProfile(id, data) {
  const p = db.prepare('SELECT * FROM practitioners WHERE id = ?').get(id);
  if (!p) throw new Error('Pengamal tidak dijumpai');

  const clean = data.ic_no ? cleanIC(data.ic_no) : p.ic_no;

  db.prepare(`
    UPDATE practitioners SET
      ic_no = ?,
      full_name = ?,
      phone = ?,
      office_phone = ?,
      email = ?,
      home_address = ?,
      practice_type = ?,
      principal_practice_name = ?,
      principal_practice_address = ?,
      other_practice_1 = ?,
      other_practice_2 = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    clean,
    data.full_name || p.full_name,
    data.phone || p.phone,
    data.office_phone !== undefined ? data.office_phone : (p.office_phone || ''),
    data.email !== undefined ? data.email : (p.email || ''),
    data.home_address !== undefined ? data.home_address : (p.home_address || ''),
    data.practice_type || p.practice_type || 'Freelance',
    data.principal_practice_name !== undefined ? data.principal_practice_name : (p.principal_practice_name || ''),
    data.principal_practice_address !== undefined ? data.principal_practice_address : (p.principal_practice_address || ''),
    data.other_practice_1 !== undefined ? data.other_practice_1 : (p.other_practice_1 || ''),
    data.other_practice_2 !== undefined ? data.other_practice_2 : (p.other_practice_2 || ''),
    id
  );

  // Jika item APC disertakan untuk kemaskini
  if (Array.isArray(data.apc_items)) {
    for (const item of data.apc_items) {
      if (item.discipline) {
        // Kemaskini semua entri bagi pengamal dan bidang ini agar selaras sepenuhnya
        const updateRes = db.prepare(`
          UPDATE application_apc_items SET
            subdiscipline = ?,
            registration_no = ?,
            current_expiry_date = ?,
            new_expiry_date = ?
          WHERE practitioner_id = ? AND discipline = ?
        `).run(
          item.subdiscipline || '',
          item.registration_no || '',
          item.current_expiry_date || '',
          item.new_expiry_date || '',
          id,
          item.discipline
        );

        // Jika tiada baris sedia ada untuk bidang ini, tambah rekod baharu
        if (updateRes.changes === 0) {
          const latestApp = db.prepare('SELECT id FROM applications WHERE practitioner_id = ? ORDER BY id DESC LIMIT 1').get(id);
          const appId = latestApp ? latestApp.id : 0;
          db.prepare(`
            INSERT INTO application_apc_items (
              application_id, practitioner_id, discipline, subdiscipline,
              registration_no, current_expiry_date, new_expiry_date, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Aktif')
          `).run(
            appId,
            id,
            item.discipline,
            item.subdiscipline || '',
            item.registration_no || '',
            item.current_expiry_date || '',
            item.new_expiry_date || ''
          );
        }
      }
    }
  }

  return getPractitionerWithDetails(id);
}

// Buat Permohonan Baru
function createApplication(appData) {
  // 1. Dapatkan atau cipta pengamal
  const practitioner = upsertPractitioner(appData.practitioner);

  const year = parseInt(appData.submission_year) || new Date().getFullYear();
  const refNo = generateReferenceNo(year);
  const currentSettings = getSettings();
  const defaultFeePerApc = parseFloat(currentSettings.apc_unit_fee) || 150.0;
  const feePerApc = (appData.apc_official_fee !== undefined && appData.apc_official_fee !== null && appData.apc_official_fee !== '')
    ? parseFloat(appData.apc_official_fee)
    : defaultFeePerApc;
  const apcFeePerUnit = feePerApc;
  const serviceFee = 0.0;
  const apcItems = Array.isArray(appData.apc_items) && appData.apc_items.length > 0 ? appData.apc_items : [];
  const apcCount = appData.total_apc_count !== undefined ? parseInt(appData.total_apc_count) : (apcItems.length || 1);
  const totalFee = feePerApc * apcCount;

  const appInsertStmt = db.prepare(`
    INSERT INTO applications (
      reference_no, practitioner_id, submission_year, submission_batch,
      status, notes, total_apc_count, apc_official_fee, service_fee,
      total_fee, payment_status, payment_method, payment_reference,
      payment_receipt, payment_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const batchCode = appData.submission_batch || '';
  const initialStatus = appData.status || 'Baru';
  const payStatus = appData.payment_status || (appData.payment_receipt ? 'Telah Bayar' : 'Belum Bayar');
  const payDate = appData.payment_date || (appData.payment_receipt ? new Date().toISOString().slice(0, 10) : '');

  const appRes = appInsertStmt.run(
    refNo,
    practitioner.id,
    year,
    batchCode,
    initialStatus,
    appData.notes || '',
    apcCount,
    apcFeePerUnit,
    serviceFee,
    totalFee,
    payStatus,
    appData.payment_method || 'Pindahan Bank / DuitNow',
    appData.payment_reference || '',
    appData.payment_receipt || '',
    payDate
  );

  const applicationId = appRes.lastInsertRowid;

  // 2. Simpan setiap item APC (sehingga 4)
  const apcInsertStmt = db.prepare(`
    INSERT INTO application_apc_items (
      application_id, practitioner_id, discipline, subdiscipline,
      registration_no, current_expiry_date, new_expiry_date,
      old_apc_document, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  if (Array.isArray(appData.apc_items)) {
    for (const item of appData.apc_items.slice(0, 4)) {
      if (!item.discipline) continue;
      apcInsertStmt.run(
        applicationId,
        practitioner.id,
        item.discipline,
        item.subdiscipline || '',
        item.registration_no || '',
        item.current_expiry_date || `${year}-12-31`,
        item.new_expiry_date || `${year + 1}-12-31`,
        item.old_apc_document || '',
        item.status || 'Aktif'
      );
    }
  }

  return getApplicationById(applicationId);
}

// Dapatkan Permohonan mengikut ID berserta butiran lengkap
function getApplicationById(id) {
  const app = db.prepare(`
    SELECT a.*, p.ic_no, p.full_name, p.phone, p.office_phone, p.email,
           p.home_address, p.practice_type, p.principal_practice_name,
           p.principal_practice_address, p.other_practice_places,
           p.signature_data, p.ic_document
    FROM applications a
    JOIN practitioners p ON a.practitioner_id = p.id
    WHERE a.id = ?
  `).get(id);

  if (!app) return null;

  const items = db.prepare(`
    SELECT * FROM application_apc_items WHERE application_id = ? ORDER BY id ASC
  `).all(id);

  app.apc_items = items;
  return app;
}

// Dapatkan Semua Permohonan dengan carian & penapis
function getAllApplications(filters = {}) {
  let query = `
    SELECT a.*, p.ic_no, p.full_name, p.phone, p.email,
           (SELECT GROUP_CONCAT(discipline, ', ') FROM application_apc_items WHERE application_id = a.id) as disciplines,
           (SELECT COUNT(*) FROM application_apc_items WHERE application_id = a.id) as apc_items_count
    FROM applications a
    JOIN practitioners p ON a.practitioner_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.year) {
    query += ' AND a.submission_year = ?';
    params.push(parseInt(filters.year));
  }

  if (filters.status) {
    query += ' AND a.status = ?';
    params.push(filters.status);
  }

  if (filters.payment_status) {
    query += ' AND a.payment_status = ?';
    params.push(filters.payment_status);
  }

  if (filters.batch) {
    query += ' AND a.submission_batch = ?';
    params.push(filters.batch);
  }

  if (filters.search) {
    query += ' AND (p.full_name LIKE ? OR p.ic_no LIKE ? OR a.reference_no LIKE ? OR p.phone LIKE ?)';
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY a.id DESC';

  const rows = db.prepare(query).all(...params);

  // Ambil maklumat apc items untuk setiap permohonan
  const getItemsStmt = db.prepare('SELECT * FROM application_apc_items WHERE application_id = ?');
  for (const r of rows) {
    r.apc_items = getItemsStmt.all(r.id);
  }

  return rows;
}

// Kemaskini Status / Maklumat Permohonan
function updateApplication(id, updates) {
  const current = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!current) throw new Error('Permohonan tidak dijumpai');

  const fields = [];
  const params = [];

  const allowedFields = [
    'submission_year', 'submission_batch', 'status', 'notes',
    'total_apc_count', 'apc_official_fee', 'service_fee', 'total_fee',
    'payment_status', 'payment_method', 'payment_reference',
    'payment_receipt', 'payment_date'
  ];

  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(updates[key]);
    }
  }

  // Recalculate total if fee fields updated
  if (updates.apc_official_fee !== undefined || updates.total_apc_count !== undefined) {
    const apcCount = updates.total_apc_count !== undefined ? parseInt(updates.total_apc_count) : current.total_apc_count;
    const apcFee = updates.apc_official_fee !== undefined ? parseFloat(updates.apc_official_fee) : current.apc_official_fee;
    const newTotal = apcFee * apcCount;
    fields.push('total_fee = ?');
    params.push(newTotal);
  }

  fields.push("updated_at = datetime('now', 'localtime')");

  if (fields.length > 1) {
    const sql = `UPDATE applications SET ${fields.join(', ')} WHERE id = ?`;
    params.push(id);
    db.prepare(sql).run(...params);
  }

  // Kemaskini maklumat pengamal jika ada
  if (updates.practitioner) {
    updates.practitioner.id = current.practitioner_id;
    upsertPractitioner(updates.practitioner);
  }

  // Kemaskini apc items jika disertakan
  if (Array.isArray(updates.apc_items)) {
    db.prepare('DELETE FROM application_apc_items WHERE application_id = ?').run(id);
    const apcInsertStmt = db.prepare(`
      INSERT INTO application_apc_items (
        application_id, practitioner_id, discipline, subdiscipline,
        registration_no, current_expiry_date, new_expiry_date,
        old_apc_document, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of updates.apc_items.slice(0, 4)) {
      if (!item.discipline) continue;
      apcInsertStmt.run(
        id,
        current.practitioner_id,
        item.discipline,
        item.subdiscipline || '',
        item.registration_no || '',
        item.current_expiry_date || '',
        item.new_expiry_date || '',
        item.old_apc_document || '',
        item.status || 'Aktif'
      );
    }
  }

  return getApplicationById(id);
}

// Helper Menyelaras Nama Bidang Amalan Mengikut Piawaian MPTK
function normalizeDiscipline(str) {
  if (!str) return 'Perubatan Tradisional Melayu (PTM)';
  const s = String(str).toUpperCase().trim();
  if (s.includes('MELAYU') || s.includes('PTM') || s.includes('BEKAM') || s.includes('URUT')) return 'Perubatan Tradisional Melayu (PTM)';
  if (s.includes('CINA') || s.includes('PTC') || s.includes('AKUPUNTUR') || s.includes('TCM')) return 'Perubatan Tradisional Cina (PTC)';
  if (s.includes('INDIA') || s.includes('PTI') || s.includes('AYURVEDA')) return 'Perubatan Tradisional India (PTI)';
  if (s.includes('HOMEO')) return 'Homeopati';
  if (s.includes('ISLAM') || s.includes('RUQYAH')) return 'Pengubatan Islam';
  if (s.includes('KIRO') || s.includes('CHIRO')) return 'Kiropraktik';
  if (s.includes('OSTEO')) return 'Osteopati';
  return String(str).trim();
}

// Cipta Data Pengamal Sahaja (Pangkalan Data Pengamal Tab 2 - Tanpa Permohonan)
function createPractitionerOnly(data) {
  if (!data.ic_no || !data.full_name) {
    throw new Error('Nama penuh dan No Kad Pengenalan adalah wajib');
  }

  const clean = cleanIC(data.ic_no);
  if (!clean) throw new Error('No Kad Pengenalan tidak sah');

  const practitioner = upsertPractitioner({
    ic_no: clean,
    full_name: data.full_name.trim(),
    phone: data.phone || '',
    office_phone: data.office_phone || '',
    email: data.email || '',
    home_address: data.home_address || '',
    practice_type: data.practice_type || 'Freelance',
    principal_practice_name: data.principal_practice_name || (data.practice_type === 'Premis' ? data.principal_practice_name : 'Freelance'),
    principal_practice_address: data.principal_practice_address || data.home_address || '',
    other_practice_1: data.other_practice_1 || '',
    other_practice_2: data.other_practice_2 || ''
  });

  // Simpan maklumat rekod APC ke practitioner_apc_records
  let itemsToSave = [];
  if (Array.isArray(data.apc_items) && data.apc_items.length > 0) {
    itemsToSave = data.apc_items;
  } else if (data.discipline) {
    itemsToSave = [{
      discipline: data.discipline,
      subdiscipline: data.subdiscipline || '',
      registration_no: data.registration_no || '',
      current_expiry_date: data.current_expiry_date || '',
      new_expiry_date: data.new_expiry_date || ''
    }];
  }

  for (const item of itemsToSave) {
    if (item && item.discipline) {
      const disc = normalizeDiscipline(item.discipline);
      const existing = db.prepare('SELECT id FROM practitioner_apc_records WHERE practitioner_id = ? AND discipline = ?').get(practitioner.id, disc);
      if (existing) {
        db.prepare(`
          UPDATE practitioner_apc_records SET
            subdiscipline = ?,
            registration_no = ?,
            current_expiry_date = ?,
            new_expiry_date = ?
          WHERE id = ?
        `).run(
          item.subdiscipline || '',
          item.registration_no || '',
          item.current_expiry_date || '',
          item.new_expiry_date || '',
          existing.id
        );
      } else {
        db.prepare(`
          INSERT INTO practitioner_apc_records (
            practitioner_id, discipline, subdiscipline,
            registration_no, current_expiry_date, new_expiry_date
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          practitioner.id,
          disc,
          item.subdiscipline || '',
          item.registration_no || '',
          item.current_expiry_date || '',
          item.new_expiry_date || ''
        );
      }
    }
  }

  return getPractitionerWithDetails(practitioner.id);
}

// Cipta Permohonan Manual (Oleh Admin di Tab 1)
function createManualPractitioner(data) {
  if (!data.ic_no || !data.full_name) {
    throw new Error('Nama penuh dan No Kad Pengenalan adalah wajib');
  }

  const clean = cleanIC(data.ic_no);
  if (!clean) throw new Error('No Kad Pengenalan tidak sah');

  const practitioner = upsertPractitioner({
    ic_no: clean,
    full_name: data.full_name.trim(),
    phone: data.phone || '',
    office_phone: data.office_phone || '',
    email: data.email || '',
    home_address: data.home_address || '',
    practice_type: data.practice_type || 'Freelance',
    principal_practice_name: data.principal_practice_name || (data.practice_type === 'Premis' ? data.principal_practice_name : 'Freelance'),
    principal_practice_address: data.principal_practice_address || data.home_address || '',
    other_practice_1: data.other_practice_1 || '',
    other_practice_2: data.other_practice_2 || ''
  });

  const year = parseInt(data.submission_year) || new Date().getFullYear();
  let apcItems = [];

  if (Array.isArray(data.apc_items) && data.apc_items.length > 0) {
    apcItems = data.apc_items.map(item => ({
      discipline: normalizeDiscipline(item.discipline),
      subdiscipline: item.subdiscipline || '',
      registration_no: item.registration_no || '',
      current_expiry_date: item.current_expiry_date || `${year}-12-31`,
      new_expiry_date: item.new_expiry_date || `${year + 1}-12-31`,
      status: 'Aktif'
    }));
  } else {
    apcItems = [
      {
        discipline: normalizeDiscipline(data.discipline),
        subdiscipline: data.subdiscipline || '',
        registration_no: data.registration_no || '',
        current_expiry_date: data.current_expiry_date || `${year}-12-31`,
        new_expiry_date: data.new_expiry_date || `${year + 1}-12-31`,
        status: 'Aktif'
      }
    ];
  }

  const currentSettings = getSettings();
  const feeRate = parseFloat(data.apc_official_fee || data.fee_per_apc) || parseFloat(currentSettings.apc_unit_fee) || 150.0;

  const appData = {
    submission_year: year,
    submission_batch: data.batch || '',
    status: data.status || 'Baru',
    notes: data.notes || 'Didaftar secara manual oleh Pentadbir',
    practitioner: {
      id: practitioner.id,
      ic_no: clean,
      full_name: data.full_name.trim(),
      phone: data.phone || '',
      office_phone: data.office_phone || '',
      email: data.email || '',
      home_address: data.home_address || '',
      practice_type: data.practice_type || 'Freelance',
      principal_practice_name: data.principal_practice_name || '',
      principal_practice_address: data.principal_practice_address || '',
      other_practice_1: data.other_practice_1 || '',
      other_practice_2: data.other_practice_2 || ''
    },
    apc_items: apcItems,
    apc_official_fee: feeRate,
    service_fee: 0.0,
    payment_status: data.payment_status || 'Telah Bayar',
    payment_method: data.payment_method || 'Pindahan Bank / DuitNow',
    payment_reference: data.payment_reference || 'Daftar Manual Admin',
    payment_date: data.payment_date || new Date().toISOString().slice(0, 10)
  };

  return createApplication(appData);
}

// Import Berkelompok Pengamal Dari Excel / CSV (Ke Pangkalan Data Pengamal Tab 2)
function importPractitionersBatch(records) {
  let successCount = 0;
  const errors = [];

  db.exec('BEGIN TRANSACTION;');
  try {
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      try {
        const name = rec.full_name || rec.nama || rec.name || rec['Nama Penuh'] || rec['NAMA PENUH'] || rec['Nama'];
        const rawIc = rec.ic_no || rec.ic || rec.no_ic || rec.kad_pengenalan || rec['No IC'] || rec['NO IC'] || rec['No. Kad Pengenalan'];
        if (!name || !rawIc) {
          errors.push(`Baris ${i + 1}: Nama atau No IC kosong`);
          continue;
        }

        const clean = cleanIC(rawIc);
        if (!clean) {
          errors.push(`Baris ${i + 1} (${name}): No IC tidak sah (${rawIc})`);
          continue;
        }

        const disc1 = rec.discipline1 || rec.bidang1 || rec['Bidang APC 1'] || rec['Bidang 1'] || rec['Disiplin 1'] || rec.discipline || rec.bidang || 'Perubatan Tradisional Melayu (PTM)';
        const exp1 = rec.current_expiry_date1 || rec.tarikh_luput1 || rec['Tarikh Luput APC 1'] || rec['Tarikh Luput 1'] || rec.tarikhLuput || '2026-12-31';

        const apcItems = [
          {
            discipline: normalizeDiscipline(disc1),
            subdiscipline: rec.subdiscipline1 || rec.subbidang1 || rec['Subbidang APC 1'] || rec['Subbidang 1'] || '',
            registration_no: rec.registration_no1 || rec.no_daftar1 || rec['No Pendaftaran APC 1'] || rec['No Siri 1'] || '',
            current_expiry_date: exp1,
            new_expiry_date: rec.new_expiry_date1 || `${parseInt(String(exp1).slice(0, 4)) + 1}-12-31`
          }
        ];

        const disc2 = rec.discipline2 || rec.bidang2 || rec['Bidang APC 2'] || rec['Bidang 2'] || rec['Disiplin 2'];
        if (disc2 && String(disc2).trim() !== '') {
          const exp2 = rec.current_expiry_date2 || rec.tarikh_luput2 || rec['Tarikh Luput APC 2'] || rec['Tarikh Luput 2'] || exp1;
          apcItems.push({
            discipline: normalizeDiscipline(disc2),
            subdiscipline: rec.subdiscipline2 || rec.subbidang2 || rec['Subbidang APC 2'] || rec['Subbidang 2'] || '',
            registration_no: rec.registration_no2 || rec.no_daftar2 || rec['No Pendaftaran APC 2'] || rec['No Siri 2'] || '',
            current_expiry_date: exp2,
            new_expiry_date: rec.new_expiry_date2 || `${parseInt(String(exp2).slice(0, 4)) + 1}-12-31`
          });
        }

        const phone = rec.phone || rec.tel || rec.no_telefon || rec['No Telefon'] || rec['No. Telefon'] || rec['Telefon'] || '';
        const email = rec.email || rec.emel || rec['Emel'] || rec['Email'] || '';
        const homeAddr = rec.home_address || rec.alamat || rec.alamatRumah || rec['Alamat Kediaman'] || rec['Alamat Rumah'] || rec['Alamat'] || '';
        const practiceType = rec.practice_type || rec.jenis_amalan || rec['Jenis Amalan'] || 'Freelance';
        const pName = rec.principal_practice_name || rec.nama_premis || rec['Nama Tempat Amalan Utama'] || rec['Nama Tempat Amalan'] || (practiceType === 'Freelance' ? 'Freelance' : '');
        const pAddr = rec.principal_practice_address || rec.alamat_amalan || rec.alamatAmalan || rec['Alamat Tempat Amalan Utama'] || rec['Alamat Tempat Amalan'] || homeAddr;

        createPractitionerOnly({
          full_name: String(name).trim(),
          ic_no: clean,
          phone: String(phone).trim(),
          office_phone: rec.office_phone || rec.tel_pejabat || '',
          email: String(email).trim(),
          home_address: String(homeAddr).trim(),
          practice_type: practiceType,
          principal_practice_name: String(pName).trim(),
          principal_practice_address: String(pAddr).trim(),
          apc_items: apcItems
        });

        successCount++;
      } catch (err) {
        errors.push(`Baris ${i + 1}: ${err.message}`);
      }
    }
    db.exec('COMMIT;');
  } catch (txErr) {
    try { db.exec('ROLLBACK;'); } catch (e) {}
    throw txErr;
  }

  return { successCount, errors };
}

// Dapatkan Semua Pengamal
function getAllPractitioners(search = '') {
  let sql = `
    SELECT p.*,
           COUNT(DISTINCT a.id) as total_applications,
           MAX(a.submission_year) as latest_year,
           COALESCE(
             NULLIF((SELECT GROUP_CONCAT(DISTINCT discipline) FROM application_apc_items WHERE practitioner_id = p.id), ''),
             (SELECT GROUP_CONCAT(DISTINCT discipline) FROM practitioner_apc_records WHERE practitioner_id = p.id),
             ''
           ) as registered_disciplines
    FROM practitioners p
    LEFT JOIN applications a ON p.id = a.practitioner_id
  `;
  const params = [];

  if (search) {
    sql += ' WHERE p.full_name LIKE ? OR p.ic_no LIKE ? OR p.phone LIKE ?';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  sql += ' GROUP BY p.id ORDER BY p.full_name ASC';
  return db.prepare(sql).all(...params);
}

// Dapatkan Pengamal mengikut No IC (untuk semakan permohonan lama & auto-fill)
function getPractitionerByIC(ic) {
  const clean = cleanIC(ic);
  if (!clean) return null;

  const practitioner = db.prepare('SELECT * FROM practitioners WHERE ic_no = ?').get(clean);
  if (!practitioner) return null;

  // Dapatkan maklumat APC terdahulu yang pernah didaftarkan
  const apcRecords = db.prepare(`
    SELECT DISTINCT discipline, subdiscipline, registration_no, current_expiry_date, new_expiry_date
    FROM application_apc_items
    WHERE practitioner_id = ?
    ORDER BY id DESC
  `).all(practitioner.id);

  const directRecords = db.prepare(`
    SELECT DISTINCT discipline, subdiscipline, registration_no, current_expiry_date, new_expiry_date
    FROM practitioner_apc_records
    WHERE practitioner_id = ?
    ORDER BY id DESC
  `).all(practitioner.id);

  const allRecords = [...apcRecords, ...directRecords];

  // Ambil yang paling terkini bagi setiap bidang
  const uniqueApcMap = new Map();
  for (const item of allRecords) {
    if (!uniqueApcMap.has(item.discipline)) {
      uniqueApcMap.set(item.discipline, item);
    }
  }

  practitioner.past_apc_items = Array.from(uniqueApcMap.values());

  // Ambil permohonan terkini
  const latestApp = db.prepare(`
    SELECT * FROM applications WHERE practitioner_id = ? ORDER BY submission_year DESC, id DESC LIMIT 1
  `).get(practitioner.id);
  practitioner.latest_application = latestApp;

  return practitioner;
}

// Senarai Peringatan Tarikh Luput APC (Expiry Alerts)
function getExpiryAlerts(daysThreshold = 90) {
  // Dapatkan APC items yang paling terkini bagi setiap pengamal dan bidang
  const sql = `
    SELECT i.*, p.full_name, p.ic_no, p.phone, p.email, a.submission_year, a.reference_no,
           julianday(COALESCE(NULLIF(i.current_expiry_date, ''), (COALESCE(a.submission_year, 2026) || '-12-31'))) - julianday('now', 'localtime') AS days_left
    FROM application_apc_items i
    JOIN practitioners p ON i.practitioner_id = p.id
    LEFT JOIN applications a ON i.application_id = a.id
    WHERE i.current_expiry_date IS NOT NULL AND i.current_expiry_date != ''
    ORDER BY i.id DESC
  `;

  const rows = db.prepare(sql).all();

  // Tapis yang unik mengikut pengamal dan bidang (ambil rekod yang paling terkini mengikut id)
  const resultMap = new Map();
  for (const row of rows) {
    const key = `${row.practitioner_id}_${row.discipline}`;
    if (!resultMap.has(key)) {
      // Tentukan status peringatan
      const days = Math.round(row.days_left);
      let alertCategory = 'Sah';
      let badgeClass = 'bg-green-100 text-green-800';

      if (days < 0) {
        alertCategory = 'Telah Tamat Tempoh';
        badgeClass = 'bg-red-100 text-red-800 animate-pulse';
      } else if (days <= 30) {
        alertCategory = 'Kritikal (< 30 Hari)';
        badgeClass = 'bg-orange-100 text-orange-800 font-bold';
      } else if (days <= 60) {
        alertCategory = 'Amaran (< 60 Hari)';
        badgeClass = 'bg-yellow-100 text-yellow-800';
      } else if (days <= 90) {
        alertCategory = 'Peringatan (< 90 Hari)';
        badgeClass = 'bg-blue-100 text-blue-800';
      }

      row.days_remaining = days;
      row.alert_category = alertCategory;
      row.badge_class = badgeClass;

      resultMap.set(key, row);
    }
  }

  // Susun semula mengikut hari paling awal tamat
  const allAlerts = Array.from(resultMap.values()).sort((a, b) => a.days_remaining - b.days_remaining);
  if (daysThreshold === 'all' || !daysThreshold) {
    return allAlerts;
  }
  const maxDays = parseInt(daysThreshold) || 30;
  return allAlerts.filter(item => item.days_remaining <= maxDays);
}

// Ringkasan Statistik Dashboard
function getDashboardStats() {
  const currentYear = new Date().getFullYear();

  const totalPractitioners = db.prepare('SELECT COUNT(*) as count FROM practitioners').get().count;
  const totalApplications = db.prepare('SELECT COUNT(*) as count FROM applications').get().count;
  const currentYearApps = db.prepare('SELECT COUNT(*) as count FROM applications WHERE submission_year = ?').get(currentYear).count;
  
  const paymentStats = db.prepare(`
    SELECT
      SUM(CASE WHEN payment_status = 'Telah Bayar' THEN total_fee ELSE 0 END) as total_collected,
      SUM(CASE WHEN payment_status = 'Belum Bayar' THEN total_fee ELSE 0 END) as total_pending,
      SUM(CASE WHEN payment_status = 'Telah Bayar' THEN service_fee ELSE 0 END) as profit_earned,
      COUNT(CASE WHEN payment_status = 'Belum Bayar' THEN 1 END) as unpaid_count
    FROM applications
  `).get();

  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count FROM applications GROUP BY status
  `).all();

  const batches = db.prepare(`
    SELECT submission_batch, COUNT(*) as count, submission_year
    FROM applications
    WHERE submission_batch IS NOT NULL AND submission_batch != ''
    GROUP BY submission_batch
    ORDER BY submission_batch DESC
  `).all();

  const allAlerts = getExpiryAlerts('all');
  const criticalExpiryCount = allAlerts.filter(a => a.days_remaining <= 30).length;

  return {
    current_year: currentYear,
    total_practitioners: totalPractitioners,
    total_applications: totalApplications,
    current_year_applications: currentYearApps,
    financial: {
      total_collected: paymentStats.total_collected || 0,
      total_pending: paymentStats.total_pending || 0,
      profit_earned: paymentStats.profit_earned || 0,
      unpaid_count: paymentStats.unpaid_count || 0
    },
    status_counts: statusCounts,
    batches: batches,
    critical_expiry_count: criticalExpiryCount
  };
}

// Tetapan (Settings)
function getSettings() {
  const rows = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  for (const r of rows) {
    obj[r.key] = r.value;
  }
  return obj;
}

function updateSettings(newSettings) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  for (const [key, value] of Object.entries(newSettings)) {
    stmt.run(key, String(value));
  }
  return getSettings();
}

// ==========================================
// PENGESAHAN & KESELAMATAN PENTADBIR
// ==========================================

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

function verifyAdminPassword(username, password) {
  if (!username || !password) return false;
  const userRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_username');
  const currentUsername = userRow ? userRow.value : 'admin';
  if (username.trim() !== currentUsername.trim()) return false;

  const saltRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_salt');
  const hashRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_hash');

  if (!saltRow || !hashRow) return false;
  const calcHash = hashPassword(password, saltRow.value);
  return calcHash === hashRow.value;
}


function changeAdminCredentials(newUsername, newPassword) {
  if (newUsername && newUsername.trim()) {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('admin_username', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(newUsername.trim());
  }
  if (newPassword && newPassword.trim()) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(newPassword.trim(), salt);
    const stmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run('admin_password_salt', salt);
    stmt.run('admin_password_hash', hash);
  }
  return true;
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, expires_at) VALUES (?, ?)').run(token, expiresAt);
  return token;
}

function validateSession(token) {
  if (!token) return false;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return false;
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return false;
  }
  return true;
}

function deleteSession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Inisialisasi pada import
initDatabase();

module.exports = {
  db,
  initDatabase,
  cleanIC,
  upsertPractitioner,
  getPractitionerWithDetails,
  updatePractitionerProfile,
  createApplication,
  getApplicationById,
  getAllApplications,
  updateApplication,
  getAllPractitioners,
  getPractitionerByIC,
  createPractitionerOnly,
  createManualPractitioner,
  importPractitionersBatch,
  normalizeDiscipline,
  getExpiryAlerts,
  getDashboardStats,
  getSettings,
  updateSettings,
  verifyAdminPassword,
  changeAdminCredentials,
  createSession,
  validateSession,
  deleteSession
};

