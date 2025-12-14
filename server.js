/**
 * server.js - Flix Backend (Final Version)
 * Author: Today
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIG ---
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure directories exist
if (!fs.existsSync(path.dirname(DB_FILE))) fs.mkdirSync(path.dirname(DB_FILE));
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- MOCK DATABASE HELPER ---
const getDB = () => {
    if (!fs.existsSync(DB_FILE)) return { users: [], messages: [], friendships: [] };
    try {
        return JSON.parse(fs.readFileSync(DB_FILE));
    } catch(e) {
        console.error("Error reading DB file:", e);
        return { users: [], messages: [], friendships: [] };
    }
};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Multer Storage (File Upload)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Auth Middleware (Ensures user is logged in for protected routes)
const requireAuth = (req, res, next) => {
    const userId = req.cookies.user_session;
    if (!userId) {
        // Strict redirect if no session is found
        return res.redirect('/login.html');
    }
    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) {
        res.clearCookie('user_session');
        return res.redirect('/login.html');
    }
    req.user = user;
    next();
};

// --- ROUTES ---
// Protected main page routes
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/settings.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// Auth Routes
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    if (db.users.find(u => u.username === username)) return res.status(400).json({ error: 'User exists' });
    
    const newUser = { 
        id: uuidv4(), 
        username, 
        password, 
        // Generative Avatar URL
        avatar: `https://ui-avatars.com/api/?name=${username}&background=random&color=fff&size=128&bold=true` 
    };
    db.users.push(newUser);
    saveDB(db);
    
    res.cookie('user_session', newUser.id);
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    
    if (user) {
        res.cookie('user_session', user.id);
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/me', requireAuth, (req, res) => {
    const { password, ...userSafe } = req.user;
    res.json(userSafe);
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('user_session');
    res.json({ success: true });
});

// Update User Info (Username/Avatar URL)
app.post('/api/update_user', requireAuth, (req, res) => {
    const { username, avatar } = req.body;
    const db = getDB();
    const userIndex = db.users.findIndex(u => u.id === req.user.id);

    if (username && username.trim() !== req.user.username) {
        if (db.users.some(u => u.username === username && u.id !== req.user.id)) {
            return res.status(400).json({ error: 'Username already taken.' });
        }
    }

    if (userIndex !== -1) {
        if (username) db.users[userIndex].username = username;
        if (avatar) db.users[userIndex].avatar = avatar;
        saveDB(db);
        const { password, ...userSafe } = db.users[userIndex];
        return res.json({ success: true, user: userSafe });
    }
    res.status(500).json({ error: 'User not found.' });
});

// NEW: API for file-based Avatar Upload
app.post('/api/update_avatar', requireAuth, upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    
    const db = getDB();
    const userIndex = db.users.findIndex(u => u.id === req.user.id);
    const newAvatarUrl = `/uploads/${req.file.filename}`;

    if (userIndex !== -1) {
        db.users[userIndex].avatar = newAvatarUrl;
        saveDB(db);
        const { password, ...userSafe } = db.users[userIndex];
        return res.json({ success: true, user: userSafe });
    }
    res.status(500).json({ error: 'User not found.' });
});

// Upload Route (Media File handling)
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ 
        url: `/uploads/${req.file.filename}`, 
        type: req.file.mimetype, 
        name: req.file.originalname 
    });
});

// --- SOCKET.IO LOGIC ---
const onlineUsers = new Map();

const sendInitialData = (socket, userId) => {
    const db = getDB();
    
    // 1. Friend Requests
    const myRequests = db.friendships
        .filter(f => f.to === userId && f.status === 'pending')
        .map(f => ({ 
            id: f.id, 
            from: f.from, 
            fromName: db.users.find(u => u.id === f.from).username 
        }));
        
    // 2. Friend List
    const myFriends = db.friendships
        .filter(f => (f.from === userId || f.to === userId) && f.status === 'accepted')
        .map(f => {
            const friendId = f.from === userId ? f.to : f.from;
            const friend = db.users.find(u => u.id === friendId);
            const { password, ...friendSafe } = friend;
            return { ...friendSafe, status: onlineUsers.has(friendId) ? 'online' : 'offline' };
        });

    socket.emit('init_data', { requests: myRequests, friends: myFriends });
};


io.on('connection', (socket) => {
    const cookie = socket.handshake.headers.cookie;
    const userId = cookie?.split('; ').find(row => row.startsWith('user_session='))?.split('=')[1];
    
    if (!userId) {
        socket.disconnect(); 
        return;
    }

    onlineUsers.set(userId, socket.id);
    socket.join(userId);

    sendInitialData(socket, userId);

    socket.on('refresh_data', () => sendInitialData(socket, userId)); // Auto-update handler

    socket.on('get_history', ({ friendId }) => {
        const db = getDB();
        const history = db.messages.filter(msg =>
            (msg.from === userId && msg.to === friendId) ||
            (msg.from === friendId && msg.to === userId)
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        socket.emit('chat_history', { friendId, messages: history });
    });

    socket.on('send_message', (data) => {
        const newMessage = {
            id: uuidv4(),
            from: userId,
            to: data.toUserId,
            content: data.content,
            type: data.type || 'text',
            timestamp: new Date().toISOString()
        };
        
        const db = getDB(); 
        db.messages.push(newMessage); 
        saveDB(db); 

        io.to(data.toUserId).emit('new_message', newMessage);
        socket.emit('message_sent', newMessage);
    });

    socket.on('friend_request', (targetUsername) => {
        const db = getDB();
        const target = db.users.find(u => u.username === targetUsername);
        
        if (!target) return socket.emit('error', 'User not found');
        if (target.id === userId) return socket.emit('error', 'Cannot add yourself');
        
        const existing = db.friendships.find(f => 
            (f.from === userId && f.to === target.id) || 
            (f.from === target.id && f.to === userId)
        );

        if (existing) return socket.emit('error', 'Request already exists or friends');

        const request = { id: uuidv4(), from: userId, to: target.id, status: 'pending', fromName: db.users.find(u=>u.id===userId).username };
        db.friendships.push(request);
        saveDB(db);

        io.to(target.id).emit('new_friend_request', request); // Notify recipient
        socket.emit('success', `Request sent to ${target.username}`);
    });

    socket.on('accept_request', (requestId) => {
        const db = getDB();
        const request = db.friendships.find(f => f.id === requestId && f.to === userId && f.status === 'pending');
        if(!request) return socket.emit('error', 'Request not found or not pending.');

        request.status = 'accepted';
        saveDB(db);
        
        // Auto-update both parties
        socket.emit('refresh_data');
        io.to(request.from).emit('refresh_data');
    });

    socket.on('decline_request', (requestId) => {
        const db = getDB();
        
        const initialCount = db.friendships.length;
        // Keep only requests that are NOT the one being declined
        db.friendships = db.friendships.filter(f => !(f.id === requestId && f.to === userId && f.status === 'pending'));
        
        if (db.friendships.length < initialCount) {
            saveDB(db);
            socket.emit('refresh_data'); // Auto-update requests list
        } else {
            socket.emit('error', 'Could not decline request.');
        }
    });

    socket.on('disconnect', () => {
        onlineUsers.delete(userId);
    });
});

server.listen(PORT, () => {
    console.log(`[Flix] Server running on http://localhost:${PORT}`);
    console.log(`[Flix] Author: Today`);
});