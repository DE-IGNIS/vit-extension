const BACKEND_URL = 'http://localhost:3000'; // Change to your deployed backend URL

let userId = null;
let authToken = null;
let role = null;
let sessionId = null;
let qrInterval = null;

// Load stored login if any (for demo, use chrome.storage for persistence)
chrome.storage.local.get(['userId', 'authToken', 'role'], (data) => {
  if (data.userId && data.authToken && data.role) {
    userId = data.userId;
    authToken = data.authToken;
    role = data.role;
    showPanel();
  }
});

document.getElementById('register-btn').addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const selectedRole = document.getElementById('role').value;
  const response = await fetch(`${BACKEND_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role: selectedRole })
  });
  const data = await response.json();
  if (data.userId) {
    document.getElementById('status').textContent = 'Registered. Now login.';
  } else {
    document.getElementById('status').textContent = data.error;
  }
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const response = await fetch(`${BACKEND_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await response.json();
  if (data.userId) {
    userId = data.userId;
    authToken = data.authToken;
    role = data.role;
    chrome.storage.local.set({ userId, authToken, role });
    showPanel();
  } else {
    document.getElementById('status').textContent = data.error;
  }
});

function showPanel() {
  document.getElementById('login-form').style.display = 'none';
  if (role === 'teacher') {
    document.getElementById('teacher-panel').style.display = 'block';
  } else {
    document.getElementById('student-panel').style.display = 'block';
  }
}

// Teacher: Create session
document.getElementById('create-session-btn').addEventListener('click', async () => {
  const response = await fetch(`${BACKEND_URL}/create-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, authToken })
  });
  const data = await response.json();
  if (data.sessionId) {
    sessionId = data.sessionId;
    document.getElementById('status').textContent = `Session created: ${sessionId}`;
    startQrGeneration();
  } else {
    document.getElementById('status').textContent = data.error;
  }
});

// Teacher: Start generating QR every 2s
async function startQrGeneration() {
  const qrDiv = document.getElementById('qr-code');
  qrDiv.innerHTML = '';
  if (qrInterval) clearInterval(qrInterval);
  qrInterval = setInterval(async () => {
    const response = await fetch(`${BACKEND_URL}/get-new-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, authToken, sessionId })
    });
    const data = await response.json();
    if (data.token) {
      const qrData = `${sessionId}:${data.token}`;
      qrDiv.innerHTML = '';
      new QRCode(qrDiv, qrData);
    } else {
      document.getElementById('status').textContent = data.error;
    }
  }, 2000);
}

// Teacher: View attendance
document.getElementById('view-attendance-btn').addEventListener('click', async () => {
  if (!sessionId) return;
  const response = await fetch(`${BACKEND_URL}/get-attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, authToken, sessionId })
  });
  const data = await response.json();
  if (data.attendance) {
    document.getElementById('attendance-list').textContent = `Attendance: ${data.attendance.join(', ')}`;
  } else {
    document.getElementById('status').textContent = data.error;
  }
});

// Student: Start scanning
document.getElementById('start-scan-btn').addEventListener('click', startScanning);

let video = null;
let canvas = null;
let scanningInterval = null;

async function startScanning() {
  video = document.getElementById('video');
  canvas = document.getElementById('canvas');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  video.srcObject = stream;
  video.play();
  scanningInterval = setInterval(scanQr, 100);
}

function scanQr() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.height = video.videoHeight;
    canvas.width = video.videoWidth;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code) {
      processQrData(code.data);
    }
  }
}

async function processQrData(qrData) {
  clearInterval(scanningInterval);
  video.srcObject.getTracks().forEach(track => track.stop());
  const [scannedSessionId, token] = qrData.split(':');
  // Check if already submitted for this session
  const storageKey = `submitted_${scannedSessionId}`;
  const alreadySubmitted = await chrome.storage.local.get(storageKey);
  if (alreadySubmitted[storageKey]) {
    document.getElementById('status').textContent = 'You have already submitted for this session.';
    return;
  }
  // Submit to backend
  const response = await fetch(`${BACKEND_URL}/mark-attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, authToken, sessionId: scannedSessionId, token })
  });
  const data = await response.json();
  if (data.message) {
    document.getElementById('status').textContent = 'Attendance marked successfully.';
    chrome.storage.local.set({ [storageKey]: true });
  } else {
    document.getElementById('status').textContent = data.error;
  }
}