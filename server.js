const express = require('express');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// In-memory store: record_id -> { buffer, contentType, filename, storedAt }
// Files expire after FILE_TTL_MS (default 1 hour)
const fileStore = new Map();
const FILE_TTL_MS = Number(process.env.FILE_TTL_MS) || 60 * 60 * 1000;

function cleanupExpired() {
  const now = Date.now();
  for (const [id, entry] of fileStore.entries()) {
    if (now - entry.storedAt > FILE_TTL_MS) fileStore.delete(id);
  }
}
setInterval(cleanupExpired, 5 * 60 * 1000);

const upload = multer({ storage: multer.memoryStorage() });

// Base URL for download links. Set BASE_URL on Railway if behind a proxy; otherwise we derive from request.
const BASE_URL = process.env.BASE_URL || null;

// ----- Your flow: Zoho POSTs the file here (auth stays on Zoho's side) -----
// Zoho function: look up by maid_id/client_id, get file, POST to this URL with file + record_id
app.post('/webhook', upload.single('oec_file'), (req, res) => {
  const recordId = req.body?.record_id?.trim();
  const file = req.file;

  if (!recordId) {
    return res.status(400).json({ error: 'Missing record_id in form' });
  }
  if (!file || !file.buffer) {
    return res.status(400).json({ error: 'Missing file (field name: oec_file)' });
  }

  const filename = file.originalname || `document-${recordId}`;
  fileStore.set(recordId, {
    buffer: file.buffer,
    contentType: file.mimetype || 'application/octet-stream',
    filename,
    storedAt: Date.now(),
  });

  const base = BASE_URL || `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
  const downloadUrl = `${base}/download/${recordId}`;

  res.status(200).json({
    status: 'success',
    record_id: recordId,
    download_url: downloadUrl,
  });
});

// ----- Direct download: serve the file that Zoho already sent us -----
app.get('/download/:id', (req, res) => {
  const id = req.params.id;
  const entry = fileStore.get(id);

  if (!entry) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
  res.setHeader('Content-Type', entry.contentType);
  res.send(entry.buffer);
});

app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
