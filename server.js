/**
 * server.js - Flix Backend (FINAL COMPLETE VERSION with all Fixes)
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
const UNAUTH_REDIRECT_URL = '/register.html'; 

// Ensure directories exist
if (!fs.existsSync(path.dirname(DB_FILE))) fs.mkdirSync(path.dirname(DB_FILE));
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- MOCK DATABASE HELPER ---
const getDB = () => {
    if (!fs.existsSync(DB_FILE)) return { users: [], messages: [], friendships: [], groups: [] };
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        if (!data.groups) data.groups = [];
        if (!data.friendships) data.friendships = [];
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
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage });

// Auth Middleware 
const requireAuth = (req, res, next) => {
    const userId = req.cookies.user_session;
    
    if (!userId) {
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized: Session required.' });
        }
        return res.redirect(UNAUTH_REDIRECT_URL);
    }
    
    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) {
        res.clearCookie('user_session');
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized: Invalid session.' });
        }
        return res.redirect(UNAUTH_REDIRECT_URL);
    }
    req.user = user;
    next();
};

// --- ROUTES ---

// Protected Routes
app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/settings.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));

// Auth API 
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    const db = getDB();
    if (db.users.some(u => u.username === username)) {
        return res.status(409).json({ error: 'User already exists.' });
    }

    const newUser = {
        id: uuidv4(),
        username,
        password: password, 
        avatar: `https://ui-avatars.com/api/?name=${username.substring(0,2)}&background=3b82f6&color=fff&size=128&bold=true`
    };

    db.users.push(newUser);
    saveDB(db);

    res.cookie('user_session', newUser.id, { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 }); // 7 days
    res.status(201).json({ message: 'User registered successfully', userId: newUser.id });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username or password missing.' });
    }

    const db = getDB();
    const user = db.users.find(u => u.username === username && u.password === password);

    if (!user) {
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    res.cookie('user_session', user.id, { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 }); // 7 days
    res.status(200).json({ message: 'Logged in successfully', userId: user.id });
});

app.get('/api/me', requireAuth, (req, res) => { 
    const { password, ...userSafe } = req.user;
    res.json(userSafe);
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('user_session');
    res.status(200).json({ message: 'Logged out successfully' });
});

// Upload Route (Used for both chat files and avatar files)
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ 
        url: `/uploads/${req.file.filename}`, 
        type: req.file.mimetype, 
        name: req.file.originalname 
    });
});

// Update Avatar Route
app.post('/api/update_avatar', requireAuth, (req, res) => {
    const { newAvatarUrl } = req.body;
    
    if (!newAvatarUrl) {
        return res.status(400).json({ error: 'New avatar URL is required.' });
    }

    const db = getDB();
    const userIndex = db.users.findIndex(u => u.id === req.user.id);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found.' });
    }

    db.users[userIndex].avatar = newAvatarUrl;
    saveDB(db);

    const { password, ...updatedUserSafe } = db.users[userIndex];
    res.json({ message: 'Avatar updated successfully', user: updatedUserSafe });
});


// USER SEARCH API (Autocomplete)
app.get('/api/search_users', requireAuth, (req, res) => {
    const { query } = req.query;
    if (!query || query.length < 2) return res.json([]);

    const db = getDB();
    const currentUserId = req.user.id;
    const lowerQuery = query.toLowerCase();

    const results = db.users
        .filter(u => 
            u.id !== currentUserId && 
            u.username.toLowerCase().startsWith(lowerQuery)
        )
        .map(u => ({
            id: u.id,
            username: u.username,
            avatar: u.avatar
        }))
        .slice(0, 10); 
    
    res.json(results);
});


// --- SOCKET.IO LOGIC ---
const onlineUsers = new Map();

const getMyGroups = (userId, db) => {
    return db.groups.filter(group => group.members.some(m => m.id === userId));
};

const sendInitialData = (socket, userId) => {
    const db = getDB();
    const currentUser = db.users.find(u => u.id === userId);
    
    const myRequests = db.friendships
        .filter(f => f.to === userId && f.status === 'pending')
        .map(f => ({ 
            id: f.id, 
            from: f.from, 
            fromName: db.users.find(u => u.id === f.from)?.username
        }));
        
    const myFriends = db.friendships
        .filter(f => (f.from === userId || f.to === userId) && f.status === 'accepted')
        .map(f => {
            const friendId = f.from === userId ? f.to : f.from;
            const friend = db.users.find(u => u.id === friendId);
            if (!friend) return null;

            const { password, ...friendSafe } = friend;
            
            const isBlocked = f.blockerId === userId || f.blockerId === friendId;

            return { 
                ...friendSafe, 
                status: onlineUsers.has(friendId) ? 'online' : 'offline',
                isBlocked: isBlocked,
                blockerId: f.blockerId || null
            };
        }).filter(f => f !== null);

    const groups = getMyGroups(userId, db);
    
    socket.emit('init_data', { currentUser, requests: myRequests, friends: myFriends, groups: groups });
};


io.on('connection', (socket) => {
    const cookie = socket.handshake.headers.cookie;
    const userIdMatch = cookie?.split('; ').find(row => row.startsWith('user_session='));
    const userId = userIdMatch ? userIdMatch.split('=')[1] : null;
    
    if (!userId) { socket.disconnect(); return; }

    onlineUsers.set(userId, socket.id);
    socket.join(userId);

    const db = getDB();
    getMyGroups(userId, db).forEach(group => socket.join(group.id));

    sendInitialData(socket, userId);

    // Notify friends about status change
    db.friendships
        .filter(f => (f.from === userId || f.to === userId) && f.status === 'accepted')
        .forEach(f => {
            const friendId = f.from === userId ? f.to : f.from;
            io.to(friendId).emit('refresh_data');
        });

    socket.on('refresh_data', () => sendInitialData(socket, userId));

    // --- Message Handling ---

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
            to: data.toUserId,
            isGroup: data.isGroup || false,
            content: data.content,
            type: data.type || 'text',
            timestamp: new Date().toISOString()
        };

        // Blocking check (Only for DMs)
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
                     return socket.emit('error', 'You are blocked by this user.');
                 }
            }
        }
        
        const db = getDB(); 
        
        // Добавляем имя отправителя для групповых сообщений
        if (newMessage.isGroup) {
            const sender = db.users.find(u => u.id === userId);
            if (sender) newMessage.senderName = sender.username;
        }
        
        db.messages.push(newMessage); 
        saveDB(db); 

        if (newMessage.isGroup) {
            // Отправляем всем членам группы
            io.to(newMessage.to).emit('new_message', newMessage);
        } else {
            // Отправляем получателю и себе (для подтверждения)
            io.to(newMessage.to).emit('new_message', newMessage);
            socket.emit('message_sent', newMessage);
        }
    });

    socket.on('delete_message', ({ messageId, chatId, isGroup }) => {
        const db = getDB();
        const msgIndex = db.messages.findIndex(m => m.id === messageId && m.from === userId);

        if (msgIndex !== -1) {
            const targetMessage = db.messages[msgIndex];
            
            let recipients = [];
            if (isGroup) {
                const group = db.groups.find(g => g.id === chatId);
                recipients = group ? group.members.map(m => m.id) : [];
            } else {
                recipients = [targetMessage.to, targetMessage.from];
            }
            recipients = recipients.filter(id => id !== userId); 

            db.messages.splice(msgIndex, 1);
            saveDB(db);
            
            io.to(userId).emit('message_deleted', { messageId, chatId, isGroup, permanent: true });
            recipients.forEach(id => io.to(id).emit('message_deleted', { messageId, chatId, isGroup, permanent: true }));
            
            socket.emit('success', 'Message permanently deleted for everyone.');
        } else {
            socket.emit('error', 'Cannot delete this message or message not found.');
        }
    });

    // --- Friend and Group Management (ПОЛНАЯ ИСПРАВЛЕННАЯ ЛОГИКА) ---

    socket.on('friend_request', (username) => {
        const db = getDB();
        const targetUser = db.users.find(u => u.username === username);

        if (!targetUser) {
            return socket.emit('error', 'User not found.');
        }
        if (targetUser.id === userId) {
            return socket.emit('error', 'Cannot send a friend request to yourself.');
        }

        const existing = db.friendships.find(f =>
            (f.from === userId && f.to === targetUser.id) ||
            (f.from === targetUser.id && f.to === userId)
        );

        if (existing) {
            if (existing.status === 'accepted') return socket.emit('error', 'You are already friends.');
            if (existing.status === 'pending' && existing.from === userId) return socket.emit('error', 'Request already sent.');
            if (existing.status === 'pending' && existing.from === targetUser.id) {
                // Взаимный запрос: автоматически принимаем
                existing.status = 'accepted';
                saveDB(db);
                io.to(userId).emit('success', 'Friend added!');
                io.to(targetUser.id).emit('success', 'Friend added!');
                io.to(userId).emit('refresh_data');
                io.to(targetUser.id).emit('refresh_data');
                return;
            }
        }
        
        // Создаем новый запрос
        const newRequest = {
            id: uuidv4(),
            from: userId,
            to: targetUser.id,
            status: 'pending'
        };
        db.friendships.push(newRequest);
        saveDB(db);

        io.to(targetUser.id).emit('refresh_data'); 
        socket.emit('success', 'Friend request sent.');
    });

    socket.on('accept_request', (requestId) => {
        const db = getDB();
        const friendship = db.friendships.find(f => f.id === requestId && f.to === userId && f.status === 'pending');

        if (!friendship) {
            return socket.emit('error', 'Request not found or already processed.');
        }

        friendship.status = 'accepted';
        saveDB(db);

        io.to(userId).emit('success', 'Request accepted. Friend added!');
        io.to(friendship.from).emit('success', 'Request accepted. Friend added!');
        io.to(userId).emit('refresh_data');
        io.to(friendship.from).emit('refresh_data');
    });

    socket.on('decline_request', (requestId) => {
        const db = getDB();
        const friendshipIndex = db.friendships.findIndex(f => f.id === requestId && f.to === userId && f.status === 'pending');

        if (friendshipIndex === -1) {
            return socket.emit('error', 'Request not found or already processed.');
        }

        const senderId = db.friendships[friendshipIndex].from;
        db.friendships.splice(friendshipIndex, 1); 
        saveDB(db);

        io.to(userId).emit('success', 'Request declined.');
        io.to(senderId).emit('refresh_data');
        io.to(userId).emit('refresh_data');
    });
    
    socket.on('remove_friend', (friendId) => {
        const db = getDB();
        const friendshipIndex = db.friendships.findIndex(f => 
            (f.from === userId && f.to === friendId && f.status === 'accepted') || 
            (f.from === friendId && f.to === userId && f.status === 'accepted')
        );

        if (friendshipIndex === -1) {
            return socket.emit('error', 'Friendship not found.');
        }

        db.friendships.splice(friendshipIndex, 1);
        saveDB(db);

        io.to(userId).emit('success', 'Friend removed.');
        io.to(friendId).emit('success', 'Friend removed by partner.');
        io.to(userId).emit('refresh_data');
        io.to(friendId).emit('refresh_data');
    });


    socket.on('block_user', (targetId) => {
        const db = getDB();
        const friendshipIndex = db.friendships.findIndex(f => 
            (f.from === userId && f.to === targetId) || (f.from === targetId && f.to === userId)
        );

        if (friendshipIndex === -1) {
            return socket.emit('error', 'You can only block current friends.');
        }

        const friendship = db.friendships[friendshipIndex];
        const isCurrentlyBlocked = friendship.blockerId;
        
        if (isCurrentlyBlocked) {
            friendship.blockerId = null;
            socket.emit('success', 'User unblocked.');
        } else {
            friendship.blockerId = userId;
            socket.emit('success', 'User blocked.');
        }
        
        saveDB(db);
        io.to(userId).emit('refresh_data');
        io.to(targetId).emit('refresh_data');
    });

    socket.on('create_group', ({ name, members, avatar }) => {
        const db = getDB();
        
        const allMembers = Array.from(new Set([...members, userId]));
        
        if (allMembers.length < 2) return socket.emit('error', 'Group needs at least two members (including you).');
        
        const memberObjects = allMembers.map(id => {
            const user = db.users.find(u => u.id === id);
            return user ? { id: user.id, name: user.username } : null;
        }).filter(m => m !== null);
        
        if (memberObjects.length !== allMembers.length) {
             return socket.emit('error', 'One or more selected users were not found.');
        }

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

        newGroup.members.forEach(member => {
            io.to(member.id).emit('refresh_data');
            if (onlineUsers.has(member.id)) {
                io.sockets.sockets.get(onlineUsers.get(member.id))?.join(newGroup.id);
            }
        });

        socket.emit('success', 'Group created successfully.');
    });
    
    socket.on('add_members_to_group', ({ groupId, membersToAdd }) => {
        const db = getDB();
        const groupIndex = db.groups.findIndex(g => g.id === groupId);
        
        if (groupIndex === -1) return socket.emit('error', 'Group not found.');
        
        const group = db.groups[groupIndex];
        if (!group.admins.includes(userId) && group.creatorId !== userId) {
            return socket.emit('error', 'Only group admins can add members.');
        }

        const newMemberIds = [];
        membersToAdd.forEach(id => {
            if (!group.members.some(m => m.id === id)) {
                const user = db.users.find(u => u.id === id);
                if (user) {
                    group.members.push({ id: user.id, name: user.username });
                    newMemberIds.push(user.id);
                }
            }
        });

        if (newMemberIds.length > 0) {
            saveDB(db);
            group.members.forEach(member => {
                io.to(member.id).emit('refresh_data');
                if (newMemberIds.includes(member.id) && onlineUsers.has(member.id)) {
                    io.sockets.sockets.get(onlineUsers.get(member.id))?.join(group.id);
                }
            });
            socket.emit('success', `${newMemberIds.length} members added.`);
        } else {
            socket.emit('error', 'No new members were added.');
        }
    });


    socket.on('disconnect', () => {
        onlineUsers.delete(userId);
         db.friendships
            .filter(f => (f.from === userId || f.to === userId) && f.status === 'accepted')
            .forEach(f => {
                const friendId = f.from === userId ? f.to : f.from;
                io.to(friendId).emit('refresh_data');
            });
    });
});

server.listen(PORT, () => {
    console.log(`[Flix] Server running on http://localhost:${PORT}`);
});