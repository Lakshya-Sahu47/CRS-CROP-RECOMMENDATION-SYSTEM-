/* ═══════════════════════════════════════════════════════════
   AgroSense — Smart Farming Dashboard  |  script.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════════════════════
// API BASE URL  — same-origin (Flask serves this file)
// ══════════════════════════════════════════════════════════
const API_BASE = '';

// ══════════════════════════════════════════════════════════
// PAGE ROUTING
// ══════════════════════════════════════════════════════════
const pages   = document.querySelectorAll('.page');
const navTabs = document.querySelectorAll('.nav-tab');

function showPage(id) {
  pages.forEach(p   => p.classList.remove('active'));
  navTabs.forEach(t => t.classList.remove('active'));

  const page = document.getElementById('page-' + id);
  const tab  = document.querySelector(`[data-page="${id}"]`);
  if (page) page.classList.add('active');
  if (tab)  tab.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navTabs.forEach(tab => {
  tab.addEventListener('click', () => showPage(tab.dataset.page));
});


// ══════════════════════════════════════════════════════════
// THEME SWITCHER
// ══════════════════════════════════════════════════════════
const htmlEl       = document.documentElement;
const themePanel   = document.getElementById('themePanel');
const themeToggle  = document.getElementById('themeToggle');
const themeToggle2 = document.getElementById('themeToggle2');
const tpOptions    = document.querySelectorAll('.tp-option');

const savedTheme = localStorage.getItem('agro-theme') || 'forest';
applyTheme(savedTheme);

[themeToggle, themeToggle2].forEach(btn => {
  btn?.addEventListener('click', e => {
    e.stopPropagation();
    themePanel.classList.toggle('open');
  });
});

document.addEventListener('click', e => {
  if (!e.target.closest('.theme-panel-wrap')) themePanel.classList.remove('open');
});

tpOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    applyTheme(opt.dataset.t);
    localStorage.setItem('agro-theme', opt.dataset.t);
    themePanel.classList.remove('open');
  });
});

function applyTheme(t) {
  htmlEl.setAttribute('data-theme', t);
  tpOptions.forEach(o => o.classList.toggle('active', o.dataset.t === t));
}


// ══════════════════════════════════════════════════════════
// STATUS POLLING
// ══════════════════════════════════════════════════════════
const sensorPill = document.getElementById('sensorPill');
const modelPill  = document.getElementById('modelPill');
let sensorOnline = false;

async function checkStatus() {
  try {
    const data = await fetchJSON(`${API_BASE}/api/status`);

    if (data.sensor_connected) {
      sensorPill.textContent = '📡 ESP8266 Online';
      sensorPill.className   = 's-pill on';
      document.getElementById('cropManualSection').style.display = 'none';
      sensorOnline = true;
    } else {
      sensorPill.textContent = '📡 ESP8266 Offline';
      sensorPill.className   = 's-pill off';
      document.getElementById('cropManualSection').style.display = 'block';
      sensorOnline = false;
    }

    if (data.crop_model_loaded && data.soil_model_loaded && data.disease_model_loaded) {
      modelPill.textContent = '🤖 AI Ready';
      modelPill.className   = 's-pill rdy';
    } else {
      const m = [];
      if (!data.crop_model_loaded)    m.push('Crop');
      if (!data.soil_model_loaded)    m.push('Soil CNN');
      if (!data.disease_model_loaded) m.push('Disease CNN');
      modelPill.textContent = `⚠️ Missing: ${m.join(', ')}`;
      modelPill.className   = 's-pill off';
    }
  } catch {
    sensorPill.textContent = '⚠️ Server Offline';
    sensorPill.className   = 's-pill off';
  }
}


// ══════════════════════════════════════════════════════════
// LIVE SENSOR POLLING
// ══════════════════════════════════════════════════════════
async function pollSensor() {
  try {
    const data = await fetchJSON(`${API_BASE}/api/live-sensor`);
    if (data.temperature != null) {
      setText('h-temp',   data.temperature.toFixed(1));
      setText('h-hum',    data.humidity.toFixed(1));
      setText('h-update', new Date(data.timestamp).toLocaleTimeString());
    }
  } catch {}
}

async function pollRainfall(city) {
  try {
    const url  = city ? `${API_BASE}/api/weather?city=${encodeURIComponent(city)}` : `${API_BASE}/api/weather`;
    const data = await fetchJSON(url);
    setText('h-rain', data.rainfall_mm.toFixed(1));
  } catch {}
}


// ══════════════════════════════════════════════════════════
// GEOLOCATION
// ══════════════════════════════════════════════════════════
function setupGeolocation(btnId, inputId, msgId, onSuccess) {
  const btn   = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  const msg   = document.getElementById(msgId);
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!navigator.geolocation) { setMsg(msg, 'Geolocation not supported.', 'err'); return; }

    btn.disabled = true;
    btn.textContent = '⏳';
    setMsg(msg, 'Requesting location…', '');

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setMsg(msg, `Got coords (${lat.toFixed(2)}, ${lon.toFixed(2)})…`, '');
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`);
          const data = await res.json();
          const addr = data.address || {};
          const city = addr.city || addr.town || addr.village || addr.county || addr.state || 'Unknown';
          input.value = city;
          setMsg(msg, `✅ Set to: ${city}`, 'ok');
          if (onSuccess) onSuccess(city);
        } catch {
          input.value = `${lat.toFixed(4)},${lon.toFixed(4)}`;
          setMsg(msg, '⚠️ Reverse geocode failed — using coordinates.', 'err');
        }
        btn.disabled = false;
        btn.textContent = '📡 Detect';
      },
      err => {
        const msgs = { 1: '🚫 Permission denied.', 2: '⚠️ Position unavailable.', 3: '⏱️ Timed out.' };
        setMsg(msg, msgs[err.code] || 'Location error.', 'err');
        btn.disabled = false;
        btn.textContent = '📡 Detect';
      },
      { timeout: 10000 }
    );
  });
}

setupGeolocation('cropLocBtn', 'cropCity', 'cropLocMsg', city => pollRainfall(city));


// ══════════════════════════════════════════════════════════
// SOIL IMAGE UPLOADS (all three pages)
// ══════════════════════════════════════════════════════════
function setupUploadZone(zoneId, fileId, previewId, phId, onFile) {
  const zone    = document.getElementById(zoneId);
  const fileIn  = document.getElementById(fileId);
  const preview = document.getElementById(previewId);
  const ph      = document.getElementById(phId);
  if (!zone) return;

  zone.addEventListener('click', () => fileIn.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) handleFile(fileIn.files[0]); });

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.hidden = false;
      ph.hidden = true;
    };
    reader.readAsDataURL(file);
    if (onFile) onFile(file);
  }
}

// Crop page soil upload → immediate soil classification
setupUploadZone('cropUploadZone', 'cropSoilFile', 'cropSoilPreview', 'cropUploadPH', async file => {
  const manualSoil = document.getElementById('soilTypeManual').value;
  if (manualSoil) return;
  const data = await quickSoilClassify(file);
  if (data) {
    document.getElementById('cropSoilName').textContent = cap(data.soil_type);
    document.getElementById('cropSoilConf').textContent = data.confidence + '%';
    document.getElementById('cropSoilResult').hidden = false;
  }
});

// When manual soil type is changed, update the detected label or hide it
document.getElementById('soilTypeManual')?.addEventListener('change', function() {
  const result = document.getElementById('cropSoilResult');
  if (this.value) {
    document.getElementById('cropSoilName').textContent = cap(this.value);
    document.getElementById('cropSoilConf').textContent = 'Manual';
    result.hidden = false;
  } else {
    result.hidden = true;
  }
});

// Soil page upload → enable check button (analysis triggered by button click)
setupUploadZone('soilUploadZone', 'soilPageFile', 'soilPagePreview', 'soilUploadPH', () => {
  document.getElementById('soilCheckBtn').disabled = false;
});

// Disease page upload → enable button
setupUploadZone('diseaseUploadZone', 'diseaseFile', 'diseasePreview', 'diseaseUploadPH', () => {
  document.getElementById('diseaseBtn').disabled = false;
});

async function quickSoilClassify(file) {
  try {
    const fd = new FormData();
    fd.append('soil_image', file);
    const res  = await fetch(`${API_BASE}/api/predict-soil`, { method: 'POST', body: fd, headers: { 'ngrok-skip-browser-warning': 'true' } });
    return await res.json();
  } catch { return null; }
}


// ══════════════════════════════════════════════════════════
// CROP RECOMMENDATION FORM
// ══════════════════════════════════════════════════════════
document.getElementById('cropMonth').value = new Date().getMonth() + 1;

document.getElementById('cropForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('cropBtn');
  btn.disabled = true;
  setText('cropBtnText', '⏳ Predicting…');

  const fd = new FormData(e.target);
  if (sensorOnline) { fd.delete('temperature'); fd.delete('humidity'); }

  // If manual soil type is selected OR no image was uploaded, remove the
  // empty soil_image field so the backend doesn't see a blank file entry.
  const manualSoil  = document.getElementById('soilTypeManual').value;
  const soilFileIn  = document.getElementById('cropSoilFile');
  if (manualSoil || !soilFileIn.files[0]) {
    fd.delete('soil_image');
  }

  try {
    const res  = await fetch(`${API_BASE}/api/predict`, { method: 'POST', body: fd, headers: { 'ngrok-skip-browser-warning': 'true' } });
    const data = await res.json();
    if (data.status === 'success') renderCropResults(data);
    else alert('Prediction error: ' + (data.message || 'Unknown'));
  } catch (err) {
    alert('Network error: ' + err.message);
  } finally {
    btn.disabled = false;
    setText('cropBtnText', '🔍 Recommend Crops');
  }
});

function renderCropResults(data) {
  const { predictions: preds, inputs } = data;

  hide('cropEmpty');
  show('cropResults');
  setText('cropResultBadge', `${preds.length} crops found`);
  setText('cropTop',     cap(preds[0].crop));
  setText('cropTopConf', `${preds[0].confidence}% confidence`);

  document.getElementById('cropRecList').innerHTML = preds.map(p => `
    <div class="rec-card">
      <div class="rec-rank">#${p.rank}</div>
      <div class="rec-body">
        <div class="rec-name">${cap(p.crop)}</div>
        <div class="rec-reason">${p.reason}</div>
      </div>
      <div class="rec-bar-col">
        <div class="rec-pct">${p.confidence}%</div>
        <div class="bar-track"><div class="bar-fill" style="width:${p.confidence}%"></div></div>
      </div>
    </div>
  `).join('');

  document.getElementById('cropSummaryChips').innerHTML = [
    ['Temp',     `${inputs.temperature}°C`],
    ['Humidity', `${inputs.humidity}%`],
    ['Rainfall', `${inputs.rainfall_mm}mm (${inputs.rainfall_source})`],
    ['Soil',     `${cap(inputs.soil_type)} (${inputs.soil_source})`],
    ['Soil CNN', `${inputs.soil_confidence}%`],
    ['Month',    MONTH_NAMES[inputs.month]],
  ].map(([l, v]) => `
    <div class="chip">
      <span class="chip-label">${l}</span>
      <span class="chip-val">${v}</span>
    </div>
  `).join('');
}


// ══════════════════════════════════════════════════════════
// SOIL TYPE ANALYZER PAGE
// ══════════════════════════════════════════════════════════
const SOIL_DATA = {
  alluvial: {
    traits: 'Fine-grained, high fertility, water-retentive',
    ph: '6.5 – 7.5',
    crops: 'Rice, Wheat, Sugarcane, Maize, Cotton',
    tip: 'Excellent for most crops; ensure good drainage to prevent waterlogging.'
  },
  black: {
    traits: 'Rich in clay, high moisture retention, swells when wet',
    ph: '7.2 – 8.5',
    crops: 'Cotton, Soybean, Sorghum, Wheat',
    tip: 'Deep-rooted crops thrive here. Avoid water stagnation by providing drainage channels.'
  },
  clay: {
    traits: 'High mineral content, compact, slow drainage',
    ph: '6.0 – 7.0',
    crops: 'Rice, Jute, Sugarcane',
    tip: 'Mix in organic matter to improve aeration and workability.'
  },
  laterite: {
    traits: 'High iron & aluminium, low fertility, porous',
    ph: '4.5 – 6.0',
    crops: 'Cashew, Tea, Coffee, Rubber',
    tip: 'Apply lime and compost to raise pH. Suitable for plantation crops with amendments.'
  },
  loamy: {
    traits: 'Balanced mix of sand, silt, clay — ideal texture',
    ph: '6.0 – 7.0',
    crops: 'Almost all vegetables, fruits, and grains',
    tip: 'The gold standard of farming soil. Maintain organic matter levels for best yield.'
  },
  red: {
    traits: 'High iron oxide, well-drained, less fertile',
    ph: '5.5 – 7.0',
    crops: 'Groundnut, Maize, Millets, Pulses',
    tip: 'Supplement with green manure and NPK fertilisers to boost productivity.'
  },
  sandy: {
    traits: 'Coarse, fast-draining, low water retention',
    ph: '5.5 – 7.5',
    crops: 'Groundnut, Watermelon, Carrot, Potato',
    tip: 'Use drip irrigation and add organic matter to improve water holding capacity.'
  },
};

function renderSoilRefGrid() {
  const grid = document.getElementById('soilRefGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(SOIL_DATA).map(([type, info]) => `
    <div class="soil-ref-card" onclick="highlightSoilType('${type}')">
      <div class="src-name">${cap(type)}</div>
      <div class="src-traits">${info.traits}</div>
    </div>
  `).join('');
}

function renderSoilResult(data) {
  const type = data.soil_type.toLowerCase();
  const info = SOIL_DATA[type] || { traits: '—', ph: '—', crops: '—', tip: 'No data available.' };
  const conf = data.confidence;

  document.getElementById('soilConfPct').textContent = conf + '%';
  document.getElementById('soilTypeName').textContent = cap(type);

  document.getElementById('soilInfoCards').innerHTML = `
    <div class="soil-info-card">
      <div class="sic-title">📊 Characteristics</div>
      <div class="sic-val">${info.traits}</div>
    </div>
    <div class="soil-info-card">
      <div class="sic-title">🧪 pH Range</div>
      <div class="sic-val accent">${info.ph}</div>
    </div>
    <div class="soil-info-card">
      <div class="sic-title">🌾 Suitable Crops</div>
      <div class="sic-val">${info.crops}</div>
    </div>
    <div class="soil-info-card">
      <div class="sic-title">💡 Farming Tip</div>
      <div class="sic-val">${info.tip}</div>
    </div>
  `;

  show('soilResultArea');
}

function highlightSoilType(type) {
  // Scroll to upload and pre-fill a demo result
  document.querySelector('#page-soil').scrollIntoView({ behavior: 'smooth' });
  const info = SOIL_DATA[type] || {};
  renderSoilResult({ soil_type: type, confidence: '—' });
}


// ══════════════════════════════════════════════════════════
// DISEASE DETECTOR
// ══════════════════════════════════════════════════════════
const DISEASE_DB = {
  'tomato_early_blight':    { sev: 'high',   desc: 'Fungal disease causing dark concentric rings on leaves.', treatments: ['Remove infected leaves immediately','Apply copper-based fungicide every 7–10 days','Ensure good air circulation between plants','Avoid overhead watering'] },
  'tomato_late_blight':     { sev: 'high',   desc: 'Oomycete causing water-soaked lesions, white mould on undersides.', treatments: ['Apply chlorothalonil or mancozeb fungicide','Destroy infected plant material','Rotate crops next season','Use resistant varieties'] },
  'corn_common_rust':       { sev: 'medium', desc: 'Fungal pustules (orange-brown) on both leaf surfaces.', treatments: ['Apply triazole fungicide at first sign','Ensure timely planting to avoid peak rust season','Use rust-resistant hybrid varieties'] },
  'grape_powdery_mildew':   { sev: 'medium', desc: 'White powdery coating on leaves, shoots, and fruit.', treatments: ['Spray sulphur-based fungicide','Prune for better air circulation','Apply potassium bicarbonate as organic alternative'] },
  'apple_scab':             { sev: 'medium', desc: 'Olive-green to brown lesions on leaves and fruit.', treatments: ['Apply captan or myclobutanil fungicide','Rake and destroy fallen leaves','Use scab-resistant apple varieties'] },
  'potato_late_blight':     { sev: 'high',   desc: 'Water-soaked dark lesions, classic cause of famine. Very fast spreading.', treatments: ['Apply mancozeb or fluazinam preventively','Destroy infected tubers and foliage','Hilling soil around plants reduces infection'] },
  'wheat_leaf_rust':        { sev: 'high',   desc: 'Orange-red urediospore pustules on upper leaf surface.', treatments: ['Apply propiconazole fungicide at flag leaf stage','Use rust-resistant wheat varieties','Monitor regularly during humid seasons'] },
  'healthy':                { sev: 'low',    desc: 'No disease detected. The plant appears healthy.', treatments: ['Continue regular monitoring','Maintain balanced fertilisation','Ensure adequate water and drainage'] },
};

async function analyzeDisease() {
  const fileIn = document.getElementById('diseaseFile');
  if (!fileIn.files[0]) return;

  const btn = document.getElementById('diseaseBtn');
  btn.disabled = true;
  setText('diseaseBtnText', '⏳ Analyzing…');

  try {
    const fd = new FormData();
    fd.append('leaf_image', fileIn.files[0]);
    const res  = await fetch(`${API_BASE}/api/predict-disease`, { method: 'POST', body: fd, headers: { 'ngrok-skip-browser-warning': 'true' } });
    const data = await res.json();

    if (data.status === 'success') {
      renderDiseaseResult(data);
    } else {
      // Fallback: use Claude AI vision
      await analyzeWithClaude(fileIn.files[0]);
    }
  } catch {
    // Server offline — use Claude AI vision
    await analyzeWithClaude(fileIn.files[0]);
  } finally {
    btn.disabled = false;
    setText('diseaseBtnText', '🔬 Analyze Disease');
  }
}

function renderDiseaseResult(data) {
  const top    = data.predictions[0];
  const dbInfo = DISEASE_DB[top.disease?.toLowerCase().replace(/ /g,'_')] || DISEASE_DB['healthy'];
  _displayDisease(top.disease, top.confidence, dbInfo, data.predictions);
}

// ── Claude AI Vision Fallback ──────────────────────────────────
async function analyzeWithClaude(file) {
  setText('diseaseBtnText', '🤖 AI Analyzing…');

  try {
    // Convert image to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const mediaType = file.type || 'image/jpeg';

    const prompt = `You are an expert plant pathologist AI. Analyze this leaf/plant image and identify any diseases.

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{
  "disease": "disease name or Healthy",
  "confidence": 85,
  "severity": "high|medium|low",
  "description": "brief description of the disease or health status",
  "treatments": ["treatment 1", "treatment 2", "treatment 3", "treatment 4"],
  "top3": [
    {"disease": "most likely disease", "confidence": 85},
    {"disease": "second possibility", "confidence": 10},
    {"disease": "third possibility", "confidence": 5}
  ]
}

severity should be "high" for serious diseases, "medium" for moderate, "low" for healthy or minor issues.
confidence should be a number 0-100.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const aiData = await response.json();
    const text = aiData.content?.find(b => b.type === 'text')?.text || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    // Convert Claude response to the internal format
    _displayDisease(
      parsed.disease,
      parsed.confidence,
      { sev: parsed.severity, desc: parsed.description, treatments: parsed.treatments },
      (parsed.top3 || []).map(p => ({ disease: p.disease, confidence: p.confidence }))
    );

    // Mark as AI-powered
    const badge = document.getElementById('diseaseBadge');
    if (badge) badge.textContent = `🤖 AI · ${parsed.confidence}% confidence`;

  } catch (err) {
    _displayDisease(
      'Analysis Failed',
      0,
      { sev: 'low', desc: 'Could not analyze the image. Please ensure you have a valid leaf photo and try again.', treatments: ['Check your internet connection', 'Try a clearer, well-lit photo', 'Ensure the leaf fills most of the frame', 'Try again in a moment'] },
      []
    );
  }
}

function renderDiseaseFallback() {
  analyzeWithClaude(document.getElementById('diseaseFile').files[0])
    .catch(() => _displayDisease(
      'Disease Model Not Loaded',
      0,
      { sev: 'low', desc: 'Flask server offline and AI fallback unavailable.', treatments: ['Check server connection', 'Restart Flask server'] },
      []
    ));
}

function _displayDisease(name, conf, info, allPreds) {
  hide('diseaseEmpty');
  show('diseaseResults');

  setText('diseaseBadge', conf > 0 ? `${conf}% confidence` : 'Model not loaded');
  setText('diseaseName', cap(name.replace(/_/g, ' ')));
  setText('diseaseConf', conf > 0 ? `${conf}% confidence` : 'N/A');
  setText('diseaseDesc', info.desc);

  const sevEl = document.getElementById('diseaseSeverityBadge');
  sevEl.textContent = { high: '🔴 High Severity', medium: '🟡 Moderate Severity', low: '🟢 Low / Healthy' }[info.sev] || '⚪ Unknown';
  sevEl.className = 'dr-severity ' + { high: 'sev-high', medium: 'sev-medium', low: 'sev-low' }[info.sev];

  document.getElementById('diseaseTreatments').innerHTML = (info.treatments || []).map((t, i) => `
    <div class="treat-item">
      <span class="treat-icon">${['💊','🌿','✂️','🚿'][i % 4]}</span>
      <span>${t}</span>
    </div>
  `).join('');

  const cols = ['c1','c2','c3'];
  document.getElementById('diseaseTopPreds').innerHTML = allPreds.slice(0, 3).map((p, i) => `
    <div class="cbr-item">
      <div class="cbr-label">${cap(p.disease?.replace(/_/g,' ') || '—')}</div>
      <div class="cbr-track"><div class="cbr-fill ${cols[i]}" style="width:${p.confidence}%"></div></div>
      <div class="cbr-pct">${p.confidence}%</div>
    </div>
  `).join('');
}


// ══════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════
async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function show(id) { const el = document.getElementById(id); if (el) el.hidden = false; }
function hide(id) { const el = document.getElementById(id); if (el) el.hidden = true; }

function cap(str) {
  if (!str) return '—';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function setMsg(el, msg, type) {
  el.textContent = msg;
  el.className   = 'loc-msg' + (type ? ' ' + type : '');
}

const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];


// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
renderSoilRefGrid();
checkStatus();
pollSensor();
pollRainfall();

setInterval(pollSensor,    4000);
setInterval(pollRainfall,  60000);
setInterval(checkStatus,   10000);

// ── Remove live server button ────────────────────────────────
(function removeLiveServerBtn() {
  function _remove() {
    document.querySelectorAll('.live-server-btn, [class*="live-server"]').forEach(el => el.remove());
  }
  _remove();
  // Also handle if injected after load
  const obs = new MutationObserver(_remove);
  obs.observe(document.body, { childList: true, subtree: true });
  // Disconnect after 5s to avoid overhead
  setTimeout(() => obs.disconnect(), 5000);
})();


// ══════════════════════════════════════════════════════════
// SCROLL-REVEAL  (IntersectionObserver on home sections)
// ══════════════════════════════════════════════════════════
(function setupScrollReveal() {
  if (!('IntersectionObserver' in window)) return;

  const targets = document.querySelectorAll(
    '.about-block, .pipeline-flow, .features-grid, ' +
    '.training-grid, .disease-coverage-grid, .files-grid, ' +
    '.tech-row, .hw-grid, .home-content .section-header'
  );

  // Start them invisible so animation fires on scroll
  targets.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(28px)';
    el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  targets.forEach(el => observer.observe(el));
})();


// ══════════════════════════════════════════════════════════
// DISEASE INFO LOOKUP  (map class_names.txt → disease_info)
// ══════════════════════════════════════════════════════════
// Augment the existing DISEASE_DB with the disease_info.json data

const DISEASE_INFO_MAP = {
  'Bacterialblight':                    { cause: 'Bacterial infection due to high humidity.', solution: 'Use resistant varieties and avoid excess nitrogen.', need: 'Balanced nitrogen' },
  'Brownspot':                          { cause: 'Nutrient deficiency and fungal attack.',      solution: 'Apply potassium fertilizer.',                       need: 'Potassium' },
  'Leafsmut':                           { cause: 'Fungal spores, typically in warm humid conditions.', solution: 'Apply systemic fungicide at early stage.',   need: 'Potassium' },
  'Pepper__bell___Bacterial_spot':      { cause: 'Bacterial infection from contaminated water.',  solution: 'Avoid overhead watering, apply copper spray.',   need: 'Balanced nutrition' },
  'Pepper__bell___healthy':             { cause: 'Plant is healthy.',                             solution: 'No action required.',                           need: 'Regular care' },
  'Potato___Early_blight':              { cause: 'Fungal disease due to moisture and poor air circulation.', solution: 'Remove infected leaves and apply fungicide.', need: 'Balanced nutrition' },
  'Potato___Late_blight':               { cause: 'Oomycete causing water-soaked lesions, spreads very fast.', solution: 'Apply mancozeb preventively, destroy infected foliage.', need: 'Proper airflow' },
  'Potato___healthy':                   { cause: 'Plant is healthy.',                             solution: 'Maintain regular care.',                         need: 'Routine irrigation' },
  'Tomato_Bacterial_spot':              { cause: 'Bacterial infection from contaminated water.',  solution: 'Avoid overhead watering.',                       need: 'Balanced nutrition' },
  'Tomato_Early_blight':                { cause: 'Fungal disease due to moisture and poor air circulation.', solution: 'Remove infected leaves and apply fungicide.', need: 'Balanced nutrition' },
  'Tomato_Late_blight':                 { cause: 'Fungal disease due to wet conditions.',         solution: 'Use fungicide and remove infected parts.',        need: 'Proper airflow' },
  'Tomato_Leaf_Mold':                   { cause: 'Fungal pathogen in high humidity greenhouse conditions.', solution: 'Improve air circulation, apply fungicide.', need: 'Good ventilation' },
  'Tomato_Septoria_leaf_spot':          { cause: 'Fungal disease spreading via water splash.',    solution: 'Apply chlorothalonil, remove infected lower leaves.', need: 'Mulching' },
  'Tomato_Spider_mites_Two_spotted_spider_mite': { cause: 'Pest infestation in hot dry conditions.', solution: 'Apply miticide or neem oil, increase humidity.', need: 'Adequate moisture' },
  'Tomato__Target_Spot':                { cause: 'Fungal disease causing bullseye-patterned lesions.', solution: 'Apply fungicide, avoid leaf wetness.',      need: 'Balanced fertilisation' },
  'Tomato__Tomato_YellowLeaf__Curl_Virus': { cause: 'Viral disease transmitted by whiteflies.', solution: 'Control whitefly population, remove infected plants.', need: 'Pest management' },
  'Tomato__Tomato_mosaic_virus':        { cause: 'Virus spread by contact and infected tools.',   solution: 'Sanitise tools, remove and destroy infected plants.', need: 'Strict hygiene' },
  'Tomato_healthy':                     { cause: 'Plant is healthy.',                             solution: 'No action required.',                           need: 'Regular care' },
  'Wheat_Healthy':                      { cause: 'Plant is healthy.',                             solution: 'Maintain regular care.',                        need: 'Routine irrigation' },
  'Wheat_Rust':                         { cause: 'Fungal infection spreading via wind.',           solution: 'Apply fungicide and use resistant seeds.',       need: 'Potassium' },
};

// Override renderDiseaseResult to use DISEASE_INFO_MAP when DISEASE_DB lookup fails
const _origRenderDiseaseResult = renderDiseaseResult;
window.renderDiseaseResult = function(data) {
  const top  = data.predictions[0];
  const key  = top.disease?.toLowerCase().replace(/ /g,'_');
  let dbInfo = null;

  if (top.reason || top.solution || top.plant_need) {
    const reason = top.reason || 'No detailed cause available.';
    const solution = top.solution || 'Consult a local agronomist for treatment guidance.';
    const need = top.plant_need || 'Regular monitoring';
    const reasonLc = reason.toLowerCase();
    const solutionLc = solution.toLowerCase();
    const sev = (solutionLc.includes('destroy') ||
                 reasonLc.includes('virus') ||
                 reasonLc.includes('extremely fast') ||
                 reasonLc.includes('within days')) ? 'high'
              : reasonLc.includes('healthy') ? 'low' : 'medium';

    dbInfo = {
      sev,
      desc: reason,
      treatments: [
        solution,
        `Plant need: ${need}`,
        'Monitor nearby leaves for spread',
        'Consult local Krishi Vigyan Kendra (KVK) if symptoms continue'
      ]
    };
  }

  if (!dbInfo) {
    dbInfo = DISEASE_DB[key];
  }

  if (!dbInfo) {
    // Try the raw class name from DISEASE_INFO_MAP
    const rawInfo = DISEASE_INFO_MAP[top.disease] || DISEASE_INFO_MAP[key];
    if (rawInfo) {
      const sev = (rawInfo.solution.toLowerCase().includes('destroy') ||
                   rawInfo.cause.toLowerCase().includes('virus') ||
                   rawInfo.cause.toLowerCase().includes('spreads very fast')) ? 'high'
                : rawInfo.cause.toLowerCase().includes('healthy') ? 'low' : 'medium';
      dbInfo = {
        sev,
        desc: rawInfo.cause,
        treatments: [
          rawInfo.solution,
          `Nutrient focus: ${rawInfo.need}`,
          'Monitor surrounding plants for spread',
          'Consult local Krishi Vigyan Kendra (KVK) if symptoms persist'
        ]
      };
    }
  }

  if (!dbInfo) dbInfo = DISEASE_DB['healthy'];
  _displayDisease(top.disease, top.confidence, dbInfo, data.predictions);
};


// ══════════════════════════════════════════════════════════
// INPUT METHOD TABS  (Upload ↔ Camera)
// ══════════════════════════════════════════════════════════
function switchInputTab(page, mode) {
  const uploadPanel = document.getElementById(`${page}PanelUpload`);
  const cameraPanel = document.getElementById(`${page}PanelCamera`);
  const tabUpload   = document.getElementById(`${page}TabUpload`);
  const tabCamera   = document.getElementById(`${page}TabCamera`);

  if (mode === 'upload') {
    uploadPanel.hidden = false;
    cameraPanel.hidden = true;
    tabUpload.classList.add('active');
    tabCamera.classList.remove('active');
    // Stop any active stream
    stopCamera(page);
  } else {
    uploadPanel.hidden = true;
    cameraPanel.hidden = false;
    tabUpload.classList.remove('active');
    tabCamera.classList.add('active');
  }
}


// ══════════════════════════════════════════════════════════
// CAMERA  (shared logic for soil & disease pages)
// ══════════════════════════════════════════════════════════
const _streams = {};   // { soil: MediaStream, disease: MediaStream }

async function startCamera(page) {
  const video    = document.getElementById(`${page}Video`);
  const startBtn = document.getElementById(`${page}CamStart`);
  const snapBtn  = document.getElementById(`${page}CamSnap`);

  try {
    startBtn.disabled = true;
    startBtn.textContent = '⏳';

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });

    _streams[page]    = stream;
    video.srcObject   = stream;
    await video.play();

    startBtn.textContent = currentLang === 'hi' ? '⏹ बंद करें' : '⏹ Stop';
    startBtn.classList.remove('cam-start');
    startBtn.classList.add('cam-stop');
    startBtn.disabled  = false;
    startBtn.onclick   = () => stopCamera(page);
    snapBtn.disabled   = false;
  } catch (err) {
    startBtn.disabled    = false;
    startBtn.textContent = currentLang === 'hi' ? '▶ कैमरा खोलें' : '▶ Start Camera';
    alert(currentLang === 'hi'
      ? '❌ कैमरा नहीं खुला। कृपया ब्राउज़र को कैमरा अनुमति दें।'
      : '❌ Camera access denied or unavailable. Please allow camera permission in browser.');
  }
}

function stopCamera(page) {
  const stream   = _streams[page];
  const video    = document.getElementById(`${page}Video`);
  const startBtn = document.getElementById(`${page}CamStart`);
  const snapBtn  = document.getElementById(`${page}CamSnap`);

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    delete _streams[page];
  }
  if (video) video.srcObject = null;
  if (startBtn) {
    startBtn.textContent = currentLang === 'hi' ? '▶ कैमरा खोलें' : '▶ Start Camera';
    startBtn.classList.add('cam-start');
    startBtn.classList.remove('cam-stop');
    startBtn.onclick = () => startCamera(page);
    startBtn.disabled = false;
  }
  if (snapBtn) snapBtn.disabled = true;
}

function snapPhoto(page) {
  const video    = document.getElementById(`${page}Video`);
  const canvas   = document.getElementById(`${page}Canvas`);
  const preview  = document.getElementById(`${page}CapturedPreview`);
  const snapBtn  = document.getElementById(`${page}CamSnap`);
  const retakeBtn= document.getElementById(`${page}CamRetake`);

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const dataURL = canvas.toDataURL('image/jpeg', 0.92);
  preview.src    = dataURL;
  preview.hidden = false;

  // Convert dataURL to Blob/File and store on the appropriate file input
  canvas.toBlob(blob => {
    const file = new File([blob], `${page}_capture.jpg`, { type: 'image/jpeg' });
    // Store captured file for submission
    _capturedFiles[page] = file;

    // Enable the action button
    if (page === 'soil')    document.getElementById('soilCheckBtn').disabled = false;
    if (page === 'disease') document.getElementById('diseaseBtn').disabled   = false;
  }, 'image/jpeg', 0.92);

  // Freeze the video view — show retake
  stopCamera(page);
  snapBtn.hidden   = true;
  retakeBtn.hidden = false;
}

function retakePhoto(page) {
  const preview  = document.getElementById(`${page}CapturedPreview`);
  const snapBtn  = document.getElementById(`${page}CamSnap`);
  const retakeBtn= document.getElementById(`${page}CamRetake`);

  preview.hidden   = true;
  preview.src      = '';
  snapBtn.hidden   = false;
  retakeBtn.hidden = true;
  delete _capturedFiles[page];

  if (page === 'soil')    document.getElementById('soilCheckBtn').disabled = true;
  if (page === 'disease') document.getElementById('diseaseBtn').disabled   = true;

  startCamera(page);
}

// Holds File objects from camera captures
const _capturedFiles = {};

// Helper: get the active file for a page (upload file or camera capture)
function getActiveFile(page) {
  if (_capturedFiles[page]) return _capturedFiles[page];
  const fileInput = document.getElementById(
    page === 'soil' ? 'soilPageFile' : 'diseaseFile'
  );
  return fileInput?.files[0] || null;
}


// ══════════════════════════════════════════════════════════
// SOIL CHECK BUTTON
// ══════════════════════════════════════════════════════════
async function checkSoil() {
  const file = getActiveFile('soil');
  if (!file) return;

  const btn  = document.getElementById('soilCheckBtn');
  const span = document.getElementById('soilCheckBtnText');
  btn.disabled   = true;
  span.textContent = currentLang === 'hi' ? '⏳ जाँच रहे हैं...' : '⏳ Checking...';

  try {
    const data = await quickSoilClassify(file);
    if (data && data.soil_type) {
      renderSoilResult(data);
    } else {
      alert(currentLang === 'hi'
        ? '⚠️ मिट्टी की पहचान नहीं हो सकी। कृपया साफ़ फोटो लें।'
        : '⚠️ Could not classify soil. Please try a clearer image.');
    }
  } catch {
    alert(currentLang === 'hi' ? '❌ सर्वर से जुड़ नहीं सके।' : '❌ Server error.');
  } finally {
    btn.disabled = false;
    const key = 'soil_check_btn';
    span.textContent = currentLang === 'hi' ? (I18N.hi[key] || '🪨 मिट्टी जाँचें') : (I18N.en[key] || '🪨 Check Soil Type');
  }
}

// Patch analyzeDisease to also support camera captures
const _origAnalyzeDisease = analyzeDisease;
window.analyzeDisease = async function() {
  const capturedFile = _capturedFiles['disease'];
  if (!capturedFile) {
    _origAnalyzeDisease();
    return;
  }

  const btn  = document.getElementById('diseaseBtn');
  btn.disabled = true;
  setText('diseaseBtnText', currentLang === 'hi' ? '⏳ जाँच हो रही है...' : '⏳ Analyzing…');

  try {
    const fd = new FormData();
    fd.append('leaf_image', capturedFile);
    const res  = await fetch(`${API_BASE}/api/predict-disease`, { method: 'POST', body: fd, headers: { 'ngrok-skip-browser-warning': 'true' } });
    const data = await res.json();
    if (data.status === 'success') {
      renderDiseaseResult(data);
    } else {
      await analyzeWithClaude(capturedFile);
    }
  } catch {
    await analyzeWithClaude(capturedFile);
  } finally {
    btn.disabled = false;
    const key = 'disease_analyze_btn';
    setText('diseaseBtnText', currentLang === 'hi' ? (I18N.hi[key] || '🔬 रोग जाँचें') : (I18N.en[key] || '🔬 Analyze Disease'));
  }
};


// ══════════════════════════════════════════════════════════
// HINDI / ENGLISH TRANSLATION SYSTEM
// ══════════════════════════════════════════════════════════
let currentLang = localStorage.getItem('agro-lang') || 'en';

const I18N = {
  en: {
    // Nav
    nav_home:    'Home',
    nav_crop:    'Crop Advisor',
    nav_soil:    'Soil Analyzer',
    nav_disease: 'Disease Detector',
    // Hero
    hero_badge:  '<span class="hero-badge-dot"></span>EPICS Final Year Project · IoT + AI · Bhopal, India',
    hero_title:  'Smarter Farming<br>Powered by <em>Living Data</em>',
    hero_sub:    'A full-stack AI platform that fuses real-time IoT sensor data, computer vision, and gradient-boosted machine learning — giving every farmer the predictive intelligence once reserved for large agri-corporations.',
    hero_cta1:   '🌱 Get Crop Advice',
    hero_cta2:   '🪨 Analyze Soil',
    hero_cta3:   '🔬 Detect Disease',
    hs_label_models:   'AI Models',
    hs_label_diseases: 'Plant Diseases',
    hs_label_soils:    'Soil Types',
    hs_label_features: 'ML Features',
    // Sensor strip
    sensor_temp:   'Temperature °C',
    sensor_hum:    'Humidity %',
    sensor_rain:   'Rainfall mm/h',
    sensor_update: 'Last Update',
    // Section headers
    about_kicker:  'About This Project',
    about_title:   'What Is AgroSense?',
    arch_kicker:   'System Architecture',
    arch_title:    'How It Works — End to End',
    arch_sub:      'Data flows from field sensors through AI inference to actionable advice in under 2 seconds.',
    modules_kicker:'Core AI Modules',
    modules_title: 'Three Engines, One Platform',
    modules_sub:   'Each module was trained, validated, and optimized independently before integration.',
    training_kicker:'Model Training Details',
    training_title: 'Data, Training & Validation',
    disease_cov_kicker: 'Disease Detection Coverage',
    disease_cov_title: 'Detected Conditions',
    disease_cov_sub: 'The disease model covers 20 classes across 5 major crops.',
    deploy_kicker:  'Deployment Checklist',
    deploy_title:   'Required Model Files',
    deploy_sub:     'Place all files in the /model directory.',
    // Soil page
    soil_kicker:       'Computer Vision · MobileNetV2 · 7 Soil Types',
    soil_title:        'Soil Type Analyzer',
    soil_desc:         'Upload or capture a photograph of your soil sample. The CNN model instantly classifies the type and provides cultivation guidance.',
    soil_photo_title:  '📷 Soil Sample Photo',
    soil_drop_text:    'Click or drag a soil photograph here',
    soil_drop_hint:    'Clear, well-lit shots give best accuracy',
    soil_check_btn:    '🪨 Check Soil Type',
    soil_detected_label: 'Detected Soil Type',
    soil_ref_title:    '📚 Soil Type Reference',
    soil_ref_desc:     'Tap any soil type below to learn about its characteristics and best crops.',
    // Disease page
    disease_photo_title:  '🍃 Leaf / Plant Photo',
    disease_drop_text:    'Upload a photo of the affected leaf',
    disease_drop_hint:    'Close-up shots of leaves give best accuracy',
    disease_analyze_btn:  '🔬 Analyze Disease',
    disease_common_title: 'Common Diseases',
    disease_result_title: '🔬 Diagnosis',
    disease_awaiting:     'Awaiting image',
    disease_empty_msg:    'Upload a leaf photograph and click Analyze Disease to get a diagnosis.',
    // Camera
    tab_upload: '📁 Upload Photo',
    tab_camera: '📸 Take Photo',
    cam_start:  '▶ Start Camera',
    cam_snap:   '📸 Capture',
    cam_retake: '🔄 Retake',
  },

  hi: {
    // Nav
    nav_home:    'होम',
    nav_crop:    'फसल सलाह',
    nav_soil:    'मिट्टी जाँच',
    nav_disease: 'रोग पहचान',
    // Hero
    hero_badge:  '<span class="hero-badge-dot"></span>EPICS अंतिम वर्ष परियोजना · IoT + AI · भोपाल, भारत',
    hero_title:  'स्मार्ट खेती<br><em>जीवित डेटा</em> से संचालित',
    hero_sub:    'एक पूर्ण AI प्लेटफ़ॉर्म जो IoT सेंसर डेटा, कंप्यूटर विज़न और मशीन लर्निंग को जोड़कर हर किसान को सटीक फसल सलाह देता है।',
    hero_cta1:   '🌱 फसल सलाह लें',
    hero_cta2:   '🪨 मिट्टी जाँचें',
    hero_cta3:   '🔬 रोग पहचानें',
    hs_label_models:   'AI मॉडल',
    hs_label_diseases: 'पौधों के रोग',
    hs_label_soils:    'मिट्टी के प्रकार',
    hs_label_features: 'ML फ़ीचर',
    // Sensor strip
    sensor_temp:   'तापमान °C',
    sensor_hum:    'नमी %',
    sensor_rain:   'वर्षा mm/घंटा',
    sensor_update: 'अंतिम अपडेट',
    // Section headers
    about_kicker:  'इस परियोजना के बारे में',
    about_title:   'AgroSense क्या है?',
    arch_kicker:   'सिस्टम संरचना',
    arch_title:    'यह कैसे काम करता है',
    arch_sub:      'डेटा सेंसर से AI अनुमान तक 2 सेकंड में पहुँचता है।',
    modules_kicker:'मुख्य AI मॉड्यूल',
    modules_title: 'तीन इंजन, एक प्लेटफ़ॉर्म',
    modules_sub:   'प्रत्येक मॉड्यूल को अलग से प्रशिक्षित और परीक्षण किया गया है।',
    training_kicker:'मॉडल प्रशिक्षण विवरण',
    training_title: 'डेटा, प्रशिक्षण और सत्यापन',
    disease_cov_kicker: 'रोग पहचान की क्षमता',
    disease_cov_title: 'पहचाने जाने वाले रोग',
    disease_cov_sub: 'यह मॉडल 5 प्रमुख फसलों में 20 रोगों की पहचान करता है।',
    deploy_kicker:  'तैनाती जाँच सूची',
    deploy_title:   'आवश्यक मॉडल फ़ाइलें',
    deploy_sub:     'सभी फ़ाइलें /model फ़ोल्डर में रखें।',
    // Soil page
    soil_kicker:       'कंप्यूटर विज़न · MobileNetV2 · 7 मिट्टी प्रकार',
    soil_title:        'मिट्टी प्रकार पहचानकर्ता',
    soil_desc:         'अपनी मिट्टी की फोटो अपलोड करें या कैमरे से खींचें। AI मॉडल तुरंत मिट्टी का प्रकार और खेती की सलाह बताएगा।',
    soil_photo_title:  '📷 मिट्टी का नमूना फोटो',
    soil_drop_text:    'यहाँ मिट्टी की फोटो खींचें या क्लिक करें',
    soil_drop_hint:    'साफ़ और रोशनी में ली गई फोटो सबसे सटीक होती है',
    soil_check_btn:    '🪨 मिट्टी जाँचें',
    soil_detected_label: 'पहचानी गई मिट्टी',
    soil_ref_title:    '📚 मिट्टी प्रकार संदर्भ',
    soil_ref_desc:     'किसी भी मिट्टी प्रकार पर टैप करें और उसकी विशेषताएं जानें।',
    // Disease page
    disease_photo_title:  '🍃 पत्ता / पौधे की फोटो',
    disease_drop_text:    'प्रभावित पत्ते की फोटो यहाँ अपलोड करें',
    disease_drop_hint:    'पत्ते की नज़दीकी फोटो सबसे सटीक होती है',
    disease_analyze_btn:  '🔬 रोग जाँचें',
    disease_common_title: 'सामान्य रोग',
    disease_result_title: '🔬 निदान',
    disease_awaiting:     'फोटो की प्रतीक्षा',
    disease_empty_msg:    'पत्ते की फोटो अपलोड करें और "रोग जाँचें" बटन दबाएं।',
    // Camera
    tab_upload: '📁 फोटो अपलोड करें',
    tab_camera: '📸 फोटो खींचें',
    cam_start:  '▶ कैमरा खोलें',
    cam_snap:   '📸 तस्वीर लें',
    cam_retake: '🔄 दोबारा लें',
  }
};

// Hindi soil data (characteristics, pH, crops, tips)
const SOIL_DATA_HI = {
  alluvial: {
    traits: 'उपजाऊ, बारीक कण, नमी धारक, नदी के किनारे पाई जाती है',
    ph: '6.5 – 8.0',
    crops: 'गेहूँ, चावल, गन्ना, दालें, सब्ज़ियाँ',
    tip: 'नियमित खाद डालें। जल निकासी का ध्यान रखें क्योंकि यह मिट्टी जलभराव में बदल सकती है।'
  },
  black: {
    traits: 'गहरी काली, नमी अच्छी रखती है, फटती है, कपास के लिए आदर्श',
    ph: '7.5 – 8.5',
    crops: 'कपास, सोयाबीन, मूँगफली, ज्वार',
    tip: 'गहरी जुताई करें। यह मिट्टी गीली होने पर चिपचिपी और सूखने पर कड़ी हो जाती है।'
  },
  clay: {
    traits: 'बारीक कण, पानी रोकती है, सूखने पर सख्त',
    ph: '6.0 – 7.5',
    crops: 'चावल, गेहूँ, जूट',
    tip: 'रेत और जैविक खाद मिलाएं। बेहतर जल निकासी के लिए उठे हुए क्यारे बनाएं।'
  },
  laterite: {
    traits: 'लोहा-एल्युमिनियम युक्त, कम उपजाऊ, छिद्रदार',
    ph: '4.5 – 6.0',
    crops: 'काजू, चाय, कॉफी, रबर',
    tip: 'चूना और कम्पोस्ट डालें। बागान फसलों के लिए उपयुक्त।'
  },
  loamy: {
    traits: 'रेत, गाद, मिट्टी का आदर्श मिश्रण',
    ph: '6.0 – 7.0',
    crops: 'लगभग सभी सब्ज़ियाँ, फल और अनाज',
    tip: 'खेती के लिए सबसे अच्छी मिट्टी। जैविक पदार्थ बनाए रखें।'
  },
  red: {
    traits: 'लोहे के ऑक्साइड से लाल, अच्छी जल निकासी, कम उपजाऊ',
    ph: '5.5 – 7.0',
    crops: 'मूँगफली, मक्का, बाजरा, दालें',
    tip: 'हरी खाद और NPK उर्वरक से उत्पादकता बढ़ाएं।'
  },
  sandy: {
    traits: 'मोटे कण, जल्दी सूखती है, कम जल धारण क्षमता',
    ph: '5.5 – 7.5',
    crops: 'मूँगफली, तरबूज, गाजर, आलू',
    tip: 'ड्रिप सिंचाई का उपयोग करें। जैविक खाद से पानी धारण क्षमता बढ़ाएं।'
  }
};

// Hindi soil ref grid labels
const SOIL_NAMES_HI = {
  alluvial: 'जलोढ़ मिट्टी',
  black:    'काली मिट्टी',
  clay:     'चिकनी मिट्टी',
  laterite: 'लेटराइट मिट्टी',
  loamy:    'दोमट मिट्टी',
  red:      'लाल मिट्टी',
  sandy:    'रेतीली मिट्टी'
};

// Apply language to all [data-i18n] elements
function applyLang(lang) {
  currentLang = lang;
  localStorage.setItem('agro-lang', lang);
  document.documentElement.setAttribute('data-lang', lang);

  const btn = document.getElementById('langToggle');
  const lbl = document.getElementById('langBtnLabel');
  if (lang === 'hi') {
    lbl.textContent = 'EN';
    btn.title = 'Switch to English';
  } else {
    lbl.textContent = 'हिं';
    btn.title = 'हिंदी में देखें';
  }

  // Translate all [data-i18n] elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = I18N[lang][key];
    if (val !== undefined) {
      el.innerHTML = val;
    }
  });

  // Sensor strip labels (direct text nodes in .s-card-label)
  const sensorKeys = ['sensor_temp','sensor_hum','sensor_rain','sensor_update'];
  const sensorIds  = ['h-temp','h-hum','h-rain','h-update'];
  document.querySelectorAll('.s-card-label').forEach((el, i) => {
    if (I18N[lang][sensorKeys[i]]) el.textContent = I18N[lang][sensorKeys[i]];
  });

  // Re-render soil ref grid in correct language
  renderSoilRefGrid();

  // Update camera buttons if streams are active
  ['soil','disease'].forEach(page => {
    const startBtn = document.getElementById(`${page}CamStart`);
    if (startBtn && !_streams[page]) {
      startBtn.textContent = lang === 'hi' ? '▶ कैमरा खोलें' : '▶ Start Camera';
    }
  });
}

// Wire up toggle button
document.getElementById('langToggle')?.addEventListener('click', () => {
  applyLang(currentLang === 'en' ? 'hi' : 'en');
});

// Patch renderSoilRefGrid to support Hindi
const _origRenderSoilRefGrid = renderSoilRefGrid;
window.renderSoilRefGrid = function() {
  const grid = document.getElementById('soilRefGrid');
  if (!grid) return;
  const isHi = currentLang === 'hi';
  grid.innerHTML = Object.entries(SOIL_DATA).map(([type, info]) => {
    const hiData  = SOIL_DATA_HI[type] || {};
    const name    = isHi ? (SOIL_NAMES_HI[type] || cap(type)) : cap(type);
    const traits  = isHi ? (hiData.traits || info.traits) : info.traits;
    return `
      <div class="soil-ref-card" onclick="highlightSoilType('${type}')">
        <div class="src-name">${name}</div>
        <div class="src-traits">${traits}</div>
      </div>`;
  }).join('');
};

// Patch renderSoilResult to show Hindi info if active
const _origRenderSoilResult = window.renderSoilResult || function(){};
window.renderSoilResult = function(data) {
  const type  = data.soil_type.toLowerCase();
  const isHi  = currentLang === 'hi';
  const enInfo = SOIL_DATA[type] || { traits: '—', ph: '—', crops: '—', tip: '—' };
  const hiInfo = SOIL_DATA_HI[type] || {};
  const conf   = data.confidence;

  document.getElementById('soilConfPct').textContent  = conf + '%';
  document.getElementById('soilTypeName').textContent =
    isHi ? (SOIL_NAMES_HI[type] || cap(type)) : cap(type);

  const traits = isHi ? (hiInfo.traits || enInfo.traits) : enInfo.traits;
  const crops  = isHi ? (hiInfo.crops  || enInfo.crops)  : enInfo.crops;
  const tip    = isHi ? (hiInfo.tip    || enInfo.tip)     : enInfo.tip;

  document.getElementById('soilInfoCards').innerHTML = `
    <div class="soil-info-card">
      <div class="sic-title">${isHi ? '📊 विशेषताएँ' : '📊 Characteristics'}</div>
      <div class="sic-val">${traits}</div>
    </div>
    <div class="soil-info-card">
      <div class="sic-title">${isHi ? '🧪 pH स्तर' : '🧪 pH Range'}</div>
      <div class="sic-val accent">${enInfo.ph}</div>
    </div>
    <div class="soil-info-card">
      <div class="sic-title">${isHi ? '🌾 उपयुक्त फसलें' : '🌾 Suitable Crops'}</div>
      <div class="sic-val">${crops}</div>
    </div>
    <div class="soil-info-card">
      <div class="sic-title">${isHi ? '💡 खेती सुझाव' : '💡 Farming Tip'}</div>
      <div class="sic-val">${tip}</div>
    </div>
  `;

  show('soilResultArea');
};

// Apply saved language on load
applyLang(currentLang);
