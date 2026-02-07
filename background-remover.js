import imglyRemoveBackground, { preload as imglyPreload } from './assets/imgly-background-remover.js';

const IMGLY_PUBLIC_PATH = 'https://staticimgly.com/@imgly/background-removal-data/@1.4.1/dist/';

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const processingState = document.getElementById('processingState');
    const resultArea = document.getElementById('resultArea');
    const statusText = document.getElementById('statusText');
    const originalImage = document.getElementById('originalImage');
    const processedImage = document.getElementById('processedImage');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');

    // Drag & Drop handlers
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    resetBtn.addEventListener('click', () => {
        resultArea.classList.add('hidden');
        dropZone.classList.remove('hidden');
        fileInput.value = ''; // Reset input
        originalImage.src = '';
        processedImage.src = '';
        downloadBtn.removeAttribute('href');
        downloadBtn.removeAttribute('download');
    });

    const INFERENCE_TIMEOUT_MS = 120000;
    let activeJobId = 0;

    const withTimeout = async (promise, timeoutMs) => {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const buildConfig = () => ({
            publicPath: IMGLY_PUBLIC_PATH,
            debug: false,
            // Worker proxy requires a cross-origin-isolated context in many browsers.
            // Fall back to main-thread wasm when isolation headers are absent.
            proxyToWorker: typeof Worker !== 'undefined' && window.crossOriginIsolated,
            model: 'medium',
            output: { format: 'image/png', quality: 0.9 },
            progress: (key, current, total) => {
                if (key === 'compute:inference') {
                    statusText.textContent = 'Removing background...';
                    return;
                }

                if (key.startsWith('fetch:') && total) {
                    const percent = Math.round((current / total) * 100);
                    if (key.includes('/models/')) {
                        statusText.textContent = `Downloading AI model... ${percent}%`;
                    } else if (key.includes('/onnxruntime-web/')) {
                        statusText.textContent = `Preparing runtime... ${percent}%`;
                    } else {
                        statusText.textContent = `Downloading assets... ${percent}%`;
                    }
                }
            }
    });

    async function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file (PNG, JPG, WebP)');
            return;
        }

        // UI State: Processing
        dropZone.classList.add('hidden');
        processingState.classList.remove('hidden');
        resultArea.classList.add('hidden');
        statusText.textContent = "Preparing background removal...";

        const jobId = ++activeJobId;

        // Show original image immediately
        const objectUrl = URL.createObjectURL(file);
        originalImage.src = objectUrl;

        try {
            const config = buildConfig();

            // Preload assets to surface any path issues early.
            statusText.textContent = 'Loading AI model...';
            await withTimeout(imglyPreload(config), INFERENCE_TIMEOUT_MS / 2);

            statusText.textContent = 'Analyzing image...';
            const blob = await withTimeout(imglyRemoveBackground(file, config), INFERENCE_TIMEOUT_MS);

            // Success
            if (jobId !== activeJobId) {
                return;
            }
            const processedUrl = URL.createObjectURL(blob);
            processedImage.src = processedUrl;

            // Setup Download
            const safeName = file.name.split('.').slice(0, -1).join('.') || 'image';
            const downloadName = `removed-bg-${safeName}.png`;
            downloadBtn.href = processedUrl;
            downloadBtn.download = downloadName;

            const supportsDownload = typeof HTMLAnchorElement !== 'undefined' && 'download' in HTMLAnchorElement.prototype;
            if (!supportsDownload) {
                downloadBtn.target = '_blank';
                downloadBtn.rel = 'noopener';
            } else {
                downloadBtn.removeAttribute('target');
                downloadBtn.removeAttribute('rel');
            }

            // Switch to Result View
            processingState.classList.add('hidden');
            resultArea.classList.remove('hidden');

        } catch (error) {
            console.error('Background removal failed:', error);
            // Show more detailed error to user
            let errorMessage = 'Error processing image. ';
            if (error.message && error.message.includes('timeout')) {
                errorMessage += 'Processing is taking too long. Try a smaller image or refresh and try again.';
            } else if (error.message && error.message.includes('Resource metadata')) {
                errorMessage += 'Model files were not found. Check CDN/local asset availability and try again.';
            } else if (error.message && error.message.includes('fetch')) {
                errorMessage += 'Could not download AI model files. Please check your internet connection.';
            } else if (error.message) {
                errorMessage += error.message;
            } else {
                errorMessage += 'Check console for details.';
            }
            alert(errorMessage);

            processingState.classList.add('hidden');
            dropZone.classList.remove('hidden');
            statusText.textContent = "";
        } finally {}
    }
});
