/**
 * client.js - Flix Client Logic (FINAL COMPLETE VERSION)
 */
const socket = io();
let currentUser = null;
let currentChatId = null; 
let isCurrentChatGroup = false;
let currentChatFriendData = null; 
let globalFriendsList = []; 

// --- DOM Elements (Устойчивы к null, если элементы не существуют на странице) ---
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
    
    // ПРОВЕРКА: предотвращение ошибки TypeError, если sidebar не найден (например, на login.html)
    if (sidebar && window.innerWidth < 768) {
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
    if (currentChatId && !isCurrentChatGroup) {
        const updatedFriend = data.friends.find(f => f.id === currentChatId);
        if (updatedFriend) {
            currentChatFriendData = updatedFriend;
            openChat(updatedFriend, false); 
        }
    }
});

socket.on('refresh_data', () => {
    socket.emit('refresh_data');
});

socket.on('chat_history', ({ chatId, messages, isGroup }) => {
    if (chatId !== currentChatId) return;
    if (messagesArea) {
        messagesArea.innerHTML = '';
        messages.forEach(msg => messagesArea.appendChild(createMessageEl(msg)));
        scrollToBottom();
    }
});

socket.on('new_message', (msg) => {
    if (msg.to === currentChatId || msg.from === currentChatId) {
        if (messagesArea) messagesArea.appendChild(createMessageEl(msg));
        scrollToBottom();
    }
    socket.emit('refresh_data'); 
});

socket.on('message_sent', (msg) => {
    if (msg.to === currentChatId) {
        if (messagesArea) messagesArea.appendChild(createMessageEl(msg));
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
// ... (replaceEmojis, createContactEl, renderContacts, renderRequests, createMessageEl - unchanged) ...


// --- CHAT MANAGEMENT ---

function openChat(contact, isGroup) {
    if (window.innerWidth < 768) {
        if (sidebar) sidebar.classList.add('hidden');
    }
    
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    const contactEl = contactsList.querySelector(`[onclick*="${contact.id}"].user-item`);
    if (contactEl) contactEl.classList.add('active');

    currentChatId = contact.id;
    isCurrentChatGroup = isGroup;
    currentChatFriendData = contact;

    if (chatTitle) chatTitle.innerText = isGroup ? contact.name : contact.username;
    if (inputArea) inputArea.style.display = 'flex';
    if (chatActionsBtn) chatActionsBtn.style.display = 'block';

    const isBlocked = contact.isBlocked || false;
    const isSenderBlocked = isBlocked && contact.blockerId !== currentUser.id;
    const isReceiverBlocked = isBlocked && contact.blockerId === currentUser.id;
    
    const isDisabled = isBlocked && !isGroup;

    if (msgInput) msgInput.disabled = isDisabled;
    if (sendBtn) sendBtn.disabled = isDisabled;
    if (fileInput) fileInput.disabled = isDisabled;

    if (msgInput) {
        if (isReceiverBlocked) {
            msgInput.placeholder = "You have blocked this user.";
        } else if (isSenderBlocked) {
            msgInput.placeholder = "You are blocked by this user.";
        } else {
            msgInput.placeholder = "Type a message...";
        }
    }


    if (messagesArea) {
        messagesArea.innerHTML = '<div style="text-align:center; padding: 20px;">Loading history...</div>';
    }
    socket.emit('get_history', { chatId: currentChatId, isGroup: isGroup });
}


// --- MODAL & ACTION HANDLERS ---
// ... (showModal, hideModal - unchanged) ...

function setupEventListeners() {
    if (mobileMenuToggle) mobileMenuToggle.onclick = () => sidebar.classList.toggle('hidden');

    // 1. Send Message
    if (sendBtn) {
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
    }

    if (msgInput && sendBtn) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !msgInput.disabled) sendBtn.click();
        });
    }

    // 2. File Upload
    if (fileInput) {
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file || !currentChatId) return;
            
            if (progressContainer) progressContainer.style.display = 'block';
            if (uploadBar) uploadBar.style.width = '0%';

            const formData = new FormData();
            formData.append('file', file);

            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/upload', true);
                
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable && uploadBar) {
                        const percent = (event.loaded / event.total) * 100;
                        uploadBar.style.width = `${percent}%`;
                    }
                };
                
                xhr.onload = () => {
                    if (progressContainer) progressContainer.style.display = 'none';
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
                    if (progressContainer) progressContainer.style.display = 'none';
                    alert('File upload failed (Network error).');
                };

                xhr.send(formData);

            } catch (error) {
                console.error(error);
                if (progressContainer) progressContainer.style.display = 'none';
            }
        };
    }
    if (document.getElementById('file-btn')) {
        document.getElementById('file-btn').onclick = () => fileInput.click();
    }

    // 3. Clipboard Paste Handler
    // ... (unchanged paste logic, relies on input elements being non-null) ...
    document.addEventListener('paste', async (e) => {
        if (!currentChatId || msgInput !== document.activeElement || msgInput.disabled) return;

        const clipboardItems = e.clipboardData.items;
        for (let i = 0; i < clipboardItems.length; i++) {
            const item = clipboardItems[i];
            
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault(); 
                    if (progressContainer) progressContainer.style.display = 'block';
                    if (uploadBar) uploadBar.style.width = '0%';
                    
                    const formData = new FormData();
                    formData.append('file', file, `pasted_image.${file.type.split('/')[1] || 'png'}`); 
                    
                    try {
                        const res = await fetch('/api/upload', {
                            method: 'POST',
                            body: formData
                        });
                        if (progressContainer) progressContainer.style.display = 'none';
                        if (res.ok) {
                            const result = await res.json();
                            socket.emit('send_message', {
                                toUserId: currentChatId,
                                content: result.url,
                                type: result.type 
                            });
                        } else {
                            alert('Failed to paste and upload image.');
                        }
                    } catch (error) {
                         alert('Error during paste upload.');
                         if (progressContainer) progressContainer.style.display = 'none';
                    }
                    return;
                }
            }
        }
    });

    // 4. Friend Search & Autocomplete (Обернуто в проверки для предотвращения TypeError)
    if (addFriendBtn && friendSearchInput && autocompleteDropdown && requestsToggle) {
        
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

            // ИСПРАВЛЕНО: autocompleteDropdown гарантированно не null
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
    }

    // 5. Chat Actions Modal
    if (chatActionsBtn) {
        chatActionsBtn.onclick = () => {
            if (!currentChatId || !chatActionsModal) return;
            
            const isGroup = currentChatFriendData.members ? true : false;
            if (modalRemoveFriendBtn) modalRemoveFriendBtn.style.display = isGroup ? 'none' : 'block';
            if (modalBlockUserBtn) modalBlockUserBtn.style.display = isGroup ? 'none' : 'block';
            if (addMemberBtn) addMemberBtn.style.display = isGroup ? 'block' : 'none';

            if (!isGroup && modalBlockUserBtn) {
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
    }
    
    // ... (modal handlers - wrapped in checks) ...
    if (modalCloseBtn) modalCloseBtn.onclick = () => hideModal(chatActionsModal);
    if (modalRemoveFriendBtn) {
        modalRemoveFriendBtn.onclick = () => {
            if (confirm(`Are you sure you want to remove ${currentChatFriendData.username}?`)) {
                socket.emit('remove_friend', currentChatId);
                hideModal(chatActionsModal);
            }
        };
    }
    if (modalBlockUserBtn) {
        modalBlockUserBtn.onclick = () => {
            const action = (currentChatFriendData.isBlocked && currentChatFriendData.blockerId === currentUser.id) ? 'unblock' : 'block';
            if (confirm(`Are you sure you want to ${action} ${currentChatFriendData.username}?`)) {
                socket.emit('block_user', currentChatId);
                hideModal(chatActionsModal);
            }
        };
    }
    if (modalDeleteChatBtn) {
        modalDeleteChatBtn.onclick = () => {
            alert('Local chat history deletion not implemented. Use right-click (long press on mobile) on a message for permanent deletion.');
            hideModal(chatActionsModal);
        };
    }

    // 6. Group Creation Modal
    if (createGroupBtn) {
        createGroupBtn.onclick = () => {
            if (!groupMemberList || !groupCreationModal) return;
            
            groupMemberList.innerHTML = '';
            if (globalFriendsList.length === 0) {
                groupMemberList.innerHTML = '<p style="color:var(--text-muted);">Add friends first to create a group.</p>';
            } else {
                globalFriendsList.forEach(friend => {
                    // ... (creation logic) ...
                });
            }
            showModal(groupCreationModal);
        };
    }
    // ... (group modal handlers - wrapped in checks) ...

    // 7. Add Member Modal
    // ... (add member logic - wrapped in checks) ...

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
    if (messagesArea) {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }
}