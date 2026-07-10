(() => {
  'use strict';

  // ---------- DOM refs ----------
  const dropzone        = document.getElementById('dropzone');
  const fileInput       = document.getElementById('fileInput');
  const uploadStage     = document.getElementById('uploadStage');
  const benchStage      = document.getElementById('benchStage');
  const loadNewBtn      = document.getElementById('loadNewBtn');
  const fileNameEl      = document.getElementById('fileName');

  const originalImg     = document.getElementById('originalImg');
  const compressedImg   = document.getElementById('compressedImg');
  const originalFormatEl   = document.getElementById('originalFormat');
  const compressedFormatEl = document.getElementById('compressedFormat');
  const originalSizeEl  = document.getElementById('originalSize');
  const originalDimsEl  = document.getElementById('originalDims');
  const compressedSizeEl = document.getElementById('compressedSize');
  const compressedDimsEl = document.getElementById('compressedDims');
  const wellLoading     = document.getElementById('wellLoading');

  const qualitySlider   = document.getElementById('qualitySlider');
  const qualityLcd      = document.getElementById('qualityLcd');
  const formatToggle    = document.getElementById('formatToggle');

  const metricRatio     = document.getElementById('metricRatio');
  const metricSaved     = document.getElementById('metricSaved');
  const metricQuality   = document.getElementById('metricQuality');
  const metricPsnr      = document.getElementById('metricPsnr');

  const downloadBtn     = document.getElementById('downloadBtn');
  const downloadHint    = document.getElementById('downloadHint');

  // ---------- state ----------
  let sourceImage = null;      // HTMLImageElement (decoded original)
  let originalFile = null;     // File object
  let originalName = 'image';
  let currentFormat = 'image/jpeg';
  let workCanvas = document.createElement('canvas'); // holds original at natural size
  let currentObjectUrl = null; // for compressed <img> blob preview
  let currentDownloadUrl = null;
  let debounceTimer = null;
  let requestToken = 0; // guards against out-of-order async compression results

  // ---------- helpers ----------
  function formatBytes(bytes){
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function extFor(mime){
    return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  }

  function labelFor(mime){
    return mime === 'image/png' ? 'PNG' : mime === 'image/webp' ? 'WebP' : 'JPEG';
  }

  function baseName(name){
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
  }

  function classifyPsnr(psnr){
    if (!isFinite(psnr)) return { label: 'Lossless', cls: 'q-excellent' };
    if (psnr >= 42) return { label: 'Imperceptible', cls: 'q-excellent' };
    if (psnr >= 34) return { label: 'Very low', cls: 'q-low' };
    if (psnr >= 27) return { label: 'Low', cls: 'q-low' };
    if (psnr >= 20) return { label: 'Moderate', cls: 'q-moderate' };
    return { label: 'High', cls: 'q-high' };
  }

  function setLoading(active){
    wellLoading.classList.toggle('active', active);
  }

  // ---------- file loading ----------
  function handleFile(file){
    if (!file || !file.type.startsWith('image/')) return;

    originalFile = file;
    originalName = file.name || 'image';

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      sourceImage = img;

      workCanvas.width = img.naturalWidth;
      workCanvas.height = img.naturalHeight;
      workCanvas.getContext('2d').drawImage(img, 0, 0);

      originalImg.src = url;
      originalFormatEl.textContent = (file.type.split('/')[1] || 'unknown').toUpperCase();
      originalSizeEl.textContent = formatBytes(file.size);
      originalDimsEl.textContent = `${img.naturalWidth} × ${img.naturalHeight}px`;
      fileNameEl.textContent = originalName;

      uploadStage.classList.add('hidden');
      benchStage.classList.remove('hidden');

      compress();
    };
    img.onerror = () => {
      alert('Could not read that file as an image. Try a JPG, PNG or WebP.');
    };
    img.src = url;
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  loadNewBtn.addEventListener('click', () => {
    benchStage.classList.add('hidden');
    uploadStage.classList.remove('hidden');
    fileInput.value = '';
  });

  // ---------- format toggle ----------
  formatToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.format-opt');
    if (!btn) return;
    [...formatToggle.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFormat = btn.dataset.format;
    compressedFormatEl.textContent = labelFor(currentFormat);
    compress();
  });

  // ---------- quality slider ----------
  function updateSliderFill(){
    const pct = qualitySlider.value;
    qualitySlider.style.setProperty('--fill', `${pct}%`);
    qualityLcd.innerHTML = `${pct}<span class="lcd-unit">%</span>`;
  }
  qualitySlider.addEventListener('input', () => {
    updateSliderFill();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(compress, 90);
  });
  updateSliderFill();

  // ---------- PSNR (sampled) ----------
  function computePsnr(originalData, compressedData){
    const a = originalData.data, b = compressedData.data;
    const len = a.length;
    // sample to bound cost on large images
    const targetSamples = 60000; // pixel samples (not bytes)
    const totalPixels = len / 4;
    const stride = Math.max(1, Math.floor(totalPixels / targetSamples));

    let sumSq = 0, count = 0;
    for (let p = 0; p < totalPixels; p += stride) {
      const i = p * 4;
      const dr = a[i] - b[i];
      const dg = a[i + 1] - b[i + 1];
      const db = a[i + 2] - b[i + 2];
      sumSq += dr * dr + dg * dg + db * db;
      count += 3;
    }
    const mse = sumSq / count;
    if (mse === 0) return Infinity;
    return 10 * Math.log10((255 * 255) / mse);
  }

  // ---------- core compression ----------
  function compress(){
    if (!sourceImage) return;
    const token = ++requestToken;
    setLoading(true);

    const w = workCanvas.width, h = workCanvas.height;
    const quality = currentFormat === 'image/png' ? 1 : Number(qualitySlider.value) / 100;

    workCanvas.toBlob((blob) => {
      if (token !== requestToken || !blob) { setLoading(false); return; }

      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(blob);
      currentDownloadUrl = currentObjectUrl;

      const outImg = new Image();
      outImg.onload = () => {
        if (token !== requestToken) return;

        compressedImg.src = currentObjectUrl;
        compressedDimsEl.textContent = `${w} × ${h}px`;
        compressedSizeEl.textContent = formatBytes(blob.size);
        compressedFormatEl.textContent = labelFor(currentFormat);

        // metrics
        const ratio = originalFile.size / blob.size;
        const saved = (1 - blob.size / originalFile.size) * 100;
        metricRatio.textContent = `${ratio.toFixed(2)}:1`;
        metricSaved.textContent = `${saved >= 0 ? saved.toFixed(1) : '0.0'}%`;

        // PSNR via off-screen comparison canvas
        const cmpCanvas = document.createElement('canvas');
        cmpCanvas.width = w; cmpCanvas.height = h;
        const cctx = cmpCanvas.getContext('2d');
        cctx.drawImage(outImg, 0, 0, w, h);

        try {
          const octx = workCanvas.getContext('2d');
          const originalData = octx.getImageData(0, 0, w, h);
          const compressedData = cctx.getImageData(0, 0, w, h);
          const psnr = computePsnr(originalData, compressedData);
          const cls = classifyPsnr(psnr);

          metricPsnr.textContent = isFinite(psnr) ? `${psnr.toFixed(1)} dB` : '∞ dB';
          metricQuality.textContent = cls.label;
          metricQuality.className = `metric-value ${cls.cls}`;
        } catch (err) {
          metricPsnr.textContent = 'n/a';
          metricQuality.textContent = 'n/a';
          metricQuality.className = 'metric-value';
        }

        // download link
        const ext = extFor(currentFormat);
        downloadBtn.href = currentDownloadUrl;
        downloadBtn.download = `${baseName(originalName)}-compressed.${ext}`;
        downloadHint.textContent = `${baseName(originalName)}-compressed.${ext} · ${formatBytes(blob.size)}`;

        setLoading(false);
      };
      outImg.src = currentObjectUrl;
    }, currentFormat, quality);
  }

})();