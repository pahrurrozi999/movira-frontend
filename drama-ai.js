/* Movira AI - Drama AI workspace.
 * Scene planning, model selection and reference selection are local/project features.
 * Video generation remains intentionally locked pending integration and billing verification.
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
  function estimateSceneCredits(modelId, resolution, duration, ratio) {
    const config = modelConfig(modelId);
    let usd;
    if (config.pricing === "seedance") {
      // Seedance 2.5 Flash: output pixels × seconds × 24 FPS / 1024 tokens.
      // Images are the only references sent by Drama AI; fal documents image references as free.
      // Endpoint-specific public price: USD 0.014 per 1,000 output tokens.
      const pixels = resolution === "480p" ? 864 * 496 : 1280 * 720;
      const tokens = Math.ceil((pixels * Number(duration) * 24) / 1024);
      usd = (tokens / 1000) * 0.014;
    } else {
      const rate = config.pricing[resolution];
      if (!Number.isFinite(rate)) return null;
      usd = rate * Number(duration);
    }
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return Math.ceil(usd * 100 * 1.30);
  }

  function freshState() {
    return {
      mode: "manual", title: "Drama Baru", genre: "Petualangan", premise: "", continuity: "",
      references: { character: [], location: [] },
      scenes: [{ prompt: "", model: DEFAULT_DRAMA_MODEL, duration: 10, ratio: "16:9", resolution: "480p", characterReferenceIds: [], locationReferenceIds: [] }]
    };
  }
  function selectedText(el) { return el ? String(el.value || "") : ""; }
  function setStatus(message) { if (statusEl) statusEl.textContent = message; }
  function getActiveScene() {
    if (!state.scenes.length) state.scenes.push({ prompt:"", model: DEFAULT_DRAMA_MODEL, duration:10, ratio:"16:9", resolution:"480p", characterReferenceIds: [], locationReferenceIds: [] });
    activeIndex = Math.max(0, Math.min(activeIndex, state.scenes.length - 1));
    const scene = state.scenes[activeIndex];
    if (!DRAMA_MODELS[scene.model]) scene.model = DEFAULT_DRAMA_MODEL;
    if (!scene.duration) scene.duration = 10;
    if (!scene.ratio) scene.ratio = "16:9";
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
    if (ratio) scene.ratio = ratio.value;
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
    page.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><div class="drama-muted">MOVIRA AI · KHUSUS CERITA BERSERI</div><h2 style="margin:6px 0">🎬 Drama AI</h2><div class="drama-muted">Masukkan cerita dari tool pilihanmu, susun menjadi scene, lalu pilih referensi karakter dan lokasi untuk setiap scene.</div></div>
        <button type="button" id="dramaLoadProjectsBtn">📁 Proyek Drama Tersimpan</button>
      </div>
      <div class="drama-grid" style="margin-top:16px">
        <button type="button" id="dramaStoryChoice" class="primary" style="text-align:left;min-height:125px"><strong>📖 Masukkan Prompt Cerita</strong><div class="drama-muted" style="margin-top:8px;color:#e6eaff">Tempel cerita yang sudah dibuat di ChatGPT, Gemini, atau tool lain. Movira tidak memanggil API AI.</div></button>
        <button type="button" id="dramaManualChoice" style="text-align:left;min-height:125px"><strong>✍️ Buat Storyboard Manual</strong><div class="drama-muted" style="margin-top:8px">Mulai dari editor kosong dan tulis prompt setiap scene sendiri.</div></button>
      </div>
      <div class="drama-card drama-warning"><strong>Catatan</strong><div class="drama-muted" style="color:#ffe4a3;margin-top:5px">Pembuatan cerita dilakukan di luar Movira. Menempel cerita dan menyimpan proyek tidak memakai API berbayar. Tombol Buat Video tetap terkunci.</div></div>
      <div class="drama-card"><strong>Proyek Drama</strong><div id="dramaProjectList" class="drama-muted" style="margin-top:8px">Tekan “Proyek Drama Tersimpan” untuk memuat proyek milik akunmu.</div></div>
      <div class="drama-status" id="dramaStatus" role="status" aria-live="polite"></div>
    `;
    statusEl = page.querySelector("#dramaStatus");
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
    page.innerHTML = `
      <button type="button" id="dramaBackBtn">← Kembali</button>
      <h2 style="margin-bottom:4px">📖 Masukkan Prompt Cerita</h2>
      <div class="drama-muted">Buat cerita di tool pilihanmu, lalu salin dan tempel seluruh cerita di bawah. Movira akan membantu membaginya menjadi scene untuk diedit.</div>
      <div class="drama-card">
        <label for="dramaTitle">Nama drama</label><input id="dramaTitle" maxlength="100" value="Drama Baru">
        <label for="dramaGenre">Genre</label><select id="dramaGenre"><option>Petualangan</option><option>Komedi</option><option>Fantasi</option><option>Persahabatan</option><option>Misteri</option><option>Drama keluarga</option><option>Aksi</option></select>
        <label for="dramaPremise">Sinopsis / ringkasan cerita (opsional)</label><textarea id="dramaPremise" rows="3" placeholder="Ringkasan singkat cerita…"></textarea>
        <label for="dramaContinuity">Panduan konsistensi karakter dan dunia (opsional)</label><textarea id="dramaContinuity" rows="3" placeholder="Deskripsi karakter, pakaian, lokasi, dan gaya visual."></textarea>
        <label for="dramaStoryText">Tempel seluruh cerita atau prompt di sini</label><textarea id="dramaStoryText" rows="12" placeholder="Tempel cerita lengkap di sini. Jika ada judul Scene 1, Scene 2, dan seterusnya, Movira akan menggunakannya sebagai pemisah. Jika tidak, paragraf akan dijadikan scene."></textarea>
        <div class="drama-actions"><button type="button" class="primary" id="dramaImportStoryBtn">Bagi Cerita Menjadi Scene</button><button type="button" id="dramaBlankEditorBtn">Buka Editor Kosong</button></div>
        <div class="drama-muted" style="margin-top:8px">Setelah masuk editor, periksa dan edit prompt tiap scene. Kamu tetap bisa menambah atau menghapus scene.</div>
      </div>
      <div class="drama-status" id="dramaStatus" role="status" aria-live="polite"></div>
    `;
    statusEl = page.querySelector("#dramaStatus");
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
    page.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div class="drama-muted">DRAMA WORKSPACE</div><h2 style="margin:4px 0">Editor Adegan</h2></div><button type="button" id="dramaBackHomeBtn">← Beranda Drama AI</button></div>
      <div class="drama-card">
        <div class="drama-grid"><div><label for="dramaTitle">Nama drama / proyek</label><input id="dramaTitle" maxlength="100"></div><div><label for="dramaGenre">Genre</label><select id="dramaGenre"><option>Petualangan</option><option>Komedi</option><option>Fantasi</option><option>Persahabatan</option><option>Misteri</option><option>Drama keluarga</option><option>Aksi</option></select></div></div>
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
        <div class="drama-actions"><button type="button" class="primary" id="dramaSaveBtn">Simpan ke Projects</button><button type="button" id="dramaSaveNewBtn">Simpan sebagai Proyek Baru</button><button type="button" id="dramaGenerateBtn" disabled title="Dinonaktifkan sampai endpoint dan biaya kredit disetujui">🔒 Buat Video (belum aktif)</button></div>
        <div class="drama-muted" style="margin-top:8px">Simpan otomatis aktif sesudah proyek memiliki ID. Generasi video belum aktif sehingga adegan tidak akan mengirim permintaan berbayar.</div>
      </div>
      <div class="drama-card"><strong>Proyek Drama tersimpan</strong><div id="dramaProjectList" class="drama-muted" style="margin-top:8px">Memuat daftar proyek…</div></div>
      <div class="drama-status" id="dramaStatus" role="status" aria-live="polite"></div>
    `;
    statusEl = page.querySelector("#dramaStatus");
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
    page.querySelector("#dramaSceneRatio").value = getActiveScene().ratio || "16:9";
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
      option.textContent = `${value} detik`;
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
    info.textContent = `${config.label}. Mendukung beberapa gambar referensi; batas aplikasi Drama AI: maksimal ${config.maxImages} gambar untuk satu Scene. ` +
      (config.imageLimitNote || "Batas endpoint yang didokumentasikan: maksimal 10 gambar referensi.") +
      " Video/audio referensi belum disediakan di editor Drama AI.";
    if (count === 0) {
      validation.textContent = "Pilih minimal satu gambar karakter atau lokasi untuk Scene ini sebelum generasi nanti diaktifkan.";
    } else if (count > config.maxImages) {
      validation.textContent = `Terlalu banyak gambar: ${count} dipilih, sedangkan batas Scene adalah ${config.maxImages}. Kurangi pilihan gambar sebelum generasi diaktifkan.`;
    } else {
      validation.textContent = `${count} gambar dipilih. Jumlah ini sesuai dengan batas Scene untuk model yang dipilih.`;
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
      box.textContent = "Estimasi kredit belum tersedia untuk kombinasi pengaturan ini.";
      return;
    }
    box.textContent = `Estimasi biaya output: sekitar ${credits.toLocaleString("id-ID")} Kredit untuk ${duration} detik ${resolution}. Perhitungan memakai biaya API yang dipublikasikan × 100 Kredit/USD × markup 30%; biaya aktual dapat berubah. Generator masih terkunci dan belum ada debit kredit.`;
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
      remove.textContent = "Hapus Gambar";
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
        box.textContent = `Belum ada gambar ${kind === "character" ? "karakter" : "lokasi"}. Unggah gambar proyek atau gambar khusus scene ini.`;
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
          empty.textContent = "Belum ada gambar yang dipilih untuk scene ini.";
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
      if (!loadedDramaProjects.length) { list.textContent = "Belum ada proyek Drama tersimpan."; return; }
      loadedDramaProjects.forEach(project => {
        const row = document.createElement("div"); row.className = "drama-card"; row.style.marginTop = "8px";
        const title = document.createElement("strong"); title.textContent = project.name || "Drama Baru";
        const meta = document.createElement("div"); meta.className = "drama-muted"; meta.textContent = `${project.settings.dramaAI.scenes.length} scene · ${project.updated_at ? new Date(project.updated_at).toLocaleString("id-ID") : "tanggal tidak tersedia"}`;
        const open = document.createElement("button"); open.type = "button"; open.className = "primary"; open.textContent = "Buka Proyek"; open.style.marginTop = "8px";
        open.addEventListener("click", () => openDramaProject(project));
        row.append(title, meta, open); list.appendChild(row);
      });
    } catch (error) {
      list.textContent = error.message || "Gagal memuat proyek Drama.";
    }
  }
  function openDramaProject(project) {
    const settings = project.settings || {};
    const drama = settings.dramaAI || {};
    currentProjectId = project.id;
    state = {
      mode: drama.mode || "manual", title: project.name || "Drama Baru", genre: drama.genre || "Petualangan",
      premise: drama.premise || "", continuity: drama.continuity || "", originalSettings: settings,
      references: {
        character: drama.referenceImages?.character ?? "",
        location: drama.referenceImages?.location ?? ""
      },
      scenes: Array.isArray(drama.scenes) && drama.scenes.length ? drama.scenes.map(scene => ({ prompt: String(scene.prompt || ""), model: DRAMA_MODELS[scene.model] ? scene.model : DEFAULT_DRAMA_MODEL, duration: Number(scene.duration || 10), ratio: scene.ratio || "16:9", resolution: scene.resolution || modelConfig(scene.model).defaultResolution, characterReferenceIds: Array.isArray(scene.characterReferenceIds) ? scene.characterReferenceIds.map(String) : [], locationReferenceIds: Array.isArray(scene.locationReferenceIds) ? scene.locationReferenceIds.map(String) : [] })) : [{ prompt: project.prompt || "", model: DEFAULT_DRAMA_MODEL, duration:10, ratio:"16:9", resolution:"480p", characterReferenceIds: [], locationReferenceIds: [] }]
    };
    activeIndex = Math.max(0, Math.min(Number(settings.activeSceneIndex || 0), state.scenes.length - 1));
    showEditor(); setStatus(`Proyek dibuka: ${state.title}.`);
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
  window.moviraDramaAI = {
    onOpen() { if (page?.querySelector("#dramaProjectList")) void loadDramaProjects(); },
    openProjectById
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
