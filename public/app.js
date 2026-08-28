document.addEventListener('DOMContentLoaded', () => {
  // Destination
  const qrUrlInput = document.getElementById('qr-url');

  // Colour
  const colorDarkInput = document.getElementById('color-dark');
  const colorDarkVal = document.getElementById('color-dark-val');
  const colorLightInput = document.getElementById('color-light');
  const colorLightVal = document.getElementById('color-light-val');
  const swatchPicks = [...document.querySelectorAll('.swatch__pick')];
  const presetButtons = [...document.querySelectorAll('#presets .pill')];

  // Mark
  const logoEnableInput = document.getElementById('logo-enable');
  const markOptions = document.getElementById('mark-opts');
  const logoFileInput = document.getElementById('logo-file');
  const fileNameLabel = document.getElementById('file-name-label');
  const logoSizeInput = document.getElementById('logo-size');
  const logoSizeVal = document.getElementById('logo-size-val');

  // Output
  const sizeRadios = [...document.querySelectorAll('input[name="qr-size"]')];
  const eccRadios = [...document.querySelectorAll('input[name="qr-ecc"]')];
  const qrMarginInput = document.getElementById('qr-margin');
  const marginValText = document.getElementById('margin-val');

  // Stage + console
  const qrCanvas = document.getElementById('qr-canvas');
  const qrLoader = document.getElementById('qr-loader');
  const stageGround = document.getElementById('stage-ground');
  const stageEmpty = document.getElementById('stage-empty');
  const stageDim = document.getElementById('stage-dim');
  const consoleCmd = document.getElementById('console-cmd');
  const consoleLines = document.getElementById('console-lines');
  const toastDock = document.getElementById('toast-dock');

  const btnDownload = document.getElementById('btn-download');
  const btnCopy = document.getElementById('btn-copy');
  const btnReset = document.getElementById('btn-reset');

  // Nominal recovery capacity per error-correction level
  const ECC_CAPACITY = { L: 7, M: 15, Q: 25, H: 30 };
  // drawLogoWatermark paints a card of side = logoSize * (1 + 0.18 * 2)
  const MARK_CARD_SCALE = 1.36;
  // A centred mark does not cost its own area in codewords alone — it also
  // takes out alignment and timing runs, so the usable fraction is well under
  // the nominal figure. Measured by decoding the generated canvas at every
  // mark size on each level: the largest mark that still read covered 2.7% at
  // L, 6.0% at M, 10.7% at Q and 14.5% at H — 0.39 to 0.48 of nominal.
  const MARK_SAFE = 0.40;
  const MARK_LIMIT = 0.48;

  const DEFAULTS = {
    url: 'https://www.instagram.com/snaptiqz',
    dark: '#000000',
    light: '#ffffff',
    mark: true,
    markSize: 15,
    size: '1024',
    margin: 2,
    ecc: 'H'
  };

  let debounceTimer;
  let activeLogoImage = new Image();
  let defaultLogoLoaded = false;
  let activeChannel = 'dark';
  const labelTimers = new WeakMap();

  syncReadouts();

  // Pre-load the default mark
  activeLogoImage.onload = () => {
    defaultLogoLoaded = true;
    generateQRCode();
  };
  activeLogoImage.onerror = () => {
    console.warn('Default mark (logo.png) not found in the workspace root.');
    defaultLogoLoaded = false;
    generateQRCode();
  };
  activeLogoImage.src = 'logo.png';

  // ── Listeners ──────────────────────────────────────────────

  // Nothing is submitted anywhere; the form exists only to group the controls.
  // Bound here rather than inline so the page needs no 'unsafe-inline' in CSP.
  document.getElementById('qr-control-form')
    .addEventListener('submit', (e) => e.preventDefault());

  qrUrlInput.addEventListener('input', debounceGenerate);

  colorDarkInput.addEventListener('input', () => {
    setChannel('dark');
    syncReadouts();
    debounceGenerate();
  });

  colorLightInput.addEventListener('input', () => {
    setChannel('light');
    syncReadouts();
    debounceGenerate();
  });

  // A swatch chooses which channel the presets below will paint
  swatchPicks.forEach((btn) => {
    btn.addEventListener('click', () => setChannel(btn.dataset.channel));
  });

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = activeChannel === 'dark' ? colorDarkInput : colorLightInput;
      target.value = btn.dataset.hex.toLowerCase();
      syncReadouts();
      generateQRCode();
    });
  });

  logoEnableInput.addEventListener('change', () => {
    syncMarkState();
    generateQRCode();
  });

  logoSizeInput.addEventListener('input', () => {
    syncReadouts();
    debounceGenerate();
  });

  qrMarginInput.addEventListener('input', () => {
    syncReadouts();
    debounceGenerate();
  });

  [...sizeRadios, ...eccRadios].forEach((radio) => {
    radio.addEventListener('change', generateQRCode);
  });

  logoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        activeLogoImage = img;
        defaultLogoLoaded = true;
        fileNameLabel.textContent = file.name;
        generateQRCode();
      };
      img.onerror = () => {
        showToast('That file could not be read as an image. Try a PNG or SVG.');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  btnReset.addEventListener('click', resetAll);

  // Action: download the PNG
  btnDownload.addEventListener('click', () => {
    try {
      const url = qrCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = outputFilename();
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      flashLabel(btnDownload, 'SAVED ✓');
    } catch (err) {
      console.error('Download error:', err);
      showToast('The image could not be saved. Serve this page over http:// rather than opening the file directly.');
    }
  });

  // Action: copy the image
  btnCopy.addEventListener('click', () => {
    try {
      qrCanvas.toBlob(async (blob) => {
        if (!blob) {
          showToast('The image could not be copied. Download the PNG instead.');
          return;
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          flashLabel(btnCopy, 'COPIED ✓');
        } catch (err) {
          console.warn('ClipboardItem write failed:', err);
          showToast("This browser can't copy images. Download the PNG instead.");
        }
      }, 'image/png');
    } catch (err) {
      console.error('Clipboard copy error:', err);
      showToast("This browser can't copy images. Download the PNG instead.");
    }
  });

  // ── State helpers ──────────────────────────────────────────

  function debounceGenerate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generateQRCode, 250);
  }

  function currentSize() {
    return parseInt(sizeRadios.find((r) => r.checked).value, 10);
  }

  function currentEcc() {
    return eccRadios.find((r) => r.checked).value;
  }

  function setChannel(channel) {
    activeChannel = channel;
    swatchPicks.forEach((btn) => {
      const on = btn.dataset.channel === channel;
      btn.setAttribute('aria-pressed', String(on));
      btn.closest('.swatch').classList.toggle('is-active', on);
    });
  }

  function syncMarkState() {
    markOptions.classList.toggle('is-off', !logoEnableInput.checked);
    logoFileInput.disabled = !logoEnableInput.checked;
    logoSizeInput.disabled = !logoEnableInput.checked;
  }

  function syncReadouts() {
    colorDarkVal.textContent = colorDarkInput.value.toUpperCase();
    colorLightVal.textContent = colorLightInput.value.toUpperCase();
    logoSizeVal.textContent = `${logoSizeInput.value} %`;

    const n = parseInt(qrMarginInput.value, 10);
    marginValText.textContent = `${n} ${n === 1 ? 'module' : 'modules'}`;

    // The stage sits on the code's own ground colour, as the design specifies
    stageGround.style.background = colorLightInput.value;
    syncMarkState();
  }

  function outputFilename() {
    try {
      const urlObj = new URL(qrUrlInput.value);
      const host = urlObj.hostname.replace('www.', '').split('.')[0];
      return `${host || 'custom'}-qr.png`;
    } catch (e) {
      return 'custom-qr.png';
    }
  }

  function resetAll() {
    qrUrlInput.value = DEFAULTS.url;
    colorDarkInput.value = DEFAULTS.dark;
    colorLightInput.value = DEFAULTS.light;
    logoEnableInput.checked = DEFAULTS.mark;
    logoSizeInput.value = String(DEFAULTS.markSize);
    qrMarginInput.value = String(DEFAULTS.margin);
    sizeRadios.forEach((r) => { r.checked = r.value === DEFAULTS.size; });
    eccRadios.forEach((r) => { r.checked = r.value === DEFAULTS.ecc; });

    logoFileInput.value = '';
    fileNameLabel.textContent = 'Default mark';
    activeLogoImage = new Image();
    activeLogoImage.onload = () => { defaultLogoLoaded = true; generateQRCode(); };
    activeLogoImage.onerror = () => { defaultLogoLoaded = false; generateQRCode(); };
    activeLogoImage.src = 'logo.png';

    setChannel('dark');
    syncReadouts();
    generateQRCode();
  }

  // ── Generation ─────────────────────────────────────────────

  function generateQRCode() {
    const text = qrUrlInput.value.trim();

    if (!text) {
      const ctx = qrCanvas.getContext('2d');
      ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
      qrCanvas.hidden = true;
      stageEmpty.hidden = false;
      qrLoader.classList.add('hidden');
      renderConsole(null);
      return;
    }

    stageEmpty.hidden = true;
    qrCanvas.hidden = false;
    qrLoader.classList.remove('hidden');

    const width = currentSize();
    const options = {
      errorCorrectionLevel: currentEcc(),
      margin: parseInt(qrMarginInput.value, 10),
      width: width,
      color: {
        dark: colorDarkInput.value,
        light: colorLightInput.value
      }
    };

    stageDim.textContent = `${width} × ${width} px`;

    if (typeof QRCode === 'undefined') {
      qrLoader.classList.add('hidden');
      showToast('The QR library did not load. Reload the page.');
      console.error('QRCode library is not loaded.');
      return;
    }

    QRCode.toCanvas(qrCanvas, text, options, (err) => {
      qrLoader.classList.add('hidden');

      if (err) {
        console.error('Generation Error:', err);
        renderConsole(null, err.message);
        showToast('That link is too long to encode. Shorten it or lower the error correction.');
        return;
      }

      // QRCode.toCanvas writes inline width/height in px onto the element,
      // which would override the CSS box and overflow the frame.
      qrCanvas.style.removeProperty('width');
      qrCanvas.style.removeProperty('height');

      if (logoEnableInput.checked && defaultLogoLoaded) {
        drawLogoWatermark();
      }

      renderConsole(text);
    });
  }

  // Draw the mark in the centre of the canvas
  function drawLogoWatermark() {
    const ctx = qrCanvas.getContext('2d');
    const qrSize = qrCanvas.width;

    const logoPercentage = parseInt(logoSizeInput.value, 10) / 100;
    const logoSize = qrSize * logoPercentage;
    const x = (qrSize - logoSize) / 2;
    const y = (qrSize - logoSize) / 2;

    // Background card, so the mark never sits on top of live modules
    const padding = logoSize * 0.18;
    const bgSize = logoSize + padding * 2;
    const bgX = (qrSize - bgSize) / 2;
    const bgY = (qrSize - bgSize) / 2;
    const radius = bgSize * 0.22;

    ctx.fillStyle = colorLightInput.value || '#ffffff';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bgX, bgY, bgSize, bgSize, radius);
    } else {
      ctx.rect(bgX, bgY, bgSize, bgSize);
    }
    ctx.fill();

    try {
      ctx.drawImage(activeLogoImage, x, y, logoSize, logoSize);
    } catch (e) {
      console.error('Failed to draw the mark on the canvas:', e);
    }
  }

  // ── Scan report ────────────────────────────────────────────

  function hexToRgb(hex) {
    let h = hex.replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function channelToLinear(c) {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
  }

  function contrastRatio(hexA, hexB) {
    const a = luminance(hexA);
    const b = luminance(hexB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  // Build the console rows: what the code is, and whether a scanner will read it
  function buildReport(text) {
    const rows = [];
    const dark = colorDarkInput.value;
    const light = colorLightInput.value;
    const ecc = currentEcc();

    // 1. Contrast between blocks and ground
    const ratio = contrastRatio(dark, light);
    rows.push({
      key: 'contrast',
      value: `${ratio.toFixed(1)} : 1`,
      state: ratio >= 7 ? 'ok' : ratio >= 3 ? 'risky' : 'fail'
    });

    // 2. Polarity — blocks must be darker than the ground, or most scanners give up
    const blocksDarker = luminance(dark) < luminance(light);
    rows.push({
      key: 'polarity',
      value: blocksDarker ? 'blocks darker' : 'blocks lighter',
      state: blocksDarker ? 'ok' : 'fail'
    });

    // 3. Mark coverage against what the error correction can recover
    if (logoEnableInput.checked && defaultLogoLoaded) {
      const side = (parseInt(logoSizeInput.value, 10) / 100) * MARK_CARD_SCALE;
      const covered = side * side * 100;
      const allowance = ECC_CAPACITY[ecc] * MARK_SAFE;
      rows.push({
        key: 'mark covers',
        value: `${covered.toFixed(1)}% / ecc ${ecc} allows ${allowance.toFixed(1)}%`,
        state: covered <= allowance ? 'ok'
          : covered <= ECC_CAPACITY[ecc] * MARK_LIMIT ? 'risky'
          : 'fail'
      });
    } else {
      rows.push({ key: 'mark', value: 'off', state: null });
    }

    // 4 + 5. What actually got encoded
    try {
      const qr = QRCode.create(text, { errorCorrectionLevel: ecc });
      rows.push({ key: 'modules', value: `${qr.modules.size} × ${qr.modules.size}`, state: null });
    } catch (e) {
      rows.push({ key: 'modules', value: 'unknown', state: null });
    }

    const bytes = new TextEncoder().encode(text).length;
    rows.push({ key: 'payload', value: `${bytes} bytes`, state: null });

    return rows;
  }

  function renderConsole(text, errorMessage) {
    consoleLines.replaceChildren();

    if (!text) {
      consoleCmd.textContent = 'qr --out=?';
      const li = document.createElement('li');
      li.append(rowLabel(errorMessage ? 'error' : 'waiting for a link'));
      if (errorMessage) li.append(dots(), badge('fail', '[ WONT ENCODE ]'));
      consoleLines.append(li);
      return;
    }

    consoleCmd.textContent = `qr --out="${outputFilename()}"`;

    for (const row of buildReport(text)) {
      const li = document.createElement('li');
      li.append(rowLabel(row.key), dots());

      if (row.value) {
        const v = document.createElement('span');
        v.className = 'v';
        v.textContent = row.value;
        li.append(v);
      }

      if (row.state) {
        const label = row.state === 'ok' ? '[ OK ]'
          : row.state === 'risky' ? '[ RISKY ]'
          : "[ WON'T SCAN ]";
        li.append(badge(row.state, label));
      }

      consoleLines.append(li);
    }
  }

  function rowLabel(t) {
    const el = document.createElement('span');
    el.textContent = t;
    return el;
  }

  function dots() {
    const el = document.createElement('span');
    el.className = 'dots';
    return el;
  }

  function badge(state, text) {
    const el = document.createElement('span');
    el.className = `badge badge--${state}`;
    el.textContent = text;
    return el;
  }

  // ── Feedback ───────────────────────────────────────────────

  // Success is confirmed on the button itself, as the design specifies
  function flashLabel(button, message) {
    const label = button.querySelector('.btn__label');
    if (!label.dataset.original) label.dataset.original = label.textContent;

    label.textContent = message;
    clearTimeout(labelTimers.get(button));
    labelTimers.set(button, setTimeout(() => {
      label.textContent = label.dataset.original;
    }, 1600));
  }

  // Toasts carry failures only
  function showToast(message) {
    const existing = toastDock.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML =
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-alert"/></svg><span></span>';
    toast.querySelector('span').textContent = message;

    toastDock.append(toast);
    requestAnimationFrame(() => toast.classList.add('is-in'));

    setTimeout(() => {
      toast.classList.remove('is-in');
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }
});
