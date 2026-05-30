// State management
const state = {
    sourceFolder: null,
    destinationFolders: [],
    files: [],
    currentIndex: 0,
    stats: {
        moved: {},
        skipped: 0
    },
    browserMode: null, // 'source' or 'destination'
    currentBrowsePath: '/'
};

// Viewer state
let pdfDoc = null;
let pdfPage = 1;
let pdfTotalPages = 1;
let lightbox = null;
let plyrVideo = null;
let plyrAudio = null;
let monacoEditor = null;
let monacoModel = null;
let monacoReadyPromise = null;

const LANGUAGE_BY_EXT = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'javascript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.rb': 'ruby',
    '.sh': 'shell',
    '.bat': 'bat',
    '.ps1': 'powershell',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.xml': 'xml',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.ini': 'ini',
    '.toml': 'toml'
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

    const prevBtn = document.getElementById('pdf-prev');
    const nextBtn = document.getElementById('pdf-next');

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => changePdfPage(-1));
        nextBtn.addEventListener('click', () => changePdfPage(1));
    }

    if (window.PhotoSwipeLightbox && window.PhotoSwipe) {
        lightbox = new PhotoSwipeLightbox({
            gallery: '#image-viewer',
            children: 'a',
            pswpModule: PhotoSwipe
        });
        lightbox.init();
    }

    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
    }
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

    let parentPath = null;
    if (data.isKioPath && data.parentPath) {
        parentPath = data.parentPath;
    } else if (data.currentPath && data.currentPath !== '/') {
        const pathParts = data.currentPath.split('/').filter(p => p);
        pathParts.pop();
        parentPath = '/' + pathParts.join('/');
        if (!parentPath || parentPath === '/') {
            parentPath = '/';
        }
    }

    if (parentPath && parentPath !== data.currentPath) {
        const parentItem = document.createElement('div');
        parentItem.className = 'folder-item parent-item';
        parentItem.innerHTML = `
            <span class="icon">..</span>
        `;
        parentItem.addEventListener('click', () => loadDirectories(parentPath));
        folderList.appendChild(parentItem);
    }
    
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
        
        // Get file count
        const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('source-info').textContent = `✅ ${data.total} file ditemukan`;
            state.files = data.files;
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
                     state.files.length > 0;
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
    
    // Refresh file list
    const response = await fetch(`/api/files?path=${encodeURIComponent(state.sourceFolder)}`);
    const data = await response.json();
    
    if (!data.success || data.files.length === 0) {
        alert('Tidak ada file untuk disortir!');
        return;
    }
    
    state.files = data.files;
    
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
    
    // Show first file
    showCurrentFile();
}

function showCurrentFile() {
    if (state.currentIndex >= state.files.length) {
        showComplete();
        return;
    }
    
    const file = state.files[state.currentIndex];
    document.getElementById('image-name').textContent = file.name;
    renderFile(file);
    
    // Update progress
    const progress = state.currentIndex + 1;
    const total = state.files.length;
    document.getElementById('progress-text').textContent = `${progress} / ${total}`;
    document.getElementById('progress-fill').style.width = `${(progress / total) * 100}%`;
}

function hideAllViewers() {
    const viewerIds = [
        'image-viewer',
        'pdf-viewer',
        'video-viewer',
        'audio-viewer',
        'text-viewer',
        'zip-viewer',
        'docx-viewer',
        'xlsx-viewer',
        'unsupported-viewer'
    ];

    viewerIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

function getFileUrl(filePath) {
    return `/api/file?path=${encodeURIComponent(filePath)}`;
}

function renderFile(file) {
    hideAllViewers();

    switch (file.type) {
        case 'image':
            renderImage(file);
            break;
        case 'pdf':
            renderPdf(file);
            break;
        case 'video':
            renderVideo(file);
            break;
        case 'audio':
            renderAudio(file);
            break;
        case 'text':
        case 'code':
            renderText(file);
            break;
        case 'zip':
            renderZip(file);
            break;
        case 'docx':
            renderDocx(file);
            break;
        case 'xlsx':
            renderXlsx(file);
            break;
        default:
            renderUnsupported(file);
    }
}

function renderImage(file) {
    const viewer = document.getElementById('image-viewer');
    const link = document.getElementById('photo-link');
    const img = document.getElementById('current-image');
    const url = getFileUrl(file.path);

    if (!viewer || !link || !img) return;

    link.href = url;
    img.src = url;
    img.onload = () => {
        link.setAttribute('data-pswp-width', img.naturalWidth || 1200);
        link.setAttribute('data-pswp-height', img.naturalHeight || 800);
    };

    viewer.classList.remove('hidden');
}

async function renderPdf(file) {
    const viewer = document.getElementById('pdf-viewer');
    const canvas = document.getElementById('pdf-canvas');
    const info = document.getElementById('pdf-page-info');

    if (!viewer || !canvas || !window.pdfjsLib) {
        renderUnsupported(file, 'PDF.js tidak tersedia');
        return;
    }

    try {
        if (!file || !file.path) {
            renderUnsupported(file, 'Path PDF tidak valid');
            return;
        }

        const url = getFileUrl(file.path);
        pdfDoc = await window.pdfjsLib.getDocument({ url }).promise;
        pdfPage = 1;
        pdfTotalPages = pdfDoc.numPages;
        await renderPdfPage(canvas, info);
        viewer.classList.remove('hidden');
    } catch (error) {
        renderUnsupported(file, error.message);
    }
}

async function renderPdfPage(canvas, info) {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pdfPage);
    const viewport = page.getViewport({ scale: 1.4 });

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
        canvasContext: canvas.getContext('2d'),
        viewport
    };

    await page.render(renderContext).promise;

    if (info) {
        info.textContent = `${pdfPage} / ${pdfTotalPages}`;
    }
}

function changePdfPage(delta) {
    if (!pdfDoc) return;
    const nextPage = pdfPage + delta;
    if (nextPage < 1 || nextPage > pdfTotalPages) return;
    pdfPage = nextPage;
    const canvas = document.getElementById('pdf-canvas');
    const info = document.getElementById('pdf-page-info');
    renderPdfPage(canvas, info);
}

function renderVideo(file) {
    const viewer = document.getElementById('video-viewer');
    const video = document.getElementById('video-player');
    const url = getFileUrl(file.path);

    if (!viewer || !video) return;

    video.src = url;
    if (window.Plyr) {
        if (!plyrVideo) {
            plyrVideo = new Plyr(video, { ratio: '16:9' });
        } else {
            plyrVideo.source = { type: 'video', sources: [{ src: url }] };
        }
    }

    viewer.classList.remove('hidden');
}

function renderAudio(file) {
    const viewer = document.getElementById('audio-viewer');
    const audio = document.getElementById('audio-player');
    const url = getFileUrl(file.path);

    if (!viewer || !audio) return;

    audio.src = url;
    if (window.Plyr) {
        if (!plyrAudio) {
            plyrAudio = new Plyr(audio, { controls: ['play', 'progress', 'current-time', 'duration', 'volume'] });
        } else {
            plyrAudio.source = { type: 'audio', sources: [{ src: url }] };
        }
    }

    viewer.classList.remove('hidden');
}

async function renderText(file) {
    const viewer = document.getElementById('text-viewer');
    if (!viewer) return;

    try {
        const url = getFileUrl(file.path);
        const response = await fetch(url);
        const text = await response.text();
        await ensureMonaco();

        if (!window.monaco) {
            renderUnsupported(file, 'Monaco Editor tidak tersedia');
            return;
        }

        const language = LANGUAGE_BY_EXT[file.ext || ''] || 'plaintext';
        if (!monacoModel) {
            monacoModel = monaco.editor.createModel(text, language);
            monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
                model: monacoModel,
                theme: 'vs-dark',
                minimap: { enabled: false },
                wordWrap: 'on',
                readOnly: true
            });
        } else {
            monacoModel.setValue(text);
            monaco.editor.setModelLanguage(monacoModel, language);
        }

        viewer.classList.remove('hidden');
    } catch (error) {
        renderUnsupported(file, error.message);
    }
}

async function renderZip(file) {
    const viewer = document.getElementById('zip-viewer');
    const list = document.getElementById('zip-list');
    if (!viewer || !list || !window.JSZip) {
        renderUnsupported(file, 'JSZip tidak tersedia');
        return;
    }

    list.innerHTML = 'Memuat isi ZIP...';
    try {
        const url = getFileUrl(file.path);
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const zip = await window.JSZip.loadAsync(buffer);
        const entries = Object.keys(zip.files);

        if (entries.length === 0) {
            list.innerHTML = '<p>ZIP kosong</p>';
        } else {
            list.innerHTML = `<ul>${entries.map(name => `<li>${name}</li>`).join('')}</ul>`;
        }

        viewer.classList.remove('hidden');
    } catch (error) {
        renderUnsupported(file, error.message);
    }
}

async function renderDocx(file) {
    const viewer = document.getElementById('docx-viewer');
    const content = document.getElementById('docx-content');
    if (!viewer || !content || !window.mammoth) {
        renderUnsupported(file, 'Mammoth tidak tersedia');
        return;
    }

    content.innerHTML = 'Memuat DOCX...';
    try {
        const url = getFileUrl(file.path);
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const result = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
        content.innerHTML = result.value;
        viewer.classList.remove('hidden');
    } catch (error) {
        renderUnsupported(file, error.message);
    }
}

async function renderXlsx(file) {
    const viewer = document.getElementById('xlsx-viewer');
    const content = document.getElementById('xlsx-content');
    if (!viewer || !content || !window.XLSX) {
        renderUnsupported(file, 'SheetJS tidak tersedia');
        return;
    }

    content.innerHTML = 'Memuat XLSX...';
    try {
        const url = getFileUrl(file.path);
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheet];
        content.innerHTML = window.XLSX.utils.sheet_to_html(sheet, { id: 'xlsx-table' });
        viewer.classList.remove('hidden');
    } catch (error) {
        renderUnsupported(file, error.message);
    }
}

function renderUnsupported(file, message) {
    const viewer = document.getElementById('unsupported-viewer');
    const text = document.getElementById('unsupported-text');
    if (!viewer || !text) return;
    text.textContent = message ? `Tidak bisa menampilkan file: ${message}` : 'Tipe file ini belum didukung.';
    viewer.classList.remove('hidden');
}

function ensureMonaco() {
    if (monacoReadyPromise) return monacoReadyPromise;

    monacoReadyPromise = new Promise((resolve) => {
        if (window.monaco) {
            resolve();
            return;
        }

        if (!window.require) {
            resolve();
            return;
        }

        window.require.config({
            paths: { vs: 'https://unpkg.com/monaco-editor@0.50.0/min/vs' }
        });

        window.require(['vs/editor/editor.main'], () => {
            resolve();
        });
    });

    return monacoReadyPromise;
}

async function moveToDestination(destIndex) {
    const file = state.files[state.currentIndex];
    const destination = state.destinationFolders[destIndex];
    
    const response = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sourcePath: file.path,
            destinationFolder: destination
        })
    });
    
    const data = await response.json();
    
    if (data.success) {
        state.stats.moved[destIndex]++;
        state.currentIndex++;
        showCurrentFile();
    } else {
        alert('Error: ' + data.error);
    }
}

async function skipImage() {
    state.stats.skipped++;
    state.currentIndex++;
    showCurrentFile();
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
        html += `<div class="stat-item">${index + 1}. ${folderName}: <strong>${count}</strong> file</div><br>`;
    });
    
    html += `<div class="stat-item">Dilewati: <strong>${state.stats.skipped}</strong> file</div><br>`;
    html += `<div class="stat-item">Total dipindahkan: <strong>${totalMoved}</strong> file</div>`;
    
    statsDiv.innerHTML = html;
}

function restart() {
    // Reset state
    state.sourceFolder = null;
    state.destinationFolders = [];
    state.files = [];
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
