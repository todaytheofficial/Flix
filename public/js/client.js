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


// --- UTILITIES & RENDERING FUNCTIONS (ПЕРЕМЕЩЕНЫ ВВЕРХ для устранения ReferenceError) ---

function scrollToBottom() {
    if (messagesArea) {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }
}

function showModal(modalElement) {
    if (modalElement) modalElement.classList.add('active');
}

function hideModal(modalElement) {
    if (modalElement) modalElement.classList.remove('active');
}

function replaceEmojis(text) {
    return text.replace(/:\)/g, '😊').replace(/:\(/g, '😞').replace(/<3/g, '❤️').replace(/:D/g, '😁');
}

function createContactEl(contact, isGroup = false) {
    const li = document.createElement('li');
    li.className = 'user-item';
    li.setAttribute('onclick', `openChat({ id: '${contact.id}', username: '${contact.username || contact.name}', avatar: '${contact.avatar}', status: '${contact.status || ''}', isBlocked: ${!!contact.isBlocked}, blockerId: '${contact.blockerId || ''}' }, ${isGroup})`);
    
    // Активация, если это текущий чат
    if (contact.id === currentChatId) li.classList.add('active');

    li.innerHTML = `
        <img src="${contact.avatar}" alt="${contact.username || contact.name}" class="avatar">
        <div class="user-info">
            <h4>${contact.username || contact.name}</h4>
            <p>${isGroup ? 'Group Chat' : (contact.lastMessage || 'No messages yet')}</p>
        </div>
        ${!isGroup ? `<div class="user-status ${contact.status || 'offline'}"></div>` : ''}
    `;
    return li;
}

function renderContacts(contacts) {
    if (!contactsList) return;
    contactsList.innerHTML = '';
    contacts.forEach(contact => {
        const isGroup = !!contact.members;
        contactsList.appendChild(createContactEl(contact, isGroup));
    });
}

function renderRequests(requests) {
    if (!requestsList || !reqCountEl) return;
    requestsList.innerHTML = '';
    reqCountEl.textContent = requests.length > 0 ? requests.length : '';
    reqCountEl.style.display = requests.length > 0 ? 'flex' : 'none';

    if (requests.length === 0) {
        requestsList.innerHTML = '<li class="no-requests">No pending requests.</li>';
        return;
    }
    
    requests.forEach(req => {
        const li = document.createElement('li');
        li.className = 'request-item';
        li.innerHTML = `
            <span>${req.fromName}</span>
            <div>
                <button class="btn-accept" onclick="socket.emit('accept_request', '${req.id}')">Accept</button>
                <button class="btn-decline" onclick="socket.emit('decline_request', '${req.id}')">Decline</button>
            </div>
        `;
        requestsList.appendChild(li);
    });
}

function createMessageEl(msg) {
    const isMine = msg.from === currentUser.id;
    const div = document.createElement('div');
    div.className = `message-bubble ${isMine ? 'mine' : 'theirs'}`;
    div.id = `msg-${msg.id}`;

    let contentHTML = '';
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (msg.type.startsWith('image')) {
        contentHTML = `<img src="${msg.content}" style="max-width: 100%; max-height: 250px; border-radius: 8px;" onclick="window.open(this.src)">`;
    } else if (msg.type.startsWith('video')) {
        contentHTML = `<video src="${msg.content}" controls style="max-width: 100%; max-height: 250px; border-radius: 8px;"></video>`;
    } else if (msg.type !== 'text') {
        contentHTML = `<a href="${msg.content}" target="_blank" style="color: var(--text-link);">File: ${msg.content.substring(msg.content.lastIndexOf('/') + 1)}</a>`;
    } else {
        contentHTML = `<p>${replaceEmojis(msg.content)}</p>`;
    }

    div.innerHTML = `
        <div class="message-content">
            ${msg.isGroup && !isMine ? `<small class="msg-sender">${msg.senderName || 'User'}</small>` : ''}
            ${contentHTML}
            <small class="msg-time">${time}</small>
        </div>
        ${isMine ? `<span class="delete-icon" onclick="socket.emit('delete_message', { messageId: '${msg.id}', chatId: currentChatId, isGroup: isCurrentChatGroup })">🗑️</span>` : ''}
    `;

    return div;
}


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

    // 4. Friend Search & Autocomplete
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
                    const li = document.createElement('li');
                    li.innerHTML = `<label><input type="checkbox" data-id="${friend.id}"> ${friend.username}</label>`;
                    groupMemberList.appendChild(li);
                });
            }
            showModal(groupCreationModal); 
        };
    }
    if (modalCloseGroupBtn) modalCloseGroupBtn.onclick = () => hideModal(groupCreationModal);
    if (submitGroupBtn) {
        submitGroupBtn.onclick = () => {
            const name = groupNameInput.value.trim();
            let avatar = groupAvatarInput.value.trim();
            const members = Array.from(groupMemberList.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.getAttribute('data-id'));

            if (!name || members.length === 0) {
                return alert('Group name and at least one member are required.');
            }
            
            socket.emit('create_group', { name, members, avatar });
            hideModal(groupCreationModal);
        };
    }

    // 7. Add Member Modal
    if (addMemberBtn) {
        addMemberBtn.onclick = () => {
            if (!currentChatId || !isCurrentChatGroup || !addMemberModal || !addMemberList) return;
            
            const currentGroup = globalFriendsList.find(c => c.id === currentChatId);
            if (!currentGroup) return;

            addMemberList.innerHTML = '';
            const availableFriends = globalFriendsList.filter(f => !currentGroup.members.some(m => m.id === f.id));

            if (availableFriends.length === 0) {
                addMemberList.innerHTML = '<p style="color:var(--text-muted);">All friends are already in this group.</p>';
            } else {
                availableFriends.forEach(friend => {
                    const li = document.createElement('li');
                    li.innerHTML = `<label><input type="checkbox" data-id="${friend.id}"> ${friend.username}</label>`;
                    addMemberList.appendChild(li);
                });
            }
            hideModal(chatActionsModal); // Скрываем модалку действий чата
            showModal(addMemberModal);
        };
    }
    if (modalCloseAddMember) modalCloseAddMember.onclick = () => hideModal(addMemberModal);
    if (submitAddMember) {
        submitAddMember.onclick = () => {
            const membersToAdd = Array.from(addMemberList.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.getAttribute('data-id'));

            if (membersToAdd.length === 0) {
                return alert('Select at least one member to add.');
            }
            
            socket.emit('add_members_to_group', { groupId: currentChatId, membersToAdd });
            hideModal(addMemberModal);
        };
    }

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