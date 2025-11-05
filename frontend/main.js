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

// Zodiac signs with cohesive pastel color gradient (Aries → Pisces)
// Colors follow a rainbow gradient: red → orange → yellow → green → cyan → blue → purple → pink
const ASTROLOGY_SIGNS = [
  { id: 'aries', name: 'Aries', color: '#FFB3B3' },       // Light coral
  { id: 'taurus', name: 'Taurus', color: '#FFD9B3' },     // Peach
  { id: 'gemini', name: 'Gemini', color: '#FFFFB3' },     // Light yellow
  { id: 'cancer', name: 'Cancer', color: '#D9FFB3' },     // Light lime
  { id: 'leo', name: 'Leo', color: '#B3FFB3' },           // Light green
  { id: 'virgo', name: 'Virgo', color: '#B3FFD9' },       // Mint
  { id: 'libra', name: 'Libra', color: '#B3FFFF' },       // Cyan
  { id: 'scorpio', name: 'Scorpio', color: '#B3D9FF' },   // Light blue
  { id: 'sagittarius', name: 'Sagittarius', color: '#B3B3FF' }, // Light purple
  { id: 'capricorn', name: 'Capricorn', color: '#D9B3FF' },     // Lavender
  { id: 'aquarius', name: 'Aquarius', color: '#FFB3FF' },       // Light magenta
  { id: 'pisces', name: 'Pisces', color: '#FFB3D9' }            // Pink
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
  landscapeWarning: document.getElementById('landscape-warning')
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  maskImages: {},           // {personId: {frameIdx: Image}}
  svgCache: {},             // {signId: svgContent}
  loadingComplete: false,
  currentFrame: -1,
  selectedPerson: null,     // Currently selected person for assignment
  personAssignments: {}     // {personId: signId}
};

// ============================================================================
// SVG LOADING & INITIALIZATION
// ============================================================================

/**
 * Preload all SVG icons for zodiac signs
 */
async function preloadSVGs() {
  const promises = ASTROLOGY_SIGNS.map(sign => {
    return fetch(`assets/svg/${sign.id}.svg`)
      .then(response => response.text())
      .then(svgContent => {
        state.svgCache[sign.id] = svgContent;
      })
      .catch(error => {
        console.warn(`Failed to load SVG for ${sign.id}:`, error);
        state.svgCache[sign.id] = null;
      });
  });

  await Promise.all(promises);
  console.log('All SVGs loaded!');
}

/**
 * Preload all mask images for all people across all frames
 */
async function preloadMasks() {
  console.log('Loading masks...');
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
        img.onerror = () => {
          console.warn(`Mask not found: frame ${frameIdx}, person ${personId}`);
          resolve();
        };
      }));
    }
  }

  await Promise.all(promises);
  state.loadingComplete = true;
  console.log('All masks loaded!');
}

/**
 * Initialize the sign selection buttons with SVG icons
 */
function initializeSignButtons() {
  ASTROLOGY_SIGNS.forEach(sign => {
    const btn = document.createElement('button');
    btn.className = 'sign-btn';
    btn.dataset.signId = sign.id;
    btn.title = sign.name;
    btn.style.backgroundColor = sign.color;

    // Add SVG icon if available
    if (state.svgCache[sign.id]) {
      btn.innerHTML = state.svgCache[sign.id];
    } else {
      // Fallback to text if SVG failed to load
      btn.textContent = sign.name.substring(0, 2);
    }

    btn.addEventListener('click', () => handleSignClick(sign.id));
    elements.signsContainer.appendChild(btn);
  });
}

// ============================================================================
// CANVAS & VIDEO MANAGEMENT
// ============================================================================

/**
 * Resize canvas to match video container with proper aspect ratio handling
 * Accounts for object-fit: cover behavior
 */
function resizeCanvas() {
  if (!elements.video.videoWidth || !elements.video.videoHeight) return;

  const videoAspect = elements.video.videoWidth / elements.video.videoHeight;
  const containerAspect = elements.video.offsetWidth / elements.video.offsetHeight;

  let scale, visibleWidth, visibleHeight, cropX, cropY;

  if (containerAspect > videoAspect) {
    // Container is wider - video width fills container, height is cropped
    scale = elements.video.offsetWidth / elements.video.videoWidth;
    visibleWidth = elements.video.videoWidth;
    visibleHeight = elements.video.offsetHeight / scale;
    cropX = 0;
    cropY = (elements.video.videoHeight - visibleHeight) / 2;
  } else {
    // Container is taller - video height fills container, width is cropped
    scale = elements.video.offsetHeight / elements.video.videoHeight;
    visibleHeight = elements.video.videoHeight;
    visibleWidth = elements.video.offsetWidth / scale;
    cropX = (elements.video.videoWidth - visibleWidth) / 2;
    cropY = 0;
  }

  // Set canvas dimensions
  elements.canvas.width = visibleWidth;
  elements.canvas.height = visibleHeight;
  elements.canvas.style.width = `${elements.video.offsetWidth}px`;
  elements.canvas.style.height = `${elements.video.offsetHeight}px`;
  elements.canvas.style.left = '0px';
  elements.canvas.style.top = '0px';

  // Store crop info for mask drawing
  elements.canvas.dataset.cropX = cropX;
  elements.canvas.dataset.cropY = cropY;
  elements.canvas.dataset.scale = scale;
}

/**
 * Draw a colored mask on the canvas
 * Uses composite operations to colorize the mask
 */
function drawColoredMask(maskImage, color) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = elements.canvas.width;
  tempCanvas.height = elements.canvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  const cropX = parseFloat(elements.canvas.dataset.cropX) || 0;
  const cropY = parseFloat(elements.canvas.dataset.cropY) || 0;

  // Draw only the visible portion of the mask
  tempCtx.drawImage(
    maskImage,
    cropX, cropY, elements.canvas.width, elements.canvas.height,
    0, 0, elements.canvas.width, elements.canvas.height
  );

  // Apply color using source-in composite operation
  tempCtx.globalCompositeOperation = 'source-in';
  tempCtx.fillStyle = color;
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  // Draw the colored mask onto the main canvas
  elements.ctx.drawImage(tempCanvas, 0, 0);
}

/**
 * Redraw all masks on the canvas
 * Shows assigned people with their zodiac colors and selected person with white overlay
 */
function redrawMask() {
  elements.ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  if (!state.loadingComplete || state.currentFrame < 0) return;

  // Draw all assigned people with their zodiac colors
  for (let personId = 0; personId < CONFIG.GAME.NUM_PEOPLE; personId++) {
    const signId = state.personAssignments[personId];
    const mask = state.maskImages[personId]?.[state.currentFrame];

    if (signId && mask) {
      const sign = ASTROLOGY_SIGNS.find(s => s.id === signId);
      if (sign) {
        drawColoredMask(mask, sign.color);
      }
    }
  }

  // Draw selected person with white overlay
  if (state.selectedPerson !== null) {
    const mask = state.maskImages[state.selectedPerson]?.[state.currentFrame];
    if (mask) {
      drawColoredMask(mask, CONFIG.COLORS.SELECTION_OVERLAY);
    }
  }
}

/**
 * Update mask display on each animation frame
 * Synchronizes mask rendering with video playback
 */
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
// CLICK DETECTION & INTERACTION
// ============================================================================

/**
 * Handle clicks on the canvas to select people
 * Uses mask alpha channel for precise hit detection
 */
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

  // Check which person was clicked (check in reverse order for proper layering)
  for (let personId = CONFIG.GAME.NUM_PEOPLE - 1; personId >= 0; personId--) {
    const mask = state.maskImages[personId]?.[state.currentFrame];
    if (!mask) continue;

    // Create temporary canvas to check pixel at click position
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
    const alpha = imageData.data[3];

    if (alpha > 0) {
      clickedPerson = personId;
      break;
    }
  }

  if (clickedPerson !== null) {
    // Person clicked - select them and pause video
    state.selectedPerson = clickedPerson;
    console.log('Selected person:', state.selectedPerson);

    elements.video.pause();
    elements.submitBtn.style.display = 'none';
    enableSignButtons();
    redrawMask();
  } else {
    // Background clicked - deselect and resume video
    state.selectedPerson = null;
    console.log('Deselected');

    if (elements.video.paused) {
      elements.video.play();
    }

    disableSignButtons();
    checkAllAssigned();
    redrawMask();
  }
}

// ============================================================================
// SIGN BUTTON MANAGEMENT
// ============================================================================

/**
 * Enable sign buttons for selection (except already used ones)
 */
function enableSignButtons() {
  const usedSigns = new Set(Object.values(state.personAssignments));

  document.querySelectorAll('.sign-btn').forEach(btn => {
    const signId = btn.dataset.signId;
    if (!usedSigns.has(signId)) {
      btn.classList.add('enabled');
      btn.classList.remove('used');
    } else {
      btn.classList.add('used');
      btn.classList.remove('enabled');
    }
  });
}

/**
 * Disable all sign buttons
 */
function disableSignButtons() {
  document.querySelectorAll('.sign-btn').forEach(btn => {
    btn.classList.remove('enabled');
  });
}

/**
 * Handle sign button clicks - assign sign to selected person
 */
function handleSignClick(signId) {
  if (state.selectedPerson === null) return;

  console.log(`Assigned ${signId} to person ${state.selectedPerson}`);

  // Assign the sign to the person
  state.personAssignments[state.selectedPerson] = signId;

  // Mark button as used
  const button = document.querySelector(`[data-sign-id="${signId}"]`);
  if (button) {
    button.classList.add('used');
    button.classList.remove('enabled');
  }

  // Deselect person and resume video
  state.selectedPerson = null;
  disableSignButtons();
  elements.video.play();
  checkAllAssigned();
  redrawMask();
}

// ============================================================================
// GAME FLOW & SCORING
// ============================================================================

/**
 * Check if all people have been assigned signs
 * Show submit button if complete
 */
function checkAllAssigned() {
  const allAssigned = Object.keys(state.personAssignments).length === CONFIG.GAME.NUM_PEOPLE;

  if (allAssigned && !elements.video.paused && state.selectedPerson === null) {
    elements.submitBtn.style.display = 'block';
  } else {
    elements.submitBtn.style.display = 'none';
  }
}

/**
 * Calculate score and display results
 */
function calculateScore() {
  let correctCount = 0;

  for (let personId = 0; personId < CONFIG.GAME.NUM_PEOPLE; personId++) {
    const assigned = state.personAssignments[personId];
    const correct = CORRECT_ANSWERS[personId];

    if (assigned === correct) {
      correctCount++;
    }
  }

  // Display result
  elements.resultScore.textContent = `${correctCount}/${CONFIG.GAME.NUM_PEOPLE}`;

  if (correctCount === CONFIG.GAME.NUM_PEOPLE) {
    elements.resultMessage.textContent = "Perfect! The stars were in your favor!";
  } else if (correctCount === 0) {
    elements.resultMessage.textContent = "0/100 pts. Good try! The stars weren't in your favor.";
  } else {
    elements.resultMessage.textContent = "Good try! The stars weren't in your favor.";
  }

  // Show result modal
  elements.video.pause();
  elements.resultModal.classList.add('show');
  elements.submitBtn.style.display = 'none';
}

/**
 * Reset game state and return to playing
 */
function resetGame() {
  elements.resultModal.classList.remove('show');
  state.personAssignments = {};
  state.selectedPerson = null;

  // Reset all sign buttons
  document.querySelectorAll('.sign-btn').forEach(btn => {
    btn.classList.remove('used', 'enabled');
  });

  elements.video.play();
  redrawMask();
}

// ============================================================================
// ORIENTATION CHECK
// ============================================================================

/**
 * Check device orientation and display warning on mobile landscape
 */
function checkOrientation() {
  const isMobile = window.innerWidth <= 640;
  const isLandscape = window.innerWidth > window.innerHeight;

  if (isMobile && isLandscape) {
    elements.landscapeWarning.style.display = 'flex';
  } else {
    elements.landscapeWarning.style.display = 'none';
  }

  // Trigger canvas resize
  window.dispatchEvent(new Event('canvasresize'));
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Canvas interaction
elements.canvas.addEventListener('click', handleCanvasClick);

// Video events
elements.video.addEventListener('loadedmetadata', () => {
  setTimeout(() => {
    resizeCanvas();
    updateMask();
  }, 0);
});

elements.video.addEventListener('play', checkAllAssigned);
elements.video.addEventListener('pause', () => {
  elements.submitBtn.style.display = 'none';
});

// Submit and reset
elements.submitBtn.addEventListener('click', calculateScore);
elements.backToPlayingBtn.addEventListener('click', resetGame);

// Resize and orientation
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

window.addEventListener('canvasresize', () => {
  setTimeout(resizeCanvas, 150);
});

// ============================================================================
// INITIALIZATION
// ============================================================================

(async function initialize() {
  await preloadSVGs();
  initializeSignButtons();
  await preloadMasks();
  checkOrientation();
})();
