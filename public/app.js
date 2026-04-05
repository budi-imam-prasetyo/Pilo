// State management
const state = {
    sourceFolder: null,
    destinationFolders: [],
    images: [],
    currentIndex: 0,
    stats: {
        moved: {},
        skipped: 0
    },
    browserMode: null, // 'source' or 'destination'
    currentBrowsePath: '/'
};

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const sortingScreen = document.getElementById('sorting-screen');
const completeScreen = document.getElementById('complete-screen');
const folderModal = document.getElementById('folder-modal');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set default path based on OS
    state.currentBrowsePath = '/home';
    
    // Listen for keyboard shortcuts
    document.addEventListener('keydown', handleKeyPress);
});

// MTP Device Functions
async function loadMTPDevices() {
    const mtpContainer = document.getElementById('mtp-devices');
    mtpContainer.classList.remove('hidden');
    mtpContainer.innerHTML = '<p style="text-align: center; padding: 10px;">🔍 Mencari perangkat MTP...</p>';
    
    try {
        const response = await fetch('/api/mtp-devices');
        const data = await response.json();
        
        if (!data.success) {
            mtpContainer.innerHTML = `<p style="color: red; padding: 10px;">❌ ${data.error}</p>`;
            return;
        }
        
        if (data.devices.length === 0) {
            mtpContainer.innerHTML = `<p style="padding: 10px;">⚠️ ${data.message || 'Tidak ada perangkat MTP terdeteksi'}</p>`;
            return;
        }
        
        mtpContainer.innerHTML = '<p style="font-weight: bold; padding: 5px;">Perangkat Terdeteksi:</p>';
        
        data.devices.forEach(device => {
            const deviceItem = document.createElement('div');
            deviceItem.className = 'mtp-device-item';
            deviceItem.innerHTML = `
                <span class="icon">📱</span>
                <span class="name">${device.name}</span>
                <button onclick="selectMTPDevice('${device.path}', '${device.name}')">Pilih</button>
            `;
            mtpContainer.appendChild(deviceItem);
        });
    } catch (error) {
        mtpContainer.innerHTML = `<p style="color: red; padding: 10px;">❌ Error: ${error.message}</p>`;
    }
}

async function selectMTPDevice(devicePath, deviceName) {
    // Set MTP device as source
    state.currentBrowsePath = devicePath;
    
    // Open folder browser with MTP device path
    state.browserMode = 'source';
    folderModal.classList.remove('hidden');
    await loadDirectories(devicePath);
}

function selectManualMTPPath() {
    const manualPath = document.getElementById('mtp-manual-path').value.trim();
    if (!manualPath) {
        alert('Masukkan path MTP terlebih dahulu');
        return;
    }
    
    // Try to use the manual path
    selectMTPDevice(manualPath, 'MTP Device (Manual)');
}

// Folder Browser Functions
async function openFolderBrowser(mode) {
    state.browserMode = mode;
    folderModal.classList.remove('hidden');
    await loadDirectories(state.currentBrowsePath);
}

function closeFolderBrowser() {
    folderModal.classList.add('hidden');
}

async function loadDirectories(path) {
    const response = await fetch(`/api/directories?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    
    if (!data.success) {
        alert('Error: ' + data.error);
        return;
    }
    
    state.currentBrowsePath = data.currentPath;
    document.getElementById('path-input').value = data.currentPath;
    document.getElementById('current-path-display').textContent = `📁 ${data.currentPath}`;
    
    const folderList = document.getElementById('folder-list');
    folderList.innerHTML = '';
    
    for (const dir of data.directories) {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.innerHTML = `
            <span class="icon">📁</span>
            <span class="name">${dir.name}</span>
        `;
        item.addEventListener('click', () => loadDirectories(dir.path));
        folderList.appendChild(item);
    }
    
    if (data.directories.length === 0) {
        folderList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Tidak ada subfolder</p>';
    }
}

function handlePathInput(event) {
    if (event.key === 'Enter') {
        goToPath();
    }
}

function goToPath() {
    const path = document.getElementById('path-input').value;
    if (path) {
        loadDirectories(path);
    }
}

function goUp() {
    const pathParts = state.currentBrowsePath.split('/').filter(p => p);
    if (pathParts.length > 0) {
        pathParts.pop();
        const newPath = '/' + pathParts.join('/');
        loadDirectories(newPath || '/');
    }
}

async function selectCurrentFolder() {
    const path = state.currentBrowsePath;
    
    if (state.browserMode === 'source') {
        state.sourceFolder = path;
        document.getElementById('source-path').value = path;
        
        // Get image count
        const response = await fetch(`/api/images?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('source-info').textContent = `✅ ${data.total} foto ditemukan`;
            state.images = data.images;
        } else {
            document.getElementById('source-info').textContent = '❌ ' + data.error;
        }
    } else if (state.browserMode === 'destination') {
        if (state.destinationFolders.length >= 9) {
            alert('Maksimum 9 folder tujuan!');
            closeFolderBrowser();
            return;
        }
        
        // Check if already added
        if (state.destinationFolders.includes(path)) {
            alert('Folder ini sudah ditambahkan!');
            closeFolderBrowser();
            return;
        }
        
        // Check if same as source
        if (path === state.sourceFolder) {
            alert('Tidak boleh sama dengan folder sumber!');
            closeFolderBrowser();
            return;
        }
        
        state.destinationFolders.push(path);
        updateDestinationList();
    }
    
    closeFolderBrowser();
    updateStartButton();
}

function updateDestinationList() {
    const list = document.getElementById('destination-list');
    list.innerHTML = '';
    
    state.destinationFolders.forEach((path, index) => {
        const item = document.createElement('div');
        item.className = 'destination-item';
        item.innerHTML = `
            <span class="number">${index + 1}</span>
            <span class="path">${path}</span>
            <button class="remove-btn" onclick="removeDestination(${index})">Hapus</button>
        `;
        list.appendChild(item);
    });
}

function removeDestination(index) {
    state.destinationFolders.splice(index, 1);
    updateDestinationList();
    updateStartButton();
}

function updateStartButton() {
    const btn = document.getElementById('start-btn');
    const canStart = state.sourceFolder && 
                     state.destinationFolders.length > 0 && 
                     state.images.length > 0;
    btn.disabled = !canStart;
}

// Sorting Functions
async function startSorting() {
    // Reset stats
    state.stats = { moved: {}, skipped: 0 };
    state.destinationFolders.forEach((_, i) => {
        state.stats.moved[i] = 0;
    });
    state.currentIndex = 0;
    
    // Refresh image list
    const response = await fetch(`/api/images?path=${encodeURIComponent(state.sourceFolder)}`);
    const data = await response.json();
    
    if (!data.success || data.images.length === 0) {
        alert('Tidak ada foto untuk disortir!');
        return;
    }
    
    state.images = data.images;
    
    // Setup destination buttons
    const buttonsContainer = document.getElementById('destination-buttons');
    buttonsContainer.innerHTML = '';
    
    state.destinationFolders.forEach((path, index) => {
        const folderName = path.split('/').pop();
        const btn = document.createElement('button');
        btn.className = 'dest-btn';
        btn.innerHTML = `<span class="key">${index + 1}</span> ${folderName}`;
        btn.onclick = () => moveToDestination(index);
        buttonsContainer.appendChild(btn);
    });
    
    // Add skip button
    const skipBtn = document.createElement('button');
    skipBtn.className = 'dest-btn skip-btn';
    skipBtn.innerHTML = `<span class="key">S</span> Lewati`;
    skipBtn.onclick = () => skipImage();
    buttonsContainer.appendChild(skipBtn);
    
    // Show sorting screen
    setupScreen.classList.add('hidden');
    sortingScreen.classList.remove('hidden');
    
    // Show first image
    showCurrentImage();
}

function showCurrentImage() {
    if (state.currentIndex >= state.images.length) {
        showComplete();
        return;
    }
    
    const image = state.images[state.currentIndex];
    const imgElement = document.getElementById('current-image');
    imgElement.src = `/api/image?path=${encodeURIComponent(image.path)}`;
    document.getElementById('image-name').textContent = image.name;
    
    // Update progress
    const progress = state.currentIndex + 1;
    const total = state.images.length;
    document.getElementById('progress-text').textContent = `${progress} / ${total}`;
    document.getElementById('progress-fill').style.width = `${(progress / total) * 100}%`;
}

async function moveToDestination(destIndex) {
    const image = state.images[state.currentIndex];
    const destination = state.destinationFolders[destIndex];
    
    const response = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sourcePath: image.path,
            destinationFolder: destination
        })
    });
    
    const data = await response.json();
    
    if (data.success) {
        state.stats.moved[destIndex]++;
        state.currentIndex++;
        showCurrentImage();
    } else {
        alert('Error: ' + data.error);
    }
}

async function skipImage() {
    state.stats.skipped++;
    state.currentIndex++;
    showCurrentImage();
}

function handleKeyPress(event) {
    // Only handle if sorting screen is visible
    if (sortingScreen.classList.contains('hidden')) return;
    
    const key = event.key.toLowerCase();
    
    // Number keys 1-9
    if (key >= '1' && key <= '9') {
        const index = parseInt(key) - 1;
        if (index < state.destinationFolders.length) {
            moveToDestination(index);
        }
    }
    
    // S to skip
    if (key === 's') {
        skipImage();
    }
}

function stopSorting() {
    if (confirm('Yakin ingin berhenti? Progress akan disimpan.')) {
        showComplete();
    }
}

function showComplete() {
    sortingScreen.classList.add('hidden');
    completeScreen.classList.remove('hidden');
    
    // Generate stats
    const statsDiv = document.getElementById('stats');
    let html = '<div class="stat-item">📊 Statistik Sortir</div><br>';
    
    let totalMoved = 0;
    state.destinationFolders.forEach((path, index) => {
        const count = state.stats.moved[index] || 0;
        totalMoved += count;
        const folderName = path.split('/').pop();
        html += `<div class="stat-item">${index + 1}. ${folderName}: <strong>${count}</strong> foto</div><br>`;
    });
    
    html += `<div class="stat-item">Dilewati: <strong>${state.stats.skipped}</strong> foto</div><br>`;
    html += `<div class="stat-item">Total dipindahkan: <strong>${totalMoved}</strong> foto</div>`;
    
    statsDiv.innerHTML = html;
}

function restart() {
    // Reset state
    state.sourceFolder = null;
    state.destinationFolders = [];
    state.images = [];
    state.currentIndex = 0;
    state.stats = { moved: {}, skipped: 0 };
    
    // Reset UI
    document.getElementById('source-path').value = '';
    document.getElementById('source-info').textContent = '';
    document.getElementById('destination-list').innerHTML = '';
    updateStartButton();
    
    // Show setup screen
    completeScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
}
