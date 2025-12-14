/**
 * settings.js - Logic for the settings page (FINAL COMPLETE VERSION)
 */

const currentAvatar = document.getElementById('current-avatar');
const usernameDisplay = document.getElementById('username-display');
const avatarUrlInput = document.getElementById('avatar-url-input');
const avatarFileInput = document.getElementById('avatar-file-input'); // Добавлен
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
    if (avatarFileInput) avatarFileInput.value = ''; // Сброс file input
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
    if (updateAvatarBtn) updateAvatarBtn.disabled = true;
    showStatus('Processing...', false);

    let newAvatarUrl = avatarUrlInput.value.trim();
    let file = avatarFileInput.files[0];

    // 1. Проверка: либо файл, либо URL должны быть предоставлены
    if (!newAvatarUrl && !file) {
        showStatus('Please upload a file or paste an image URL.', true);
        if (updateAvatarBtn) updateAvatarBtn.disabled = false;
        return;
    }
    
    // 2. Если выбран файл, сначала загружаем его на /api/upload
    if (file) {
        showStatus('Uploading file...', false);
        const formData = new FormData();
        // Используем имя файла, совместимое с серверной логикой
        formData.append('file', file, `avatar_${Date.now()}_${file.name.replace(/\s/g, '_')}`);
        
        try {
            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) {
                const errorData = await uploadRes.json().catch(() => ({ error: 'File upload failed.' }));
                showStatus(errorData.error || 'File upload failed.', true);
                if (updateAvatarBtn) updateAvatarBtn.disabled = false;
                return;
            }
            
            const uploadResult = await uploadRes.json();
            newAvatarUrl = uploadResult.url; // Получаем публичный URL загруженного файла
            showStatus('File uploaded. Updating profile...', false);

        } catch (error) {
            showStatus('Network error during file upload.', true);
            console.error('Upload error:', error);
            if (updateAvatarBtn) updateAvatarBtn.disabled = false;
            return;
        }
    }
    
    // 3. Обновляем URL аватара на сервере
    if (newAvatarUrl) {
        try {
            const updateRes = await fetch('/api/update_avatar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newAvatarUrl: newAvatarUrl })
            });
    
            if (updateRes.status === 401) {
                window.location.href = '/login.html'; 
                return;
            }
    
            const data = await updateRes.json(); 
    
            if (updateRes.ok) {
                updateUI(data.user);
                showStatus('Avatar updated successfully! (Refresh chat page to see changes)', false);
            } else {
                showStatus(data.error || 'Failed to update avatar URL.', true);
            }
    
        } catch (error) {
            showStatus('Network error during profile update.', true);
            console.error('Update error:', error);
        } finally {
            if (updateAvatarBtn) updateAvatarBtn.disabled = false;
        }
    } else {
        showStatus('Error: No avatar URL provided after processing.', true);
        if (updateAvatarBtn) updateAvatarBtn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadUserData();
    if (updateAvatarBtn) {
        updateAvatarBtn.addEventListener('click', handleAvatarUpdate);
    }
    
    // Обработчик: если выбран файл, сбрасываем поле URL
    if (avatarFileInput && avatarUrlInput) {
        avatarFileInput.addEventListener('change', () => {
            if (avatarFileInput.files.length > 0) {
                avatarUrlInput.value = '';
            }
        });
        // Обработчик: если введен URL, сбрасываем файл
        avatarUrlInput.addEventListener('input', () => {
            if (avatarUrlInput.value.trim() !== '' && avatarFileInput.files.length > 0) {
                avatarFileInput.value = '';
            }
        });
    }
});