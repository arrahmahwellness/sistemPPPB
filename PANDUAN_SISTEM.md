# PANDUAN PENGGUNAAN SISTEM PEMBAHARUAN APC (PPPB)
**AR RAHMAH WELLNESS — MAJLIS PERUBATAN TRADISIONAL DAN KOMPLEMENTARI (MPTK)**

---

## 🚀 Cara Memulakan Sistem

Anda mempunyai dua cara untuk menjalankan sistem ini mengikut kesesuaian:

### Pilihan 1: Mod Online Internet (Disyorkan untuk pengamal isi dari mana-mana)
1. Dwi-klik pada fail **`Mula_Sistem_Online.bat`**.
2. Tetingkap Cloudflare akan dibuka dan memaparkan pautan internet selamat bertaraf HTTPS (contoh: `https://xxxx-xxxx.trycloudflare.com`).
3. Berikan pautan tersebut berserta `/borang.html` kepada rakan pengamal untuk diisi melalui telefon/komputer mereka.
4. Anda sebagai Admin boleh membuka pautan tersebut untuk ke Dashboard dengan memasukkan kata laluan.

### Pilihan 2: Mod Tempatan Sahaja (Offline / Di Komputer Ini Sahaja)
1. Dwi-klik pada fail **`Mula_Sistem.bat`**.
2. Sistem akan memulakan pelayan di komputer anda dan membuka:
   - **Papan Pemuka Pentadbir (Admin):** [http://localhost:3000](http://localhost:3000)
   - **Borang Pengamal (Tempatan):** [http://localhost:3000/borang.html](http://localhost:3000/borang.html)

### 🔐 Maklumat Log Masuk Pentadbir (Admin):
* **Nama Pengguna (Username):** `admin`
* **Kata Laluan Asal (Password):** `admin123`
* *(Kata laluan ini boleh ditukar pada bila-bila masa melalui tab **🔐 Keselamatan & Kata Laluan**)*.
* Rakan pengamal **tidak memerlukan kata laluan** untuk mengisi borang di `borang.html`.


---

## 📱 Cara Menjadikan Sistem Ini Sebagai Apps Dalam Telefon (PWA)

Sistem ini dibina dengan sokongan teknologi **Progressive Web App (PWA)**:
1. Buka pautan sistem di pelayar telefon (Chrome untuk Android, Safari untuk iPhone).
2. Tekan menu pilihan pelayar (tiga titik di Android atau ikon kongsi di iPhone).
3. Pilih **"Add to Home Screen"** atau **"Tambah ke Skrin Utama"**.
4. Ikon aplikasi **Sistem APC Ar Rahmah Wellness** akan muncul di skrin telefon anda seperti aplikasi Play Store / App Store!

---

## 📋 Aliran Pengurusan Pembaharuan APC

### 1. Rakan Pengamal Mengisi Borang Online
* Rakan pengamal membuka pautan [borang.html](http://localhost:3000/borang.html) di telefon mereka.
* **Pengamal Kali Pertama:** Memasukkan maklumat peribadi, tempat mengamal, dan memilih 1 hingga 4 bidang APC yang ingin diperbaharui.
* **Pengamal Lama (Tahun Depan):** Hanya perlu masukkan No. IC mereka, dan sistem secara automatik akan mengeluarkan maklumat terdahulu mereka! Pengamal tidak perlu menaip semula daripada kosong.
* **Tandatangan Digital:** Pengamal menandatangani borang terus di atas skrin telefon mereka menggunakan jari.
* **Pilihan Bayaran Interaktif:** Pengamal boleh memilih antara:
  - 📱 **Kod QR Pay (Sehingga 3 Kod QR):** CIMB DuitNow, Touch 'n Go eWallet, BigPay / pilihan lain beserta butang *"Simpan / Muat Turun Kod QR"* untuk imbas dari galeri perbankan telefon mereka.
  - 🏦 **Pindahan No. Akaun Bank (CIMB):** Salin nombor akaun dengan satu klik.
  - 🏧 **CDM, Tunai, atau Bayar Kemudian.**
* **Bayaran:** Sistem auto-mengira yuran rasmi KKM + upah anda secara automatik mengikut bilangan APC.

### 2. Jika Pengamal Belum Membuat Bayaran
* Pengamal **tetap boleh menghantar borang** walaupun belum memuat naik resit.
* Permohonan mereka akan disimpan dengan status **"Belum Bayar"**.
* Di papan pemuka anda, rekod ini ditandakan kuning/oren.
* Anda boleh klik butang **💬 WhatsApp** di sebelah nama mereka untuk menghantar peringatan pembayaran secara automatik.
* Apabila bayaran diterima, anda hanya perlu klik **✏️ Ubah** dan tukar status kepada **"Telah Bayar"**.

### 3. Cetakan Borang Standard KKM (1-Klik)
* Di papan pemuka, klik butang **🖨️ Cetak** di baris nama pengamal.
* Sistem akan membuka paparan rasmi **Borang Maklumat Pemohon** dan **Borang J (Subperaturan 6(3) Akta 775)** berformat standard A4.
* Semua maklumat pengamal dan tandatangan digital mereka telah siap diletakkan di tempat yang tepat.
* Tekan butang **"Cetak Borang (Ctrl+P)"** untuk mencetak terus atau simpan sebagai PDF bagi penghantaran kepada KKM.

### 4. Peringatan Tarikh Luput APC (Renewal Alerts)
* Klik tab **⏰ Peringatan Tamat Tempoh APC**.
* Sistem akan memaparkan senarai pengamal yang perakuan APC mereka telah atau bakal tamat tempoh dalam masa 30, 60, atau 90 hari.
* Klik butang **💬 Hantar WhatsApp** untuk menghantar teks peringatan yang siap dipautkan dengan link borang pembaharuan untuk mereka.

### 5. Import Data Sedia Ada (56+ Pengamal)
* Sekiranya anda ingin memasukkan rekod 56 orang pengamal sedia ada ke dalam pangkalan data:
  1. Pergi ke tab **⚙️ Tetapan & Import Data**.
  2. Klik butang **"Jalankan Import Data Sedia Ada Sekarang"**.
  3. Semua maklumat pengamal lalu akan terus dimasukkan ke pangkalan data SQLite, membolehkan fungsi auto-fill berfungsi serta-merta untuk mereka.

---

## 🔒 Keselamatan & Sandaran Data (Backup)
Semua data disimpan di dalam fail pangkalan data tunggal **`data_pppb.sqlite`** di dalam folder sistem ini. Kerana folder ini terletak di dalam Google Drive anda, data anda disandarkan (backup) secara automatik ke awan setiap masa!
