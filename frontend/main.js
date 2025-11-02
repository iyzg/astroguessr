const video = document.getElementById('video');
const canvas = document.getElementById('mask-canvas');
const ctx = canvas.getContext('2d');
const signsContainer = document.getElementById('signs-container');
const submitBtn = document.getElementById('submit-btn');
const resultModal = document.getElementById('result-modal');
const resultScore = document.getElementById('result-score');
const resultMessage = document.getElementById('result-message');
const backToPlayingBtn = document.getElementById('back-to-playing');

const fps = 29.97;
const totalFrames = 282;
const numPeople = 2; // Update this to match your number of people
let maskImages = {}; // {personId: {frameIdx: Image}}
let loadingComplete = false;
let currentFrame = -1;
let selectedPerson = null; // Track which person is currently selected for assignment
let personAssignments = {}; // {personId: signId}

// Define the 12 astrology signs with distinct colors
const astrologySigns = [
  { id: 'aries', symbol: '♈', name: 'Aries', color: '#FF6B6B' },
  { id: 'taurus', symbol: '♉', name: 'Taurus', color: '#4ECDC4' },
  { id: 'gemini', symbol: '♊', name: 'Gemini', color: '#FFE66D' },
  { id: 'cancer', symbol: '♋', name: 'Cancer', color: '#95E1D3' },
  { id: 'leo', symbol: '♌', name: 'Leo', color: '#F38181' },
  { id: 'virgo', symbol: '♍', name: 'Virgo', color: '#AA96DA' },
  { id: 'libra', symbol: '♎', name: 'Libra', color: '#FCBAD3' },
  { id: 'scorpio', symbol: '♏', name: 'Scorpio', color: '#A8E6CF' },
  { id: 'sagittarius', symbol: '♐', name: 'Sagittarius', color: '#FFD3B6' },
  { id: 'capricorn', symbol: '♑', name: 'Capricorn', color: '#FFAAA5' },
  { id: 'aquarius', symbol: '♒', name: 'Aquarius', color: '#FF8B94' },
  { id: 'pisces', symbol: '♓', name: 'Pisces', color: '#A0C4FF' }
];

// Ground truth: Define correct answers (personId -> signId)
const correctAnswers = {
  0: 'aries', // Update these with actual correct answers
  1: 'taurus'
};

// Create sign buttons
function initializeSignButtons() {
  astrologySigns.forEach(sign => {
    const btn = document.createElement('button');
    btn.className = 'sign-btn';
    btn.dataset.signId = sign.id;
    btn.textContent = sign.symbol;
    btn.style.backgroundColor = sign.color;
    btn.title = sign.name;

    btn.addEventListener('click', () => handleSignClick(sign.id));

    signsContainer.appendChild(btn);
  });
}

initializeSignButtons();

// Preload all masks for all people
async function preloadMasks() {
  console.log('Loading masks...');
  const promises = [];

  for (let personId = 0; personId < numPeople; personId++) {
    maskImages[personId] = {};

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      promises.push(new Promise((resolve) => {
        const img = new Image();
        img.src = `masks/${frameIdx}_${personId}.png`;
        img.onload = () => {
          maskImages[personId][frameIdx] = img;
          resolve();
        };
        img.onerror = () => {
          console.warn(`Frame ${frameIdx} person ${personId} not found`);
          resolve();
        };
      }));
    }
  }

  await Promise.all(promises);
  loadingComplete = true;
  console.log('All masks loaded!');
}

preloadMasks();

function resizeCanvas() {
  if (!video.videoWidth || !video.videoHeight) return;

  // Calculate the displayed video dimensions accounting for object-fit: cover
  const videoAspect = video.videoWidth / video.videoHeight;
  const containerAspect = video.offsetWidth / video.offsetHeight;

  let scale, visibleWidth, visibleHeight, cropX, cropY;

  if (containerAspect > videoAspect) {
    // Container is wider - video width fills container, height is cropped
    scale = video.offsetWidth / video.videoWidth;
    visibleWidth = video.videoWidth;
    visibleHeight = video.offsetHeight / scale;
    cropX = 0;
    cropY = (video.videoHeight - visibleHeight) / 2;
  } else {
    // Container is taller - video height fills container, width is cropped
    scale = video.offsetHeight / video.videoHeight;
    visibleHeight = video.videoHeight;
    visibleWidth = video.offsetWidth / scale;
    cropX = (video.videoWidth - visibleWidth) / 2;
    cropY = 0;
  }

  // Canvas covers the entire container
  canvas.width = visibleWidth;
  canvas.height = visibleHeight;
  canvas.style.width = video.offsetWidth + 'px';
  canvas.style.height = video.offsetHeight + 'px';
  canvas.style.left = '0px';
  canvas.style.top = '0px';

  // Store crop info for drawing masks correctly
  canvas.dataset.cropX = cropX;
  canvas.dataset.cropY = cropY;
  canvas.dataset.scale = scale;
}

video.addEventListener('loadedmetadata', () => {
  setTimeout(() => {
    resizeCanvas();
    updateMask();
  }, 0);
});

// Resize canvas when window size changes or orientation changes
window.addEventListener('resize', () => {
  resizeCanvas();
});

window.addEventListener('orientationchange', () => {
  setTimeout(resizeCanvas, 100);
});

// Listen for custom canvas resize event from orientation checks
window.addEventListener('canvasresize', () => {
  setTimeout(resizeCanvas, 150);
});

// Update mask display
function updateMask() {
  if (loadingComplete) {
    const frameIdx = Math.floor(video.currentTime * fps);
    const clampedFrame = Math.min(frameIdx, totalFrames - 1);

    if (clampedFrame !== currentFrame) {
      currentFrame = clampedFrame;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw all assigned people with their colors
      for (let personId = 0; personId < numPeople; personId++) {
        if (personAssignments[personId] && maskImages[personId][clampedFrame]) {
          const mask = maskImages[personId][clampedFrame];
          const sign = astrologySigns.find(s => s.id === personAssignments[personId]);

          if (sign) {
            drawColoredMask(mask, sign.color);
          }
        }
      }

      // Draw selected person's mask with translucent white
      if (selectedPerson !== null && maskImages[selectedPerson][clampedFrame]) {
        const mask = maskImages[selectedPerson][clampedFrame];
        drawColoredMask(mask, 'rgba(255, 255, 255, 0.3)');
      }
    }
  }

  requestAnimationFrame(updateMask);
}

// Helper function to draw a colored mask using a temporary canvas
function drawColoredMask(maskImage, color) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  const cropX = parseFloat(canvas.dataset.cropX) || 0;
  const cropY = parseFloat(canvas.dataset.cropY) || 0;

  // Draw only the visible portion of the mask
  tempCtx.drawImage(
    maskImage,
    cropX, cropY, canvas.width, canvas.height,  // source crop
    0, 0, canvas.width, canvas.height           // destination
  );

  // Apply color using source-in
  tempCtx.globalCompositeOperation = 'source-in';
  tempCtx.fillStyle = color;
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  // Draw the colored mask onto the main canvas
  ctx.drawImage(tempCanvas, 0, 0);
}

// Click detection on canvas
canvas.addEventListener('click', (e) => {
  if (!loadingComplete) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);

  const cropX = parseFloat(canvas.dataset.cropX) || 0;
  const cropY = parseFloat(canvas.dataset.cropY) || 0;

  let clickedPerson = null;

  // Check which person was clicked (check in reverse order for layering)
  for (let personId = numPeople - 1; personId >= 0; personId--) {
    const mask = maskImages[personId][currentFrame];
    if (mask) {
      // Draw the visible portion of mask to temporary canvas to check pixel
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(
        mask,
        cropX, cropY, canvas.width, canvas.height,
        0, 0, canvas.width, canvas.height
      );

      const imageData = tempCtx.getImageData(x, y, 1, 1);
      const alpha = imageData.data[3];

      if (alpha > 0) {
        clickedPerson = personId;
        break;
      }
    }
  }

  if (clickedPerson !== null) {
    // Clicked on a person
    selectedPerson = clickedPerson;
    console.log("Selected person:", selectedPerson);

    // Pause the video
    video.pause();

    // Hide submit button
    submitBtn.style.display = 'none';

    // Enable all sign buttons (except ones already used)
    enableSignButtons();

    // Force immediate redraw
    redrawMask();
  } else {
    // Clicked on background - deselect
    selectedPerson = null;
    console.log("Deselected all");

    // Resume video if was paused
    if (video.paused) {
      video.play();
    }

    // Disable sign buttons
    disableSignButtons();

    // Check if submit button should show
    checkAllAssigned();

    redrawMask();
  }
});

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

function handleSignClick(signId) {
  if (selectedPerson === null) return;

  console.log(`Assigned ${signId} to person ${selectedPerson}`);

  // Assign the sign to the person
  personAssignments[selectedPerson] = signId;

  // Deselect the person
  selectedPerson = null;

  // Disable all sign buttons
  disableSignButtons();

  // Resume the video
  video.play();

  // Check if all people have been assigned
  checkAllAssigned();

  redrawMask();
}

function checkAllAssigned() {
  const allAssigned = Object.keys(personAssignments).length === numPeople;

  // Only show submit button if all assigned, video is playing, and no person is selected
  if (allAssigned && !video.paused && selectedPerson === null) {
    submitBtn.style.display = 'block';
  } else {
    submitBtn.style.display = 'none';
  }
}

// Watch video play state to show/hide submit button
video.addEventListener('play', () => {
  checkAllAssigned();
});

video.addEventListener('pause', () => {
  // Hide submit button when video pauses
  submitBtn.style.display = 'none';
});

submitBtn.addEventListener('click', () => {
  calculateScore();
});

function calculateScore() {
  let correctCount = 0;

  for (let personId = 0; personId < numPeople; personId++) {
    const assigned = personAssignments[personId];
    const correct = correctAnswers[personId];

    if (assigned === correct) {
      correctCount++;
    }
  }

  // Display result
  resultScore.textContent = `${correctCount}/${numPeople}`;

  if (correctCount === numPeople) {
    resultMessage.textContent = "Perfect! The stars were in your favor!";
  } else if (correctCount === 0) {
    resultMessage.textContent = "0/100 pts. Good try! The stars weren't in your favor.";
  } else {
    resultMessage.textContent = "Good try! The stars weren't in your favor.";
  }

  // Pause video and show modal
  video.pause();
  resultModal.classList.add('show');
  submitBtn.style.display = 'none';
}

backToPlayingBtn.addEventListener('click', () => {
  // Reset and go back to playing
  resultModal.classList.remove('show');
  personAssignments = {};
  selectedPerson = null;

  // Re-enable all sign buttons
  document.querySelectorAll('.sign-btn').forEach(btn => {
    btn.classList.remove('used', 'enabled');
  });

  // Resume video
  video.play();

  redrawMask();
});

function redrawMask() {
  // Force immediate redraw
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw all assigned people with their colors
  for (let personId = 0; personId < numPeople; personId++) {
    if (personAssignments[personId] && maskImages[personId][currentFrame]) {
      const mask = maskImages[personId][currentFrame];
      const sign = astrologySigns.find(s => s.id === personAssignments[personId]);

      if (sign) {
        drawColoredMask(mask, sign.color);
      }
    }
  }

  // Draw selected person's mask with translucent white
  if (selectedPerson !== null && maskImages[selectedPerson][currentFrame]) {
    const mask = maskImages[selectedPerson][currentFrame];
    drawColoredMask(mask, 'rgba(255, 255, 255, 0.3)');
  }
}
