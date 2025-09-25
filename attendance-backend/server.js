// Backend code: server.js (Node.js with Express)
// Run with: node server.js
// Dependencies: npm install express uuid body-parser cors

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors()); // Allow cross-origin requests from the extension

// In-memory storage (replace with a real DB like MongoDB for production)
let users = []; // {id, username, password, role: 'teacher' or 'student'}
let sessions = {}; // sessionId: {teacherId, active: true, currentToken: null, tokenExpiration: null, attendance: Set of studentIds}
let userTokens = {}; // userId: authToken (for login sessions)

// Helper to hash password (simple, use bcrypt in production)
function hashPassword(password) {
  return password; // Placeholder, implement proper hashing
}

// Register user
app.post('/register', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Username exists' });
  }
  const id = uuidv4();
  users.push({ id, username, password: hashPassword(password), role });
  res.json({ message: 'Registered successfully', userId: id });
});

// Login user
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === hashPassword(password));
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const authToken = uuidv4();
  userTokens[user.id] = authToken;
  res.json({ message: 'Logged in', userId: user.id, authToken, role: user.role });
});

// Create session (teacher only)
app.post('/create-session', (req, res) => {
  const { userId, authToken } = req.body;
  if (!authenticate(userId, authToken) || getUser(userId).role !== 'teacher') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const sessionId = uuidv4();
  sessions[sessionId] = { teacherId: userId, active: true, currentToken: null, tokenExpiration: null, attendance: new Set() };
  res.json({ sessionId });
});

// Get new token for session (teacher only)
app.post('/get-new-token', (req, res) => {
  const { userId, authToken, sessionId } = req.body;
  if (!authenticate(userId, authToken) || !sessions[sessionId] || sessions[sessionId].teacherId !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const token = uuidv4();
  const expiration = Date.now() + 5000; // 5 seconds expiration
  sessions[sessionId].currentToken = token;
  sessions[sessionId].tokenExpiration = expiration;
  res.json({ token });
});

// Mark attendance (student only)
app.post('/mark-attendance', (req, res) => {
  const { userId, authToken, sessionId, token } = req.body;
  if (!authenticate(userId, authToken) || getUser(userId).role !== 'student') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const session = sessions[sessionId];
  if (!session || !session.active || session.currentToken !== token || Date.now() > session.tokenExpiration) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
  if (session.attendance.has(userId)) {
    return res.status(409).json({ error: 'Already marked' });
  }
  session.attendance.add(userId);
  res.json({ message: 'Attendance marked' });
});

// Get attendance for session (teacher only)
app.post('/get-attendance', (req, res) => {
  const { userId, authToken, sessionId } = req.body;
  if (!authenticate(userId, authToken) || !sessions[sessionId] || sessions[sessionId].teacherId !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  res.json({ attendance: Array.from(sessions[sessionId].attendance) });
});

// Helper functions
function authenticate(userId, authToken) {
  return userTokens[userId] === authToken;
}

function getUser(userId) {
  return users.find(u => u.id === userId);
}

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});