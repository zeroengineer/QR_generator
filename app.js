document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const qrUrlInput = document.getElementById('qr-url');
  const colorDarkInput = document.getElementById('color-dark');
  const colorDarkVal = document.getElementById('color-dark-val');
  const colorLightInput = document.getElementById('color-light');
  const colorLightVal = document.getElementById('color-light-val');
  const advancedToggle = document.getElementById('advanced-toggle');
  const advancedControls = document.getElementById('advanced-controls');
  const qrMarginInput = document.getElementById('qr-margin');
  const marginValText = document.getElementById('margin-val');
  const qrErrorLevelSelect = document.getElementById('qr-error-level');
  const qrSizeSelect = document.getElementById('qr-size');
  
  // Watermark Elements
  const logoEnableInput = document.getElementById('logo-enable');
  const logoOptions = document.getElementById('logo-options');
  const logoFileInput = document.getElementById('logo-file');
  const fileNameLabel = document.getElementById('file-name-label');
  const logoSizeInput = document.getElementById('logo-size');
  const logoSizeVal = document.getElementById('logo-size-val');

  const qrCanvas = document.getElementById('qr-canvas');
  const qrLoader = document.getElementById('qr-loader');
  const btnDownload = document.getElementById('btn-download');
  const btnCopy = document.getElementById('btn-copy');

  let debounceTimer;
  let activeLogoImage = new Image();
  let defaultLogoLoaded = false;

  // Initialize page
  updateColorTexts();
  
  // Pre-load default logo image
  activeLogoImage.onload = () => {
    defaultLogoLoaded = true;
    generateQRCode();
  };
  activeLogoImage.onerror = () => {
    console.warn('Default logo image (logo.png) not found in the workspace root.');
    defaultLogoLoaded = false;
    generateQRCode();
  };
  activeLogoImage.src = 'logo.png';

  // Event Listeners for Live Preview (with brief debounce to avoid stutter)
  qrUrlInput.addEventListener('input', debounceGenerate);
  colorDarkInput.addEventListener('input', () => {
    updateColorTexts();
    debounceGenerate();
  });
  colorLightInput.addEventListener('input', () => {
    updateColorTexts();
    debounceGenerate();
  });
  qrMarginInput.addEventListener('input', () => {
    marginValText.textContent = `${qrMarginInput.value}px`;
    debounceGenerate();
  });
  qrErrorLevelSelect.addEventListener('change', generateQRCode);
  qrSizeSelect.addEventListener('change', generateQRCode);

  // Watermark Customization Listeners
  logoEnableInput.addEventListener('change', () => {
    if (logoEnableInput.checked) {
      logoOptions.classList.remove('collapsed');
    } else {
      logoOptions.classList.add('collapsed');
    }
    generateQRCode();
  });

  logoSizeInput.addEventListener('input', () => {
    logoSizeVal.textContent = `${logoSizeInput.value}%`;
    debounceGenerate();
  });

  logoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      fileNameLabel.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          activeLogoImage = img;
          defaultLogoLoaded = true;
          generateQRCode();
          showToast('Custom watermark logo uploaded!');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  // Advanced settings toggle animation
  advancedToggle.addEventListener('click', () => {
    const isCollapsed = advancedControls.classList.contains('collapsed');
    if (isCollapsed) {
      advancedControls.classList.remove('collapsed');
      advancedToggle.classList.add('active');
    } else {
      advancedControls.classList.add('collapsed');
      advancedToggle.classList.remove('active');
    }
  });

  // Action: Download image
  btnDownload.addEventListener('click', () => {
    try {
      const url = qrCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      
      // Try to construct a clean name for the file based on the URL host
      let filename = 'qr-code.png';
      try {
        const urlObj = new URL(qrUrlInput.value || 'https://link');
        const host = urlObj.hostname.replace('www.', '').split('.')[0];
        filename = `${host || 'custom'}-qr-code.png`;
      } catch (e) {
        // Fallback for invalid URLs or plain text inputs
        filename = 'custom-qr-code.png';
      }
      
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('QR Code downloaded successfully!');
    } catch (err) {
      console.error('Download error:', err);
      showToast('Failed to download QR. Try in a standard browser.', 'error');
    }
  });

  // Action: Copy image to Clipboard
  btnCopy.addEventListener('click', () => {
    try {
      qrCanvas.toBlob(async (blob) => {
        if (!blob) {
          showToast('Failed to copy: could not create image blob.', 'error');
          return;
        }
        
        try {
          // Native Clipboard Item write (standard on modern browsers)
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          showToast('QR Code copied to clipboard!');
        } catch (err) {
          console.warn('ClipboardItem write failed, trying fallback...', err);
          showToast('Copying images directly not supported in this browser.', 'warning');
        }
      }, 'image/png');
    } catch (err) {
      console.error('Clipboard copy error:', err);
      showToast('Browser permission denied or unsupported feature.', 'error');
    }
  });

  // Helper: Debounce keypress and slider updates
  function debounceGenerate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generateQRCode, 250);
  }

  // Update hexadecimal labels on UI
  function updateColorTexts() {
    colorDarkVal.textContent = colorDarkInput.value.toUpperCase();
    colorLightVal.textContent = colorLightInput.value.toUpperCase();
  }

  // Core generation logic
  function generateQRCode() {
    const text = qrUrlInput.value.trim();
    if (!text) {
      // Clear canvas if input is empty
      const ctx = qrCanvas.getContext('2d');
      ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
      return;
    }

    // Show loading spinner
    qrLoader.classList.remove('hidden');

    const options = {
      errorCorrectionLevel: qrErrorLevelSelect.value,
      margin: parseInt(qrMarginInput.value, 10),
      width: parseInt(qrSizeSelect.value, 10),
      color: {
        dark: colorDarkInput.value,
        light: colorLightInput.value
      }
    };

    // Use third-party offline library imported via index.html
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(qrCanvas, text, options, (err) => {
        qrLoader.classList.add('hidden');
        if (err) {
          console.error('Generation Error:', err);
          showToast('Failed to generate QR Code. Check URL formatting.', 'error');
          return;
        }
        
        // Draw logo watermark if enabled and loaded
        if (logoEnableInput.checked && defaultLogoLoaded) {
          drawLogoWatermark();
        }
      });
    } else {
      qrLoader.classList.add('hidden');
      showToast('QR library loading... Please wait.', 'warning');
      console.error('QRCode library is not loaded yet.');
    }
  }

  // Draw logo watermark in the center of the QR canvas
  function drawLogoWatermark() {
    const ctx = qrCanvas.getContext('2d');
    const qrSize = qrCanvas.width;
    
    // Logo size calculation (e.g. 15%-25% of QR width)
    const logoPercentage = parseInt(logoSizeInput.value, 10) / 100;
    const logoSize = qrSize * logoPercentage;
    const x = (qrSize - logoSize) / 2;
    const y = (qrSize - logoSize) / 2;
    
    // Draw background card (rounded rectangle) to cover QR modules underneath
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
    
    // Draw watermark image in center
    try {
      ctx.drawImage(activeLogoImage, x, y, logoSize, logoSize);
    } catch (e) {
      console.error('Failed to draw logo on canvas:', e);
    }
  }

  // Custom Toast notification utility
  function showToast(message, type = 'success') {
    // Remove existing toast if present
    const existingToast = document.querySelector('.custom-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `custom-toast toast-${type}`;
    
    let iconClass = 'fa-check-circle';
    if (type === 'error') iconClass = 'fa-times-circle';
    if (type === 'warning') iconClass = 'fa-exclamation-circle';

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    
    // Inline styling for the Toast to keep it isolated
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '30px',
      left: '50%',
      transform: 'translateX(-50%) translateY(100px)',
      background: 'rgba(15, 14, 23, 0.9)',
      border: `1px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'}`,
      boxShadow: `0 4px 20px ${type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
      color: '#ffffff',
      padding: '12px 24px',
      borderRadius: '30px',
      fontSize: '0.9rem',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      zIndex: '1000',
      backdropFilter: 'blur(10px)',
      opacity: '0',
      transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease'
    });

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
      toast.style.opacity = '1';
    }, 50);

    // Auto dismiss after 3.5 seconds
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(100px)';
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 400);
    }, 3500);
  }
});
