/**
 * client.js - Flix Client Logic (FINAL COMPLETE VERSION)
 */
const socket = io();
let currentUser = null;
let currentChatId = null; 
let isCurrentChatGroup = false;
let currentChatFriendData = null; 
let globalFriendsList = []; 

// --- DOM Elements ---
const sidebar = document.querySelector('.sidebar');
const contactsList = document.getElementById('contacts-list');
const messagesArea = document.getElementById('messages-area');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const uploadBar = document.getElementById('upload-bar');
const progressContainer = document.querySelector('.progress-container');
const chatTitle = document.getElementById('chat-title');
const inputArea = document.getElementById('input-area');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const chatActionsBtn = document.getElementById('chat-actions-btn');
const logoutBtn = document.getElementById('logout-btn');


// Request/Friend Search Elements
const friendSearchInput = document.getElementById('friend-search');
const addFriendBtn = document.getElementById('add-friend-btn');
const requestsToggle = document.getElementById('requests-toggle');
const requestsList = document.getElementById('requests-list');
const reqCountEl = document.getElementById('req-count');
const autocompleteDropdown = document.querySelector('.autocomplete-dropdown');


// Modal Elements (All remain the same for structure)
const chatActionsModal = document.getElementById('chat-actions-modal');
const modalCloseBtn = document.getElementById('modal-close');
const modalRemoveFriendBtn = document.getElementById('modal-remove-friend');
const modalBlockUserBtn = document.getElementById('modal-block-user');
const modalDeleteChatBtn = document.getElementById('modal-delete-chat');

const createGroupBtn = document.getElementById('create-group-btn');
const groupCreationModal = document.getElementById('group-creation-modal');
const groupNameInput = document.getElementById('group-name-input');
const groupAvatarInput = document.getElementById('group-avatar-input');
const groupAvatarUpload = document.getElementById('group-avatar-upload');
const groupMemberList = document.getElementById('group-member-list');
const submitGroupBtn = document.getElementById('submit-group-btn');
const modalCloseGroupBtn = document.getElementById('modal-close-group');

const addMemberBtn = document.getElementById('add-member-btn');
const addMemberModal = document.getElementById('add-member-modal');
const addMemberList = document.getElementById('add-member-list');
const submitAddMember = document.getElementById('submit-add-member');
const modalCloseAddMember = document.getElementById('modal-close-add-member');


// --- CORE INITIALIZATION & THEME FIX ---

const storedTheme = localStorage.getItem('theme');
if (storedTheme) {
    document.documentElement.setAttribute('data-theme', storedTheme);
} else {
    document.documentElement.setAttribute('data-theme', 'light');
}

async function init() {
    const res = await fetch('/api/me');
    if(res.status !== 200) {
        window.location.href = '/register.html'; 
        return;
    }
    currentUser = await res.json();
    
    if (window.innerWidth < 768) {
        sidebar.classList.add('hidden'); 
    }
    
    setupEventListeners();
}
init();


// --- SOCKET.IO HANDLERS ---

socket.on('init_data', (data) => {
    currentUser = data.currentUser;
    globalFriendsList = data.friends; 
    renderRequests(data.requests);
    renderContacts([...data.friends, ...data.groups]);
    // If the current chat is a friend who was blocked/unblocked, update its state
    if (currentChatId && !isCurrentChatGroup) {
        const updatedFriend = data.friends.find(f => f.id === currentChatId);
        if (updatedFriend) {
            currentChatFriendData = updatedFriend;
            openChat(updatedFriend, false); // Re-open chat to update input state
        }
    }
});

socket.on('refresh_data', () => {
    socket.emit('refresh_data');
});

socket.on('chat_history', ({ chatId, messages, isGroup }) => {
    if (chatId !== currentChatId) return;
    
    messagesArea.innerHTML = '';
    messages.forEach(msg => messagesArea.appendChild(createMessageEl(msg)));
    scrollToBottom();
});

socket.on('new_message', (msg) => {
    if (msg.to === currentChatId || msg.from === currentChatId) {
        messagesArea.appendChild(createMessageEl(msg));
        scrollToBottom();
    }
    socket.emit('refresh_data'); 
});

socket.on('message_sent', (msg) => {
    if (msg.to === currentChatId) {
        messagesArea.appendChild(createMessageEl(msg));
        scrollToBottom();
    }
});

socket.on('message_deleted', ({ messageId, chatId, permanent }) => {
    if (chatId === currentChatId && permanent) {
        const msgEl = document.getElementById(`msg-${messageId}`);
        if (msgEl) {
            msgEl.remove(); 
        }
    }
});

socket.on('error', (message) => {
    alert(`Error: ${message}`);
    console.error(message);
});

socket.on('success', (message) => {
    console.log(`Success: ${message}`);
    if (message.includes('Friend added') || message.includes('Request declined') || message.includes('Group created') || message.includes('members added') || message.includes('blocked') || message.includes('unblocked')) {
         socket.emit('refresh_data');
    }
});


// --- UI RENDERING FUNCTIONS ---

const EMOJI_MAP = {
    ':manface:': '<img src="/assets/man_face.png" class="custom-emoji" alt="Man Face">',
    ':apple:': '🍎',
    ':thumbsup:': '👍'
};
function replaceEmojis(text) {
    let output = text;
    for (const key in EMOJI_MAP) {
        output = output.replaceAll(key, EMOJI_MAP[key]);
    }
    return output;
}

function createContactEl(contact, isGroup = false) {
    const el = document.createElement('div');
    el.className = 'user-item';
    if (contact.id === currentChatId) el.classList.add('active');

    const statusClass = isGroup ? 'group' : (contact.status === 'online' ? 'online' : 'offline');
    const statusText = isGroup ? 'Group' : contact.status;
    const isBlocked = contact.isBlocked ? ' (Blocked)' : '';
    const avatarSrc = contact.avatar || contact.groupAvatar || `https://ui-avatars.com/api/?name=${(contact.name || contact.username).substring(0,2)}&background=3b82f6&color=fff&size=128&bold=true`;

    el.innerHTML = `
        <img src="${avatarSrc}" alt="${contact.name || contact.username} avatar" class="avatar">
        <div class="user-info">
            <h4>${contact.name || contact.username}</h4>
            <span class="${statusClass}">${statusText}${isBlocked}</span>
        </div>
    `;

    el.onclick = () => openChat(contact, isGroup);
    return el;
}

function renderContacts(contacts) {
    contactsList.innerHTML = '';
    
    const friends = globalFriendsList.sort((a, b) => { 
        if (a.status === 'online' && b.status !== 'online') return -1;
        if (a.status !== 'online' && b.status === 'online') return 1;
        return a.username.localeCompare(b.username);
    });
    
    const groups = contacts.filter(c => c.members).sort((a, b) => a.name.localeCompare(b.name));

    friends.forEach(f => contactsList.appendChild(createContactEl(f, false)));
    groups.forEach(g => contactsList.appendChild(createContactEl(g, true)));
}

function renderRequests(requests) {
    reqCountEl.innerText = requests.length;

    requestsList.innerHTML = '';
    const isOpen = requestsToggle.getAttribute('data-open') === 'true';
    if (requests.length > 0 && isOpen) {
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
    } else {
        requestsList.style.display = 'none';
    }
}

window.acceptFriend = (reqId) => { socket.emit('accept_request', reqId); };
window.declineFriend = (reqId) => { socket.emit('decline_request', reqId); };

function createMessageEl(msg) {
    const el = document.createElement('div');
    el.id = `msg-${msg.id}`;
    el.className = `msg ${msg.from === currentUser.id ? 'sent' : 'received'}`;
    
    let contentHTML = msg.content;
    const senderName = msg.isGroup ? currentChatFriendData.members.find(m => m.id === msg.from)?.name : '';

    const mediaType = msg.type.split('/')[0];
    if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') {
        if (mediaType === 'image' && msg.type === 'image/svg+xml') {
            contentHTML = `<img src="${msg.content}" alt="SVG Sticker" style="max-height: 150px;"/>`;
        } else if (mediaType === 'image') {
            contentHTML = `<img src="${msg.content}" alt="Image" />`;
        } else if (mediaType === 'video') {
            contentHTML = `<video controls src="${msg.content}"></video>`;
        } else if (mediaType === 'audio') {
            contentHTML = `<audio controls src="${msg.content}"></audio>`;
        }
    } else if (msg.type === 'text') {
        contentHTML = replaceEmojis(msg.content); 
    }
    
    if (msg.isGroup && msg.from !== currentUser.id) {
        el.innerHTML = `<div class="group-sender">${senderName}</div>${contentHTML}`;
    } else {
        el.innerHTML = contentHTML;
    }
    
    if (msg.from === currentUser.id) {
        el.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm("Permanently delete this message for everyone?")) {
                socket.emit('delete_message', { messageId: msg.id, chatId: currentChatId, isGroup: isCurrentChatGroup });
            }
        };
        // Fix for mobile long press
        let timer;
        el.ontouchstart = () => {
            timer = setTimeout(() => {
                if (confirm("Permanently delete this message for everyone?")) {
                    socket.emit('delete_message', { messageId: msg.id, chatId: currentChatId, isGroup: isCurrentChatGroup });
                }
            }, 700); 
        };
        el.ontouchend = () => clearTimeout(timer);
        el.ontouchmove = () => clearTimeout(timer);
    }

    return el;
}


// --- CHAT MANAGEMENT ---

function openChat(contact, isGroup) {
    if (window.innerWidth < 768) sidebar.classList.add('hidden');
    
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    const contactEl = contactsList.querySelector(`[onclick*="${contact.id}"].user-item`);
    if (contactEl) contactEl.classList.add('active');

    currentChatId = contact.id;
    isCurrentChatGroup = isGroup;
    currentChatFriendData = contact;
    chatTitle.innerText = isGroup ? contact.name : contact.username;
    inputArea.style.display = 'flex';
    chatActionsBtn.style.display = 'block';

    const isBlocked = contact.isBlocked || false;
    const isSenderBlocked = isBlocked && contact.blockerId !== currentUser.id;
    const isReceiverBlocked = isBlocked && contact.blockerId === currentUser.id;
    
    // Disable inputs based on block status or if it's a group (which shouldn't be blocked)
    const isDisabled = isBlocked && !isGroup;

    msgInput.disabled = isDisabled;
    sendBtn.disabled = isDisabled;
    fileInput.disabled = isDisabled;

    if (isReceiverBlocked) {
        msgInput.placeholder = "You have blocked this user.";
    } else if (isSenderBlocked) {
        msgInput.placeholder = "You are blocked by this user.";
    } else {
        msgInput.placeholder = "Type a message...";
    }

    messagesArea.innerHTML = '<div style="text-align:center; padding: 20px;">Loading history...</div>';
    socket.emit('get_history', { chatId: currentChatId, isGroup: isGroup });
}


// --- MODAL & ACTION HANDLERS ---

function showModal(modal) { modal.style.display = 'flex'; }
function hideModal(modal) { modal.style.display = 'none'; }

function setupEventListeners() {
    mobileMenuToggle.onclick = () => sidebar.classList.toggle('hidden');

    // 1. Send Message
    sendBtn.onclick = () => {
        const content = msgInput.value.trim();
        if (!content || !currentChatId || msgInput.disabled) return;

        socket.emit('send_message', {
            toUserId: currentChatId,
            content: content,
            isGroup: isCurrentChatGroup,
            type: 'text'
        });
        msgInput.value = '';
    };

    msgInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !msgInput.disabled) sendBtn.click();
    });

    // 2. File Upload
    fileInput.onchange = async (e) => {
        // ... (File Upload Logic remains the same) ...
        const file = e.target.files[0];
        if (!file || !currentChatId) return;
        
        progressContainer.style.display = 'block';
        uploadBar.style.width = '0%';

        const formData = new FormData();
        formData.append('file', file);

        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload', true);
            
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 100;
                    uploadBar.style.width = `${percent}%`;
                }
            };
            
            xhr.onload = () => {
                progressContainer.style.display = 'none';
                if (xhr.status === 200) {
                    const result = JSON.parse(xhr.responseText);
                    socket.emit('send_message', {
                        toUserId: currentChatId,
                        content: result.url,
                        isGroup: isCurrentChatGroup,
                        type: result.type
                    });
                } else {
                    alert('File upload failed.');
                }
            };
            xhr.onerror = () => {
                progressContainer.style.display = 'none';
                alert('File upload failed (Network error).');
            };

            xhr.send(formData);

        } catch (error) {
            console.error(error);
            progressContainer.style.display = 'none';
        }
    };
    document.getElementById('file-btn').onclick = () => fileInput.click();

    // 3. Clipboard Paste Handler
    document.addEventListener('paste', async (e) => {
        if (!currentChatId || msgInput !== document.activeElement || msgInput.disabled) return;

        const clipboardItems = e.clipboardData.items;
        for (let i = 0; i < clipboardItems.length; i++) {
            const item = clipboardItems[i];
            
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault(); 
                    progressContainer.style.display = 'block';
                    uploadBar.style.width = '0%';
                    
                    const formData = new FormData();
                    formData.append('file', file, `pasted_image.${file.type.split('/')[1] || 'png'}`); 
                    
                    try {
                        const res = await fetch('/api/upload', {
                            method: 'POST',
                            body: formData
                        });
                        progressContainer.style.display = 'none';
                        if (res.ok) {
                            const result = await res.json();
                            socket.emit('send_message', {
                                toUserId: currentChatId,
                                content: result.url,
                                isGroup: isCurrentChatGroup,
                                type: result.type 
                            });
                        } else {
                            alert('Failed to paste and upload image.');
                        }
                    } catch (error) {
                         alert('Error during paste upload.');
                         progressContainer.style.display = 'none';
                    }
                    return;
                }
            }
        }
    });

    // 4. Friend Search & Autocomplete
    addFriendBtn.onclick = () => {
        const username = friendSearchInput.value.trim();
        if (username) {
            socket.emit('friend_request', username);
            friendSearchInput.value = '';
            autocompleteDropdown.innerHTML = '';
        }
    };

    requestsToggle.onclick = () => {
        const isOpen = requestsToggle.getAttribute('data-open') === 'true';
        requestsToggle.setAttribute('data-open', !isOpen);
        socket.emit('refresh_data'); 
    };

    friendSearchInput.oninput = async () => {
        const query = friendSearchInput.value.trim();
        if (query.length < 2) {
            autocompleteDropdown.innerHTML = '';
            return;
        }

        const res = await fetch(`/api/search_users?query=${encodeURIComponent(query)}`);
        const users = await res.json();

        autocompleteDropdown.innerHTML = '';
        const inputRect = friendSearchInput.getBoundingClientRect();
        autocompleteDropdown.style.width = `${inputRect.width}px`;
        autocompleteDropdown.style.top = `${inputRect.bottom}px`; 
        autocompleteDropdown.style.left = `${inputRect.left}px`;
        
        if (users.length > 0) {
            users.forEach(user => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.innerHTML = `
                    <img src="${user.avatar}" class="avatar" style="width:30px; height:30px; margin-right: 10px;">
                    <span>${user.username}</span>
                `;
                item.onclick = () => {
                    friendSearchInput.value = user.username;
                    autocompleteDropdown.innerHTML = '';
                };
                autocompleteDropdown.appendChild(item);
            });
        }
    };
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#friend-search') && !e.target.closest('.autocomplete-dropdown')) {
            autocompleteDropdown.innerHTML = '';
        }
    });

    // 5. Chat Actions Modal
    chatActionsBtn.onclick = () => {
        if (!currentChatId) return;
        
        const isGroup = currentChatFriendData.members ? true : false;
        modalRemoveFriendBtn.style.display = isGroup ? 'none' : 'block';
        modalBlockUserBtn.style.display = isGroup ? 'none' : 'block';
        addMemberBtn.style.display = isGroup ? 'block' : 'none';

        if (!isGroup) {
            if (currentChatFriendData.isBlocked && currentChatFriendData.blockerId === currentUser.id) {
                modalBlockUserBtn.innerText = 'Unblock User';
                modalBlockUserBtn.style.color = 'var(--accent)';
            } else {
                modalBlockUserBtn.innerText = 'Block User';
                modalBlockUserBtn.style.color = '#ef4444';
            }
        }

        showModal(chatActionsModal);
    };

    modalCloseBtn.onclick = () => hideModal(chatActionsModal);

    modalRemoveFriendBtn.onclick = () => {
        if (confirm(`Are you sure you want to remove ${currentChatFriendData.username}?`)) {
            socket.emit('remove_friend', currentChatId);
            hideModal(chatActionsModal);
        }
    };
    
    modalBlockUserBtn.onclick = () => {
        const action = (currentChatFriendData.isBlocked && currentChatFriendData.blockerId === currentUser.id) ? 'unblock' : 'block';
        if (confirm(`Are you sure you want to ${action} ${currentChatFriendData.username}?`)) {
            socket.emit('block_user', currentChatId);
            hideModal(chatActionsModal);
        }
    };

    modalDeleteChatBtn.onclick = () => {
        alert('Local chat history deletion not implemented. Use right-click (long press on mobile) on a message for permanent deletion.');
        hideModal(chatActionsModal);
    };

    // 6. Group Creation Modal (unchanged logic)
    createGroupBtn.onclick = () => {
        groupMemberList.innerHTML = '';
        if (globalFriendsList.length === 0) {
            groupMemberList.innerHTML = '<p style="color:var(--text-muted);">Add friends first to create a group.</p>';
        } else {
            globalFriendsList.forEach(friend => {
                const checkbox = document.createElement('label');
                checkbox.style.cssText = 'display:flex; align-items:center; margin-bottom:8px;';
                checkbox.innerHTML = `
                    <input type="checkbox" name="group-member" value="${friend.id}" style="width: auto; margin-right: 10px; margin-bottom:0;">
                    <img src="${friend.avatar}" class="avatar" style="width:25px; height:25px; margin-right: 5px;">
                    ${friend.username}
                `;
                groupMemberList.appendChild(checkbox);
            });
        }
        showModal(groupCreationModal);
    };

    modalCloseGroupBtn.onclick = () => hideModal(groupCreationModal);

    submitGroupBtn.onclick = async () => {
        const name = groupNameInput.value.trim();
        const file = groupAvatarUpload.files[0];
        const selectedMembers = Array.from(groupMemberList.querySelectorAll('input[name="group-member"]:checked')).map(el => el.value);

        if (!name) return alert('Please enter a group name.');
        
        let avatarUrl = groupAvatarInput.value.trim() || ''; 

        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                if (res.ok) {
                    const result = await res.json();
                    avatarUrl = result.url;
                } else {
                    return alert('Failed to upload group avatar.');
                }
            } catch (error) {
                return alert('Network error during avatar upload.');
            }
        }

        socket.emit('create_group', {
            name: name,
            members: selectedMembers,
            avatar: avatarUrl 
        });
        
        hideModal(groupCreationModal);
        groupNameInput.value = '';
        groupAvatarInput.value = '';
        groupAvatarUpload.value = ''; 
    };
    
    // 7. Add Member Modal (unchanged logic)
    addMemberBtn.onclick = () => {
        if (!currentChatId || !isCurrentChatGroup) return;
        hideModal(chatActionsModal);

        const currentGroupMembers = currentChatFriendData.members.map(m => m.id);
        addMemberList.innerHTML = '';
        
        const eligibleFriends = globalFriendsList.filter(f => !currentGroupMembers.includes(f.id));
        
        if (eligibleFriends.length === 0) {
            addMemberList.innerHTML = '<p style="color:var(--text-muted);">No friends available to add.</p>';
        } else {
            eligibleFriends.forEach(friend => {
                const checkbox = document.createElement('label');
                checkbox.style.cssText = 'display:flex; align-items:center; margin-bottom:8px;';
                checkbox.innerHTML = `
                    <input type="checkbox" name="add-member" value="${friend.id}" style="width: auto; margin-right: 10px; margin-bottom:0;">
                    <img src="${friend.avatar}" class="avatar" style="width:25px; height:25px; margin-right: 5px;">
                    ${friend.username}
                `;
                addMemberList.appendChild(checkbox);
            });
        }
        
        showModal(addMemberModal);
    };

    modalCloseAddMember.onclick = () => hideModal(addMemberModal);

    submitAddMember.onclick = () => {
        const membersToAdd = Array.from(addMemberList.querySelectorAll('input[name="add-member"]:checked')).map(el => el.value);

        if (membersToAdd.length === 0) return alert('Select members to add.');

        socket.emit('add_members_to_group', {
            groupId: currentChatId,
            membersToAdd: membersToAdd
        });
        
        hideModal(addMemberModal);
    };

    // 8. Log Out Handler
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            if (confirm("Are you sure you want to log out?")) {
                try {
                    const res = await fetch('/api/logout', { method: 'POST' });
                    if (res.ok) {
                        window.location.href = '/login.html';
                    } else {
                        alert('Logout failed on server.');
                    }
                } catch (error) {
                    console.error('Logout error:', error);
                    alert('Network error during logout.');
                }
            }
        };
    }
}


// --- UTILITIES ---

function scrollToBottom() {
    messagesArea.scrollTop = messagesArea.scrollHeight;
}