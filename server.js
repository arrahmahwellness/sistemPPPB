// server.js - Pelayan HTTP & API Pangkalan Data Sistem PPPB / APC
// Dibina menggunakan modul teras Node.js (sifar kebergantungan luar / zero-dependency)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');
const db = require('./database.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

// Helper: Hantar respons JSON
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

// Helper: Baca badan permintaan (Request Body Parser)
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString('utf8');
      // Had saiz 50MB untuk muat naik gambar dokumen
      if (body.length > 50 * 1024 * 1024) {
        reject(new Error('Saiz muat naik melebihi had (Maks 50MB)'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

// Helper: Simpan data base64 ke fail
function saveBase64File(base64String, prefix = 'doc') {
  if (!base64String || typeof base64String !== 'string') return null;

  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  let ext = '.png';
  let buffer;

  if (matches && matches.length === 3) {
    const mime = matches[1];
    if (mime.includes('jpeg') || mime.includes('jpg')) ext = '.jpg';
    else if (mime.includes('pdf')) ext = '.pdf';
    else if (mime.includes('svg')) ext = '.svg';
    else if (mime.includes('webp')) ext = '.webp';
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    // Mungkin Base64 tanpa header data:
    buffer = Buffer.from(base64String, 'base64');
  }

  const fileName = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${fileName}`;
}

// Helper: Dapatkan token sesi pengesahan
function getAuthToken(req) {
  const cookie = req.headers.cookie;
  if (cookie) {
    const match = cookie.match(/admin_session=([a-f0-9]+)/);
    if (match) return match[1];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function isAuthenticated(req) {
  const token = getAuthToken(req);
  return db.validateSession(token);
}

// Cipta Pelayan HTTP
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Log permintaan
  console.log(`[${new Date().toLocaleTimeString()}] ${method} ${pathname}`);
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  try {
    // ==========================================
    // 1. API ROUTES
    // ==========================================

    // POST /api/login - Log Masuk Pentadbir
    if (method === 'POST' && pathname === '/api/login') {
      const body = await parseRequestBody(req);
      const valid = db.verifyAdminPassword(body.username, body.password);
      if (!valid) {
        return sendJSON(res, 401, { success: false, error: 'Nama pengguna atau kata laluan tidak tepat' });
      }
      const token = db.createSession();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `admin_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify({ success: true, message: 'Log masuk berjaya!', token }));
    }

    // POST /api/logout - Log Keluar Pentadbir
    if (method === 'POST' && pathname === '/api/logout') {
      const token = getAuthToken(req);
      if (token) db.deleteSession(token);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': 'admin_session=; HttpOnly; Path=/; Max-Age=0',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(JSON.stringify({ success: true, message: 'Log keluar berjaya' }));
    }

    // GET /api/auth/check - Semak Status Sesi
    if (method === 'GET' && pathname === '/api/auth/check') {
      return sendJSON(res, 200, { authenticated: isAuthenticated(req) });
    }

    // POST /api/settings/password - Tukar Kata Laluan Pentadbir
    if (method === 'POST' && pathname === '/api/settings/password') {
      if (!isAuthenticated(req)) return sendJSON(res, 401, { error: 'Sila log masuk' });
      const body = await parseRequestBody(req);
      const valid = db.verifyAdminPassword(body.current_username, body.current_password);
      if (!valid) {
        return sendJSON(res, 400, { success: false, error: 'Nama pengguna atau kata laluan semasa tidak tepat' });
      }
      if (!body.new_password || body.new_password.length < 6) {
        return sendJSON(res, 400, { success: false, error: 'Kata laluan baharu mestilah sekurang-kurangnya 6 aksara' });
      }
      db.changeAdminCredentials(body.new_username, body.new_password);
      return sendJSON(res, 200, { success: true, message: 'Kredensial pentadbir berjaya dikemaskini!' });
    }

    // Semak Akses API Pentadbir (Cegah akses tanpa kebenaran)
    const isPublicApi = (
      (pathname === '/api/applications' && method === 'POST') ||
      (pathname.startsWith('/api/practitioners/check/') && method === 'GET') ||
      (pathname === '/api/upload' && method === 'POST') ||
      (pathname === '/api/settings' && method === 'GET') ||
      (pathname === '/api/practitioners/template.csv' && method === 'GET')
    );

    if (pathname.startsWith('/api/') && !isPublicApi && !isAuthenticated(req)) {
      return sendJSON(res, 401, { success: false, error: 'Sesi anda telah tamat. Sila log masuk semula.' });
    }


    // GET /api/stats - Ringkasan Dashboard
    if (method === 'GET' && pathname === '/api/stats') {
      const stats = db.getDashboardStats();
      return sendJSON(res, 200, { success: true, data: stats });
    }

    // GET /api/applications - Senarai Permohonan
    if (method === 'GET' && pathname === '/api/applications') {
      const filters = {
        year: parsedUrl.query.year,
        status: parsedUrl.query.status,
        payment_status: parsedUrl.query.payment_status,
        batch: parsedUrl.query.batch,
        search: parsedUrl.query.search
      };
      const apps = db.getAllApplications(filters);
      return sendJSON(res, 200, { success: true, count: apps.length, data: apps });
    }

    // GET /api/applications/:id - Butiran Permohonan Tunggal
    if (method === 'GET' && pathname.startsWith('/api/applications/') && !pathname.endsWith('/docx')) {
      const id = parseInt(pathname.split('/')[3]);
      if (isNaN(id)) return sendJSON(res, 400, { error: 'ID tidak sah' });

      const app = db.getApplicationById(id);
      if (!app) return sendJSON(res, 404, { error: 'Permohonan tidak dijumpai' });
      return sendJSON(res, 200, { success: true, data: app });
    }


    // POST /api/applications - Cipta Permohonan Baharu (Dari Borang Online atau Admin)
    if (method === 'POST' && pathname === '/api/applications') {
      const body = await parseRequestBody(req);

      if (!body.practitioner || !body.practitioner.ic_no || !body.practitioner.full_name) {
        return sendJSON(res, 400, { error: 'Nama penuh dan No Kad Pengenalan adalah wajib' });
      }

      // Semakan Kelayakan Had Pembaharuan (Renewal Window Check)
      // Pengamal awam hanya dibenarkan memperbaharui dalam tempoh X hari (default: 30 hari) sebelum tamat
      const sysSettings = db.getSettings();
      const enforceWindow = sysSettings.enforce_renewal_window === '1' || sysSettings.enforce_renewal_window === true || sysSettings.enforce_renewal_window === undefined;
      const windowDays = parseInt(sysSettings.renewal_window_days) || 30;

      if (!isAuthenticated(req) && enforceWindow && Array.isArray(body.apc_items)) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        for (const item of body.apc_items) {
          if (item.current_expiry_date) {
            const [y, m, d] = item.current_expiry_date.split('-').map(Number);
            if (y && m && d) {
              const expiry = new Date(y, m - 1, d);
              const diffTime = expiry.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              if (diffDays > windowDays) {
                const discName = item.discipline || item.practice_area || 'APC';
                return sendJSON(res, 400, {
                  success: false,
                  error: `Pembaharuan APC tidak dibenarkan bagi bidang "${discName}": Perakuan APC anda masih sah sehingga ${item.current_expiry_date} (baki ${diffDays} hari lagi). Pembaharuan hanya dibuka ${windowDays} hari sebelum tarikh tamat tempoh.`
                });
              }
            }
          }
        }
      }

      // Proses dokumen jika dihantar sebagai base64
      if (body.practitioner.signature_data && body.practitioner.signature_data.startsWith('data:image')) {
        body.practitioner.signature_data = saveBase64File(body.practitioner.signature_data, 'sig');
      }
      if (body.practitioner.ic_document && body.practitioner.ic_document.startsWith('data:')) {
        body.practitioner.ic_document = saveBase64File(body.practitioner.ic_document, 'ic');
      }
      if (body.payment_receipt && body.payment_receipt.startsWith('data:')) {
        body.payment_receipt = saveBase64File(body.payment_receipt, 'receipt');
      }

      if (Array.isArray(body.apc_items)) {
        for (const item of body.apc_items) {
          if (item.old_apc_document && item.old_apc_document.startsWith('data:')) {
            item.old_apc_document = saveBase64File(item.old_apc_document, 'apc_doc');
          }
        }
      }

      const newApp = db.createApplication(body);
      return sendJSON(res, 201, {
        success: true,
        message: 'Permohonan berjaya dihantar!',
        data: newApp
      });
    }

    // PUT /api/applications/:id - Kemaskini Permohonan (Status, Bayaran, Batch, Nota)
    if (method === 'PUT' && pathname.startsWith('/api/applications/')) {
      const id = parseInt(pathname.split('/')[3]);
      if (isNaN(id)) return sendJSON(res, 400, { error: 'ID tidak sah' });

      const body = await parseRequestBody(req);

      if (body.payment_receipt && body.payment_receipt.startsWith('data:')) {
        body.payment_receipt = saveBase64File(body.payment_receipt, 'receipt');
      }

      const updated = db.updateApplication(id, body);
      return sendJSON(res, 200, {
        success: true,
        message: 'Permohonan berjaya dikemaskini!',
        data: updated
      });
    }

    // GET /api/practitioners - Senarai Semua Pengamal
    if (method === 'GET' && pathname === '/api/practitioners') {
      const list = db.getAllPractitioners(parsedUrl.query.search || '');
      return sendJSON(res, 200, { success: true, count: list.length, data: list });
    }

    // GET /api/practitioners/check/:ic - Semak Pengamal Mengikut IC (Auto-Fill untuk Pembaharuan)
    if (method === 'GET' && pathname.startsWith('/api/practitioners/check/')) {
      const ic = pathname.split('/')[4];
      const p = db.getPractitionerByIC(ic);
      if (!p) {
        return sendJSON(res, 200, { exists: false, message: 'Pengamal belum pernah didaftarkan' });
      }
      return sendJSON(res, 200, { exists: true, data: p });
    }

    // GET /api/practitioners/template.csv - Muat Turun Templat CSV Pengamal
    if (method === 'GET' && (pathname === '/api/practitioners/template.csv' || pathname === '/api/practitioners/template')) {
      const csvHeader = 'Nama Penuh,No IC,No Telefon,Emel,Alamat Kediaman,Jenis Amalan (Freelance/Premis),Nama Tempat Amalan Utama,Alamat Tempat Amalan Utama,Bidang APC 1,Subbidang APC 1,No Pendaftaran APC 1,Tarikh Luput APC 1 (YYYY-MM-DD),Bidang APC 2,Subbidang APC 2,No Pendaftaran APC 2,Tarikh Luput APC 2 (YYYY-MM-DD)\n';
      const sample1 = '"AHMAD BIN ABDULLAH","850101015555","0123456789","ahmad@gmail.com","No 12 Jalan Mawar 2, Taman Melati, 53100 KL","Freelance","Freelance","No 12 Jalan Mawar 2, Taman Melati, 53100 KL","Perubatan Tradisional Melayu (PTM)","Bekam","PTM-2024-0012","2026-12-31","","","",""\n';
      const sample2 = '"SITI AISHAH BINTI ISMAIL","900512105432","0198765432","aishah@gmail.com","Pusat Rawatan Holistik, 43000 Kajang","Premis","Pusat Rawatan Holistik Kajang","No 5 Jalan Reko, 43000 Kajang","Perubatan Tradisional Melayu (PTM)","Urut Melayu","PTM-2023-0988","2026-11-30","Homeopati","","HOM-2024-0045","2026-12-31"\n';
      const csvContent = '\uFEFF' + csvHeader + sample1 + sample2;
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="Templat_Pangkalan_Data_Pengamal_PPPB.csv"'
      });
      return res.end(csvContent);
    }

    // GET /api/practitioners/:id - Butiran Lengkap Pengamal (Profil & Sejarah APC)
    if (method === 'GET' && pathname.startsWith('/api/practitioners/') && !pathname.includes('/check/') && !pathname.includes('/template')) {
      const id = parseInt(pathname.split('/')[3]);
      if (isNaN(id)) return sendJSON(res, 400, { error: 'ID tidak sah' });
      const p = db.getPractitionerWithDetails(id);
      if (!p) return sendJSON(res, 404, { error: 'Pengamal tidak dijumpai' });
      return sendJSON(res, 200, { success: true, data: p });
    }

    // PUT /api/practitioners/:id - Kemaskini Profil Pengamal & APC oleh Admin
    if (method === 'PUT' && pathname.startsWith('/api/practitioners/')) {
      const id = parseInt(pathname.split('/')[3]);
      if (isNaN(id)) return sendJSON(res, 400, { error: 'ID tidak sah' });
      const body = await parseRequestBody(req);
      const updated = db.updatePractitionerProfile(id, body);
      return sendJSON(res, 200, {
        success: true,
        message: 'Maklumat pengamal berjaya dikemaskini!',
        data: updated
      });
    }

    // POST /api/practitioners - Tambah Data Pengamal Sahaja (Tab 2 Admin - Tanpa Permohonan)
    if (method === 'POST' && pathname === '/api/practitioners') {
      const body = await parseRequestBody(req);
      if (!body.full_name || !body.ic_no) {
        return sendJSON(res, 400, { success: false, error: 'Nama penuh dan No Kad Pengenalan adalah wajib.' });
      }
      try {
        const result = db.createPractitionerOnly(body);
        return sendJSON(res, 201, {
          success: true,
          message: 'Data pengamal berjaya disimpan ke pangkalan data!',
          data: result
        });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: err.message });
      }
    }

    // POST /api/practitioners/import - Import Berkelompok Pengamal Dari Excel / CSV (Tab 2)
    if (method === 'POST' && pathname === '/api/practitioners/import') {
      const body = await parseRequestBody(req);
      if (!body.records || !Array.isArray(body.records) || body.records.length === 0) {
        return sendJSON(res, 400, { success: false, error: 'Tiada rekod pengamal ditemui untuk diimport.' });
      }
      try {
        const importRes = db.importPractitionersBatch(body.records);
        return sendJSON(res, 200, {
          success: true,
          message: `${importRes.successCount} rekod pengamal berjaya disimpan ke pangkalan data!`,
          data: importRes
        });
      } catch (err) {
        return sendJSON(res, 500, { success: false, error: 'Ralat semasa memproses import: ' + err.message });
      }
    }


    // GET /api/reminders - Senarai Peringatan Tamat Tempoh APC & WhatsApp Link
    if (method === 'GET' && pathname === '/api/reminders') {
      const qDays = parsedUrl.query.days;
      const days = qDays ? (qDays === 'all' ? 'all' : parseInt(qDays)) : 30;
      const alerts = db.getExpiryAlerts(days);
      const settings = db.getSettings();

      const borangBaseUrl = `http://${req.headers.host || 'localhost:3000'}/borang.html`;

      // Sertakan pautan mesej WhatsApp tersuai
      const alertsWithWa = alerts.map(item => {
        let cleanPhone = String(item.phone).replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = '6' + cleanPhone;
        else if (!cleanPhone.startsWith('60')) cleanPhone = '60' + cleanPhone;

        const template = settings.reminder_template || 'Salam Tuan/Puan {NAMA}, peringatan APC {BIDANG} tamat pada {TARIKH_LUPUT}. Klik untuk renew: {PAUTAN_BORANG}';
        const msg = template
          .replace('{NAMA}', item.full_name)
          .replace('{BIDANG}', item.discipline)
          .replace('{TARIKH_LUPUT}', item.current_expiry_date || 'Hujung Tahun')
          .replace('{PAUTAN_BORANG}', `${borangBaseUrl}?ic=${item.ic_no}`);

        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

        return {
          ...item,
          whatsapp_url: waUrl,
          whatsapp_message: msg
        };
      });

      return sendJSON(res, 200, { success: true, count: alertsWithWa.length, data: alertsWithWa });
    }

    // GET & POST /api/settings - Tetapan Sistem
    if (pathname === '/api/settings') {
      if (method === 'GET') {
        const s = { ...db.getSettings() };
        // Sentiasa buang hash & salt kata laluan atas sebab keselamatan
        delete s.admin_password_hash;
        delete s.admin_password_salt;
        if (!isAuthenticated(req)) {
          delete s.admin_username;
        }
        return sendJSON(res, 200, { success: true, data: s });
      }
      if (method === 'POST') {
        if (!isAuthenticated(req)) {
          return sendJSON(res, 401, { success: false, error: 'Sesi anda telah tamat. Sila log masuk semula.' });
        }
        const body = await parseRequestBody(req);
        const updated = db.updateSettings(body);
        const s = { ...updated };
        delete s.admin_password_hash;
        delete s.admin_password_salt;
        return sendJSON(res, 200, { success: true, message: 'Tetapan berjaya disimpan', data: s });
      }
    }

    // POST /api/import/existing - Import Data Pengamal Sedia Ada Dari Fail Excel 2026
    if (method === 'POST' && pathname === '/api/import/existing') {
      try {
        const importer = require('./scripts/import_existing_excel.js');
        const count = importer.runImport();
        return sendJSON(res, 200, {
          success: true,
          message: `Berjaya mengimport ${count} rekod pengamal!`,
          count: count
        });
      } catch (err) {
        return sendJSON(res, 500, { success: false, error: err.message });
      }
    }

    // POST /api/upload - Muat Naik Fail Tunggal
    if (method === 'POST' && pathname === '/api/upload') {
      const body = await parseRequestBody(req);
      if (!body.data) return sendJSON(res, 400, { error: 'Tiada data fail' });

      const fileUrl = saveBase64File(body.data, body.prefix || 'file');
      return sendJSON(res, 200, { success: true, url: fileUrl });
    }

    // GET /api/export/csv - Eksport Batch atau Semua Permohonan ke CSV (Format MPTK)
    if (method === 'GET' && pathname === '/api/export/csv') {
      const filters = {
        year: parsedUrl.query.year,
        batch: parsedUrl.query.batch,
        status: parsedUrl.query.status
      };
      const apps = db.getAllApplications(filters);

      // Header Format MPTK: BIL, NAMA, NO KAD PENGENALAN, NO TEL, EMAIL, ALAMAT RUMAH, ALAMAT AMALAN, BAYARAN PPPB, BIDANG 1, NO DAFTAR 1, BIDANG 2, NO DAFTAR 2, STATUS BAYARAN
      let csv = 'BIL,NAMA,NO KAD PENGENALAN,NO TEL,EMAIL,ALAMAT RUMAH,TEMPAT AMALAN UTAMA,ALAMAT AMALAN,BAYARAN APC (RM),UPAH SERVIS (RM),JUMLAH (RM),STATUS BAYARAN,BIDANG APC,STATUS SUBMISSION,BATCH\n';

      apps.forEach((a, idx) => {
        const row = [
          idx + 1,
          `"${(a.full_name || '').replace(/"/g, '""')}"`,
          `"'${a.ic_no || ''}"`,
          `"'${a.phone || ''}"`,
          `"${(a.email || '').replace(/"/g, '""')}"`,
          `"${(a.home_address || '').replace(/"/g, '""')}"`,
          `"${(a.principal_practice_name || '').replace(/"/g, '""')}"`,
          `"${(a.principal_practice_address || '').replace(/"/g, '""')}"`,
          (a.apc_official_fee * a.total_apc_count).toFixed(2),
          a.service_fee.toFixed(2),
          a.total_fee.toFixed(2),
          `"${a.payment_status}"`,
          `"${(a.disciplines || '').replace(/"/g, '""')}"`,
          `"${a.status}"`,
          `"${a.submission_batch || ''}"`
        ];
        csv += row.join(',') + '\n';
      });

      const filename = `Submission_MPTK_${filters.batch || filters.year || 'Semua'}_${Date.now()}.csv`;
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      return res.end('\uFEFF' + csv); // \uFEFF BOM for Excel utf-8
    }

    // GET /api/applications/:id/docx - Jana & Muat Turun Fail Word .docx Asal KKM
    if (method === 'GET' && pathname.startsWith('/api/applications/') && pathname.endsWith('/docx')) {
      const parts = pathname.split('/');
      const id = parseInt(parts[3]);
      if (isNaN(id)) return sendJSON(res, 400, { error: 'ID tidak sah' });

      const app = db.getApplicationById(id);
      if (!app) return sendJSON(res, 404, { error: 'Permohonan tidak dijumpai' });

      const templatePath = path.join(__dirname, 'templates', 'Borang_Pembaharuan_PPPB_KKM.docx');
      if (!fs.existsSync(templatePath)) {
        return sendJSON(res, 500, { error: 'Templat fail Word KKM tidak dijumpai' });
      }

      const tempOutputFileName = `Borang_PPPB_${app.reference_no || id}_${Date.now()}.docx`;
      const outputPath = path.join(UPLOADS_DIR, tempOutputFileName);

      const isFreelance = (app.practice_type === 'Freelance') || (!app.principal_practice_name && !app.principal_practice_address);
      let tempatUtama = isFreelance
        ? `Freelance\r\n${app.home_address || app.principal_practice_address || ''}`
        : `${app.principal_practice_name || ''}\r\n${app.principal_practice_address || ''}`;

      let discList = (app.apc_items || []).map(i => i.discipline).join(', ') || app.disciplines || '';

      const now = new Date();
      const tarikhStr = `${String(now.getDate()).padStart(2, '0')} / ${String(now.getMonth() + 1).padStart(2, '0')} / ${now.getFullYear()}`;
      const officialFee = (app.apc_official_fee || 50) * (app.total_apc_count || 1);
      const bayaranStr = `RM${officialFee.toFixed(2)}`;

      const { execFile } = require('node:child_process');
      const psScript = path.join(__dirname, 'scripts', 'fill_word_form.ps1');

      const psArgs = [
        '-ExecutionPolicy', 'Bypass',
        '-File', psScript,
        '-TemplatePath', templatePath,
        '-OutputPath', outputPath,
        '-PemohonNama', app.full_name || '',
        '-IC', app.ic_no || '',
        '-Email', app.email || '',
        '-TelPejabat', app.office_phone || 'Tiada',
        '-TelBimbit', app.phone || '',
        '-BidangString', discList || 'PTM',
        '-TempatUtama', tempatUtama,
        '-TempatLainA', app.other_practice_1 || app.other_practice_places || 'Tiada',
        '-TempatLainB', app.other_practice_2 || 'Tiada',
        '-Tarikh', tarikhStr,
        '-Bayaran', bayaranStr

      ];

      execFile('powershell', psArgs, (error, stdout, stderr) => {
        if (error || !fs.existsSync(outputPath)) {
          console.error('Word export error:', error || stderr);
          return sendJSON(res, 500, { error: 'Gagal menjana dokumen Word', details: stderr || (error && error.message) });
        }

        const safeName = (app.full_name || 'Pengamal').replace(/[^a-zA-Z0-9_\-]/g, '_');
        const downloadName = `Borang_PPPB_KKM_${app.reference_no || id}_${safeName}.docx`;

        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${downloadName}"`
        });

        const readStream = fs.createReadStream(outputPath);
        readStream.pipe(res);
        readStream.on('close', () => {
          try { fs.unlinkSync(outputPath); } catch (e) {}
        });
      });
      return;
    }

    // ==========================================
    // 2. STATIC FILES & HTML PAGES
    // ==========================================

    // Routing mesra URL & Kawalan Akses
    let filePath;
    const authed = isAuthenticated(req);

    if (pathname === '/' || pathname === '/index.html' || pathname === '/admin') {
      if (!authed) {
        res.writeHead(302, { 'Location': '/login.html' });
        return res.end();
      }
      filePath = path.join(PUBLIC_DIR, 'index.html');
    } else if (pathname === '/login' || pathname === '/login.html') {
      if (authed) {
        res.writeHead(302, { 'Location': '/' });
        return res.end();
      }
      filePath = path.join(PUBLIC_DIR, 'login.html');
    } else if (pathname.startsWith('/cetak')) {
      if (!authed) {
        res.writeHead(302, { 'Location': '/login.html' });
        return res.end();
      }
      filePath = path.join(PUBLIC_DIR, 'cetak.html');
    } else if (pathname === '/borang' || pathname === '/borang.html') {
      filePath = path.join(PUBLIC_DIR, 'borang.html');
    } else if (pathname.startsWith('/uploads/')) {
      const filename = path.basename(pathname);
      filePath = path.join(UPLOADS_DIR, filename);
    } else {
      filePath = path.join(PUBLIC_DIR, pathname);
    }


    // Semak keselamatan path (cegah directory traversal)
    if (!filePath.startsWith(PUBLIC_DIR) && !filePath.startsWith(UPLOADS_DIR)) {
      res.writeHead(403);
      return res.end('Dilarang / Forbidden');
    }

    // Baca dan sajikan fail
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileStream = fs.createReadStream(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      fileStream.pipe(res);
      return;
    }

    // Jika fail tidak wujud
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Halaman atau fail tidak dijumpai (404)');

  } catch (err) {
    console.error('Server error:', err);
    sendJSON(res, 500, { error: 'Ralat dalaman pelayan', details: err.message });
  }
});

// Kendalikan jika port telah digunakan
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('====================================================');
    console.log(`Port ${PORT} telah digunakan (Pelayan sedia ada sedang berjalan).`);
    console.log(`Sistem boleh dibuka terus di: http://localhost:${PORT}`);
    console.log('====================================================');
  } else {
    console.error('Ralat pelayan:', err);
  }
});

// Mulakan pelayan
server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log('SISTEM PENGURUSAN PEMBAHARUAN APC (PPPB) - MPTK');
  console.log('AR RAHMAH WELLNESS');
  console.log('====================================================');
  console.log(`Pelayan beroperasi di: http://localhost:${PORT}`);
  console.log(`- Admin Dashboard    : http://localhost:${PORT}/`);
  console.log(`- Borang Online Awam : http://localhost:${PORT}/borang.html`);
  console.log('Tekan Ctrl+C untuk berhenti.');
  console.log('====================================================');
});
