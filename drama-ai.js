/* Movira AI - Drama AI workspace.
 * Scene planning, model selection and reference selection are local/project features.
 * Video generation uses the authenticated batch endpoint and remains guarded by backend deployment flags.
 */
(() => {
  "use strict";
  const STYLE = `
    #dramaPage { color:#eaf1ff; background:#091629; border:1px solid #243a59; border-radius:16px; padding:clamp(12px,3vw,22px); }
    #dramaPage .drama-card { background:#101f35; border:1px solid #2b405d; border-radius:12px; padding:14px; margin-top:12px; }
    #dramaPage .drama-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
    #dramaPage button, #dramaPage select, #dramaPage input, #dramaPage textarea { font:inherit; }
    #dramaPage button { cursor:pointer; border-radius:9px; padding:10px 12px; color:#fff; background:#172b49; border:1px solid #405a7f; }
    #dramaPage button.primary { background:linear-gradient(90deg,#1987ff,#6d45ff); border:0; font-weight:700; }
    #dramaPage button:disabled { cursor:not-allowed; opacity:.55; }
    #dramaPage input, #dramaPage select, #dramaPage textarea { box-sizing:border-box; width:100%; border:1px solid #405a7f; border-radius:8px; background:#081426; color:#f3f6ff; padding:10px; }
    #dramaPage label { display:block; color:#c9d7ef; font-size:13px; margin:10px 0 5px; }
    #dramaPage .drama-muted { color:#9fb1c9; font-size:12px; line-height:1.5; }
    #dramaPage .drama-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }
    #dramaPage .drama-scene-tabs { display:flex; gap:7px; flex-wrap:wrap; }
    #dramaPage .drama-scene-tabs button[aria-pressed="true"] { background:#214b8a; border-color:#79aaff; }
    #dramaPage .drama-status { min-height:20px; margin-top:10px; color:#b8d2ff; font-size:13px; white-space:pre-wrap; }
    #dramaPage .drama-generate-menu { display:flex; flex-wrap:wrap; gap:8px; margin-top:9px; padding:10px; border:1px solid #405a7f; border-radius:10px; background:#0a1729; }
    #dramaPage .drama-generate-menu[hidden] { display:none!important; }
    #dramaPage .drama-results { display:grid; gap:7px; margin-top:10px; }
    #dramaPage .drama-result-link { color:#9ec5ff; overflow-wrap:anywhere; }

    #dramaPage .drama-warning { border-color:#7a5a22; background:#241e12; color:#ffe4a3; }
    #dramaPage .drama-reference-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; margin-top:10px; }
    #dramaPage .drama-reference-box { min-width:0; border:1px dashed #405a7f; border-radius:10px; padding:10px; background:#0a1729; }
    #dramaPage .drama-reference-preview { display:flex; flex-direction:column; align-items:flex-start; gap:8px; margin-top:8px; }
    #dramaPage .drama-reference-preview img { display:block; width:100%; max-height:190px; object-fit:contain; border:1px solid #405a7f; border-radius:8px; background:#07111f; }
    #dramaPage .drama-reference-preview[hidden] { display:none!important; }
    #dramaPage .drama-reference-empty { color:#9fb1c9; font-size:12px; line-height:1.5; margin-top:8px; }
    #dramaPage .drama-scene-selected-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(105px,1fr)); gap:8px; margin-top:8px; }
    #dramaPage .drama-scene-selected-card { min-width:0; border:1px solid #405a7f; border-radius:8px; padding:7px; background:#081426; }
    #dramaPage .drama-scene-selected-card img { width:100%; height:92px; object-fit:cover; border-radius:6px; display:block; }
    #dramaPage .drama-scene-selected-card div { overflow-wrap:anywhere; margin-top:5px; }
    @media(max-width:520px){ #dramaPage .drama-actions button { flex:1 1 auto; } }
  `;
  const DEFAULT_DRAMA_MODEL = "bytedance/seedance-2.5/flash/reference-to-video";
  const DRAMA_MODELS = Object.freeze({
    "bytedance/seedance-2.5/flash/reference-to-video": {
      label: "Seedance 2.5 Flash · Reference-to-Video",
      resolutions: ["480p", "720p"], defaultResolution: "480p", maxImages: 10,
      durationMin: 4, durationMax: 30, durations: [10, 15, 30], pricing: "seedance"
    },
    "alibaba/wan-3.0/reference-to-video": {
      label: "Wan 3.0 · Reference-to-Video",
      resolutions: ["480p", "720p", "1080p"], defaultResolution: "480p", maxImages: 10,
      durationMin: 2, durationMax: 30, durations: [10, 15, 30], pricing: { "480p": 0.05, "720p": 0.10, "1080p": 0.20 }
    },
    "alibaba/wan-3.0-prime/reference-to-video": {
      label: "Wan 3.0 Prime · Reference-to-Video",
      resolutions: ["480p", "720p", "1080p"], defaultResolution: "480p", maxImages: 10,
      durationMin: 2, durationMax: 30, durations: [10, 15, 30], pricing: { "480p": 0.068, "720p": 0.14, "1080p": 0.28 }
    },
    "google/gemini-omni-flash/v1.1/reference-to-video": {
      label: "Gemini Omni Flash 1.1 · Reference-to-Video",
      resolutions: ["360p", "720p", "1080p"], defaultResolution: "360p", maxImages: 10,
      durationMin: 10, durationMax: 10, durations: [10], pricing: { "360p": 0.03, "720p": 0.10, "1080p": 0.15 },
      imageLimitNote: "Batas 10 gambar adalah batas aplikasi Drama AI; skema Gemini 1.1 yang diperiksa tidak mencantumkan batas maksimum gambar."
    }
  });

  let page, statusEl, currentProjectId = null, activeIndex = 0, saveTimer = null;
  let state = freshState();
  let loadedDramaProjects = [];

  const DRAMA_COPY = {
    en: {
      "MOVIRA AI · KHUSUS CERITA BERSERI": "MOVIRA AI · SERIAL STORY WORKSPACE",
      "Masukkan cerita dari tool pilihanmu, susun menjadi scene, lalu pilih referensi karakter dan lokasi untuk setiap scene.": "Paste a story from your preferred tool, split it into scenes, then choose character and location references for each scene.",
      "📁 Proyek Drama Tersimpan": "📁 Saved Drama Projects",
      "📖 Masukkan Prompt Cerita": "📖 Import a Story Prompt",
      "Tempel cerita yang sudah dibuat di ChatGPT, Gemini, atau tool lain. Movira tidak memanggil API AI.": "Paste a story created in ChatGPT, Gemini, or another tool. Movira does not call an AI writing API.",
      "✍️ Buat Storyboard Manual": "✍️ Create a Manual Storyboard",
      "Mulai dari editor kosong dan tulis prompt setiap scene sendiri.": "Start with a blank editor and write each scene prompt yourself.",
      "Catatan": "Note",
      "Pembuatan cerita dilakukan di luar Movira. Menempel cerita dan menyimpan proyek tidak memakai API berbayar. Setelah proyek tersimpan, kamu dapat membuat video untuk semua Scene atau Scene aktif.": "Story writing happens outside Movira. Pasting a story and saving a project do not use paid APIs. Once saved, you can generate all scenes or only the active scene.",
      "Proyek Drama": "Drama Projects",
      "Tekan “Proyek Drama Tersimpan” untuk memuat proyek milik akunmu.": "Choose “Saved Drama Projects” to load projects from your account.",
      "← Kembali": "← Back",
      "Buat cerita di tool pilihanmu, lalu salin dan tempel seluruh cerita di bawah. Movira akan membantu membaginya menjadi scene untuk diedit.": "Write a story in your preferred tool, then paste it below. Movira will split it into editable scenes.",
      "Nama drama": "Drama title",
      "Nama drama / proyek": "Drama / project title",
      "Genre": "Genre",
      "Petualangan": "Adventure", "Komedi": "Comedy", "Fantasi": "Fantasy", "Persahabatan": "Friendship", "Misteri": "Mystery", "Drama keluarga": "Family drama", "Aksi": "Action",
      "Sinopsis / ringkasan cerita (opsional)": "Synopsis / story summary (optional)",
      "Sinopsis / premis": "Synopsis / premise",
      "Ringkasan singkat cerita…": "A short story summary…",
      "Panduan konsistensi karakter dan dunia (opsional)": "Character and world consistency guide (optional)",
      "Deskripsi karakter, pakaian, lokasi, dan gaya visual.": "Describe characters, clothing, locations, and visual style.",
      "Referensi konsistensi karakter dan dunia": "Character and world consistency references",
      "Karakter, pakaian, lokasi, gaya visual. Kolom ini terpisah dan tidak mengubah prompt adegan.": "Characters, clothing, locations, and visual style. This field is separate and does not change scene prompts.",
      "Tempel seluruh cerita atau prompt di sini": "Paste the full story or prompt here",
      "Tempel cerita lengkap di sini. Jika ada judul Scene 1, Scene 2, dan seterusnya, Movira akan menggunakannya sebagai pemisah. Jika tidak, paragraf akan dijadikan scene.": "Paste the complete story here. If it contains Scene 1, Scene 2, and similar headings, Movira will use them as separators. Otherwise, paragraphs become scenes.",
      "Bagi Cerita Menjadi Scene": "Split Story into Scenes",
      "Buka Editor Kosong": "Open Blank Editor",
      "Setelah masuk editor, periksa dan edit prompt tiap scene. Kamu tetap bisa menambah atau menghapus scene.": "In the editor, review and edit each scene prompt. You can still add or remove scenes.",
      "DRAMA WORKSPACE": "DRAMA WORKSPACE",
      "Editor Adegan": "Scene Editor",
      "← Beranda Drama AI": "← Drama AI Home",
      "Ringkasan cerita": "Story summary",
      "Karakter, pakaian, lokasi, gaya visual. Kolom ini terpisah dan tidak mengubah prompt adegan.": "Characters, clothing, locations, and visual style. This field is separate from scene prompts.",
      "🖼️ Gambar Referensi": "🖼️ Reference Images",
      "Pustaka gambar proyek. Gambar di sini dapat dipakai ulang, tetapi pilihan karakter dan lokasi disimpan secara terpisah untuk setiap scene.": "Project image library. Images can be reused, while character and location selections are saved separately for each scene.",
      "Gambar karakter": "Character images",
      "＋ Upload Gambar Karakter": "＋ Upload Character Images",
      "Belum ada gambar karakter.": "No character images yet.",
      "Gambar lokasi": "Location images",
      "＋ Upload Gambar Lokasi": "＋ Upload Location Images",
      "Belum ada gambar lokasi.": "No location images yet.",
      "Daftar adegan": "Scene List",
      "＋ Tambah Scene": "＋ Add Scene",
      "Hapus Scene Aktif": "Delete Active Scene",
      "Prompt scene (tetap bisa kamu edit)": "Scene prompt (you can still edit it)",
      "Tulis prompt video untuk scene ini…": "Write the video prompt for this scene…",
      "Model video untuk Scene ini": "Video model for this scene",
      "Informasi Model dan Referensi": "Model and Reference Information",
      "Karakter untuk scene ini": "Characters for this scene",
      "Centang gambar dari pustaka, atau unggah gambar khusus untuk scene aktif. Pilihan scene lain tidak ikut berubah.": "Select images from the library or upload images for the active scene. Other scenes will not be changed.",
      "＋ Upload khusus scene ini": "＋ Upload for this scene only",
      "Gambar terpilih di Scene ini:": "Images selected for this scene:",
      "Lokasi untuk scene ini": "Locations for this scene",
      "Durasi": "Duration",
      "10 detik": "10 seconds", "15 detik": "15 seconds", "30 detik": "30 seconds",
      "Rasio": "Aspect ratio",
      "Resolusi": "Resolution",
      "Simpan ke Projects": "Save to Projects",
      "Simpan sebagai Proyek Baru": "Save as New Project",
      "🎬 Buat Video": "🎬 Generate Video",
      "Generate Semua Scene": "Generate All Scenes",
      "Generate Scene Aktif": "Generate Active Scene",
      "Pilih semua Scene atau hanya Scene aktif. Estimasi kredit ditampilkan sebelum konfirmasi.": "Choose all scenes or only the active scene. The credit estimate is shown before confirmation.",
      "Periksa Status Generate Terakhir": "Check Last Generation Status",
      "Proyek Drama tersimpan": "Saved Drama Projects",
      "Memuat daftar proyek…": "Loading projects…",
      "Tekan ‘Simpan ke Projects’ agar tersimpan permanen.": "Choose ‘Save to Projects’ to save permanently.",
      "Hapus Gambar": "Remove Image",
      "Belum ada gambar yang dipilih untuk scene ini.": "No images selected for this scene yet.",
      "Belum ada gambar karakter. Unggah gambar proyek atau gambar khusus scene ini.": "No character images yet. Upload project images or images for this scene.",
      "Belum ada gambar lokasi. Unggah gambar proyek atau gambar khusus scene ini.": "No location images yet. Upload project images or images for this scene.",
      "Buka Proyek": "Open Project",
      "Belum ada proyek Drama tersimpan.": "No saved Drama projects yet.",
      "Gagal memuat proyek Drama.": "Failed to load Drama projects.",
      "tanggal tidak tersedia": "date unavailable",
      "Tekan minimal satu gambar karakter atau lokasi untuk Scene ini sebelum generasi nanti diaktifkan.": "Select at least one character or location image for this scene before generation is enabled.",
      "Video/audio referensi belum disediakan di editor Drama AI.": "Reference video/audio is not available in the Drama AI editor.",
      "Batas endpoint yang didokumentasikan: maksimal 10 gambar referensi.": "Documented endpoint limit: up to 10 reference images.",
      "Estimasi biaya output: sekitar": "Estimated output cost: about",
      "Kredit untuk": "Credits for",
      "Total semua scene (pembulatan sekali):": "Total for all scenes (rounded once):",
    },
    ms: {
      "MOVIRA AI · KHUSUS CERITA BERSERI": "MOVIRA AI · RUANG KERJA CERITA BERSIRI",
      "Masukkan cerita dari tool pilihanmu, susun menjadi scene, lalu pilih referensi karakter dan lokasi untuk setiap scene.": "Masukkan cerita daripada alat pilihan anda, bahagikan kepada scene, kemudian pilih rujukan watak dan lokasi bagi setiap scene.",
      "📁 Proyek Drama Tersimpan": "📁 Projek Drama Tersimpan",
      "📖 Masukkan Prompt Cerita": "📖 Masukkan Prompt Cerita",
      "Tempel cerita yang sudah dibuat di ChatGPT, Gemini, atau tool lain. Movira tidak memanggil API AI.": "Tampal cerita yang dibuat di ChatGPT, Gemini atau alat lain. Movira tidak memanggil API penulisan AI.",
      "✍️ Buat Storyboard Manual": "✍️ Cipta Papan Cerita Manual",
      "Mulai dari editor kosong dan tulis prompt setiap scene sendiri.": "Mulakan dengan editor kosong dan tulis prompt setiap scene sendiri.",
      "Catatan": "Nota",
      "Pembuatan cerita dilakukan di luar Movira. Menempel cerita dan menyimpan proyek tidak memakai API berbayar. Setelah proyek tersimpan, kamu dapat membuat video untuk semua Scene atau Scene aktif.": "Penulisan cerita dilakukan di luar Movira. Menampal cerita dan menyimpan projek tidak menggunakan API berbayar. Selepas disimpan, anda boleh menjana semua scene atau scene aktif sahaja.",
      "Proyek Drama": "Projek Drama",
      "Tekan “Proyek Drama Tersimpan” untuk memuat proyek milik akunmu.": "Tekan “Projek Drama Tersimpan” untuk memuatkan projek akaun anda.",
      "← Kembali": "← Kembali",
      "Buat cerita di tool pilihanmu, lalu salin dan tempel seluruh cerita di bawah. Movira akan membantu membaginya menjadi scene untuk diedit.": "Cipta cerita dalam alat pilihan anda, kemudian salin dan tampal keseluruhan cerita di bawah. Movira akan membahagikannya kepada scene untuk diedit.",
      "Nama drama": "Nama drama",
      "Nama drama / proyek": "Nama drama / projek",
      "Genre": "Genre",
      "Petualangan": "Pengembaraan", "Komedi": "Komedi", "Fantasi": "Fantasi", "Persahabatan": "Persahabatan", "Misteri": "Misteri", "Drama keluarga": "Drama keluarga", "Aksi": "Aksi",
      "Sinopsis / ringkasan cerita (opsional)": "Sinopsis / ringkasan cerita (pilihan)",
      "Sinopsis / premis": "Sinopsis / premis",
      "Ringkasan singkat cerita…": "Ringkasan pendek cerita…",
      "Panduan konsistensi karakter dan dunia (opsional)": "Panduan konsistensi watak dan dunia (pilihan)",
      "Deskripsi karakter, pakaian, lokasi, dan gaya visual.": "Huraikan watak, pakaian, lokasi dan gaya visual.",
      "Referensi konsistensi karakter dan dunia": "Rujukan konsistensi watak dan dunia",
      "Karakter, pakaian, lokasi, gaya visual. Kolom ini terpisah dan tidak mengubah prompt adegan.": "Watak, pakaian, lokasi dan gaya visual. Ruangan ini berasingan dan tidak mengubah prompt scene.",
      "Tempel seluruh cerita atau prompt di sini": "Tampal keseluruhan cerita atau prompt di sini",
      "Tempel cerita lengkap di sini. Jika ada judul Scene 1, Scene 2, dan seterusnya, Movira akan menggunakannya sebagai pemisah. Jika tidak, paragraf akan dijadikan scene.": "Tampal cerita lengkap di sini. Jika terdapat tajuk Scene 1, Scene 2 dan seterusnya, Movira akan menggunakannya sebagai pemisah. Jika tiada, perenggan akan dijadikan scene.",
      "Bagi Cerita Menjadi Scene": "Bahagikan Cerita kepada Scene",
      "Buka Editor Kosong": "Buka Editor Kosong",
      "Setelah masuk editor, periksa dan edit prompt tiap scene. Kamu tetap bisa menambah atau menghapus scene.": "Selepas masuk ke editor, semak dan edit prompt setiap scene. Anda masih boleh menambah atau memadam scene.",
      "DRAMA WORKSPACE": "RUANG KERJA DRAMA",
      "Editor Adegan": "Editor Scene",
      "← Beranda Drama AI": "← Laman Utama Drama AI",
      "Ringkasan cerita": "Ringkasan cerita",
      "🖼️ Gambar Referensi": "🖼️ Imej Rujukan",
      "Pustaka gambar proyek. Gambar di sini dapat dipakai ulang, tetapi pilihan karakter dan lokasi disimpan secara terpisah untuk setiap scene.": "Pustaka imej projek. Imej boleh digunakan semula, tetapi pilihan watak dan lokasi disimpan secara berasingan bagi setiap scene.",
      "Gambar karakter": "Imej watak",
      "＋ Upload Gambar Karakter": "＋ Muat Naik Imej Watak",
      "Belum ada gambar karakter.": "Belum ada imej watak.",
      "Gambar lokasi": "Imej lokasi",
      "＋ Upload Gambar Lokasi": "＋ Muat Naik Imej Lokasi",
      "Belum ada gambar lokasi.": "Belum ada imej lokasi.",
      "Daftar adegan": "Senarai scene",
      "＋ Tambah Scene": "＋ Tambah Scene",
      "Hapus Scene Aktif": "Padam Scene Aktif",
      "Prompt scene (tetap bisa kamu edit)": "Prompt scene (masih boleh diedit)",
      "Tulis prompt video untuk scene ini…": "Tulis prompt video untuk scene ini…",
      "Model video untuk Scene ini": "Model video untuk scene ini",
      "Informasi Model dan Referensi": "Maklumat Model dan Rujukan",
      "Karakter untuk scene ini": "Watak untuk scene ini",
      "Centang gambar dari pustaka, atau unggah gambar khusus untuk scene aktif. Pilihan scene lain tidak ikut berubah.": "Tandakan imej daripada pustaka atau muat naik imej khas untuk scene aktif. Pilihan scene lain tidak berubah.",
      "＋ Upload khusus scene ini": "＋ Muat Naik untuk scene ini sahaja",
      "Gambar terpilih di Scene ini:": "Imej yang dipilih untuk scene ini:",
      "Lokasi untuk scene ini": "Lokasi untuk scene ini",
      "Durasi": "Tempoh",
      "10 detik": "10 saat", "15 detik": "15 saat", "30 detik": "30 saat",
      "Rasio": "Nisbah aspek",
      "Resolusi": "Resolusi",
      "Simpan ke Projects": "Simpan ke Projects",
      "Simpan sebagai Proyek Baru": "Simpan sebagai Projek Baharu",
      "Dinonaktifkan sampai endpoint dan biaya kredit disetujui": "Dinyahaktifkan sehingga endpoint dan kos kredit diluluskan",
      "Proyek Drama tersimpan": "Projek Drama tersimpan",
      "Memuat daftar proyek…": "Memuatkan senarai projek…",
      "Tekan ‘Simpan ke Projects’ agar tersimpan permanen.": "Tekan ‘Simpan ke Projects’ untuk menyimpan secara kekal.",
      "Hapus Gambar": "Padam Imej",
      "Belum ada gambar yang dipilih untuk scene ini.": "Belum ada imej dipilih untuk scene ini.",
      "Belum ada gambar karakter. Unggah gambar proyek atau gambar khusus scene ini.": "Belum ada imej watak. Muat naik imej projek atau imej khas untuk scene ini.",
      "Belum ada gambar lokasi. Unggah gambar proyek atau gambar khusus scene ini.": "Belum ada imej lokasi. Muat naik imej projek atau imej khas untuk scene ini.",
      "Buka Proyek": "Buka Projek",
      "Belum ada proyek Drama tersimpan.": "Belum ada projek Drama tersimpan.",
      "Gagal memuat proyek Drama.": "Gagal memuatkan projek Drama.",
      "tanggal tidak tersedia": "tarikh tidak tersedia",
      "Tekan minimal satu gambar karakter atau lokasi untuk Scene ini sebelum generasi nanti diaktifkan.": "Pilih sekurang-kurangnya satu imej watak atau lokasi untuk scene ini sebelum penjanaan diaktifkan.",
      "Video/audio referensi belum disediakan di editor Drama AI.": "Video/audio rujukan belum disediakan dalam editor Drama AI.",
      "Batas endpoint yang didokumentasikan: maksimal 10 gambar referensi.": "Had endpoint yang didokumenkan: maksimum 10 imej rujukan.",
      "Estimasi biaya output: sekitar": "Anggaran kos output: sekitar",
      "Kredit untuk": "Kredit untuk",
      "Total semua scene (pembulatan sekali):": "Jumlah semua scene (dibundarkan sekali):",
    }
  };

  function dramaLanguage() {
    return ["en", "id", "ms"].includes(window.moviraLang) ? window.moviraLang : "en";
  }
  function dramaText(source) {
    if (dramaLanguage() === "id") return source;
    return DRAMA_COPY[dramaLanguage()]?.[source] || source;
  }
  function applyDramaLanguage() {
    if (!page) return;
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const original = node.nodeValue || "";
      const trimmed = original.trim();
      if (!trimmed) return;
      const translated = dramaText(trimmed);
      if (translated !== trimmed) {
        const leading = original.match(/^\s*/)?.[0] || "";
        const trailing = original.match(/\s*$/)?.[0] || "";
        node.nodeValue = leading + translated + trailing;
      }
    });
    page.querySelectorAll("[placeholder], [title]").forEach(el => {
      for (const attr of ["placeholder", "title"]) {
        const value = el.getAttribute(attr);
        if (value) el.setAttribute(attr, dramaText(value));
      }
    });
  }
  function localizeDramaMessage(message) {
    const text = String(message || "");
    const lang = dramaLanguage();
    if (lang === "id") return text;
    const fixed = dramaText(text);
    if (fixed !== text) return fixed;
    let m;
    if ((m = text.match(/^(\d+) scene dimasukkan dari cerita\. Periksa dan edit setiap scene sebelum menyimpan\.$/))) return lang === "en" ? `${m[1]} scenes were imported. Review and edit each scene before saving.` : `${m[1]} scene diimport daripada cerita. Semak dan edit setiap scene sebelum menyimpan.`;
    if ((m = text.match(/^Model Scene (\d+) diubah\. Pilihan gambar referensi tidak dihapus\.$/))) return lang === "en" ? `Model for Scene ${m[1]} changed. Reference image selections were kept.` : `Model untuk Scene ${m[1]} ditukar. Pilihan imej rujukan dikekalkan.`;
    if ((m = text.match(/^Scene (\d+) dari (\d+)$/))) return lang === "en" ? `Scene ${m[1]} of ${m[2]}` : `Scene ${m[1]} daripada ${m[2]}`;
    if ((m = text.match(/^Proyek Drama tersimpan: (.+)\.$/))) return lang === "en" ? `Drama project saved: ${m[1]}.` : `Projek Drama disimpan: ${m[1]}.`;
    if ((m = text.match(/^Proyek dibuka: (.+)\.$/))) return lang === "en" ? `Project opened: ${m[1]}.` : `Projek dibuka: ${m[1]}.`;
    if ((m = text.match(/^Gagal menyimpan proyek: (.+)$/))) return lang === "en" ? `Failed to save project: ${m[1]}` : `Gagal menyimpan projek: ${m[1]}`;
    if ((m = text.match(/^Memproses (\d+) gambar khusus untuk Scene (\d+)\.\.\.$/))) return lang === "en" ? `Processing ${m[1]} scene-specific images for Scene ${m[2]}...` : `Memproses ${m[1]} imej khas untuk Scene ${m[2]}...`;
    if ((m = text.match(/^Gambar ditambahkan dan dipilih khusus untuk Scene (\d+)\. Scene lain tidak diubah; perubahan akan disimpan otomatis\.$/))) return lang === "en" ? `Images added and selected for Scene ${m[1]} only. Other scenes were not changed; updates will autosave.` : `Imej ditambah dan dipilih untuk Scene ${m[1]} sahaja. Scene lain tidak berubah; perubahan akan disimpan secara automatik.`;
    if ((m = text.match(/^Gambar ditambahkan dan dipilih khusus untuk Scene (\d+)\. Tekan ‘Simpan ke Projects’ agar tersimpan permanen\.$/))) return lang === "en" ? `Images added and selected for Scene ${m[1]} only. Choose ‘Save to Projects’ to keep them permanently.` : `Imej ditambah dan dipilih untuk Scene ${m[1]} sahaja. Tekan ‘Simpan ke Projects’ untuk menyimpannya secara kekal.`;
    const common = {
      "Scene ditambahkan.": ["Scene added.", "Scene ditambah."],
      "Proyek Drama tersimpan.": ["Drama project saved.", "Projek Drama disimpan."],
      "Tempel cerita terlebih dahulu.": ["Paste a story first.", "Tampal cerita terlebih dahulu."],
      "Scene ditambahkan.": ["Scene added.", "Scene ditambah."],
      "Drama harus memiliki minimal satu scene.": ["A drama must have at least one scene.", "Drama mesti mempunyai sekurang-kurangnya satu scene."],
      "Scene dihapus dari draf. Simpan proyek untuk menerapkan perubahan.": ["Scene removed from the draft. Save the project to apply the change.", "Scene dipadam daripada draf. Simpan projek untuk menerapkan perubahan."],
      "Perubahan Drama tersimpan otomatis.": ["Drama changes saved automatically.", "Perubahan Drama disimpan secara automatik."],
      "Gambar referensi ditambahkan. Perubahan akan disimpan otomatis.": ["Reference images added. Changes will be saved automatically.", "Imej rujukan ditambah. Perubahan akan disimpan secara automatik."],
      "Gambar referensi ditambahkan ke draf. Tekan ‘Simpan ke Projects’ agar tersimpan permanen.": ["Reference images added to the draft. Choose ‘Save to Projects’ to save permanently.", "Imej rujukan ditambah ke draf. Tekan ‘Simpan ke Projects’ untuk menyimpannya secara kekal."],
      "Gambar referensi dihapus; perubahan akan disimpan otomatis.": ["Reference image removed; changes will autosave.", "Imej rujukan dipadam; perubahan akan disimpan secara automatik."],
      "Gambar referensi dihapus dari draf.": ["Reference image removed from the draft.", "Imej rujukan dipadam daripada draf."],
      "Proyek tidak ditemukan atau bukan milik akun ini.": ["Project not found or does not belong to this account.", "Projek tidak ditemui atau bukan milik akaun ini."],
      "Proyek ini bukan proyek Drama AI.": ["This is not a Drama AI project.", "Ini bukan projek Drama AI."],
      "Klien Supabase belum tersedia. Muat ulang halaman, lalu coba lagi.": ["Supabase client is not available. Reload the page and try again.", "Klien Supabase belum tersedia. Muat semula halaman dan cuba lagi."],
      "Silakan login terlebih dahulu untuk menyimpan proyek Drama.": ["Please log in to save a Drama project.", "Sila log masuk untuk menyimpan projek Drama."]
    };
    return common[text]?.[lang === "en" ? 0 : 1] || text;
  }

  function modelConfig(modelId) {
    return DRAMA_MODELS[modelId] || DRAMA_MODELS[DEFAULT_DRAMA_MODEL];
  }
  function countSelectedReferences(scene = getActiveScene()) {
    ensureReferenceState();
    const characterIds = new Set(scene.characterReferenceIds || []);
    const locationIds = new Set(scene.locationReferenceIds || []);
    return state.references.character.filter(ref => characterIds.has(ref.id)).length +
      state.references.location.filter(ref => locationIds.has(ref.id)).length;
  }
  function estimateSceneCostUsd(modelId, resolution, duration) {
    const config = modelConfig(modelId);
    let usd;
    if (config.pricing === "seedance") {
      // Both supported aspect ratios use the same output pixel count for a given resolution.
      // Seedance 2.5 Flash endpoint price: USD 0.014 per 1,000 output tokens.
      const pixels = resolution === "480p" ? 864 * 496 : resolution === "720p" ? 1280 * 720 : null;
      if (!pixels) return null;
      const tokens = Math.ceil((pixels * Number(duration) * 24) / 1024);
      usd = (tokens / 1000) * 0.014;
    } else {
      const rate = config.pricing[resolution];
      if (!Number.isFinite(rate)) return null;
      usd = rate * Number(duration);
    }
    return Number.isFinite(usd) && usd > 0 ? usd : null;
  }
  function creditsFromUsd(totalUsd) {
    // Subtract a tiny floating-point tolerance so values such as 0.14 × 10 × 130
    // round to the mathematical result (182), not 183 due to binary precision.
    return Math.ceil((Number(totalUsd) * 130) - 1e-9);
  }

  function estimateSceneCredits(modelId, resolution, duration, ratio) {
    const usd = estimateSceneCostUsd(modelId, resolution, duration);
    return Number.isFinite(usd) ? creditsFromUsd(usd) : null;
  }
  function estimateProjectCredits() {
    const totalUsd = state.scenes.reduce((sum, scene) => {
      const usd = estimateSceneCostUsd(scene.model, scene.resolution, scene.duration);
      return Number.isFinite(usd) ? sum + usd : sum;
    }, 0);
    return totalUsd > 0 ? creditsFromUsd(totalUsd) : null;
  }

  function freshState() {
    return {
      mode: "manual", title: "Drama Baru", genre: "Petualangan", premise: "", continuity: "",
      references: { character: [], location: [] },
      scenes: [{ prompt: "", model: DEFAULT_DRAMA_MODEL, duration: 10, ratio: "16:9", resolution: "480p", characterReferenceIds: [], locationReferenceIds: [] }]
    };
  }
  function selectedText(el) { return el ? String(el.value || "") : ""; }
  function setStatus(message) { if (statusEl) statusEl.textContent = localizeDramaMessage(message); }
  function getActiveScene() {
    if (!state.scenes.length) state.scenes.push({ prompt:"", model: DEFAULT_DRAMA_MODEL, duration:10, ratio:"16:9", resolution:"480p", characterReferenceIds: [], locationReferenceIds: [] });
    activeIndex = Math.max(0, Math.min(activeIndex, state.scenes.length - 1));
    const scene = state.scenes[activeIndex];
    if (!DRAMA_MODELS[scene.model]) scene.model = DEFAULT_DRAMA_MODEL;
    if (!scene.duration) scene.duration = 10;
    if (!["16:9", "9:16"].includes(scene.ratio)) scene.ratio = "16:9";
    if (!scene.resolution || !modelConfig(scene.model).resolutions.includes(scene.resolution)) scene.resolution = modelConfig(scene.model).defaultResolution;
    return scene;
  }
  function syncActiveEditor() {
    const scene = getActiveScene();
    const prompt = page.querySelector("#dramaScenePrompt");
    const duration = page.querySelector("#dramaSceneDuration");
    const ratio = page.querySelector("#dramaSceneRatio");
    const resolution = page.querySelector("#dramaSceneResolution");
    const model = page.querySelector("#dramaSceneModel");
    if (prompt) scene.prompt = prompt.value;
    if (model && DRAMA_MODELS[model.value]) scene.model = model.value;
    if (duration) scene.duration = Number(duration.value);
    if (ratio) scene.ratio = ["16:9", "9:16"].includes(ratio.value) ? ratio.value : "16:9";
    if (resolution) scene.resolution = resolution.value;
    const title = page.querySelector("#dramaTitle");
    const genre = page.querySelector("#dramaGenre");
    const premise = page.querySelector("#dramaPremise");
    const continuity = page.querySelector("#dramaContinuity");
    if (title) state.title = title.value.trim() || "Drama Baru";
    if (genre) state.genre = genre.value;
    if (premise) state.premise = premise.value;
    if (continuity) state.continuity = continuity.value;
    for (const kind of ["character", "location"]) {
      const selector = page.querySelector(`#dramaScene${kind === "character" ? "Character" : "Location"}Selections`);
      if (selector) scene[kind === "character" ? "characterReferenceIds" : "locationReferenceIds"] = Array.from(selector.querySelectorAll("input[type=checkbox]:checked"), input => input.value);
    }
  }
  function scheduleSave() {
    if (!currentProjectId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void saveProject(true); }, 1300);
  }
  function showChoiceScreen() {
    page.dataset.screen = "choice";
    page.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><div class="drama-muted">MOVIRA AI · KHUSUS CERITA BERSERI</div><h2 style="margin:6px 0">🎬 Drama AI</h2><div class="drama-muted">Masukkan cerita dari tool pilihanmu, susun menjadi scene, lalu pilih referensi karakter dan lokasi untuk setiap scene.</div></div>
        <button type="button" id="dramaLoadProjectsBtn">📁 Proyek Drama Tersimpan</button>
      </div>
      <div class="drama-grid" style="margin-top:16px">
        <button type="button" id="dramaStoryChoice" class="primary" style="text-align:left;min-height:125px"><strong>📖 Masukkan Prompt Cerita</strong><div class="drama-muted" style="margin-top:8px;color:#e6eaff">Tempel cerita yang sudah dibuat di ChatGPT, Gemini, atau tool lain. Movira tidak memanggil API AI.</div></button>
        <button type="button" id="dramaManualChoice" style="text-align:left;min-height:125px"><strong>✍️ Buat Storyboard Manual</strong><div class="drama-muted" style="margin-top:8px">Mulai dari editor kosong dan tulis prompt setiap scene sendiri.</div></button>
      </div>
      <div class="drama-card"><strong>Catatan</strong><div class="drama-muted" style="margin-top:5px">Pembuatan cerita dilakukan di luar Movira. Menempel cerita dan menyimpan proyek tidak memakai API berbayar. Setelah proyek tersimpan, kamu dapat membuat video untuk semua Scene atau Scene aktif.</div></div>
      <div class="drama-card"><strong>Proyek Drama</strong><div id="dramaProjectList" class="drama-muted" style="margin-top:8px">Tekan “Proyek Drama Tersimpan” untuk memuat proyek milik akunmu.</div></div>
      <div class="drama-status" id="dramaStatus" role="status" aria-live="polite"></div>
    `;
    statusEl = page.querySelector("#dramaStatus");
    applyDramaLanguage();
    page.querySelector("#dramaStoryChoice").addEventListener("click", () => {
      clearTimeout(saveTimer); saveTimer = null; currentProjectId = null;
      state = freshState(); state.mode = "story-import"; activeIndex = 0; showSetupScreen();
    });
    page.querySelector("#dramaManualChoice").addEventListener("click", () => {
      clearTimeout(saveTimer); saveTimer = null; currentProjectId = null;
      state = freshState(); state.mode = "manual"; activeIndex = 0; showEditor();
    });
    page.querySelector("#dramaLoadProjectsBtn").addEventListener("click", loadDramaProjects);
  }
  function showSetupScreen() {
    page.dataset.screen = "setup";
    page.innerHTML = `
      <button type="button" id="dramaBackBtn">← Kembali</button>
      <h2 style="margin-bottom:4px">📖 Masukkan Prompt Cerita</h2>
      <div class="drama-muted">Buat cerita di tool pilihanmu, lalu salin dan tempel seluruh cerita di bawah. Movira akan membantu membaginya menjadi scene untuk diedit.</div>
      <div class="drama-card">
        <label for="dramaTitle">Nama drama</label><input id="dramaTitle" maxlength="100" value="Drama Baru">
        <label for="dramaGenre">Genre</label><select id="dramaGenre"><option value="Petualangan">Petualangan</option><option value="Komedi">Komedi</option><option value="Fantasi">Fantasi</option><option value="Persahabatan">Persahabatan</option><option value="Misteri">Misteri</option><option value="Drama keluarga">Drama keluarga</option><option value="Aksi">Aksi</option></select>
        <label for="dramaPremise">Sinopsis / ringkasan cerita (opsional)</label><textarea id="dramaPremise" rows="3" placeholder="Ringkasan singkat cerita…"></textarea>
        <label for="dramaContinuity">Panduan konsistensi karakter dan dunia (opsional)</label><textarea id="dramaContinuity" rows="3" placeholder="Deskripsi karakter, pakaian, lokasi, dan gaya visual."></textarea>
        <label for="dramaStoryText">Tempel seluruh cerita atau prompt di sini</label><textarea id="dramaStoryText" rows="12" placeholder="Tempel cerita lengkap di sini. Jika ada judul Scene 1, Scene 2, dan seterusnya, Movira akan menggunakannya sebagai pemisah. Jika tidak, paragraf akan dijadikan scene."></textarea>
        <div class="drama-actions"><button type="button" class="primary" id="dramaImportStoryBtn">Bagi Cerita Menjadi Scene</button><button type="button" id="dramaBlankEditorBtn">Buka Editor Kosong</button></div>
        <div class="drama-muted" style="margin-top:8px">Setelah masuk editor, periksa dan edit prompt tiap scene. Kamu tetap bisa menambah atau menghapus scene.</div>
      </div>
      <div class="drama-status" id="dramaStatus" role="status" aria-live="polite"></div>
    `;
    statusEl = page.querySelector("#dramaStatus");
    applyDramaLanguage();
    page.querySelector("#dramaBackBtn").addEventListener("click", showChoiceScreen);
    page.querySelector("#dramaBlankEditorBtn").addEventListener("click", () => { syncSetupFields(); showEditor(); });
    page.querySelector("#dramaImportStoryBtn").addEventListener("click", () => {
      syncSetupFields();
      const story = page.querySelector("#dramaStoryText").value.trim();
      if (!story) { setStatus("Tempel cerita terlebih dahulu."); page.querySelector("#dramaStoryText").focus(); return; }
      const hasHeadings = /(?:^|\n)\s*(?:\[?Scene|\[?Adegan)\s*\d+/i.test(story);
      let chunks = [];
      if (hasHeadings) {
        const lines = story.split(/\r?\n/);
        let current = "";
        for (const line of lines) {
          if (/^\s*(?:\[?Scene|\[?Adegan)\s*\d+/i.test(line)) {
            if (current.trim()) chunks.push(current.trim());
            current = line.trim();
          } else {
            current += (current ? "\n" : "") + line;
          }
        }
        if (current.trim()) chunks.push(current.trim());
      } else {
        chunks = story.split(/\n\s*\n+/).map(part => part.trim()).filter(Boolean);
      }
      if (!chunks.length) chunks = [story];
      state.scenes = chunks.map(prompt => ({
        prompt, model: DEFAULT_DRAMA_MODEL, duration: 10, ratio: "16:9", resolution: "480p",
        characterReferenceIds: [], locationReferenceIds: []
      }));
      activeIndex = 0;
      showEditor();
      setStatus(`${chunks.length} scene dimasukkan dari cerita. Periksa dan edit setiap scene sebelum menyimpan.`);
    });
  }
  function syncSetupFields() {
    state.title = page.querySelector("#dramaTitle")?.value.trim() || "Drama Baru";
    state.genre = page.querySelector("#dramaGenre")?.value || "Petualangan";
    state.premise = page.querySelector("#dramaPremise")?.value || "";
    state.continuity = page.querySelector("#dramaContinuity")?.value || "";
  }
  function showEditor() {
    page.dataset.screen = "editor";
    page.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div class="drama-muted">DRAMA WORKSPACE</div><h2 style="margin:4px 0">Editor Adegan</h2></div><button type="button" id="dramaBackHomeBtn">← Beranda Drama AI</button></div>
      <div class="drama-card">
        <div class="drama-grid"><div><label for="dramaTitle">Nama drama / proyek</label><input id="dramaTitle" maxlength="100"></div><div><label for="dramaGenre">Genre</label><select id="dramaGenre"><option value="Petualangan">Petualangan</option><option value="Komedi">Komedi</option><option value="Fantasi">Fantasi</option><option value="Persahabatan">Persahabatan</option><option value="Misteri">Misteri</option><option value="Drama keluarga">Drama keluarga</option><option value="Aksi">Aksi</option></select></div></div>
        <label for="dramaPremise">Sinopsis / premis</label><textarea id="dramaPremise" rows="3" placeholder="Ringkasan cerita"></textarea>
        <label for="dramaContinuity">Referensi konsistensi karakter dan dunia</label><textarea id="dramaContinuity" rows="3" placeholder="Karakter, pakaian, lokasi, gaya visual. Kolom ini terpisah dan tidak mengubah prompt adegan."></textarea>
      </div>
      <div class="drama-card">
        <strong>🖼️ Gambar Referensi</strong>
        <div class="drama-muted" style="margin-top:5px">Pustaka gambar proyek. Gambar di sini dapat dipakai ulang, tetapi pilihan karakter dan lokasi disimpan secara terpisah untuk setiap scene.</div>
        <div class="drama-reference-grid">
          <div class="drama-reference-box">
            <label for="dramaCharacterReferenceInput">Gambar karakter</label>
            <input id="dramaCharacterReferenceInput" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
            <button type="button" id="dramaCharacterReferenceBtn" class="primary">＋ Upload Gambar Karakter</button>
            <div id="dramaCharacterReferenceEmpty" class="drama-reference-empty">Belum ada gambar karakter.</div>
            <div id="dramaCharacterReferencePreview" class="drama-reference-preview" hidden></div>
          </div>
          <div class="drama-reference-box">
            <label for="dramaLocationReferenceInput">Gambar lokasi</label>
            <input id="dramaLocationReferenceInput" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
            <button type="button" id="dramaLocationReferenceBtn" class="primary">＋ Upload Gambar Lokasi</button>
            <div id="dramaLocationReferenceEmpty" class="drama-reference-empty">Belum ada gambar lokasi.</div>
            <div id="dramaLocationReferencePreview" class="drama-reference-preview" hidden></div>
          </div>
        </div>
      </div>
      <div class="drama-card"><strong>Daftar adegan</strong><div class="drama-scene-tabs" id="dramaSceneTabs" style="margin-top:10px"></div><div class="drama-actions"><button type="button" id="dramaAddSceneBtn">＋ Tambah Scene</button><button type="button" id="dramaDeleteSceneBtn">Hapus Scene Aktif</button></div></div>
      <div class="drama-card">
        <strong id="dramaActiveSceneTitle">Scene 1</strong>
        <label for="dramaScenePrompt">Prompt scene (tetap bisa kamu edit)</label><textarea id="dramaScenePrompt" rows="7" placeholder="Tulis prompt video untuk scene ini…"></textarea>
        <label for="dramaSceneModel">Model video untuk Scene ini</label>
        <select id="dramaSceneModel">
          <option value="bytedance/seedance-2.5/flash/reference-to-video">Seedance 2.5 Flash · Reference-to-Video</option>
          <option value="alibaba/wan-3.0/reference-to-video">Wan 3.0 · Reference-to-Video</option>
          <option value="alibaba/wan-3.0-prime/reference-to-video">Wan 3.0 Prime · Reference-to-Video</option>
          <option value="google/gemini-omni-flash/v1.1/reference-to-video">Gemini Omni Flash 1.1 · Reference-to-Video</option>
        </select>
        <div class="drama-card drama-warning" style="margin-top:10px">
          <strong>Informasi Model dan Referensi</strong>
          <div id="dramaModelInfo" class="drama-muted" style="color:#ffe4a3;margin-top:5px" role="status" aria-live="polite"></div>
          <div id="dramaModelValidation" class="drama-muted" style="color:#ffe4a3;margin-top:5px"></div>
        </div>
        <div class="drama-reference-grid">
          <div class="drama-reference-box">
            <strong>Karakter untuk scene ini</strong>
            <div class="drama-muted" style="margin-top:5px">Centang gambar dari pustaka, atau unggah gambar khusus untuk scene aktif. Pilihan scene lain tidak ikut berubah.</div>
            <div id="dramaSceneCharacterSelections" class="drama-muted" style="margin-top:8px"></div>
            <div class="drama-actions"><input id="dramaSceneCharacterUploadInput" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><button type="button" id="dramaSceneCharacterUploadBtn">＋ Upload khusus scene ini</button></div>
            <div class="drama-muted" style="margin-top:9px">Gambar terpilih di Scene ini:</div>
            <div id="dramaSceneCharacterSelectedPreview" class="drama-scene-selected-grid"></div>
          </div>
          <div class="drama-reference-box">
            <strong>Lokasi untuk scene ini</strong>
            <div class="drama-muted" style="margin-top:5px">Centang gambar dari pustaka, atau unggah gambar khusus untuk scene aktif. Pilihan scene lain tidak ikut berubah.</div>
            <div id="dramaSceneLocationSelections" class="drama-muted" style="margin-top:8px"></div>
            <div class="drama-actions"><input id="dramaSceneLocationUploadInput" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><button type="button" id="dramaSceneLocationUploadBtn">＋ Upload khusus scene ini</button></div>
            <div class="drama-muted" style="margin-top:9px">Gambar terpilih di Scene ini:</div>
            <div id="dramaSceneLocationSelectedPreview" class="drama-scene-selected-grid"></div>
          </div>
        </div>
        <div class="drama-grid"><div><label for="dramaSceneDuration">Durasi</label><select id="dramaSceneDuration"><option value="10">10 detik</option><option value="15">15 detik</option><option value="30">30 detik</option></select></div><div><label for="dramaSceneRatio">Rasio</label><select id="dramaSceneRatio"><option value="16:9">16:9</option><option value="9:16">9:16</option></select></div><div><label for="dramaSceneResolution">Resolusi</label><select id="dramaSceneResolution"><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option><option value="360p">360p</option></select></div></div>
        <div id="dramaCostEstimate" class="drama-muted" style="margin-top:10px"></div>
        <div class="drama-actions"><button type="button" class="primary" id="dramaSaveBtn">Simpan ke Projects</button><button type="button" id="dramaSaveNewBtn">Simpan sebagai Proyek Baru</button><button type="button" class="primary" id="dramaGenerateBtn">🎬 Buat Video</button></div>
        <div id="dramaGenerateChoices" class="drama-generate-menu" hidden>
          <button type="button" class="primary" id="dramaGenerateAllBtn">Generate Semua Scene</button>
          <button type="button" id="dramaGenerateActiveBtn">Generate Scene Aktif</button>
        </div>
        <div class="drama-muted" style="margin-top:8px">Pilih semua Scene atau hanya Scene aktif. Estimasi kredit ditampilkan sebelum konfirmasi.</div>
        <div class="drama-actions"><button type="button" id="dramaCheckBatchBtn" hidden>Periksa Status Generate Terakhir</button></div>
        <div id="dramaGenerationResults" class="drama-results" aria-live="polite"></div>
      </div>
      <div class="drama-card"><strong>Proyek Drama tersimpan</strong><div id="dramaProjectList" class="drama-muted" style="margin-top:8px">Memuat daftar proyek…</div></div>
      <div class="drama-status" id="dramaStatus" role="status" aria-live="polite"></div>
    `;
    statusEl = page.querySelector("#dramaStatus");
    applyDramaLanguage();
    page.querySelector("#dramaBackHomeBtn").addEventListener("click", async () => {
      clearTimeout(saveTimer); saveTimer = null;
      if (currentProjectId) {
        syncActiveEditor();
        const saved = await saveProject(true);
        if (!saved) return;
      }
      showChoiceScreen();
    });
    const title = page.querySelector("#dramaTitle"); title.value = state.title;
    const genre = page.querySelector("#dramaGenre"); genre.value = state.genre;
    page.querySelector("#dramaPremise").value = state.premise;
    page.querySelector("#dramaContinuity").value = state.continuity;
    bindReferenceUpload("character");
    bindReferenceUpload("location");
    bindSceneReferenceUpload("character");
    bindSceneReferenceUpload("location");
    renderReferencePreview("character");
    renderReferencePreview("location");
    renderSceneReferenceSelections();
    page.querySelector("#dramaScenePrompt").value = getActiveScene().prompt;
    page.querySelector("#dramaSceneModel").value = getActiveScene().model || DEFAULT_DRAMA_MODEL;
    configureModelControls(true);
    page.querySelector("#dramaSceneDuration").value = String(getActiveScene().duration || 10);
    page.querySelector("#dramaSceneRatio").value = ["16:9", "9:16"].includes(getActiveScene().ratio) ? getActiveScene().ratio : "16:9";
    page.querySelector("#dramaSceneResolution").value = getActiveScene().resolution || modelConfig(getActiveScene().model).defaultResolution;
    const autosaveEvents = ["input", "change"];
    for (const id of ["dramaTitle","dramaGenre","dramaPremise","dramaContinuity","dramaScenePrompt","dramaSceneDuration","dramaSceneRatio","dramaSceneResolution"]) {
      const el = page.querySelector(`#${id}`);
      autosaveEvents.forEach(type => el.addEventListener(type, () => { syncActiveEditor(); renderSceneTabs(); updateCostEstimate(); scheduleSave(); }));
    }
    page.querySelector("#dramaScenePrompt").addEventListener("input", () => { syncActiveEditor(); scheduleSave(); });
    page.querySelector("#dramaSceneModel").addEventListener("change", () => {
      const scene = getActiveScene();
      scene.model = page.querySelector("#dramaSceneModel").value;
      configureModelControls(true);
      syncActiveEditor();
      updateCostEstimate();
      scheduleSave();
      setStatus(`Model Scene ${activeIndex + 1} diubah. Pilihan gambar referensi tidak dihapus.`);
    });
    page.querySelector("#dramaAddSceneBtn").addEventListener("click", () => { syncActiveEditor(); state.scenes.push({ prompt:"", model: DEFAULT_DRAMA_MODEL, duration:10, ratio:"16:9", resolution:"480p", characterReferenceIds: [], locationReferenceIds: [] }); activeIndex = state.scenes.length - 1; showEditor(); setStatus("Scene ditambahkan."); scheduleSave(); });
    page.querySelector("#dramaDeleteSceneBtn").addEventListener("click", () => {
      if (state.scenes.length <= 1) { setStatus("Drama harus memiliki minimal satu scene."); return; }
      syncActiveEditor(); state.scenes.splice(activeIndex, 1); activeIndex = Math.min(activeIndex, state.scenes.length - 1); showEditor(); setStatus("Scene dihapus dari draf. Simpan proyek untuk menerapkan perubahan."); scheduleSave();
    });
    page.querySelector("#dramaSaveBtn").addEventListener("click", () => saveProject(false));
    page.querySelector("#dramaGenerateBtn").addEventListener("click", () => {
      const choices = page.querySelector("#dramaGenerateChoices");
      if (choices) choices.hidden = !choices.hidden;
    });
    page.querySelector("#dramaGenerateAllBtn").addEventListener("click", () => startDramaGeneration("all"));
    page.querySelector("#dramaGenerateActiveBtn").addEventListener("click", () => startDramaGeneration("active"));
    page.querySelector("#dramaCheckBatchBtn").addEventListener("click", checkLastDramaBatch);
    try {
      lastDramaBatchId = localStorage.getItem(`moviraDramaBatch:${currentProjectId}`) || null;
      page.querySelector("#dramaCheckBatchBtn").hidden = !lastDramaBatchId;
    } catch { lastDramaBatchId = null; }

    page.querySelector("#dramaSaveNewBtn").addEventListener("click", () => {
      clearTimeout(saveTimer); saveTimer = null;
      currentProjectId = null;
      void saveProject(false);
    });
    renderSceneTabs(); updateModelInfo(); updateCostEstimate();
    void loadDramaProjects();
  }
  function renderSceneTabs() {
    const tabs = page?.querySelector("#dramaSceneTabs");
    if (!tabs) return;
    tabs.replaceChildren();
    state.scenes.forEach((scene, index) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = `Scene ${index + 1}`; btn.setAttribute("aria-pressed", String(index === activeIndex));
      btn.addEventListener("click", () => { syncActiveEditor(); activeIndex = index; showEditor(); });
      tabs.appendChild(btn);
    });
    const activeTitle = page.querySelector("#dramaActiveSceneTitle");
    if (activeTitle) activeTitle.textContent = `Scene ${activeIndex + 1} dari ${state.scenes.length}`;
  }
  function configureModelControls(preserveAllowed = true) {
    const modelSelect = page?.querySelector("#dramaSceneModel");
    const resolutionSelect = page?.querySelector("#dramaSceneResolution");
    const durationSelect = page?.querySelector("#dramaSceneDuration");
    if (!modelSelect || !resolutionSelect || !durationSelect) return;
    const scene = getActiveScene();
    const selectedModel = DRAMA_MODELS[modelSelect.value] ? modelSelect.value : DEFAULT_DRAMA_MODEL;
    scene.model = selectedModel;
    const config = modelConfig(selectedModel);
    const previousResolution = preserveAllowed ? (scene.resolution || resolutionSelect.value) : "";
    resolutionSelect.replaceChildren();
    config.resolutions.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      resolutionSelect.appendChild(option);
    });
    scene.resolution = config.resolutions.includes(previousResolution) ? previousResolution : config.defaultResolution;
    resolutionSelect.value = scene.resolution;
    const allowedDurations = config.durations || [10, 15, 30];
    const previousDuration = Number(scene.duration || durationSelect.value || 10);
    durationSelect.replaceChildren();
    allowedDurations.forEach(value => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value} ${dramaLanguage() === "en" ? "seconds" : dramaLanguage() === "ms" ? "saat" : "detik"}`;
      durationSelect.appendChild(option);
    });
    scene.duration = allowedDurations.includes(previousDuration) ? previousDuration : allowedDurations[0];
    durationSelect.value = String(scene.duration);
    updateModelInfo();
  }

  function updateModelInfo() {
    const info = page?.querySelector("#dramaModelInfo");
    const validation = page?.querySelector("#dramaModelValidation");
    const modelSelect = page?.querySelector("#dramaSceneModel");
    if (!info || !validation || !modelSelect) return;
    const scene = getActiveScene();
    const config = modelConfig(modelSelect.value);
    const count = countSelectedReferences(scene);
    const lang = dramaLanguage();
    const limitText = lang === "en" ? `Drama AI app limit: up to ${config.maxImages} images per scene.` : lang === "ms" ? `Had aplikasi Drama AI: maksimum ${config.maxImages} imej bagi setiap scene.` : `Batas aplikasi Drama AI: maksimal ${config.maxImages} gambar untuk satu Scene.`;
    const endpointText = lang === "en" ? "Documented endpoint limit: up to 10 reference images." : lang === "ms" ? "Had endpoint yang didokumenkan: maksimum 10 imej rujukan." : "Batas endpoint yang didokumentasikan: maksimal 10 gambar referensi.";
    const mediaText = lang === "en" ? "Drama AI editor accepts image references only; audio is generated from the prompt." : lang === "ms" ? "Editor Drama AI menerima imej rujukan sahaja; audio dijana berdasarkan prompt." : "Editor Drama AI hanya menerima gambar referensi; audio dihasilkan mengikuti prompt.";
    info.textContent = `${config.label}. ${limitText} ${config.imageLimitNote || endpointText} ${mediaText}`;
    if (count === 0) {
      validation.textContent = dramaLanguage() === "en" ? "Select at least one character or location image for this scene before generation is enabled." : dramaLanguage() === "ms" ? "Pilih sekurang-kurangnya satu imej watak atau lokasi untuk scene ini sebelum penjanaan diaktifkan." : "Pilih minimal satu gambar karakter atau lokasi untuk Scene ini sebelum generasi nanti diaktifkan.";
    } else if (count > config.maxImages) {
      validation.textContent = dramaLanguage() === "en" ? `Too many images: ${count} selected; the scene limit is ${config.maxImages}. Remove some images before generation is enabled.` : dramaLanguage() === "ms" ? `Terlalu banyak imej: ${count} dipilih; had scene ialah ${config.maxImages}. Kurangkan pilihan sebelum penjanaan diaktifkan.` : `Terlalu banyak gambar: ${count} dipilih, sedangkan batas Scene adalah ${config.maxImages}. Kurangi pilihan gambar sebelum generasi diaktifkan.`;
    } else {
      validation.textContent = dramaLanguage() === "en" ? `${count} images selected. This is within the selected model's scene limit.` : dramaLanguage() === "ms" ? `${count} imej dipilih. Jumlah ini dalam had scene model yang dipilih.` : `${count} gambar dipilih. Jumlah ini sesuai dengan batas Scene untuk model yang dipilih.`;
    }
  }

  function updateCostEstimate() {
    const box = page?.querySelector("#dramaCostEstimate");
    if (!box) return;
    const scene = getActiveScene();
    const modelSelect = page?.querySelector("#dramaSceneModel");
    const resolutionSelect = page?.querySelector("#dramaSceneResolution");
    const durationSelect = page?.querySelector("#dramaSceneDuration");
    const ratioSelect = page?.querySelector("#dramaSceneRatio");
    const modelId = modelSelect?.value || scene.model || DEFAULT_DRAMA_MODEL;
    const resolution = resolutionSelect?.value || scene.resolution;
    const duration = Number(durationSelect?.value || scene.duration || 10);
    const credits = estimateSceneCredits(modelId, resolution, duration, ratioSelect?.value || scene.ratio || "16:9");
    if (!Number.isFinite(credits)) {
      box.textContent = dramaLanguage() === "en" ? "Credit estimate is not available for this combination." : dramaLanguage() === "ms" ? "Anggaran kredit tidak tersedia untuk gabungan ini." : "Estimasi kredit belum tersedia untuk kombinasi pengaturan ini.";
      return;
    }
    const projectCredits = estimateProjectCredits();
    const lang = dramaLanguage();
    const locale = lang === "en" ? "en-US" : lang === "ms" ? "ms-MY" : "id-ID";
    const sceneLabel = lang === "en" ? "Active scene estimate" : lang === "ms" ? "Anggaran scene aktif" : "Estimasi scene aktif";
    const allLabel = lang === "en" ? "Total for all scenes (rounded once)" : lang === "ms" ? "Jumlah semua scene (dibundarkan sekali)" : "Total semua scene (pembulatan sekali)";
    const sceneUnit = lang === "en" ? "Credits" : "Kredit";
    box.textContent = `${sceneLabel}: ${credits.toLocaleString(locale)} ${sceneUnit} · ${duration}s ${resolution}. ${allLabel}: ${projectCredits?.toLocaleString(locale) ?? "—"} ${sceneUnit} (${state.scenes.length} scene).`;
  }

  let dramaGenerationBusy = false;
  let lastDramaBatchId = null;

  function selectedSceneIndexes(mode) {
    return mode === "active" ? [activeIndex] : state.scenes.map((_, index) => index);
  }

  function validateDramaGeneration(mode) {
    syncActiveEditor();
    ensureReferenceState();
    const indexes = selectedSceneIndexes(mode);
    const selected = [];
    let totalUsd = 0;
    for (const index of indexes) {
      const scene = state.scenes[index];
      if (!scene || !String(scene.prompt || "").trim()) throw new Error(`Prompt Scene ${index + 1} masih kosong.`);
      const config = DRAMA_MODELS[scene.model];
      if (!config) throw new Error(`Model Scene ${index + 1} tidak valid.`);
      const referenceCount = countSelectedReferences(scene);
      if (referenceCount < 1 || referenceCount > config.maxImages) {
        throw new Error(`Scene ${index + 1} harus memilih 1–${config.maxImages} gambar referensi.`);
      }
      if (!config.resolutions.includes(scene.resolution) || !config.durations.includes(Number(scene.duration))) {
        throw new Error(`Resolusi atau durasi Scene ${index + 1} belum sesuai dengan model.`);
      }
      if (!["16:9", "9:16"].includes(scene.ratio)) throw new Error(`Rasio Scene ${index + 1} harus 16:9 atau 9:16.`);
      const usd = estimateSceneCostUsd(scene.model, scene.resolution, scene.duration);
      if (!Number.isFinite(usd) || usd <= 0) throw new Error(`Biaya Scene ${index + 1} belum tersedia.`);
      totalUsd += usd;
      selected.push({ index, scene });
    }
    const credits = creditsFromUsd(totalUsd);
    if (!Number.isInteger(credits) || credits < 1) throw new Error("Estimasi total kredit tidak valid.");
    return { selected, totalUsd, credits };
  }

  function renderDramaBatchResults(data) {
    const box = page?.querySelector("#dramaGenerationResults");
    if (!box) return;
    box.replaceChildren();
    const scenes = Array.isArray(data?.scenes) ? data.scenes : [];
    const succeeded = scenes.filter(item => item.status === "succeeded").length;
    const title = document.createElement("div");
    title.className = "drama-muted";
    const status = data?.batch?.status || "processing";
    const labels = dramaLanguage() === "en"
      ? { succeeded: "completed", partial: "partially completed", failed: "failed", unknown: "needs review", processing: "processing" }
      : dramaLanguage() === "ms"
      ? { succeeded: "selesai", partial: "sebahagiannya selesai", failed: "gagal", unknown: "perlu disemak", processing: "sedang diproses" }
      : { succeeded: "selesai", partial: "selesai sebagian", failed: "gagal", unknown: "perlu diperiksa", processing: "sedang diproses" };
    const statusLabel = status === "succeeded" ? labels.succeeded : status === "partially_succeeded" ? labels.partial : status === "failed_confirmed" ? labels.failed : status === "unknown" ? labels.unknown : labels.processing;
    title.textContent = `${dramaLanguage() === "en" ? "Batch status" : dramaLanguage() === "ms" ? "Status batch" : "Status batch"}: ${statusLabel} · ${succeeded}/${scenes.length} ${dramaLanguage() === "en" ? "scenes completed" : "scene berhasil"}`;
    box.appendChild(title);
    for (const scene of scenes) {
      const row = document.createElement("div");
      row.className = "drama-muted";
      const label = document.createElement("span");
      const stateText = scene.status === "succeeded" ? "✓ berhasil" : scene.status === "failed_confirmed" ? "Gagal terkonfirmasi" : scene.status === "unknown" ? "Status belum pasti" : scene.status === "not_submitted" ? "Belum dikirim" : "Sedang diproses";
      label.textContent = `Scene ${scene.scene_number}: ${stateText}`;
      row.appendChild(label);
      if (scene.video_url) {
        const link = document.createElement("a");
        link.className = "drama-result-link";
        link.href = scene.video_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = dramaLanguage() === "en" ? "Open generated video" : dramaLanguage() === "ms" ? "Buka video yang dijana" : "Buka video hasil";
        row.append(document.createTextNode(" · "), link);
      }
      box.appendChild(row);
    }
    if (data?.batch?.refund_status === "error") {
      const warning = document.createElement("div");
      warning.className = "drama-muted";
      warning.textContent = "Pengembalian kredit perlu pemeriksaan manual. Jangan ulangi Generate untuk batch ini.";
      box.appendChild(warning);
    }
  }

  async function getDramaAccessToken() {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error("Silakan login terlebih dahulu.");
    return token;
  }

  async function fetchDramaBatch(batchId, token) {
    const response = await fetch(`${window.MOVIRA_API_BASE || "https://movira-backend-1.onrender.com"}/api/drama-generate-batch/${encodeURIComponent(batchId)}`, {
      method: "GET", headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Gagal memeriksa status batch Drama AI.");
    return data;
  }

  async function pollDramaBatch(batchId, token) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30 * 60 * 1000) {
      const data = await fetchDramaBatch(batchId, token);
      renderDramaBatchResults(data);
      if (data.done) {
        const status = data.batch?.status;
        setStatus(status === "succeeded" ? "Semua Scene berhasil dibuat." : status === "partially_succeeded" ? "Sebagian Scene berhasil. Periksa hasil dan status kredit di bawah." : status === "failed_confirmed" ? "Semua Scene gagal dan pengembalian kredit telah diproses jika terkonfirmasi." : "Batch selesai dengan status yang perlu diperiksa. Kredit untuk status tidak pasti tidak dikembalikan otomatis.");
        return data;
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    setStatus("Batch masih diproses. Gunakan tombol Periksa Status untuk melanjutkan pemeriksaan; jangan kirim Generate ulang.");
    return null;
  }

  function makeDramaClientRequestId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  async function startDramaGeneration(mode) {
    if (dramaGenerationBusy) return;
    const menu = page?.querySelector("#dramaGenerateChoices");
    if (menu) menu.hidden = true;
    let details;
    try {
      details = validateDramaGeneration(mode);
    } catch (error) {
      setStatus(error.message || "Periksa pengaturan semua Scene terlebih dahulu.");
      return;
    }
    const isEnglish = dramaLanguage() === "en";
    const isMalay = dramaLanguage() === "ms";
    const scope = mode === "all" ? (isEnglish ? "all scenes" : isMalay ? "semua scene" : "semua Scene") : (isEnglish ? "the active scene" : isMalay ? "scene aktif" : "Scene aktif");
    const confirmText = isEnglish
      ? `Generate ${scope} (${details.selected.length} scene)? Estimated total: ${details.credits.toLocaleString("en-US")} credits. Credits are deducted once for this batch.`
      : isMalay
      ? `Jana ${scope} (${details.selected.length} scene)? Anggaran jumlah: ${details.credits.toLocaleString("ms-MY")} kredit. Kredit ditolak sekali untuk batch ini.`
      : `Buat ${scope} (${details.selected.length} Scene)? Estimasi total: ${details.credits.toLocaleString("id-ID")} kredit. Kredit dipotong satu kali untuk batch ini.`;
    if (!window.confirm(confirmText)) return;

    dramaGenerationBusy = true;
    const generateButton = page.querySelector("#dramaGenerateBtn");
    if (generateButton) generateButton.disabled = true;
    setStatus("Menyimpan proyek dan menyiapkan batch. Jangan tutup halaman dulu.");
    try {
      const saved = await saveProject(true);
      if (!saved || !currentProjectId) throw new Error("Proyek belum berhasil disimpan. Coba simpan proyek terlebih dahulu.");
      const token = await getDramaAccessToken();
      const pendingKey = `moviraDramaPending:${currentProjectId}`;
      let clientRequestId = null;
      try {
        clientRequestId = localStorage.getItem(pendingKey);
        if (!clientRequestId) {
          clientRequestId = makeDramaClientRequestId();
          localStorage.setItem(pendingKey, clientRequestId);
        }
      } catch {
        throw new Error("Browser tidak dapat menyimpan ID permintaan dengan aman. Aktifkan penyimpanan situs lalu muat ulang halaman.");
      }
      const response = await fetch(`${window.MOVIRA_API_BASE || "https://movira-backend-1.onrender.com"}/api/drama-generate-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: currentProjectId, mode, active_scene_index: activeIndex, client_request_id: clientRequestId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.batch_id) {
          lastDramaBatchId = data.batch_id;
          try {
            localStorage.setItem(`moviraDramaBatch:${currentProjectId}`, lastDramaBatchId);
            localStorage.removeItem(pendingKey);
          } catch {}
          const statusButton = page.querySelector("#dramaCheckBatchBtn");
          if (statusButton) statusButton.hidden = false;
        }
        throw new Error(data.error || "Permintaan Generate Drama AI gagal disiapkan.");
      }
      lastDramaBatchId = data.batch_id;
      try {
        localStorage.setItem(`moviraDramaBatch:${currentProjectId}`, lastDramaBatchId);
        localStorage.removeItem(pendingKey);
      } catch {}
      const statusButton = page.querySelector("#dramaCheckBatchBtn");
      if (statusButton) statusButton.hidden = false;
      renderDramaBatchResults(data);
      setStatus(`Batch diterima. ${details.selected.length} Scene sedang diproses. Kredit batch: ${Number(data.credit_amount || details.credits).toLocaleString(isEnglish ? "en-US" : isMalay ? "ms-MY" : "id-ID")}.`);
      await pollDramaBatch(lastDramaBatchId, token);
    } catch (error) {
      setStatus(error.message || "Terjadi kesalahan saat memulai Generate Drama AI.");
    } finally {
      dramaGenerationBusy = false;
      if (generateButton) generateButton.disabled = false;
    }
  }

  async function checkLastDramaBatch() {
    if (!currentProjectId) return;
    let batchId = lastDramaBatchId;
    try { batchId = batchId || localStorage.getItem(`moviraDramaBatch:${currentProjectId}`); } catch {}
    if (!batchId) { setStatus("Belum ada batch Generate untuk proyek ini."); return; }
    try {
      const token = await getDramaAccessToken();
      const data = await fetchDramaBatch(batchId, token);
      renderDramaBatchResults(data);
      if (!data.done) await pollDramaBatch(batchId, token);
    } catch (error) {
      setStatus(error.message || "Gagal memeriksa batch terakhir.");
    }
  }

  function ensureReferenceState() {
    state.references = state.references || {};
    for (const kind of ["character", "location"]) {
      const current = state.references[kind];
      if (Array.isArray(current)) {
        state.references[kind] = current.map((item, index) => typeof item === "string"
          ? { id: makeReferenceId(kind, index), name: `${kind === "character" ? "Karakter" : "Lokasi"} ${index + 1}`, dataUrl: item }
          : { id: String(item.id || makeReferenceId(kind, index)), name: String(item.name || `${kind === "character" ? "Karakter" : "Lokasi"} ${index + 1}`), dataUrl: String(item.dataUrl || item.data_url || "") }).filter(item => item.dataUrl);
      } else if (typeof current === "string" && current) {
        // Backward compatibility for projects saved with the previous single-image format.
        state.references[kind] = [{ id: makeReferenceId(kind, 0), name: kind === "character" ? "Karakter 1" : "Lokasi 1", dataUrl: current }];
      } else {
        state.references[kind] = [];
      }
    }
    if (!Array.isArray(state.scenes)) state.scenes = [];
    state.scenes = state.scenes.map(scene => {
      const currentScene = scene && typeof scene === "object" ? scene : {};
      currentScene.characterReferenceIds = Array.isArray(currentScene.characterReferenceIds) ? currentScene.characterReferenceIds.map(String) : [];
      currentScene.locationReferenceIds = Array.isArray(currentScene.locationReferenceIds) ? currentScene.locationReferenceIds.map(String) : [];
      return currentScene;
    });
  }
  function makeReferenceId(kind, index) {
    return `${kind}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function renderReferencePreview(kind) {
    ensureReferenceState();
    const prefix = kind === "character" ? "Character" : "Location";
    const preview = page?.querySelector(`#drama${prefix}ReferencePreview`);
    const empty = page?.querySelector(`#drama${prefix}ReferenceEmpty`);
    if (!preview || !empty) return;
    preview.replaceChildren();
    const items = state.references[kind];
    preview.hidden = !items.length;
    empty.hidden = Boolean(items.length);
    if (!items.length) return;
    items.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "drama-reference-box";
      card.style.width = "100%";
      const img = document.createElement("img");
      img.src = item.dataUrl;
      img.alt = item.name;
      const name = document.createElement("div");
      name.className = "drama-muted";
      name.textContent = item.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = dramaLanguage() === "en" ? "Remove Image" : dramaLanguage() === "ms" ? "Padam Imej" : "Hapus Gambar";
      remove.addEventListener("click", () => {
        state.references[kind] = state.references[kind].filter(ref => ref.id !== item.id);
        for (const scene of state.scenes) {
          const key = kind === "character" ? "characterReferenceIds" : "locationReferenceIds";
          scene[key] = (scene[key] || []).filter(id => id !== item.id);
        }
        renderReferencePreview(kind);
        renderSceneReferenceSelections();
        updateModelInfo();
        updateCostEstimate();
        if (currentProjectId) scheduleSave();
        setStatus(currentProjectId ? "Gambar referensi dihapus; perubahan akan disimpan otomatis." : "Gambar referensi dihapus dari draf.");
      });
      card.append(img, name, remove);
      preview.appendChild(card);
    });
  }
  function renderSceneReferenceSelections() {
    ensureReferenceState();
    const scene = getActiveScene();
    for (const kind of ["character", "location"]) {
      const prefix = kind === "character" ? "Character" : "Location";
      const box = page?.querySelector(`#dramaScene${prefix}Selections`);
      const preview = page?.querySelector(`#dramaScene${prefix}SelectedPreview`);
      if (!box) continue;
      box.replaceChildren();
      if (preview) preview.replaceChildren();
      const refs = state.references[kind];
      const selectedKey = kind === "character" ? "characterReferenceIds" : "locationReferenceIds";
      const selectedIds = new Set(scene[selectedKey] || []);
      if (!refs.length) {
        box.textContent = dramaLanguage() === "en" ? `No ${kind} images yet. Upload project images or images for this scene.` : dramaLanguage() === "ms" ? `Belum ada imej ${kind === "character" ? "watak" : "lokasi"}. Muat naik imej projek atau imej khas untuk scene ini.` : `Belum ada gambar ${kind === "character" ? "karakter" : "lokasi"}. Unggah gambar proyek atau gambar khusus scene ini.`;
      } else {
        refs.forEach(ref => {
          const label = document.createElement("label");
          label.style.cssText = "display:flex;align-items:center;gap:8px;margin:7px 0;";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = ref.id;
          checkbox.checked = selectedIds.has(ref.id);
          checkbox.style.width = "auto";
          checkbox.addEventListener("change", () => {
            const nextIds = Array.from(box.querySelectorAll("input[type=checkbox]:checked"), input => input.value);
            const otherKey = kind === "character" ? "locationReferenceIds" : "characterReferenceIds";
            const otherKind = kind === "character" ? "location" : "character";
            const otherIds = new Set(scene[otherKey] || []);
            const otherCount = state.references[otherKind].filter(ref => otherIds.has(ref.id)).length;
            if (nextIds.length + otherCount > modelConfig(scene.model).maxImages) {
              checkbox.checked = false;
              setStatus(`Batas gambar untuk model ini maksimal ${modelConfig(scene.model).maxImages} per Scene.`);
              return;
            }
            scene[selectedKey] = nextIds;
            renderSceneReferenceSelections();
            updateModelInfo();
            updateCostEstimate();
            scheduleSave();
          });
          const caption = document.createElement("span");
          caption.textContent = ref.name;
          label.append(checkbox, caption);
          box.appendChild(label);
        });
      }
      if (preview) {
        const chosen = refs.filter(ref => selectedIds.has(ref.id));
        if (!chosen.length) {
          const empty = document.createElement("div");
          empty.className = "drama-muted";
          empty.textContent = dramaLanguage() === "en" ? "No images selected for this scene yet." : dramaLanguage() === "ms" ? "Belum ada imej dipilih untuk scene ini." : "Belum ada gambar yang dipilih untuk scene ini.";
          preview.appendChild(empty);
        } else {
          chosen.forEach(ref => {
            const card = document.createElement("div");
            card.className = "drama-scene-selected-card";
            const img = document.createElement("img");
            img.src = ref.dataUrl;
            img.alt = ref.name;
            const name = document.createElement("div");
            name.className = "drama-muted";
            name.textContent = ref.name;
            card.append(img, name);
            preview.appendChild(card);
          });
        }
      }
    }
  }

  function bindSceneReferenceUpload(kind) {
    const prefix = kind === "character" ? "dramaSceneCharacter" : "dramaSceneLocation";
    const input = page.querySelector(`#${prefix}UploadInput`);
    const button = page.querySelector(`#${prefix}UploadBtn`);
    if (!input || !button) return;
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      ensureReferenceState();
      const targetScene = getActiveScene();
      const targetSceneNumber = activeIndex + 1;
      const selectedKey = kind === "character" ? "characterReferenceIds" : "locationReferenceIds";
      button.disabled = true;
      setStatus(`Memproses ${files.length} gambar khusus untuk Scene ${targetSceneNumber}...`);
      try {
        const addedIds = [];
        for (const file of files) {
          const dataUrl = await compressReferenceImage(file);
          const index = state.references[kind].length + 1;
          const ref = { id: makeReferenceId(kind, index), name: file.name || `${kind === "character" ? "Karakter" : "Lokasi"} ${index}`, dataUrl };
          state.references[kind].push(ref);
          addedIds.push(ref.id);
        }
        targetScene[selectedKey] = Array.from(new Set([...(targetScene[selectedKey] || []), ...addedIds]));
        input.value = "";
        renderReferencePreview(kind);
        renderSceneReferenceSelections();
        updateModelInfo();
        updateCostEstimate();
        if (currentProjectId) {
          scheduleSave();
          setStatus(`Gambar ditambahkan dan dipilih khusus untuk Scene ${targetSceneNumber}. Scene lain tidak diubah; perubahan akan disimpan otomatis.`);
        } else {
          setStatus(`Gambar ditambahkan dan dipilih khusus untuk Scene ${targetSceneNumber}. Tekan ‘Simpan ke Projects’ agar tersimpan permanen.`);
        }
      } catch (error) {
        input.value = "";
        setStatus(error.message || "Gagal menambahkan gambar khusus scene.");
      } finally {
        button.disabled = false;
      }
    });
  }

  function compressReferenceImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        reject(new Error("Format gambar harus PNG, JPG, atau WEBP."));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        reject(new Error("Ukuran gambar maksimal 10 MB."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Gagal membaca gambar referensi."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("File gambar tidak dapat dibuka."));
        image.onload = () => {
          const maxSide = 960;
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
          canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
          const context = canvas.getContext("2d");
          if (!context) { reject(new Error("Browser tidak mendukung pemrosesan gambar.")); return; }
          // JPEG is broadly supported; a white background handles transparent PNGs consistently.
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          try { resolve(canvas.toDataURL("image/jpeg", 0.76)); }
          catch { reject(new Error("Gambar gagal dikompres.")); }
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function bindReferenceUpload(kind) {
    const prefix = kind === "character" ? "dramaCharacter" : "dramaLocation";
    const input = page.querySelector(`#${prefix}ReferenceInput`);
    const button = page.querySelector(`#${prefix}ReferenceBtn`);
    if (!input || !button || input.dataset.bound === "true") return;
    input.dataset.bound = "true";
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      button.disabled = true;
      setStatus(`Memproses ${files.length} gambar referensi...`);
      try {
        ensureReferenceState();
        for (const file of files) {
          const dataUrl = await compressReferenceImage(file);
          const index = state.references[kind].length + 1;
          state.references[kind].push({ id: makeReferenceId(kind, index), name: file.name || `${kind === "character" ? "Karakter" : "Lokasi"} ${index}`, dataUrl });
        }
        input.value = "";
        renderReferencePreview(kind);
        renderSceneReferenceSelections();
        updateModelInfo();
        updateCostEstimate();
        if (currentProjectId) {
          scheduleSave();
          setStatus("Gambar referensi ditambahkan. Perubahan akan disimpan otomatis.");
        } else {
          setStatus("Gambar referensi ditambahkan ke draf. Tekan ‘Simpan ke Projects’ agar tersimpan permanen.");
        }
      } catch (error) {
        input.value = "";
        setStatus(error.message || "Gagal menambahkan gambar referensi.");
      } finally {
        button.disabled = false;
      }
    });
  }

  function getSupabaseClient() {
    // Use an explicit window export first; keep the lexical binding as a fallback.
    const client = window.moviraSupabase || (typeof moviraSupabase !== "undefined" ? moviraSupabase : null);
    if (!client || !client.auth || typeof client.from !== "function") {
      throw new Error("Klien Supabase belum tersedia. Muat ulang halaman, lalu coba lagi.");
    }
    return client;
  }

  async function getSession() {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) throw new Error("Silakan login terlebih dahulu untuk menyimpan proyek Drama.");
    return data.session.user;
  }
  function buildSettings() {
    syncActiveEditor();
    ensureReferenceState();
    return {
      ...(state.originalSettings || {}),
      dramaAI: {
        version: 3, mode: state.mode, genre: state.genre, premise: state.premise,
        continuity: state.continuity,
        referenceImages: {
          character: state.references.character.map(ref => ({ id: ref.id, name: ref.name, dataUrl: ref.dataUrl })),
          location: state.references.location.map(ref => ({ id: ref.id, name: ref.name, dataUrl: ref.dataUrl }))
        },
        scenes: state.scenes.map(scene => ({ prompt: String(scene.prompt || ""), model: DRAMA_MODELS[scene.model] ? scene.model : DEFAULT_DRAMA_MODEL, duration: Number(scene.duration || 10), ratio: scene.ratio || "16:9", resolution: scene.resolution || modelConfig(scene.model).defaultResolution, characterReferenceIds: [...(scene.characterReferenceIds || [])], locationReferenceIds: [...(scene.locationReferenceIds || [])] }))
      },
      activeSceneIndex: activeIndex,
      workspaceScenes: state.scenes.map(scene => ({ prompt: String(scene.prompt || ""), settings: { model: DRAMA_MODELS[scene.model] ? scene.model : DEFAULT_DRAMA_MODEL, duration: Number(scene.duration || 10), ratio: scene.ratio || "16:9", resolution: scene.resolution || modelConfig(scene.model).defaultResolution } }))
    };
  }
  async function saveProject(automatic = false) {
    try {
      const user = await getSession();
      syncActiveEditor();
      state.title = state.title.trim() || "Drama Baru";
      const settings = buildSettings();
      const prompt = state.scenes[0]?.prompt || state.premise || "";
      const client = getSupabaseClient();
      let result;
      if (currentProjectId) {
        result = await client.from("projects").update({ name: state.title, prompt, settings, status: "draft", updated_at: new Date().toISOString() }).eq("id", currentProjectId).eq("user_id", user.id).select("id,name,settings,updated_at").single();
      } else {
        result = await client.from("projects").insert({ user_id: user.id, name: state.title, prompt, settings, status: "draft", updated_at: new Date().toISOString() }).select("id,name,settings,updated_at").single();
      }
      if (result.error) throw result.error;
      currentProjectId = result.data.id;
      state.originalSettings = settings;
      setStatus(automatic ? "Perubahan Drama tersimpan otomatis." : `Proyek Drama tersimpan: ${result.data.name}.`);
      await loadDramaProjects();
      return true;
    } catch (error) {
      setStatus(`Gagal menyimpan proyek: ${error.message || "Kesalahan tidak diketahui"}`);
      return false;
    }
  }
  async function loadDramaProjects() {
    const list = page?.querySelector("#dramaProjectList");
    if (!list) return;
    try {
      const user = await getSession();
      const client = getSupabaseClient();
      const { data, error } = await client.from("projects").select("id,name,prompt,settings,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100);
      if (error) throw error;
      loadedDramaProjects = (data || []).filter(project => project.settings && project.settings.dramaAI && Array.isArray(project.settings.dramaAI.scenes));
      list.replaceChildren();
      if (!loadedDramaProjects.length) { list.textContent = dramaLanguage() === "en" ? "No saved Drama projects yet." : dramaLanguage() === "ms" ? "Belum ada projek Drama tersimpan." : "Belum ada proyek Drama tersimpan."; return; }
      loadedDramaProjects.forEach(project => {
        const row = document.createElement("div"); row.className = "drama-card"; row.style.marginTop = "8px";
        const title = document.createElement("strong"); title.textContent = project.name || "Drama Baru";
        const locale = dramaLanguage() === "en" ? "en-US" : dramaLanguage() === "ms" ? "ms-MY" : "id-ID";
        const sceneWord = dramaLanguage() === "en" ? "scenes" : "scene";
        const meta = document.createElement("div"); meta.className = "drama-muted"; meta.textContent = `${project.settings.dramaAI.scenes.length} ${sceneWord} · ${project.updated_at ? new Date(project.updated_at).toLocaleString(locale) : (dramaLanguage() === "en" ? "date unavailable" : dramaLanguage() === "ms" ? "tarikh tidak tersedia" : "tanggal tidak tersedia")}`;
        const open = document.createElement("button"); open.type = "button"; open.className = "primary"; open.textContent = dramaLanguage() === "en" ? "Open Project" : dramaLanguage() === "ms" ? "Buka Projek" : "Buka Proyek"; open.style.marginTop = "8px";
        open.addEventListener("click", () => openDramaProject(project));
        row.append(title, meta, open); list.appendChild(row);
      });
    } catch (error) {
      list.textContent = error.message || (dramaLanguage() === "en" ? "Failed to load Drama projects." : dramaLanguage() === "ms" ? "Gagal memuatkan projek Drama." : "Gagal memuat proyek Drama.");
    }
  }
  function openDramaProject(project) {
    const settings = project.settings || {};
    const drama = settings.dramaAI || {};
    currentProjectId = project.id;
    const sourceScenes = Array.isArray(drama.scenes) && drama.scenes.length ? drama.scenes : [{ prompt: project.prompt || "", model: DEFAULT_DRAMA_MODEL, duration: 10, ratio: "16:9", resolution: "480p", characterReferenceIds: [], locationReferenceIds: [] }];
    let adjustedLegacyRatios = 0;
    const normalizedScenes = sourceScenes.map(scene => {
      const savedRatio = scene.ratio;
      const normalizedRatio = ["16:9", "9:16"].includes(savedRatio) ? savedRatio : "16:9";
      if (savedRatio !== normalizedRatio) adjustedLegacyRatios += 1;
      return {
        prompt: String(scene.prompt || ""),
        model: DRAMA_MODELS[scene.model] ? scene.model : DEFAULT_DRAMA_MODEL,
        duration: Number(scene.duration || 10),
        ratio: normalizedRatio,
        resolution: scene.resolution || modelConfig(scene.model).defaultResolution,
        characterReferenceIds: Array.isArray(scene.characterReferenceIds) ? scene.characterReferenceIds.map(String) : [],
        locationReferenceIds: Array.isArray(scene.locationReferenceIds) ? scene.locationReferenceIds.map(String) : []
      };
    });
    state = {
      mode: drama.mode || "manual", title: project.name || "Drama Baru", genre: drama.genre || "Petualangan",
      premise: drama.premise || "", continuity: drama.continuity || "", originalSettings: settings,
      references: {
        character: drama.referenceImages?.character ?? "",
        location: drama.referenceImages?.location ?? ""
      },
      scenes: normalizedScenes
    };
    activeIndex = Math.max(0, Math.min(Number(settings.activeSceneIndex || 0), state.scenes.length - 1));
    showEditor();
    if (adjustedLegacyRatios > 0) {
      const notice = `Proyek dibuka. ${adjustedLegacyRatios} Scene memakai rasio lama selain 16:9/9:16; rasio tersebut disesuaikan ke 16:9.`;
      void saveProject(true).then(saved => {
        setStatus(saved ? `${notice} Perubahan sudah disimpan.` : `${notice} Penyimpanan otomatis gagal; tekan Simpan Proyek.`);
      });
    } else {
      setStatus(`Proyek dibuka: ${state.title}.`);
    }
  }
  async function openProjectById(projectId) {
    const user = await getSession();
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("projects")
      .select("id,name,prompt,settings,updated_at")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Proyek tidak ditemukan atau bukan milik akun ini.");
    if (!data.settings?.dramaAI || !Array.isArray(data.settings.dramaAI.scenes)) {
      throw new Error("Proyek ini bukan proyek Drama AI.");
    }

    // Flush pending autosave for the currently open Drama before switching projects.
    if (currentProjectId && currentProjectId !== data.id) {
      clearTimeout(saveTimer);
      saveTimer = null;
      syncActiveEditor();
      const saved = await saveProject(true);
      if (!saved) throw new Error("Proyek sebelumnya gagal disimpan; proyek lain tidak dibuka agar perubahanmu tidak hilang.");
    } else {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    openDramaProject(data);
    setStatus(`Proyek dibuka: ${data.name || "Drama Baru"}.`);
    return true;
  }
  function init() {
    const main = document.querySelector("main.main");
    if (!main || document.getElementById("dramaPage")) return;
    const style = document.createElement("style"); style.textContent = STYLE; document.head.appendChild(style);
    page = document.createElement("section"); page.id = "dramaPage"; page.style.display = "none";
    main.appendChild(page);
    showChoiceScreen();
  }
  window.addEventListener("movira:languagechange", () => {
    if (!page) return;
    const screen = page.dataset.screen || "choice";
    if (screen === "editor") {
      syncActiveEditor();
      showEditor();
    } else if (screen === "setup") {
      syncSetupFields();
      showSetupScreen();
    } else {
      showChoiceScreen();
      if (loadedDramaProjects.length) void loadDramaProjects();
    }
  });
  window.moviraDramaAI = {
    onOpen() { if (page?.querySelector("#dramaProjectList")) void loadDramaProjects(); },
    openProjectById
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
