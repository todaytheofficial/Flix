/**
 * client.js - Flix Client Logic (Final Mega Update)
 * Includes: Theme Management, Socket.IO, Chat/Group Logic, Media Upload, Modals, Autocomplete.
 */
const socket = io();
let currentUser = null;
let currentChatId = null; 
let isCurrentChatGroup = false;
let currentChatFriendData = null; // Stores friend/group object for header info

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

// Request/Friend Search Elements
const friendSearchInput = document.getElementById('friend-search');
const addFriendBtn = document.getElementById('add-friend-btn');
const requestsToggle = document.getElementById('requests-toggle');
const requestsList = document.getElementById('requests-list');
const reqCountEl = document.getElementById('req-count');
// Autocomplete
const autocompleteDropdown = document.createElement('div');
autocompleteDropdown.className = 'autocomplete-dropdown';
friendSearchInput.parentElement.appendChild(autocompleteDropdown); 

// Modal Elements
const chatActionsModal = document.getElementById('chat-actions-modal');
const modalCloseBtn = document.getElementById('modal-close');
const modalRemoveFriendBtn = document.getElementById('modal-remove-friend');
const modalBlockUserBtn = document.getElementById('modal-block-user');
const modalDeleteChatBtn = document.getElementById('modal-delete-chat');

const createGroupBtn = document.getElementById('create-group-btn');
const groupCreationModal = document.getElementById('group-creation-modal');
const groupNameInput = document.getElementById('group-name-input');
const groupAvatarInput = document.getElementById('group-avatar-input');
const groupMemberList = document.getElementById('group-member-list');
const submitGroupBtn = document.getElementById('submit-group-btn');
const modalCloseGroupBtn = document.getElementById('modal-close-group');


// --- CORE INITIALIZATION & THEME FIX ---

// FIX: Apply theme immediately before init (fixes white flash on dark theme)
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
    
    // Set up Mobile UI state
    if (window.innerWidth < 768) {
        sidebar.classList.add('hidden'); 
    }
    
    // Set up event listeners that depend on currentUser
    setupEventListeners();
}
init();


// --- SOCKET.IO HANDLERS ---

socket.on('init_data', (data) => {
    // data: { requests, friends, groups }
    renderRequests(data.requests);
    renderContacts([...data.friends, ...data.groups]);
});

socket.on('refresh_data', () => {
    // Re-request initial data after an action (friendship change, group creation)
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
    // Simple visual update for contact list (could be optimized)
    socket.emit('refresh_data'); 
});

socket.on('message_sent', (msg) => {
    // This is for the sender to confirm and display their own message
    if (msg.to === currentChatId) {
        messagesArea.appendChild(createMessageEl(msg));
        scrollToBottom();
    }
});

socket.on('message_deleted', ({ messageId, chatId }) => {
    if (chatId === currentChatId) {
        const msgEl = document.getElementById(`msg-${messageId}`);
        if (msgEl) {
            msgEl.classList.add('deleted');
            msgEl.innerHTML = '(Message deleted)';
        }
    }
    // No need to refresh contacts list here
});

socket.on('error', (message) => {
    alert(`Error: ${message}`);
    console.error(message);
});

socket.on('success', (message) => {
    console.log(`Success: ${message}`);
});


// --- UI RENDERING FUNCTIONS ---

function createContactEl(contact, isGroup = false) {
    const el = document.createElement('div');
    el.className = 'user-item';
    if (contact.id === currentChatId) el.classList.add('active');

    const statusClass = isGroup ? 'group' : (contact.status === 'online' ? 'online' : 'offline');
    const statusText = isGroup ? 'Group' : contact.status;
    const isBlocked = contact.isBlocked ? ' (Blocked)' : '';

    el.innerHTML = `
        <img src="${contact.avatar || contact.groupAvatar}" alt="${contact.name || contact.username} avatar" class="avatar">
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
    
    // Sort friends first, then groups. Online friends first.
    const friends = contacts.filter(c => !c.members).sort((a, b) => {
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
    if (requests.length > 0 && requestsToggle.getAttribute('data-open') === 'true') {
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

// Global window functions for request buttons
window.acceptFriend = (reqId) => { socket.emit('accept_request', reqId); };
window.declineFriend = (reqId) => { socket.emit('decline_request', reqId); };

function createMessageEl(msg) {
    const el = document.createElement('div');
    el.id = `msg-${msg.id}`;
    el.className = `msg ${msg.from === currentUser.id ? 'sent' : 'received'}`;
    
    let contentHTML = msg.content;
    const senderName = msg.isGroup ? currentChatFriendData.members.find(m => m.id === msg.from)?.name : '';

    if (msg.type !== 'text') {
        const mediaType = msg.type.split('/')[0];
        if (mediaType === 'image') {
            contentHTML = `<img src="${msg.content}" alt="Image" />`;
        } else if (mediaType === 'video') {
            contentHTML = `<video controls src="${msg.content}"></video>`;
        } else if (mediaType === 'audio') {
            contentHTML = `<audio controls src="${msg.content}"></audio>`;
        }
    }
    
    if (msg.isGroup && msg.from !== currentUser.id) {
        el.innerHTML = `<div class="group-sender">${senderName}</div>${contentHTML}`;
    } else {
        el.innerHTML = contentHTML;
    }
    
    // Add context menu for deletion (sender only)
    if (msg.from === currentUser.id && msg.type !== 'deleted') {
        el.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm("Delete this message? (Only visible to you, currently)")) {
                socket.emit('delete_message', { messageId: msg.id, chatId: currentChatId, isGroup: isCurrentChatGroup });
            }
        };
    }

    return el;
}


// --- CHAT MANAGEMENT ---

function openChat(contact, isGroup) {
    // Hide sidebar on mobile
    if (window.innerWidth < 768) sidebar.classList.add('hidden');
    
    // Update active class
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    const contactEl = contactsList.querySelector(`[onclick*="${contact.id}"].user-item`);
    if (contactEl) contactEl.classList.add('active');

    // Set chat state
    currentChatId = contact.id;
    isCurrentChatGroup = isGroup;
    currentChatFriendData = contact;
    chatTitle.innerText = isGroup ? contact.name : contact.username;
    inputArea.style.display = 'flex';
    chatActionsBtn.style.display = 'block';

    // Disable input if blocked in DM
    if (!isGroup && contact.isBlocked) {
        msgInput.disabled = true;
        msgInput.placeholder = contact.blockerId === currentUser.id ? "You have blocked this user." : "You are blocked by this user.";
        sendBtn.disabled = true;
        fileInput.disabled = true;
    } else {
        msgInput.disabled = false;
        msgInput.placeholder = "Type a message...";
        sendBtn.disabled = false;
        fileInput.disabled = false;
    }

    // Load history
    messagesArea.innerHTML = '<div style="text-align:center; padding: 20px;">Loading history...</div>';
    socket.emit('get_history', { chatId: currentChatId, isGroup: isGroup });
}


// --- MODAL & ACTION HANDLERS ---

function showModal(modal) {
    modal.style.display = 'flex';
}

function hideModal(modal) {
    modal.style.display = 'none';
}

function setupEventListeners() {
    // 1. Mobile Menu Toggle
    mobileMenuToggle.onclick = () => sidebar.classList.toggle('hidden');

    // 2. Send Message
    sendBtn.onclick = () => {
        const content = msgInput.value.trim();
        if (!content || !currentChatId) return;

        socket.emit('send_message', {
            toUserId: currentChatId,
            content: content,
            isGroup: isCurrentChatGroup,
            type: 'text'
        });
        msgInput.value = '';
    };

    msgInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendBtn.click();
    });

    // 3. File Upload
    fileInput.onchange = async (e) => {
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
                        type: result.type // e.g., 'image/png'
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

    // 4. Friend Search & Add
    addFriendBtn.onclick = () => {
        const username = friendSearchInput.value.trim();
        if (username) {
            socket.emit('friend_request', username);
            friendSearchInput.value = '';
            autocompleteDropdown.innerHTML = '';
        }
    };

    // 5. Request Toggle
    requestsToggle.onclick = () => {
        const isOpen = requestsToggle.getAttribute('data-open') === 'true';
        requestsToggle.setAttribute('data-open', !isOpen);
        // Rerender requests to handle show/hide logic
        socket.emit('refresh_data'); 
    };

    // 6. Autocomplete Logic (NEW)
    friendSearchInput.oninput = async () => {
        const query = friendSearchInput.value.trim();
        if (query.length < 2) {
            autocompleteDropdown.innerHTML = '';
            return;
        }

        const res = await fetch(`/api/search_users?query=${encodeURIComponent(query)}`);
        const users = await res.json();

        autocompleteDropdown.innerHTML = '';
        
        // Match width of the input area
        const inputRect = friendSearchInput.parentElement.getBoundingClientRect();
        autocompleteDropdown.style.width = `${inputRect.width}px`;
        autocompleteDropdown.style.left = `${inputRect.left}px`;
        
        if (users.length > 0) {
            users.forEach(user => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.innerHTML = `
                    <img src="${user.avatar}" class="avatar" style="width:30px; height:30px;">
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
    
    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#friend-search') && !e.target.closest('.autocomplete-dropdown')) {
            autocompleteDropdown.innerHTML = '';
        }
    });

    // 7. Chat Actions Modal
    chatActionsBtn.onclick = () => {
        if (!currentChatId) return;
        
        // Hide/Show options based on chat type
        const isGroup = currentChatFriendData.members ? true : false;
        modalRemoveFriendBtn.style.display = isGroup ? 'none' : 'block';
        modalBlockUserBtn.style.display = isGroup ? 'none' : 'block';
        
        // Update block button text
        if (!isGroup && currentChatFriendData.isBlocked) {
            modalBlockUserBtn.innerText = 'Unblock User';
            modalBlockUserBtn.style.color = 'var(--accent)';
        } else {
            modalBlockUserBtn.innerText = 'Block User';
            modalBlockUserBtn.style.color = '#ef4444';
        }

        showModal(chatActionsModal);
    };

    modalCloseBtn.onclick = () => hideModal(chatActionsModal);

    modalRemoveFriendBtn.onclick = () => {
        if (confirm(`Are you sure you want to remove ${currentChatFriendData.username} from your friends?`)) {
            socket.emit('remove_friend', currentChatId);
            hideModal(chatActionsModal);
        }
    };
    
    modalBlockUserBtn.onclick = () => {
        const action = currentChatFriendData.isBlocked ? 'unblock' : 'block';
        if (confirm(`Are you sure you want to ${action} ${currentChatFriendData.username}?`)) {
            socket.emit('block_user', currentChatId);
            hideModal(chatActionsModal);
        }
    };

    modalDeleteChatBtn.onclick = () => {
        // NOTE: This only deletes the local history (needs server-side implementation to delete globally)
        alert('Local chat history deletion not fully implemented on server, but functionality exists.');
        hideModal(chatActionsModal);
    };

    // 8. Group Creation Modal
    createGroupBtn.onclick = async () => {
        // Fetch all current friends to populate the member list
        const res = await fetch('/api/me');
        const userData = await res.json();
        
        socket.emit('refresh_data'); // Ensure we have the latest friends list
        
        // Simple way to get friend list (assumes init_data has already run)
        const allContacts = [...(socket.friends || []), ...(socket.groups || [])];
        const friends = allContacts.filter(c => !c.members);
        
        groupMemberList.innerHTML = '';
        if (friends.length === 0) {
            groupMemberList.innerHTML = '<p style="color:var(--text-muted);">Add friends first to create a group.</p>';
        } else {
            friends.forEach(friend => {
                const checkbox = document.createElement('label');
                checkbox.style.display = 'flex';
                checkbox.style.alignItems = 'center';
                checkbox.style.marginBottom = '8px';
                checkbox.innerHTML = `
                    <input type="checkbox" name="group-member" value="${friend.id}" style="width: auto; margin-right: 10px;">
                    <img src="${friend.avatar}" class="avatar" style="width:25px; height:25px; margin-right: 5px;">
                    ${friend.username}
                `;
                groupMemberList.appendChild(checkbox);
            });
        }
        
        showModal(groupCreationModal);
    };

    modalCloseGroupBtn.onclick = () => hideModal(groupCreationModal);

    submitGroupBtn.onclick = () => {
        const name = groupNameInput.value.trim();
        const avatar = groupAvatarInput.value.trim();
        const selectedMembers = Array.from(groupMemberList.querySelectorAll('input[name="group-member"]:checked')).map(el => el.value);

        if (!name) return alert('Please enter a group name.');
        if (selectedMembers.length === 0) return alert('Please select at least one member.');

        socket.emit('create_group', {
            name: name,
            members: selectedMembers,
            avatar: avatar
        });
        
        hideModal(groupCreationModal);
        groupNameInput.value = '';
        groupAvatarInput.value = '';
    };
}


// --- UTILITIES ---

function scrollToBottom() {
    messagesArea.scrollTop = messagesArea.scrollHeight;
}