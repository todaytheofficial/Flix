/**
 * Flix Client Logic (Final Version)
 * Features: Persistence, Friend Requests (Accept/Decline), File Uploads, Responsive UI.
 */
const socket = io();
let currentUser = null;
let currentChatId = null; 

// --- DOM Elements ---
const contactsList = document.getElementById('contacts-list');
const requestsList = document.getElementById('requests-list');
const messagesArea = document.getElementById('messages-area');
const chatTitle = document.getElementById('chat-title');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const inputArea = document.getElementById('input-area');
const fileInput = document.getElementById('file-input');
const fileBtn = document.getElementById('file-btn');
const progressBar = document.getElementById('upload-bar');
const progressContainer = document.querySelector('.progress-container');
const reqCountEl = document.getElementById('req-count');
const requestsToggle = document.getElementById('requests-toggle');
const sidebar = document.querySelector('.sidebar');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');

// Apply Theme
if(localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

// --- INITIALIZATION & AUTH CHECK ---
async function init() {
    const res = await fetch('/api/me');
    if(res.status !== 200) {
        // Redirection should be handled by server's requireAuth middleware, 
        // but this client-side check is a good fallback.
        window.location.href = '/login.html'; 
        return;
    }
    currentUser = await res.json();
    
    // Initialize Mobile UI
    if (window.innerWidth < 768) {
        sidebar.classList.add('hidden'); // Start hidden on mobile
    }
}
init();

// --- SOCKET EVENTS ---
socket.on('init_data', (data) => {
    // This event handles both initial load and refresh after actions (e.g., accept/decline)
    renderRequests(data.requests);
    renderFriends(data.friends);
});

socket.on('refresh_data', () => {
    socket.emit('refresh_data'); // Server will re-send 'init_data'
});

// Receive chat history
socket.on('chat_history', ({ friendId, messages }) => {
    if (friendId !== currentChatId) return; 
    
    messagesArea.innerHTML = ''; 
    messages.forEach(msg => {
        const type = msg.from === currentUser.id ? 'sent' : 'received';
        appendMessage(msg, type);
    });
});

socket.on('new_message', (msg) => {
    if (msg.from === currentChatId) {
        appendMessage(msg, 'received');
    } else {
        // TODO: Implement unread indicator/notification for the sidebar
    }
});

socket.on('message_sent', (msg) => {
    if (msg.to === currentChatId) {
        appendMessage(msg, 'sent');
    }
});

socket.on('error', (err) => alert('Error: ' + err));
socket.on('success', (msg) => console.log('Success: ' + msg));

// --- UI FUNCTIONS ---
function createFriendEl(user) {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.dataset.userId = user.id;
    div.onclick = () => openChat(user);
    div.innerHTML = `
        <img src="${user.avatar}" class="avatar">
        <div class="user-info">
            <h4>${user.username}</h4>
            <span class="${user.status}">${user.status}</span>
        </div>
    `;
    return div;
}

function renderRequests(requests) {
    requestsList.innerHTML = '';
    reqCountEl.innerText = requests.length;

    if (requests.length === 0) {
        requestsList.style.display = 'none';
        requestsList.innerHTML = '<div style="color: var(--text-muted); padding: 5px; font-size: 0.9rem;">No requests.</div>';
    } else {
        // Automatically show the requests list if there are pending requests
        requestsList.style.display = 'block'; 
        requests.forEach(req => {
            const div = document.createElement('div');
            div.className = 'req-item';
            div.id = `req-${req.id}`;
            div.innerHTML = `
                <b>${req.fromName}</b> wants to be friends.
                <div class="req-actions">
                    <button class="btn-small btn-accept" onclick="acceptFriend('${req.id}')">Accept</button>
                    <button class="btn-small" style="background: #ef4444; color: white;" onclick="declineFriend('${req.id}')">Decline</button>
                </div>
            `;
            requestsList.appendChild(div);
        });
    }
}

function renderFriends(friends) {
    contactsList.innerHTML = '';
    friends.forEach(f => contactsList.appendChild(createFriendEl(f)));
}

window.openChat = (user) => {
    currentChatId = user.id;
    chatTitle.innerText = user.username;
    inputArea.style.display = 'flex';
    
    // Set active class
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-user-id="${user.id}"]`).classList.add('active');

    // Clear and request history
    messagesArea.innerHTML = '<div style="text-align:center; color: var(--text-muted); margin-top: 50px;">Loading messages...</div>';
    socket.emit('get_history', { friendId: user.id });

    // NEW: Hide sidebar on chat open if on mobile
    if (window.innerWidth < 768) {
        sidebar.classList.add('hidden');
    }
}

function appendMessage(msg, type) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    
    let contentHtml = '';
    
    // Formatting content based on type (Image, Video, Audio, Text)
    if (msg.type === 'text') {
        // Basic XSS protection for text content
        contentHtml = msg.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    } else if (msg.type.startsWith('image')) {
        contentHtml = `<img src="${msg.content}" alt="Image attachment" style="max-width: 100%; height: auto; border-radius: 8px;">`;
    } else if (msg.type.startsWith('audio')) {
        contentHtml = `<audio controls src="${msg.content}"></audio>`;
    } else if (msg.type.startsWith('video')) {
        contentHtml = `<video controls src="${msg.content}" style="max-width: 100%; height: auto; border-radius: 8px;"></video>`;
    }

    div.innerHTML = contentHtml;
    messagesArea.appendChild(div);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

// --- USER ACTIONS ---
document.getElementById('add-friend-btn').onclick = () => {
    const username = document.getElementById('friend-search').value;
    if(username) socket.emit('friend_request', username);
    document.getElementById('friend-search').value = '';
};

// Toggle requests list visibility
requestsToggle.onclick = () => {
    requestsList.style.display = requestsList.style.display === 'none' ? 'block' : 'none';
};

window.acceptFriend = (reqId) => {
    socket.emit('accept_request', reqId);
};

window.declineFriend = (reqId) => {
    socket.emit('decline_request', reqId);
};

sendBtn.onclick = () => {
    const text = msgInput.value.trim();
    if(!text || !currentChatId) return;
    socket.emit('send_message', { toUserId: currentChatId, content: text, type: 'text' });
    msgInput.value = '';
};

// Enter key to send
msgInput.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') sendBtn.click();
});

// --- MOBILE UI TOGGLE ---
mobileMenuToggle.onclick = () => {
    sidebar.classList.toggle('hidden');
};

// --- FILE UPLOAD ---
fileBtn.onclick = () => {
    if (!currentChatId) return alert('Select a friend first.');
    fileInput.click();
};

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    uploadFile(file);
    fileInput.value = ''; // Clear file input
};

// Drag & Drop
messagesArea.ondragover = (e) => { e.preventDefault(); messagesArea.style.background = 'var(--msg-received)'; };
messagesArea.ondragleave = (e) => { e.preventDefault(); messagesArea.style.background = 'var(--bg-body)'; };
messagesArea.ondrop = (e) => {
    e.preventDefault();
    messagesArea.style.background = 'var(--bg-body)';
    if (!currentChatId) return alert('Select a friend first to send files.');
    const file = e.dataTransfer.files[0];
    if(file) uploadFile(file);
};

function uploadFile(file) {
    const allowedTypes = ['audio/mpeg', 'video/mp4', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        alert('Unsupported file type. Only mp3, mp4, png, jpg, webp are allowed.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    
    // Progress UI
    progressContainer.style.display = 'block';
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            progressBar.style.width = percent + '%';
        }
    };

    xhr.onload = () => {
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            // Send file URL via socket
            socket.emit('send_message', { 
                toUserId: currentChatId, 
                content: data.url, 
                type: data.type 
            });
        } else {
            alert('Upload failed: ' + (xhr.responseText || xhr.statusText));
        }
    };

    xhr.onerror = () => {
        progressContainer.style.display = 'none';
        alert('Upload failed due to a network error.');
    };

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
}