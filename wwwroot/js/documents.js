import * as pdfjs from '../vendor/pdfjs/pdf.mjs';

const appBase = new URL(document.querySelector('meta[name="app-base"]').content, location.origin);
pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.mjs', appBase).href;
const $ = id => document.getElementById(id);
const gallery = $('gallery');
const dialog = $('preview-dialog');
const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
let currentPage = 1;
let currentPages = 1;
let currentSearch = '';
let currentType = '';
let listSignature = '';
let listController;
let listGeneration = 0;
let listLoading = false;
let thumbnailGeneration = 0;
let previewGeneration = 0;
let pdfTask;
let previewPdf;
let renderTask;
let pdfPage = 1;
let selected;
let resizing;
let deleting = false;
const deleteForm = $('delete-document-form');

const fileUrl = (id, download = false) => new URL(`documents/${encodeURIComponent(id)}/content${download ? '?download=true' : ''}`, appBase).href;
const formatBytes = bytes => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const formatDate = date => dateFormat.format(new Date(date));
const pdfOptions = url => ({
    url, isEvalSupported: false, enableXfa: false, disableAutoFetch: true,
    cMapUrl: new URL('vendor/pdfjs/cmaps/', appBase).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('vendor/pdfjs/standard_fonts/', appBase).href,
    wasmUrl: new URL('vendor/pdfjs/wasm/', appBase).href
});

function message(text, error = false) {
    $('message').textContent = text;
    $('message').hidden = !text;
    $('message').classList.toggle('error', error);
}

async function loadDocuments(automatic = false) {
    if (automatic && listLoading) return;
    listLoading = true;
    const generation = ++listGeneration;
    listController?.abort();
    listController = new AbortController();
    if (!automatic) {
        $('refresh').disabled = true;
        gallery.setAttribute('aria-busy', 'true');
        message('Memuat daftar dokumen…');
    }
    try {
        const url = new URL('api/documents', appBase);
        url.search = new URLSearchParams({ search: currentSearch, type: currentType, page: currentPage });
        const response = await fetch(url, { signal: listController.signal, cache: 'no-store' });
        if (response.status === 401) {
            location.assign(new URL(`Login?ReturnUrl=${encodeURIComponent(appBase.pathname)}`, appBase));
            return;
        }
        if (!response.ok) throw new Error('Daftar dokumen tidak dapat dimuat. Tekan Perbarui untuk mencoba lagi.');
        const data = await response.json();
        if (generation !== listGeneration) return;
        currentPage = data.page;
        currentPages = data.pages;
        $('result-heading').textContent = `${data.total} dokumen${currentSearch || currentType ? ' ditemukan' : ' bersama'}`;
        $('sync-status').textContent = `Diperbarui ${new Intl.DateTimeFormat('id-ID', { timeStyle: 'short' }).format(new Date())} · Otomatis tiap 2 detik`;
        const warning = $('import-warning');
        warning.hidden = data.import.state === 'ready' && !data.import.skipped;
        warning.textContent = data.import.state === 'missing'
            ? 'Folder masuk belum tersedia. Hubungi admin untuk memeriksa lokasi penyimpanan scan.'
            : data.import.state === 'error'
                ? 'Pemeriksaan scan baru sedang bermasalah. Dokumen yang sudah diarsipkan tetap bisa diambil. Hubungi admin.'
                : data.import.state === 'starting'
                    ? 'Arsip sedang mulai memeriksa hasil scan baru.'
                    : 'Ada file yang belum dapat diarsipkan. Admin dapat memeriksa format, ukuran, atau izin file.';
        const signature = JSON.stringify(data.documents);
        if (signature !== listSignature) {
            listSignature = signature;
            buildGallery(data.documents);
        }
        message(data.total ? '' : currentSearch || currentType
            ? 'Tidak ada dokumen yang cocok. Ubah nama pencarian atau pilih Semua jenis.'
            : 'Belum ada hasil scan. Scan ke folder masuk server; dokumen akan tampil setelah selesai disimpan.');
        $('pagination').hidden = currentPages <= 1;
        $('previous').disabled = currentPage <= 1;
        $('next').disabled = currentPage >= currentPages;
        $('page-label').textContent = `Halaman ${currentPage} dari ${currentPages}`;
    } catch (error) {
        if (error.name !== 'AbortError') {
            message(error.message || 'Koneksi ke arsip terputus. Tekan Perbarui untuk mencoba lagi.', true);
            $('sync-status').textContent = 'Pembaruan tertunda';
        }
    } finally {
        if (generation === listGeneration) {
            listLoading = false;
            $('refresh').disabled = false;
            gallery.setAttribute('aria-busy', 'false');
        }
    }
}

function buildGallery(documents) {
    const generation = ++thumbnailGeneration;
    const jobs = [];
    const fragment = document.createDocumentFragment();
    for (const doc of documents) {
        const article = document.createElement('article');
        article.className = 'document-card';
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', `Preview ${doc.name}`);
        const paper = document.createElement('span');
        paper.className = 'paper-preview';
        const status = document.createElement('span');
        status.className = 'thumb-status';
        status.textContent = 'Memuat thumbnail…';
        paper.append(status);
        const caption = document.createElement('span');
        caption.className = 'document-caption';
        const name = document.createElement('span');
        name.className = 'document-name';
        name.textContent = doc.name;
        const details = document.createElement('span');
        details.className = 'document-details';
        const type = doc.contentType === 'application/pdf' ? 'PDF' : 'Gambar';
        details.textContent = `${type} · ${formatBytes(doc.bytes)} · Masuk ${formatDate(doc.importedUtc)}`;
        caption.append(name, details);
        button.append(paper, caption);
        button.addEventListener('click', () => openPreview(doc));
        article.append(button);
        fragment.append(article);
        jobs.push(async () => {
            if (generation !== thumbnailGeneration) return;
            let task;
            try {
                if (doc.contentType === 'application/pdf') {
                    task = pdfjs.getDocument(pdfOptions(fileUrl(doc.id)));
                    const pdf = await task.promise;
                    const page = await pdf.getPage(1);
                    if (generation !== thumbnailGeneration) return;
                    const canvas = document.createElement('canvas');
                    canvas.setAttribute('aria-hidden', 'true');
                    const normal = page.getViewport({ scale: 1 });
                    const viewport = page.getViewport({ scale: Math.min(400 / normal.width, 500 / normal.height) });
                    canvas.width = Math.ceil(viewport.width);
                    canvas.height = Math.ceil(viewport.height);
                    await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise;
                    if (generation === thumbnailGeneration) paper.replaceChildren(canvas);
                } else {
                    const image = new Image();
                    image.width = 400;
                    image.height = 500;
                    image.alt = '';
                    image.src = fileUrl(doc.id);
                    await image.decode();
                    if (generation === thumbnailGeneration) paper.replaceChildren(image);
                }
            } catch {
                status.textContent = 'Thumbnail tidak tersedia. Buka untuk melihat opsi dokumen.';
            } finally {
                if (task) await task.destroy();
            }
        });
    }
    gallery.replaceChildren(fragment);
    // Limit parallel PDF decoders so a full page of scans does not monopolize memory.
    const run = async () => {
        while (jobs.length && generation === thumbnailGeneration) await jobs.shift()();
    };
    void run();
    void run();
}

function setPreviewStatus(text) {
    $('preview-status').textContent = text;
}

async function clearPdf() {
    if (renderTask) {
        renderTask.cancel();
        try { await renderTask.promise; } catch { /* Cancelling a page render is expected when closing or changing pages. */ }
        renderTask = undefined;
    }
    const old = pdfTask;
    pdfTask = undefined;
    previewPdf = undefined;
    if (old) await old.destroy();
}

async function openPreview(doc) {
    const generation = ++previewGeneration;
    selected = doc;
    if (deleteForm) {
        deleteForm.hidden = true;
        $('delete-error').hidden = true;
        $('delete-document').disabled = deleting;
    }
    pdfPage = 1;
    $('preview-name').textContent = doc.name;
    $('preview-meta').textContent = `${formatBytes(doc.bytes)} · Masuk ${formatDate(doc.importedUtc)} · File sumber diubah ${formatDate(doc.sourceModifiedUtc)}`;
    $('download').href = fileUrl(doc.id, true);
    $('download').download = doc.name;
    $('zoom').value = 'fit';
    $('pdf-canvas').hidden = true;
    $('image-preview').hidden = true;
    $('pdf-controls').hidden = doc.contentType !== 'application/pdf';
    $('previous-page').disabled = true;
    $('next-page').disabled = true;
    $('pdf-page-label').textContent = '';
    setPreviewStatus('Memuat preview…');
    if (!dialog.open) dialog.showModal();
    await clearPdf();
    if (generation !== previewGeneration) return;
    try {
        if (doc.contentType === 'application/pdf') {
            pdfTask = pdfjs.getDocument(pdfOptions(fileUrl(doc.id)));
            previewPdf = await pdfTask.promise;
            if (generation !== previewGeneration) return;
            await renderPage();
        } else {
            const image = $('image-preview');
            image.alt = `Preview ${doc.name}`;
            image.src = fileUrl(doc.id);
            await image.decode();
            if (generation !== previewGeneration) return;
            image.hidden = false;
            sizeImage();
            setPreviewStatus('Preview gambar');
        }
    } catch (error) {
        if (generation === previewGeneration) setPreviewStatus('Preview tidak dapat ditampilkan. Kamu tetap bisa mencoba download dokumennya; jika file rusak, scan ulang.');
    }
}

async function renderPage() {
    if (!previewPdf || !dialog.open) return;
    const pdf = previewPdf;
    const generation = previewGeneration;
    $('previous-page').disabled = true;
    $('next-page').disabled = true;
    $('zoom').disabled = true;
    setPreviewStatus('Memuat halaman…');
    try {
        if (renderTask) {
            renderTask.cancel();
            try { await renderTask.promise; } catch { }
        }
        const page = await pdf.getPage(pdfPage);
        if (generation !== previewGeneration) return;
        const original = page.getViewport({ scale: 1 });
        const available = Math.max(150, $('preview-stage').clientWidth - 40);
        const scale = $('zoom').value === 'fit' ? available / original.width : Number($('zoom').value);
        const viewport = page.getViewport({ scale });
        const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12000000 / (viewport.width * viewport.height)));
        const canvas = $('pdf-canvas');
        canvas.width = Math.ceil(viewport.width * density);
        canvas.height = Math.ceil(viewport.height * density);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.hidden = false;
        renderTask = page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport, transform: [density, 0, 0, density, 0, 0] });
        await renderTask.promise;
        $('pdf-page-label').textContent = `${pdfPage} / ${pdf.numPages}`;
        setPreviewStatus(`Halaman ${pdfPage} dari ${pdf.numPages}`);
    } catch (error) {
        if (generation === previewGeneration && error.name !== 'RenderingCancelledException')
            setPreviewStatus('Halaman belum dapat ditampilkan. Coba buka kembali preview atau download dokumennya.');
    } finally {
        if (generation === previewGeneration) {
            $('previous-page').disabled = pdfPage <= 1;
            $('next-page').disabled = pdfPage >= pdf.numPages;
            $('zoom').disabled = false;
        }
    }
}

function sizeImage() {
    const image = $('image-preview');
    const available = Math.max(150, $('preview-stage').clientWidth - 40);
    const width = $('zoom').value === 'fit' ? Math.min(available, image.naturalWidth) : image.naturalWidth * Number($('zoom').value);
    image.style.width = `${width}px`;
    image.style.height = 'auto';
}

$('search-form').addEventListener('submit', event => {
    event.preventDefault();
    currentSearch = $('search').value.trim();
    currentType = $('type').value;
    currentPage = 1;
    void loadDocuments();
});
$('refresh').addEventListener('click', () => void loadDocuments());
$('previous').addEventListener('click', () => { if (currentPage > 1) { currentPage--; void loadDocuments(); } });
$('next').addEventListener('click', () => { if (currentPage < currentPages) { currentPage++; void loadDocuments(); } });
$('close-preview').addEventListener('click', () => dialog.close());
if (deleteForm) {
    const cancelDelete = () => {
        if (deleting) return;
        deleteForm.hidden = true;
        $('delete-document').focus();
    };
    $('delete-document').addEventListener('click', () => {
        if (!selected || deleting) return;
        $('delete-name').textContent = selected.name;
        $('delete-error').hidden = true;
        deleteForm.hidden = false;
        $('cancel-delete').focus();
    });
    $('cancel-delete').addEventListener('click', cancelDelete);
    dialog.addEventListener('cancel', event => {
        if (!deleteForm.hidden) {
            event.preventDefault();
            cancelDelete();
        }
    });
    deleteForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!selected || deleting) return;
        const doc = selected;
        deleting = true;
        for (const id of ['delete-document', 'cancel-delete', 'confirm-delete']) $(id).disabled = true;
        $('confirm-delete').textContent = 'Menghapus…';
        $('delete-error').hidden = true;
        try {
            const response = await fetch(new URL(`api/documents/${encodeURIComponent(doc.id)}/delete`, appBase), {
                method: 'POST', body: new FormData(deleteForm)
            });
            if (response.status === 401) {
                location.assign(new URL('Login', appBase));
                return;
            }
            if (!response.ok && response.status !== 404) throw new Error(response.status === 403
                ? 'Hanya admin yang boleh menghapus dokumen.'
                : 'Dokumen belum dapat dihapus. Coba lagi atau muat ulang halaman.');
            if (selected?.id === doc.id) dialog.close();
            listSignature = '';
            await loadDocuments();
            message('Dokumen berhasil dihapus dari arsip bersama.');
            $('refresh').focus();
        } catch (error) {
            $('delete-error').textContent = error.message || 'Koneksi terputus. Coba hapus kembali.';
            $('delete-error').hidden = false;
        } finally {
            deleting = false;
            for (const id of ['delete-document', 'cancel-delete', 'confirm-delete']) $(id).disabled = false;
            $('confirm-delete').textContent = 'Ya, hapus dokumen';
        }
    });
}
dialog.addEventListener('close', () => { previewGeneration++; selected = undefined; void clearPdf(); $('zoom').disabled = false; });
$('previous-page').addEventListener('click', () => { if (previewPdf && pdfPage > 1) { pdfPage--; void renderPage(); } });
$('next-page').addEventListener('click', () => { if (previewPdf && pdfPage < previewPdf.numPages) { pdfPage++; void renderPage(); } });
$('zoom').addEventListener('change', () => { if (previewPdf) void renderPage(); else sizeImage(); });
window.addEventListener('resize', () => {
    clearTimeout(resizing);
    resizing = setTimeout(() => {
        if (!dialog.open || $('zoom').value !== 'fit') return;
        if (previewPdf) void renderPage();
        else if (selected) sizeImage();
    }, 200);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) void loadDocuments(true); });
setInterval(() => { if (!document.hidden) void loadDocuments(true); }, 2000);
void loadDocuments();
