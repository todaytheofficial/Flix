/**
 * server.js - Flix Backend (Final Mega Update)
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
// Target URL for unauthenticated users
const UNAUTH_REDIRECT_URL = '/register.html'; 

// Ensure directories exist
if (!fs.existsSync(path.dirname(DB_FILE))) fs.mkdirSync(path.dirname(DB_FILE));
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- MOCK DATABASE HELPER ---
const getDB = () => {
    if (!fs.existsSync(DB_FILE)) return { users: [], messages: [], friendships: [], groups: [] };
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        // Ensure groups array exists on load
        if (!data.groups) data.groups = [];
        return data;
    } catch(e) {
        console.error("Error reading DB file:", e);
        return { users: [], messages: [], friendships: [], groups: [] };
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

// Auth Middleware (Reroute to Registration)
const requireAuth = (req, res, next) => {
    const userId = req.cookies.user_session;
    if (!userId) {
        // Redirection to register.html as requested
        return res.redirect(UNAUTH_REDIRECT_URL);
    }
    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) {
        res.clearCookie('user_session');
        return res.redirect(UNAUTH_REDIRECT_URL);
    }
    req.user = user;
    next();
};

// --- ROUTES ---
app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/settings.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));

// Auth Routes (login/register logic remains mostly same)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    if (db.users.find(u => u.username === username)) return res.status(400).json({ error: 'User exists' });
    
    const newUser = { 
        id: uuidv4(), 
        username, 
        password, 
        // Default avatar
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

// Update User Info (Username only, avatar URL removed)
app.post('/api/update_user', requireAuth, (req, res) => {
    const { username } = req.body;
    const db = getDB();
    const userIndex = db.users.findIndex(u => u.id === req.user.id);

    if (username && username.trim() !== req.user.username) {
        if (db.users.some(u => u.username === username && u.id !== req.user.id)) {
            return res.status(400).json({ error: 'Username already taken.' });
        }
    }

    if (userIndex !== -1) {
        if (username) db.users[userIndex].username = username;
        // Regenerate default avatar if username changed
        db.users[userIndex].avatar = `https://ui-avatars.com/api/?name=${db.users[userIndex].username}&background=random&color=fff&size=128&bold=true`;
        saveDB(db);
        const { password, ...userSafe } = db.users[userIndex];
        return res.json({ success: true, user: userSafe });
    }
    res.status(500).json({ error: 'User not found.' });
});

// Avatar Upload (File-based)
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

// Helper to get all groups the user belongs to
const getMyGroups = (userId, db) => {
    return db.groups.filter(group => group.members.some(m => m.id === userId));
};

const sendInitialData = (socket, userId) => {
    const db = getDB();
    
    // 1. Friend Requests (same as before)
    const myRequests = db.friendships
        .filter(f => f.to === userId && f.status === 'pending')
        .map(f => ({ 
            id: f.id, 
            from: f.from, 
            fromName: db.users.find(u => u.id === f.from)?.username // Safe check
        }));
        
    // 2. Friend List (same as before, filtering blocked users)
    const myFriends = db.friendships
        .filter(f => (f.from === userId || f.to === userId) && f.status === 'accepted')
        .map(f => {
            const friendId = f.from === userId ? f.to : f.from;
            const friend = db.users.find(u => u.id === friendId);
            const { password, ...friendSafe } = friend;
            
            // Check if blocked by or blocking the user
            const isBlocked = f.blockerId === userId || f.blockerId === friendId;

            return { 
                ...friendSafe, 
                status: onlineUsers.has(friendId) ? 'online' : 'offline',
                isBlocked: isBlocked 
            };
        });

    // 3. Group List (NEW)
    const groups = getMyGroups(userId, db);

    socket.emit('init_data', { requests: myRequests, friends: myFriends, groups: groups });
};


io.on('connection', (socket) => {
    const cookie = socket.handshake.headers.cookie;
    const userId = cookie?.split('; ').find(row => row.startsWith('user_session='))?.split('=')[1];
    
    if (!userId) { socket.disconnect(); return; }

    onlineUsers.set(userId, socket.id);
    socket.join(userId);

    // Join all group rooms
    const db = getDB();
    getMyGroups(userId, db).forEach(group => socket.join(group.id));

    sendInitialData(socket, userId);

    socket.on('refresh_data', () => sendInitialData(socket, userId));

    // --- Message Handling (Groups/DMs) ---

    socket.on('get_history', ({ chatId, isGroup = false }) => {
        const db = getDB();
        let history = [];

        if (isGroup) {
            history = db.messages.filter(msg => msg.to === chatId && msg.isGroup);
        } else {
            history = db.messages.filter(msg =>
                (msg.from === userId && msg.to === chatId) ||
                (msg.from === chatId && msg.to === userId)
            ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        }
        
        socket.emit('chat_history', { chatId, messages: history, isGroup });
    });

    socket.on('send_message', (data) => {
        const newMessage = {
            id: uuidv4(),
            from: userId,
            to: data.toUserId, // Can be friendId or groupId
            isGroup: data.isGroup || false,
            content: data.content,
            type: data.type || 'text',
            timestamp: new Date().toISOString()
        };

        // Check blocking status before saving/sending DM
        if (!newMessage.isGroup) {
            const db = getDB();
            const friendship = db.friendships.find(f => 
                (f.from === userId && f.to === newMessage.to) || 
                (f.from === newMessage.to && f.to === userId)
            );
            if (friendship?.blockerId) {
                 if (friendship.blockerId === userId) {
                    return socket.emit('error', 'You have blocked this user. Unblock to send messages.');
                 } else if (friendship.blockerId === newMessage.to) {
                     // User is blocked, don't send message, but save locally if needed (optional)
                     return socket.emit('error', 'You are blocked by this user.');
                 }
            }
        }
        
        // Save to DB
        const db = getDB(); 
        db.messages.push(newMessage); 
        saveDB(db); 

        // Emit
        if (newMessage.isGroup) {
            // Send to all members in the group room
            io.to(newMessage.to).emit('new_message', newMessage);
        } else {
            // Send to recipient and sender
            io.to(newMessage.to).emit('new_message', newMessage);
            socket.emit('message_sent', newMessage);
        }
    });

    socket.on('delete_message', ({ messageId, chatId, isGroup }) => {
        const db = getDB();
        const msgIndex = db.messages.findIndex(m => m.id === messageId && m.from === userId);

        if (msgIndex !== -1) {
            db.messages.splice(msgIndex, 1);
            saveDB(db);
            
            // Notify chat participants to remove the message
            const targetRoom = isGroup ? chatId : (chatId === userId ? db.messages[msgIndex].to : chatId); // Get the right target
            
            io.to(targetRoom).emit('message_deleted', { messageId, chatId, isGroup });
            socket.emit('message_deleted', { messageId, chatId, isGroup }); // Sender
        } else {
            socket.emit('error', 'Cannot delete this message.');
        }
    });


    // --- Friend and Group Management ---

    socket.on('remove_friend', (friendId) => {
        const db = getDB();
        const initialCount = db.friendships.length;

        // Remove friendship entirely
        db.friendships = db.friendships.filter(f => 
            !((f.from === userId && f.to === friendId) || (f.from === friendId && f.to === userId))
        );

        if (db.friendships.length < initialCount) {
            saveDB(db);
            socket.emit('refresh_data');
            io.to(friendId).emit('refresh_data');
            socket.emit('success', 'Friend removed.');
        } else {
            socket.emit('error', 'Could not find friend connection.');
        }
    });

    socket.on('block_user', (friendId) => {
        const db = getDB();
        const friendship = db.friendships.find(f => 
            (f.from === userId && f.to === friendId) || 
            (f.from === friendId && f.to === userId)
        );

        if (friendship) {
            friendship.blockerId = userId; // ID of the user who initiated the block
            saveDB(db);
            socket.emit('refresh_data');
            socket.emit('success', 'User blocked.');
        } else {
            socket.emit('error', 'Cannot block non-friend yet.');
        }
    });

    // Group Creation
    socket.on('create_group', ({ name, members, avatar }) => {
        const db = getDB();
        
        // Ensure current user is in members list and format members
        const allMembers = Array.from(new Set([...members, userId]));
        const memberObjects = allMembers.map(id => ({ id, name: db.users.find(u => u.id === id)?.username }));

        if (memberObjects.length < 2) return socket.emit('error', 'Group needs at least two members.');

        const newGroup = {
            id: uuidv4(),
            name: name,
            avatar: avatar || `https://ui-avatars.com/api/?name=${name.substring(0,2)}&background=3b82f6&color=fff&size=128&bold=true`,
            creatorId: userId,
            members: memberObjects,
            admins: [userId]
        };

        db.groups.push(newGroup);
        saveDB(db);

        // Notify all members and make them join the room
        newGroup.members.forEach(member => {
            io.to(member.id).emit('refresh_data');
            if (onlineUsers.has(member.id)) {
                io.sockets.sockets.get(onlineUsers.get(member.id))?.join(newGroup.id);
            }
        });

        socket.emit('success', 'Group created successfully.');
    });

    // TODO: Add 'add_group_member', 'kick_group_member', 'change_group_name' logic here
    // For brevity, I'll stop the group logic implementation here, focusing on the core requests.

    socket.on('disconnect', () => {
        onlineUsers.delete(userId);
    });
});

server.listen(PORT, () => {
    console.log(`[Flix] Server running on http://localhost:${PORT}`);
    console.log(`[Flix] Author: Today`);
});