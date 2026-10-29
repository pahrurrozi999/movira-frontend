/* Movira AI - Drama AI workspace.
 * Story outlining here is a local scaffold, not an AI-model call. Video generation stays disabled
 * until Seedance 2.5 credit pricing is reviewed and explicitly enabled on the backend.
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
    @media(max-width:520px){ #dramaPage .drama-actions button { flex:1 1 auto; } }
  `;
  let page, statusEl, currentProjectId = null, activeIndex = 0, saveTimer = null;
  let state = freshState();
  let loadedDramaProjects = [];

  function freshState() {
    return {
      mode: "manual", title: "Drama Baru", genre: "Petualangan", premise: "", continuity: "",
      scenes: [{ prompt: "", duration: 10, ratio: "16:9", resolution: "480p" }]
    };
  }
  function selectedText(el) { return el ? String(el.value || "") : ""; }
  function setStatus(message) { if (statusEl) statusEl.textContent = message; }
  function getActiveScene() {
    if (!state.scenes.length) state.scenes.push({ prompt:"", duration:10, ratio:"16:9", resolution:"480p" });
    activeIndex = Math.max(0, Math.min(activeIndex, state.scenes.length - 1));
    return state.scenes[activeIndex];
  }
  function syncActiveEditor() {
    const scene = getActiveScene();
    const prompt = page.querySelector("#dramaScenePrompt");
    const duration = page.querySelector("#dramaSceneDuration");
    const ratio = page.querySelector("#dramaSceneRatio");
    const resolution = page.querySelector("#dramaSceneResolution");
    if (prompt) scene.prompt = prompt.value;
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
  }
  function scheduleSave() {
    if (!currentProjectId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void saveProject(true); }, 1300);
  }
  function showChoiceScreen() {
    page.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><div class="drama-muted">MOVIRA AI · KHUSUS CERITA BERSERI</div><h2 style="margin:6px 0">🎬 Drama AI</h2><div class="drama-muted">Susun cerita per adegan, simpan ke Projects, lalu siapkan video setelah biaya dan endpoint diverifikasi.</div></div>
        <button type="button" id="dramaLoadProjectsBtn">📁 Proyek Drama Tersimpan</button>
      </div>
      <div class="drama-grid" style="margin-top:16px">
        <button type="button" id="dramaAIChoice" class="primary" style="text-align:left;min-height:125px"><strong>✨ Buat Cerita dengan AI</strong><div class="drama-muted" style="margin-top:8px;color:#e6eaff">Siapkan premis, genre, dan kerangka adegan. Penyusun cerita AI otomatis belum tersambung pada tahap ini.</div></button>
        <button type="button" id="dramaManualChoice" style="text-align:left;min-height:125px"><strong>✍️ Gunakan Prompt Sendiri</strong><div class="drama-muted" style="margin-top:8px">Masukkan prompt buatanmu sendiri. Prompt tidak akan ditimpa AI.</div></button>
      </div>
      <div class="drama-card drama-warning"><strong>Catatan biaya</strong><div class="drama-muted" style="color:#ffe4a3;margin-top:5px">Buat dan simpan proyek saat ini tidak menjalankan fal.ai. Pembuatan video sengaja belum aktif sampai skema kredit Seedance 2.5 disetujui.</div></div>
      <div class="drama-card"><strong>Proyek Drama</strong><div id="dramaProjectList" class="drama-muted" style="margin-top:8px">Tekan “Proyek Drama Tersimpan” untuk memuat proyek milik akunmu.</div></div>
      <div class="drama-status" id="dramaStatus" role="status" aria-live="polite"></div>
    `;
    statusEl = page.querySelector("#dramaStatus");
    page.querySelector("#dramaAIChoice").addEventListener("click", () => { state = freshState(); state.mode = "ai-draft"; showSetupScreen(); });
    page.querySelector("#dramaManualChoice").addEventListener("click", () => { state = freshState(); state.mode = "manual"; showEditor(); });
    page.querySelector("#dramaLoadProjectsBtn").addEventListener("click", loadDramaProjects);
  }
  function showSetupScreen() {
    page.innerHTML = `
      <button type="button" id="dramaBackBtn">← Kembali</button>
      <h2 style="margin-bottom:4px">✨ Rancang Cerita</h2>
      <div class="drama-muted">Isi data cerita. Tombol di bawah membuat kerangka lokal sederhana sebagai titik awal, bukan panggilan ke model AI.</div>
      <div class="drama-card">
        <label for="dramaTitle">Nama drama</label><input id="dramaTitle" maxlength="100" value="Drama Baru">
        <label for="dramaGenre">Genre</label><select id="dramaGenre"><option>Petualangan</option><option>Komedi</option><option>Fantasi</option><option>Persahabatan</option><option>Misteri</option><option>Drama keluarga</option><option>Aksi</option></select>
        <label for="dramaPremise">Ide atau premis cerita</label><textarea id="dramaPremise" rows="4" placeholder="Contoh: Sekelompok teman menemukan peta misterius di taman…"></textarea>
        <label for="dramaContinuity">Panduan konsistensi karakter dan dunia (opsional)</label><textarea id="dramaContinuity" rows="3" placeholder="Deskripsi karakter, pakaian, lokasi, dan gaya visual. Disimpan terpisah dari prompt scene."></textarea>
        <label for="dramaSceneCount">Jumlah adegan pada kerangka awal</label><select id="dramaSceneCount"><option value="3">3 adegan</option><option value="4" selected>4 adegan</option><option value="5">5 adegan</option><option value="6">6 adegan</option></select>
        <div class="drama-actions"><button type="button" class="primary" id="dramaBuildOutlineBtn">Buat Kerangka Lokal</button><button type="button" id="dramaBlankEditorBtn">Lanjut ke editor kosong</button></div>
      </div>
      <div class="drama-status" id="dramaStatus" role="status" aria-live="polite"></div>
    `;
    statusEl = page.querySelector("#dramaStatus");
    page.querySelector("#dramaBackBtn").addEventListener("click", showChoiceScreen);
    page.querySelector("#dramaBlankEditorBtn").addEventListener("click", () => { syncSetupFields(); showEditor(); });
    page.querySelector("#dramaBuildOutlineBtn").addEventListener("click", () => {
      syncSetupFields();
      const premise = state.premise.trim();
      if (!premise) { setStatus("Isi ide atau premis cerita terlebih dahulu."); page.querySelector("#dramaPremise").focus(); return; }
      const count = Number(page.querySelector("#dramaSceneCount").value);
      const arc = [
        ["Pembuka", `Perkenalkan dunia dan karakter utama dalam cerita: ${premise}. Bangun suasana ${state.genre.toLowerCase()} dan tunjukkan tujuan awal karakter.`],
        ["Pemicu cerita", `Sebuah kejadian mengubah keadaan dalam cerita: ${premise}. Tunjukkan reaksi karakter dan alasan mereka harus bertindak.`],
        ["Upaya dan tantangan", `Karakter mencoba menyelesaikan masalah dari cerita: ${premise}. Tampilkan tindakan yang jelas, hambatan, dan perkembangan emosi.`],
        ["Titik balik", `Tunjukkan keputusan penting atau kejutan yang mengubah arah cerita: ${premise}. Jaga hubungan sebab-akibat dengan adegan sebelumnya.`],
        ["Klimaks", `Karakter menghadapi tantangan terbesar yang berkaitan dengan: ${premise}. Tunjukkan aksi utama dan hasil yang bisa dipahami penonton.`],
        ["Penutup", `Tutup cerita ${premise} dengan resolusi yang terasa tuntas, tunjukkan perubahan karakter, dan akhiri dengan gambar penutup yang kuat.`]
      ];
      state.scenes = arc.slice(0, count).map((item, index) => ({ prompt: `${item[0]}: ${item[1]}`, duration: 10, ratio: "16:9", resolution: "480p" }));
      activeIndex = 0;
      showEditor();
      setStatus("Kerangka lokal dibuat. Ini bukan hasil model AI; edit semua prompt sesuai kebutuhanmu.");
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
      <div class="drama-card"><strong>Daftar adegan</strong><div class="drama-scene-tabs" id="dramaSceneTabs" style="margin-top:10px"></div><div class="drama-actions"><button type="button" id="dramaAddSceneBtn">＋ Tambah Scene</button><button type="button" id="dramaDeleteSceneBtn">Hapus Scene Aktif</button></div></div>
      <div class="drama-card">
        <strong id="dramaActiveSceneTitle">Scene 1</strong>
        <label for="dramaScenePrompt">Prompt scene (tetap bisa kamu edit)</label><textarea id="dramaScenePrompt" rows="7" placeholder="Tulis prompt video untuk scene ini…"></textarea>
        <div class="drama-grid"><div><label for="dramaSceneDuration">Durasi</label><select id="dramaSceneDuration"><option value="10">10 detik</option><option value="15">15 detik</option><option value="30">30 detik</option></select></div><div><label for="dramaSceneRatio">Rasio</label><select id="dramaSceneRatio"><option value="16:9">16:9</option><option value="9:16">9:16</option></select></div><div><label for="dramaSceneResolution">Resolusi</label><select id="dramaSceneResolution"><option value="480p">480p</option><option value="720p">720p</option></select></div></div>
        <div id="dramaCostEstimate" class="drama-muted" style="margin-top:10px"></div>
        <div class="drama-actions"><button type="button" class="primary" id="dramaSaveBtn">Simpan ke Projects</button><button type="button" id="dramaSaveNewBtn">Simpan sebagai Proyek Baru</button><button type="button" id="dramaGenerateBtn" disabled title="Dinonaktifkan sampai endpoint dan biaya kredit disetujui">🔒 Buat Video (belum aktif)</button></div>
        <div class="drama-muted" style="margin-top:8px">Simpan otomatis aktif sesudah proyek memiliki ID. Generasi video belum aktif sehingga adegan tidak akan mengirim permintaan berbayar.</div>
      </div>
      <div class="drama-card"><strong>Proyek Drama tersimpan</strong><div id="dramaProjectList" class="drama-muted" style="margin-top:8px">Memuat daftar proyek…</div></div>
      <div class="drama-status" id="dramaStatus" role="status" aria-live="polite"></div>
    `;
    statusEl = page.querySelector("#dramaStatus");
    page.querySelector("#dramaBackHomeBtn").addEventListener("click", showChoiceScreen);
    const title = page.querySelector("#dramaTitle"); title.value = state.title;
    const genre = page.querySelector("#dramaGenre"); genre.value = state.genre;
    page.querySelector("#dramaPremise").value = state.premise;
    page.querySelector("#dramaContinuity").value = state.continuity;
    page.querySelector("#dramaScenePrompt").value = getActiveScene().prompt;
    page.querySelector("#dramaSceneDuration").value = String(getActiveScene().duration || 10);
    page.querySelector("#dramaSceneRatio").value = getActiveScene().ratio || "16:9";
    page.querySelector("#dramaSceneResolution").value = getActiveScene().resolution || "480p";
    const autosaveEvents = ["input", "change"];
    for (const id of ["dramaTitle","dramaGenre","dramaPremise","dramaContinuity","dramaScenePrompt","dramaSceneDuration","dramaSceneRatio","dramaSceneResolution"]) {
      const el = page.querySelector(`#${id}`);
      autosaveEvents.forEach(type => el.addEventListener(type, () => { syncActiveEditor(); renderSceneTabs(); updateCostEstimate(); scheduleSave(); }));
    }
    page.querySelector("#dramaScenePrompt").addEventListener("input", () => { syncActiveEditor(); scheduleSave(); });
    page.querySelector("#dramaAddSceneBtn").addEventListener("click", () => { syncActiveEditor(); state.scenes.push({ prompt:"", duration:10, ratio:"16:9", resolution:"480p" }); activeIndex = state.scenes.length - 1; showEditor(); setStatus("Scene ditambahkan."); scheduleSave(); });
    page.querySelector("#dramaDeleteSceneBtn").addEventListener("click", () => {
      if (state.scenes.length <= 1) { setStatus("Drama harus memiliki minimal satu scene."); return; }
      syncActiveEditor(); state.scenes.splice(activeIndex, 1); activeIndex = Math.min(activeIndex, state.scenes.length - 1); showEditor(); setStatus("Scene dihapus dari draf. Simpan proyek untuk menerapkan perubahan."); scheduleSave();
    });
    page.querySelector("#dramaSaveBtn").addEventListener("click", () => saveProject(false));
    page.querySelector("#dramaSaveNewBtn").addEventListener("click", () => { currentProjectId = null; void saveProject(false); });
    renderSceneTabs(); updateCostEstimate();
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
  function updateCostEstimate() {
    const box = page?.querySelector("#dramaCostEstimate");
    if (!box) return;
    box.textContent = "Tarif fal.ai/Seedance 2.5 dan biaya Kredit Movira belum diverifikasi. Durasi, rasio, dan resolusi di layar ini masih berupa pengaturan draf; tidak ada video yang dikirim.";
  }
  async function getSession() {
    if (typeof moviraSupabase === "undefined") throw new Error("Supabase belum siap.");
    const { data, error } = await moviraSupabase.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) throw new Error("Silakan login terlebih dahulu untuk menyimpan proyek Drama.");
    return data.session.user;
  }
  function buildSettings() {
    syncActiveEditor();
    return {
      ...(state.originalSettings || {}),
      dramaAI: {
        version: 1, mode: state.mode, genre: state.genre, premise: state.premise,
        continuity: state.continuity,
        scenes: state.scenes.map(scene => ({ prompt: String(scene.prompt || ""), duration: Number(scene.duration || 10), ratio: scene.ratio || "16:9", resolution: scene.resolution || "480p" }))
      },
      activeSceneIndex: activeIndex,
      workspaceScenes: state.scenes.map(scene => ({ prompt: String(scene.prompt || ""), settings: { duration: Number(scene.duration || 10), ratio: scene.ratio || "16:9", resolution: scene.resolution || "480p" } }))
    };
  }
  async function saveProject(automatic = false) {
    try {
      const user = await getSession();
      syncActiveEditor();
      state.title = state.title.trim() || "Drama Baru";
      const settings = buildSettings();
      const prompt = state.scenes[0]?.prompt || state.premise || "";
      let result;
      if (currentProjectId) {
        result = await moviraSupabase.from("projects").update({ name: state.title, prompt, settings, status: "draft", updated_at: new Date().toISOString() }).eq("id", currentProjectId).eq("user_id", user.id).select("id,name,settings,updated_at").single();
      } else {
        result = await moviraSupabase.from("projects").insert({ user_id: user.id, name: state.title, prompt, settings, status: "draft", updated_at: new Date().toISOString() }).select("id,name,settings,updated_at").single();
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
      const { data, error } = await moviraSupabase.from("projects").select("id,name,prompt,settings,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100);
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
      scenes: Array.isArray(drama.scenes) && drama.scenes.length ? drama.scenes.map(scene => ({ prompt: String(scene.prompt || ""), duration: Number(scene.duration || 10), ratio: scene.ratio || "16:9", resolution: scene.resolution || "480p" })) : [{ prompt: project.prompt || "", duration:10, ratio:"16:9", resolution:"480p" }]
    };
    activeIndex = Math.max(0, Math.min(Number(settings.activeSceneIndex || 0), state.scenes.length - 1));
    showEditor(); setStatus(`Proyek dibuka: ${state.title}.`);
  }
  async function openProjectById(projectId) {
    const user = await getSession();
    const { data, error } = await moviraSupabase
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
