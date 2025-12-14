/**
 * Flix Client Logic (Final Mega Update)
 */
const socket = io();
let currentUser = null;
let currentChatId = null; 
let isCurrentChatGroup = false;
let currentChatFriendData = null; // Store friend/group data

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
const chatActionsBtn = document.getElementById('chat-actions-btn');

// Modals
const chatActionsModal = document.getElementById('chat-actions-modal');
const modalCloseBtn = document.getElementById('modal-close');
const modalRemoveFriend = document.getElementById('modal-remove-friend');
const modalBlockUser = document.getElementById('modal-block-user');

const createGroupBtn = document.getElementById('create-group-btn');
const groupCreationModal = document.getElementById('group-creation-modal');
const groupMemberList = document.getElementById('group-member-list');
const submitGroupBtn = document.getElementById('submit-group-btn');

// Apply Theme
if(localStorage.innerWidth < 768) {
    if(localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
}

// --- INITIALIZATION & AUTH CHECK ---
async function init() {
    const res = await fetch('/api/me');
    if(res.status !== 200) {
        window.location.href = '/register.html'; 
        return;
    }
    currentUser = await res.json();
    
    // Initialize Mobile UI
    if (window.innerWidth < 768) {
        sidebar.classList.add('hidden'); 
    }
}
init();

// --- SOCKET EVENTS ---
socket.on('init_data', (data) => {
    renderRequests(data.requests);
    // Combine friends and groups for the sidebar list
    const combinedList = [...data.friends, ...data.groups.map(g => ({...g, isGroup: true}))];
    renderContacts(combinedList);
});

socket.on('refresh_data', () => {
    socket.emit('refresh_data');
});

// Receive chat history
socket.on('chat_history', ({ chatId, messages, isGroup }) => {
    if (chatId !== currentChatId) return; 
    
    messagesArea.innerHTML = ''; 
    messages.forEach(msg => {
        const type = msg.from === currentUser.id ? 'sent' : 'received';
        appendMessage(msg, type, isGroup);
    });
});

socket.on('new_message', (msg) => {
    if (msg.to === currentChatId || msg.from === currentChatId) {
        const type = msg.from === currentUser.id ? 'sent' : 'received';
        appendMessage(msg, type, msg.isGroup);
    } else {
        // TODO: Implement unread indicator/notification
    }
});

socket.on('message_deleted', ({ messageId, chatId }) => {
    if (chatId === currentChatId) {
        const msgEl = document.getElementById(`msg-${messageId}`);
        if (msgEl) {
            msgEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">(Message deleted)</span>';
            msgEl.classList.add('deleted');
        }
    }
});

socket.on('message_sent', (msg) => {
    if (msg.to === currentChatId) {
        const type = msg.from === currentUser.id ? 'sent' : 'received';
        appendMessage(msg, type, msg.isGroup);
    }
});

socket.on('error', (err) => alert('Error: ' + err));
socket.on('success', (msg) => console.log('Success: ' + msg));

// --- UI FUNCTIONS ---
function createContactEl(contact) {
    const isGroup = contact.isGroup;
    const div = document.createElement('div');
    div.className = 'user-item';
    div.dataset.chatId = contact.id;
    div.dataset.isGroup = isGroup;

    div.onclick = () => openChat(contact);
    
    const statusHtml = isGroup ? 
        `<span class="group">Group (${contact.members.length})</span>` : 
        `<span class="${contact.status}">${contact.isBlocked ? 'Blocked' : contact.status}</span>`;

    div.innerHTML = `
        <img src="${contact.avatar}" class="avatar">
        <div class="user-info">
            <h4>${contact.name || contact.username}</h4>
            ${statusHtml}
        </div>
    `;
    return div;
}

function renderContacts(contacts) {
    contactsList.innerHTML = '';
    contacts.forEach(c => contactsList.appendChild(createContactEl(c)));
}

function renderRequests(requests) {
    // Logic similar to previous step, ensuring auto-refresh updates the list
    requestsList.innerHTML = '';
    reqCountEl.innerText = requests.length;

    if (requests.length === 0) {
        requestsList.style.display = 'none';
        requestsList.innerHTML = '<div style="color: var(--text-muted); padding: 5px; font-size: 0.9rem;">No requests.</div>';
    } else {
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

function openChat(contact) {
    currentChatId = contact.id;
    isCurrentChatGroup = contact.isGroup || false;
    currentChatFriendData = contact;
    chatTitle.innerText = contact.name || contact.username;
    inputArea.style.display = 'flex';
    
    // Manage Chat Actions Button visibility
    chatActionsBtn.style.display = isCurrentChatGroup ? 'none' : 'block';

    // Set active class
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-chat-id="${contact.id}"]`).classList.add('active');

    // Clear and request history
    messagesArea.innerHTML = '<div style="text-align:center; color: var(--text-muted); margin-top: 50px;">Loading messages...</div>';
    socket.emit('get_history', { chatId: contact.id, isGroup: isCurrentChatGroup });

    // Hide sidebar on chat open if on mobile
    if (window.innerWidth < 768) {
        sidebar.classList.add('hidden');
    }
}

function appendMessage(msg, type, isGroup) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.id = `msg-${msg.id}`;
    div.dataset.messageId = msg.id; // For deletion
    
    let contentHtml = '';
    
    if (isGroup && type === 'received') {
        // Find sender name for group messages
        const group = currentChatFriendData;
        const sender = group.members.find(m => m.id === msg.from)?.name || 'Unknown';
        contentHtml += `<div class="group-sender">${sender}</div>`;
    }

    // Formatting content based on type (Image, Video, Audio, Text)
    if (msg.type === 'text') {
        contentHtml += msg.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    } else if (msg.type.startsWith('image')) {
        contentHtml += `<img src="${msg.content}" alt="Image attachment">`;
    } else if (msg.type.startsWith('audio')) {
        contentHtml += `<audio controls src="${msg.content}"></audio>`;
    } else if (msg.type.startsWith('video')) {
        contentHtml += `<video controls src="${msg.content}"></video>`;
    }
    
    // Add right-click context menu listener for deletion
    if (type === 'sent') {
        div.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm('Delete this message for yourself only?')) {
                socket.emit('delete_message', { messageId: msg.id, chatId: currentChatId, isGroup: isGroup });
            }
        };
    }


    div.innerHTML = contentHtml;
    messagesArea.appendChild(div);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

// --- USER ACTIONS ---
// Friend Requests
window.acceptFriend = (reqId) => { socket.emit('accept_request', reqId); };
window.declineFriend = (reqId) => { socket.emit('decline_request', reqId); };

// Send Message
sendBtn.onclick = () => {
    const text = msgInput.value.trim();
    if(!text || !currentChatId) return;
    
    // Check if the current user is trying to message a blocked user
    if (currentChatFriendData?.isBlocked && !isCurrentChatGroup) {
         return alert("You or the other user is blocked. Cannot send messages.");
    }
    
    socket.emit('send_message', { 
        toUserId: currentChatId, 
        content: text, 
        type: 'text',
        isGroup: isCurrentChatGroup
    });
    msgInput.value = '';
};

// --- MODALS AND MANAGEMENT LOGIC ---

// Mobile Menu Toggle
mobileMenuToggle.onclick = () => {
    sidebar.classList.toggle('hidden');
};

// Chat Actions Modal (Block, Remove Friend)
chatActionsBtn.onclick = () => {
    if (!currentChatId || isCurrentChatGroup) return;

    // Update modal buttons based on blocking status
    const isBlocked = currentChatFriendData?.isBlocked;
    modalBlockUser.innerText = isBlocked ? 'Unblock User (Not Implemented)' : 'Block User';
    
    chatActionsModal.style.display = 'flex';
};

modalCloseBtn.onclick = () => { chatActionsModal.style.display = 'none'; };
document.getElementById('modal-close-group').onclick = () => { groupCreationModal.style.display = 'none'; };

// Remove Friend Action
modalRemoveFriend.onclick = () => {
    if (confirm(`Are you sure you want to remove ${currentChatFriendData.username}?`)) {
        socket.emit('remove_friend', currentChatId);
        chatActionsModal.style.display = 'none';
        currentChatId = null; 
        chatTitle.innerText = 'Select a chat';
        messagesArea.innerHTML = '<div style="text-align:center; color: var(--text-muted); margin-top: 50px;">Friend removed.</div>';
    }
};

// Block User Action
modalBlockUser.onclick = () => {
    if (confirm(`Are you sure you want to block ${currentChatFriendData.username}?`)) {
        socket.emit('block_user', currentChatId);
        chatActionsModal.style.display = 'none';
    }
};

// Delete Chat History (Simple client-side clearing for now)
document.getElementById('modal-delete-chat').onclick = () => {
    if (confirm('Are you sure you want to delete the local chat history? (Will not delete messages from server)')) {
        messagesArea.innerHTML = '<div style="text-align:center; color: var(--text-muted); margin-top: 50px;">Chat history cleared.</div>';
        chatActionsModal.style.display = 'none';
    }
};

// Group Creation UI/Logic
createGroupBtn.onclick = () => {
    socket.emit('refresh_data'); // Get the latest friend list
    
    // Populate the member list with current friends
    groupMemberList.innerHTML = '';
    const friends = Array.from(contactsList.children).filter(el => el.dataset.isGroup === 'false');
    
    friends.forEach(friendEl => {
        const friendId = friendEl.dataset.chatId;
        const friendName = friendEl.querySelector('h4').innerText;
        const label = document.createElement('label');
        label.style.display = 'block';
        label.innerHTML = `<input type="checkbox" name="group_member" value="${friendId}"> ${friendName}`;
        groupMemberList.appendChild(label);
    });
    
    groupCreationModal.style.display = 'flex';
};

submitGroupBtn.onclick = () => {
    const groupName = document.getElementById('group-name-input').value.trim();
    const groupAvatar = document.getElementById('group-avatar-input').value.trim();
    const selectedMembers = Array.from(document.querySelectorAll('#group-member-list input:checked'))
                                .map(input => input.value);
    
    if (!groupName || selectedMembers.length === 0) {
        return alert('Please enter a group name and select at least one friend.');
    }

    socket.emit('create_group', {
        name: groupName,
        members: selectedMembers,
        avatar: groupAvatar
    });
    
    groupCreationModal.style.display = 'none';
};

// --- FILE UPLOAD (Remains the same) ---

fileBtn.onclick = () => {
    if (!currentChatId) return alert('Select a friend or group first.');
    fileInput.click();
};

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    uploadFile(file);
    fileInput.value = ''; 
};

// Drag & Drop
messagesArea.ondragover = (e) => { e.preventDefault(); messagesArea.style.background = 'var(--msg-received)'; };
messagesArea.ondragleave = (e) => { e.preventDefault(); messagesArea.style.background = 'var(--bg-body)'; };
messagesArea.ondrop = (e) => {
    e.preventDefault();
    messagesArea.style.background = 'var(--bg-body)';
    if (!currentChatId) return alert('Select a friend or group first to send files.');
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
                type: data.type,
                isGroup: isCurrentChatGroup
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