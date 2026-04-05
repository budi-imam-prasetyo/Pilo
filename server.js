const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

// Supported image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'];

// API: Detect MTP devices
app.get('/api/mtp-devices', async (req, res) => {
    try {
        let devices = [];
        
        // Method 1: KDE/KIO - Check for MTP devices via kioclient
        try {
            const kioCmd = 'kioclient5 ls mtp:/ 2>/dev/null || kioclient ls mtp:/ 2>/dev/null || echo ""';
            const { stdout } = await execAsync(kioCmd);
            const deviceNames = stdout.trim().split('\n').filter(name => name && name !== '.');
            
            for (const deviceName of deviceNames) {
                if (deviceName) {
                    devices.push({
                        name: deviceName,
                        path: `mtp:/${deviceName}`,
                        type: 'mtp-kio',
                        kioUri: `mtp:/${deviceName}`
                    });
                }
            }
        } catch (e) {
            console.log('KIO detection failed:', e.message);
        }
        
        // Method 2: Use 'gio mount -l' to list all mounted volumes (GNOME/GVFS)
        try {
            const { stdout } = await execAsync('gio mount -l 2>/dev/null || gvfs-mount -l 2>/dev/null || true');
            const lines = stdout.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Look for MTP mounts
                if (line.includes('mtp://') || line.toLowerCase().includes('mtp')) {
                    // Extract device name (usually in the line with "Mount")
                    const nameMatch = line.match(/Mount\(\d+\):\s*(.+)/);
                    if (nameMatch) {
                        const deviceName = nameMatch[1].trim();
                        
                        // Look for the actual mount path in the next lines
                        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                            const pathLine = lines[j];
                            if (pathLine.includes('->') || pathLine.includes('uri:')) {
                                const pathMatch = pathLine.match(/->?\s*(.+)/);
                                if (pathMatch) {
                                    const mountPath = pathMatch[1].trim();
                                    if (fs.existsSync(mountPath)) {
                                        devices.push({
                                            name: deviceName,
                                            path: mountPath,
                                            type: 'mtp-gio'
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.log('gio/gvfs-mount command failed:', e.message);
        }
        
        // Method 2: Check GVFS mounts directly
        const gvfsPaths = [
            `/run/user/${process.getuid()}/gvfs`,
            path.join(process.env.HOME, '.gvfs')
        ];
        
        for (const gvfsPath of gvfsPaths) {
            if (fs.existsSync(gvfsPath)) {
                try {
                    const mounts = fs.readdirSync(gvfsPath);
                    
                    for (const mount of mounts) {
                        if (mount.startsWith('mtp')) {
                            const fullPath = path.join(gvfsPath, mount);
                            try {
                                const stats = fs.statSync(fullPath);
                                if (stats.isDirectory()) {
                                    // Decode the mount name
                                    let deviceName = mount
                                        .replace(/^mtp:host[=%]/, '')
                                        .replace(/%20/g, ' ')
                                        .replace(/%2C/g, ',')
                                        .replace(/%5B/g, '[')
                                        .replace(/%5D/g, ']')
                                        .split(',')[0];
                                    
                                    // Remove the decoded name if it's just hex or path
                                    deviceName = deviceName || 'MTP Device';
                                    
                                    devices.push({
                                        name: deviceName,
                                        path: fullPath,
                                        type: 'mtp-gvfs'
                                    });
                                }
                            } catch (e) {
                                console.log('Error accessing mount:', e.message);
                            }
                        }
                    }
                } catch (e) {
                    console.log('Error reading gvfs path:', e.message);
                }
            }
        }
        
        // Method 3: Check /media and /run/media
        const mediaPaths = [
            '/media',
            '/run/media'
        ];
        
        for (const mediaPath of mediaPaths) {
            if (fs.existsSync(mediaPath)) {
                try {
                    const userDirs = fs.readdirSync(mediaPath);
                    for (const userDir of userDirs) {
                        const userPath = path.join(mediaPath, userDir);
                        try {
                            const stats = fs.statSync(userPath);
                            if (stats.isDirectory()) {
                                const deviceDirs = fs.readdirSync(userPath);
                                for (const deviceDir of deviceDirs) {
                                    const devicePath = path.join(userPath, deviceDir);
                                    const deviceStats = fs.statSync(devicePath);
                                    if (deviceStats.isDirectory()) {
                                        devices.push({
                                            name: deviceDir,
                                            path: devicePath,
                                            type: 'media'
                                        });
                                    }
                                }
                            }
                        } catch (e) {
                            // Skip
                        }
                    }
                } catch (e) {
                    // Skip
                }
            }
        }
        
        // Remove duplicates based on path
        const uniqueDevices = [];
        const seenPaths = new Set();
        
        for (const device of devices) {
            if (!seenPaths.has(device.path)) {
                seenPaths.add(device.path);
                uniqueDevices.push(device);
            }
        }

        res.json({
            success: true,
            devices: uniqueDevices,
            message: uniqueDevices.length === 0 ? 'Tidak ada perangkat MTP terdeteksi. Pastikan perangkat sudah terhubung dan mode transfer file aktif.' : null,
            debug: {
                uid: process.getuid(),
                home: process.env.HOME,
                checkedPaths: gvfsPaths
            }
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API: List directories in a path (including KIO paths)
app.get('/api/directories', async (req, res) => {
    const dirPath = req.query.path || '/';
    
    // Check if this is a KIO path (mtp:/)
    if (dirPath.startsWith('mtp:/')) {
        try {
            const kioCmd = `kioclient5 ls "${dirPath}" 2>/dev/null || kioclient ls "${dirPath}" 2>/dev/null || echo ""`;
            const { stdout } = await execAsync(kioCmd);
            const items = stdout.trim().split('\n').filter(item => item && item !== '.');
            
            const directories = items.map(item => ({
                name: item,
                path: path.posix.join(dirPath, item)
            }));
            
            directories.sort((a, b) => a.name.localeCompare(b.name));
            
            // Get parent path
            const pathParts = dirPath.split('/').filter(p => p);
            pathParts.pop();
            const parentPath = pathParts.length > 1 ? pathParts.join('/') : 'mtp:/';
            
            return res.json({
                success: true,
                currentPath: dirPath,
                parentPath: parentPath,
                directories: directories,
                isKioPath: true
            });
        } catch (error) {
            return res.json({ success: false, error: error.message });
        }
    }
    
    // Normal filesystem path
    try {
        if (!fs.existsSync(dirPath)) {
            return res.json({ success: false, error: 'Path tidak ditemukan' });
        }

        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
            return res.json({ success: false, error: 'Path bukan direktori' });
        }

        const items = fs.readdirSync(dirPath);
        const directories = [];
        
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            try {
                const itemStats = fs.statSync(fullPath);
                if (itemStats.isDirectory()) {
                    directories.push({
                        name: item,
                        path: fullPath
                    });
                }
            } catch (e) {
                // Skip inaccessible directories
            }
        }

        // Sort directories alphabetically
        directories.sort((a, b) => a.name.localeCompare(b.name));

        res.json({
            success: true,
            currentPath: dirPath,
            parentPath: path.dirname(dirPath),
            directories: directories
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API: Get images from a folder (including KIO paths)
app.get('/api/images', async (req, res) => {
    const dirPath = req.query.path;
    
    if (!dirPath) {
        return res.json({ success: false, error: 'Path diperlukan' });
    }

    // Check if this is a KIO path
    if (dirPath.startsWith('mtp:/')) {
        try {
            const kioCmd = `kioclient5 ls "${dirPath}" 2>/dev/null || kioclient ls "${dirPath}" 2>/dev/null || echo ""`;
            const { stdout } = await execAsync(kioCmd);
            const files = stdout.trim().split('\n').filter(item => item && item !== '.');
            
            const images = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return IMAGE_EXTENSIONS.includes(ext);
            }).map(file => ({
                name: file,
                path: path.posix.join(dirPath, file),
                isKio: true
            }));
            
            images.sort((a, b) => a.name.localeCompare(b.name));
            
            return res.json({
                success: true,
                images: images,
                total: images.length,
                isKioPath: true
            });
        } catch (error) {
            return res.json({ success: false, error: error.message });
        }
    }

    // Normal filesystem path
    try {
        if (!fs.existsSync(dirPath)) {
            return res.json({ success: false, error: 'Folder tidak ditemukan' });
        }

        const files = fs.readdirSync(dirPath);
        const images = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return IMAGE_EXTENSIONS.includes(ext);
        }).map(file => ({
            name: file,
            path: path.join(dirPath, file)
        }));

        // Sort images by name
        images.sort((a, b) => a.name.localeCompare(b.name));

        res.json({
            success: true,
            images: images,
            total: images.length
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API: Serve image file (including KIO paths)
app.get('/api/image', async (req, res) => {
    const imagePath = req.query.path;
    
    if (!imagePath) {
        return res.status(400).send('Path diperlukan');
    }

    // Check if this is a KIO path
    if (imagePath.startsWith('mtp:/')) {
        try {
            // Use kioclient to copy the file to a temp location
            const tmpDir = '/tmp/photo-organizer-mtp';
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            
            const fileName = path.basename(imagePath);
            const tmpFile = path.join(tmpDir, `${Date.now()}_${fileName}`);
            
            const copyCmd = `kioclient5 copy "${imagePath}" "${tmpFile}" 2>/dev/null || kioclient copy "${imagePath}" "${tmpFile}" 2>/dev/null`;
            await execAsync(copyCmd);
            
            // Send the temp file and delete it after sending
            res.sendFile(tmpFile, (err) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tmpFile);
                } catch (e) {
                    console.log('Failed to delete temp file:', e.message);
                }
            });
        } catch (error) {
            return res.status(500).send(error.message);
        }
        return;
    }

    // Normal filesystem path
    try {
        if (!fs.existsSync(imagePath)) {
            return res.status(404).send('File tidak ditemukan');
        }

        res.sendFile(imagePath);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// API: Move image to destination folder (including from KIO paths)
app.post('/api/move', async (req, res) => {
    const { sourcePath, destinationFolder } = req.body;
    
    if (!sourcePath || !destinationFolder) {
        return res.json({ success: false, error: 'Source dan destination diperlukan' });
    }

    // Check if source is a KIO path
    if (sourcePath.startsWith('mtp:/')) {
        try {
            if (!fs.existsSync(destinationFolder)) {
                return res.json({ success: false, error: 'Folder tujuan tidak ditemukan' });
            }

            const fileName = path.basename(sourcePath);
            let destPath = path.join(destinationFolder, fileName);

            // Handle duplicate file names
            let counter = 1;
            const ext = path.extname(fileName);
            const nameWithoutExt = path.basename(fileName, ext);
            
            while (fs.existsSync(destPath)) {
                destPath = path.join(destinationFolder, `${nameWithoutExt}_${counter}${ext}`);
                counter++;
            }

            // Use kioclient to move/copy the file
            const moveCmd = `kioclient5 copy "${sourcePath}" "${destPath}" 2>/dev/null || kioclient copy "${sourcePath}" "${destPath}" 2>/dev/null`;
            await execAsync(moveCmd);
            
            // Optionally delete the source file from MTP device
            try {
                const removeCmd = `kioclient5 remove "${sourcePath}" 2>/dev/null || kioclient remove "${sourcePath}" 2>/dev/null`;
                await execAsync(removeCmd);
            } catch (e) {
                console.log('Failed to remove source file:', e.message);
            }

            return res.json({
                success: true,
                message: `File dipindahkan ke ${destPath}`,
                newPath: destPath
            });
        } catch (error) {
            return res.json({ success: false, error: error.message });
        }
    }

    // Normal filesystem path
    try {
        if (!fs.existsSync(sourcePath)) {
            return res.json({ success: false, error: 'File sumber tidak ditemukan' });
        }

        if (!fs.existsSync(destinationFolder)) {
            return res.json({ success: false, error: 'Folder tujuan tidak ditemukan' });
        }

        const fileName = path.basename(sourcePath);
        let destPath = path.join(destinationFolder, fileName);

        // Handle duplicate file names
        let counter = 1;
        const ext = path.extname(fileName);
        const nameWithoutExt = path.basename(fileName, ext);
        
        while (fs.existsSync(destPath)) {
            destPath = path.join(destinationFolder, `${nameWithoutExt}_${counter}${ext}`);
            counter++;
        }

        // Move the file
        fs.renameSync(sourcePath, destPath);

        res.json({
            success: true,
            message: `File dipindahkan ke ${destPath}`,
            newPath: destPath
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API: Skip image (do nothing, just for tracking)
app.post('/api/skip', (req, res) => {
    res.json({ success: true, message: 'File dilewati' });
});

app.listen(PORT, () => {
    console.log(`\n🖼️  Photo Organizer berjalan di http://localhost:${PORT}`);
    console.log('\nCara penggunaan:');
    console.log('1. Pilih folder sumber yang berisi foto');
    console.log('2. Tambahkan folder-folder tujuan');
    console.log('3. Klik "Mulai Sortir" untuk memulai');
    console.log('4. Tekan angka 1-9 untuk memindahkan foto ke folder tujuan');
    console.log('5. Tekan S untuk melewati foto\n');
});
