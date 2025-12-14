/**
 * settings.js - Logic for the settings page
 */

const currentAvatar = document.getElementById('current-avatar');
const usernameDisplay = document.getElementById('username-display');
const avatarUrlInput = document.getElementById('avatar-url-input');
const updateAvatarBtn = document.getElementById('update-avatar-btn');
const statusMessage = document.getElementById('status-message');

function showStatus(message, isError = false) {
    if (statusMessage) {
        statusMessage.textContent = message;
        statusMessage.style.color = isError ? '#ef4444' : '#10b981';
    }
}

function updateUI(user) {
    if (currentAvatar) currentAvatar.src = user.avatar;
    if (usernameDisplay) usernameDisplay.textContent = user.username;
    if (avatarUrlInput) avatarUrlInput.value = user.avatar;
}

async function loadUserData() {
    try {
        const res = await fetch('/api/me');
        
        if (res.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Failed to load user data' }));
            showStatus(errorData.error || 'Failed to load user data.', true);
            return;
        }

        const user = await res.json();
        updateUI(user);

    } catch (error) {
        showStatus('Network error. Cannot connect to the server.', true);
        console.error('Initial load error:', error);
    }
}

async function handleAvatarUpdate() {
    const newUrl = avatarUrlInput.value.trim();
    if (!newUrl) {
        showStatus('Avatar URL cannot be empty.', true);
        return;
    }
    
    if (updateAvatarBtn) updateAvatarBtn.disabled = true;
    showStatus('Updating avatar...', false);

    try {
        const res = await fetch('/api/update_avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newAvatarUrl: newUrl })
        });

        if (res.status === 401) {
            window.location.href = '/login.html'; 
            return;
        }

        const data = await res.json(); 

        if (res.ok) {
            updateUI(data.user);
            showStatus('Avatar updated successfully! Restart the app to fully sync.', false);
        } else {
            showStatus(data.error || 'Failed to update avatar.', true);
        }

    } catch (error) {
        showStatus('Network error during update.', true);
        console.error('Update error:', error);
    } finally {
        if (updateAvatarBtn) updateAvatarBtn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadUserData();
    if (updateAvatarBtn) {
        updateAvatarBtn.addEventListener('click', handleAvatarUpdate);
    }
});