// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
  VIDEO: {
    FPS: 29.97,
    TOTAL_FRAMES: 282
  },
  GAME: {
    NUM_PEOPLE: 2
  },
  COLORS: {
    SELECTION_OVERLAY: 'rgba(255, 255, 255, 0.3)'
  }
};

// Zodiac signs with vibrant, fun color gradient (Aries → Pisces)
const ASTROLOGY_SIGNS = [
  { id: 'aries', name: 'Aries', color: '#FF6B9D' },
  { id: 'taurus', name: 'Taurus', color: '#FF8C42' },
  { id: 'gemini', name: 'Gemini', color: '#FFD93D' },
  { id: 'cancer', name: 'Cancer', color: '#BCE784' },
  { id: 'leo', name: 'Leo', color: '#6BCF7F' },
  { id: 'virgo', name: 'Virgo', color: '#4ECDC4' },
  { id: 'libra', name: 'Libra', color: '#6BC5FF' },
  { id: 'scorpio', name: 'Scorpio', color: '#5B9FED' },
  { id: 'sagittarius', name: 'Sagittarius', color: '#A06BFF' },
  { id: 'capricorn', name: 'Capricorn', color: '#C06BFF' },
  { id: 'aquarius', name: 'Aquarius', color: '#E06BFF' },
  { id: 'pisces', name: 'Pisces', color: '#FF6BD5' }
];

// Ground truth answers (personId → signId)
const CORRECT_ANSWERS = {
  0: 'aries',
  1: 'taurus'
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
  video: document.getElementById('video'),
  canvas: document.getElementById('mask-canvas'),
  ctx: document.getElementById('mask-canvas').getContext('2d'),
  signsContainer: document.getElementById('signs-container'),
  submitBtn: document.getElementById('submit-btn'),
  resultModal: document.getElementById('result-modal'),
  resultScore: document.getElementById('result-score'),
  resultMessage: document.getElementById('result-message'),
  backToPlayingBtn: document.getElementById('back-to-playing'),
  landscapeWarning: document.getElementById('landscape-warning'),
  helpButton: document.getElementById('help-button'),
  helpModal: document.getElementById('help-modal')
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  maskImages: {},
  svgCache: {},
  loadingComplete: false,
  currentFrame: -1,
  selectedPerson: null,
  personAssignments: {},
  isSubmitting: false  // Prevent double submission
};

// ============================================================================
// ASSET LOADING
// ============================================================================

async function preloadSVGs() {
  const promises = ASTROLOGY_SIGNS.map(sign =>
    fetch(`assets/svg/${sign.id}.svg`)
      .then(response => response.text())
      .then(svgContent => { state.svgCache[sign.id] = svgContent; })
      .catch(() => { state.svgCache[sign.id] = null; })
  );
  await Promise.all(promises);
}

async function preloadMasks() {
  const promises = [];

  for (let personId = 0; personId < CONFIG.GAME.NUM_PEOPLE; personId++) {
    state.maskImages[personId] = {};

    for (let frameIdx = 0; frameIdx < CONFIG.VIDEO.TOTAL_FRAMES; frameIdx++) {
      promises.push(new Promise((resolve) => {
        const img = new Image();
        img.src = `masks/${frameIdx}_${personId}.png`;
        img.onload = () => {
          state.maskImages[personId][frameIdx] = img;
          resolve();
        };
        img.onerror = resolve;
      }));
    }
  }

  await Promise.all(promises);
  state.loadingComplete = true;
}

// ============================================================================
// UI INITIALIZATION
// ============================================================================

function initializeSignButtons() {
  ASTROLOGY_SIGNS.forEach(sign => {
    const btn = document.createElement('button');
    btn.className = 'sign-btn';
    btn.dataset.signId = sign.id;
    btn.title = sign.name;
    btn.style.backgroundColor = sign.color;

    if (state.svgCache[sign.id]) {
      btn.innerHTML = state.svgCache[sign.id];
    } else {
      btn.textContent = sign.name.substring(0, 2);
    }

    btn.addEventListener('click', () => handleSignClick(sign.id), { once: false });
    elements.signsContainer.appendChild(btn);
  });
}

// ============================================================================
// CANVAS RENDERING
// ============================================================================

function resizeCanvas() {
  if (!elements.video.videoWidth || !elements.video.videoHeight) return;

  const videoAspect = elements.video.videoWidth / elements.video.videoHeight;
  const containerAspect = elements.video.offsetWidth / elements.video.offsetHeight;

  let visibleWidth, visibleHeight, cropX, cropY;

  if (containerAspect > videoAspect) {
    const scale = elements.video.offsetWidth / elements.video.videoWidth;
    visibleWidth = elements.video.videoWidth;
    visibleHeight = elements.video.offsetHeight / scale;
    cropX = 0;
    cropY = (elements.video.videoHeight - visibleHeight) / 2;
  } else {
    const scale = elements.video.offsetHeight / elements.video.videoHeight;
    visibleHeight = elements.video.videoHeight;
    visibleWidth = elements.video.offsetWidth / scale;
    cropX = (elements.video.videoWidth - visibleWidth) / 2;
    cropY = 0;
  }

  elements.canvas.width = visibleWidth;
  elements.canvas.height = visibleHeight;
  elements.canvas.style.width = `${elements.video.offsetWidth}px`;
  elements.canvas.style.height = `${elements.video.offsetHeight}px`;

  elements.canvas.dataset.cropX = cropX;
  elements.canvas.dataset.cropY = cropY;
}

function drawColoredMask(maskImage, color) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = elements.canvas.width;
  tempCanvas.height = elements.canvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  const cropX = parseFloat(elements.canvas.dataset.cropX) || 0;
  const cropY = parseFloat(elements.canvas.dataset.cropY) || 0;

  tempCtx.drawImage(
    maskImage,
    cropX, cropY, elements.canvas.width, elements.canvas.height,
    0, 0, elements.canvas.width, elements.canvas.height
  );

  tempCtx.globalCompositeOperation = 'source-in';
  tempCtx.fillStyle = color;
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  elements.ctx.drawImage(tempCanvas, 0, 0);
}

function redrawMask() {
  elements.ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  if (!state.loadingComplete || state.currentFrame < 0) return;

  // Draw assigned people with their colors
  for (let personId = 0; personId < CONFIG.GAME.NUM_PEOPLE; personId++) {
    const signId = state.personAssignments[personId];
    const mask = state.maskImages[personId]?.[state.currentFrame];

    if (signId && mask) {
      const sign = ASTROLOGY_SIGNS.find(s => s.id === signId);
      if (sign) drawColoredMask(mask, sign.color);
    }
  }

  // Draw selected person with white overlay
  if (state.selectedPerson !== null) {
    const mask = state.maskImages[state.selectedPerson]?.[state.currentFrame];
    if (mask) drawColoredMask(mask, CONFIG.COLORS.SELECTION_OVERLAY);
  }
}

function updateMask() {
  if (state.loadingComplete) {
    const frameIdx = Math.floor(elements.video.currentTime * CONFIG.VIDEO.FPS);
    const clampedFrame = Math.min(frameIdx, CONFIG.VIDEO.TOTAL_FRAMES - 1);

    if (clampedFrame !== state.currentFrame) {
      state.currentFrame = clampedFrame;
      redrawMask();
    }
  }

  requestAnimationFrame(updateMask);
}

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================

function handleCanvasClick(e) {
  if (!state.loadingComplete) return;

  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);

  const cropX = parseFloat(elements.canvas.dataset.cropX) || 0;
  const cropY = parseFloat(elements.canvas.dataset.cropY) || 0;

  let clickedPerson = null;

  // Check which person was clicked (reverse order for layering)
  for (let personId = CONFIG.GAME.NUM_PEOPLE - 1; personId >= 0; personId--) {
    const mask = state.maskImages[personId]?.[state.currentFrame];
    if (!mask) continue;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = elements.canvas.width;
    tempCanvas.height = elements.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.drawImage(
      mask,
      cropX, cropY, elements.canvas.width, elements.canvas.height,
      0, 0, elements.canvas.width, elements.canvas.height
    );

    const imageData = tempCtx.getImageData(x, y, 1, 1);
    if (imageData.data[3] > 0) {
      clickedPerson = personId;
      break;
    }
  }

  if (clickedPerson !== null) {
    state.selectedPerson = clickedPerson;
    elements.video.pause();
    elements.submitBtn.style.display = 'none';
    enableSignButtons();
    redrawMask();
  } else {
    state.selectedPerson = null;
    if (elements.video.paused) elements.video.play();
    disableSignButtons();
    updateSubmitButtonVisibility();
    redrawMask();
  }
}

function handleSignClick(signId) {
  if (state.selectedPerson === null) return;

  state.personAssignments[state.selectedPerson] = signId;
  state.selectedPerson = null;

  disableSignButtons();
  elements.video.play();
  updateSubmitButtonVisibility();
  redrawMask();
}

// ============================================================================
// BUTTON STATE MANAGEMENT
// ============================================================================

function enableSignButtons() {
  document.querySelectorAll('.sign-btn').forEach(btn => {
    btn.classList.add('enabled');
    btn.classList.remove('used');
  });
}

function disableSignButtons() {
  document.querySelectorAll('.sign-btn').forEach(btn => {
    btn.classList.remove('enabled');
  });
}

function updateSubmitButtonVisibility() {
  const allAssigned = Object.keys(state.personAssignments).length === CONFIG.GAME.NUM_PEOPLE;
  const shouldShow = allAssigned && !elements.video.paused && state.selectedPerson === null;

  elements.submitBtn.style.display = shouldShow ? 'block' : 'none';
}

// ============================================================================
// GAME FLOW
// ============================================================================

function calculateScore() {
  // Prevent double submission
  if (state.isSubmitting) return;
  state.isSubmitting = true;

  let correctCount = 0;
  for (let personId = 0; personId < CONFIG.GAME.NUM_PEOPLE; personId++) {
    if (state.personAssignments[personId] === CORRECT_ANSWERS[personId]) {
      correctCount++;
    }
  }

  elements.resultScore.textContent = `${correctCount}/${CONFIG.GAME.NUM_PEOPLE}`;

  if (correctCount === CONFIG.GAME.NUM_PEOPLE) {
    elements.resultMessage.textContent = "Perfect! The stars were in your favor!";
  } else if (correctCount === 0) {
    elements.resultMessage.textContent = "0/100 pts. Good try! The stars weren't in your favor.";
  } else {
    elements.resultMessage.textContent = "Good try! The stars weren't in your favor.";
  }

  elements.video.pause();
  elements.submitBtn.style.display = 'none';
  elements.resultModal.classList.add('show');
}

function resetGame() {
  elements.resultModal.classList.remove('show');
  state.personAssignments = {};
  state.selectedPerson = null;
  state.isSubmitting = false;

  document.querySelectorAll('.sign-btn').forEach(btn => {
    btn.classList.remove('used', 'enabled');
  });

  elements.video.play();
  redrawMask();
}

// ============================================================================
// MODALS
// ============================================================================

function openHelpModal() {
  elements.helpModal.classList.add('show');
}

function closeHelpModal() {
  elements.helpModal.classList.remove('show');
}

// ============================================================================
// ORIENTATION
// ============================================================================

function checkOrientation() {
  const isMobile = window.innerWidth <= 640;
  const isLandscape = window.innerWidth > window.innerHeight;
  elements.landscapeWarning.style.display = (isMobile && isLandscape) ? 'flex' : 'none';
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Help modal
  elements.helpButton.addEventListener('click', openHelpModal);
  elements.helpModal.addEventListener('click', (e) => {
    if (e.target === elements.helpModal) closeHelpModal();
  });

  // Canvas interaction
  elements.canvas.addEventListener('click', handleCanvasClick);

  // Video events
  elements.video.addEventListener('loadedmetadata', () => {
    resizeCanvas();
    updateMask();
  });

  elements.video.addEventListener('play', updateSubmitButtonVisibility);
  elements.video.addEventListener('pause', () => {
    elements.submitBtn.style.display = 'none';
  });

  // Submit and reset
  elements.submitBtn.addEventListener('click', calculateScore);
  elements.backToPlayingBtn.addEventListener('click', resetGame);

  // Window events
  window.addEventListener('resize', () => {
    resizeCanvas();
    checkOrientation();
  });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      resizeCanvas();
      checkOrientation();
    }, 100);
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

(async function initialize() {
  await preloadSVGs();
  initializeSignButtons();
  setupEventListeners();
  await preloadMasks();
  checkOrientation();
})();
