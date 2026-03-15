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

// When GET /download/:id is hit and we don't have the file, we call this Zoho API so Zoho runs the function and POSTs the file to our webhook.
const ZOHO_TRIGGER_URL = process.env.ZOHO_TRIGGER_URL || "https://www.zohoapis.com/creator/custom/louay.sallakho_maids/Chatbot_Fetch_Oec?publickey=w6jnMqmxMqO0k2C66d02gJ0rz";

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
  const entry = {
    buffer: file.buffer,
    contentType: file.mimetype || 'application/octet-stream',
    filename,
    storedAt: Date.now(),
  };

  // Store under record_id and under maid_id/client_id so user can use any in the URL
  fileStore.set(recordId, entry);
  const maidId = req.body?.maid_id?.trim();
  const clientId = req.body?.client_id?.trim();
  if (maidId) fileStore.set(maidId, entry);
  if (clientId) fileStore.set(clientId, entry);

  const base = BASE_URL || `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
  // Use maid_id or client_id in the link so the direct download URL is /download/{maid_id} or /download/{client_id}
  const linkId = maidId || clientId || recordId;
  const downloadUrl = `${base}/download/${linkId}`;

  res.status(200).json({
    status: 'success',
    record_id: recordId,
    maid_id: maidId || null,
    client_id: clientId || null,
    download_url: downloadUrl,
  });
});

// ----- Direct download: user opens link → we call Zoho (Zoho POSTs file to webhook) → we return the file -----
app.get('/download/:id', async (req, res) => {
  const id = req.params.id;
  let entry = fileStore.get(id);

  if (!entry) {
    // Trigger Zoho so they run the function and POST the file to our /webhook
    console.log("[download] No file in store for id=" + id + ", calling Zoho: " + ZOHO_TRIGGER_URL);

    let zohoResp;
    try {
      zohoResp = await fetch(ZOHO_TRIGGER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reqData: { maid_id_str: id } }),
      });
    } catch (e) {
      console.error("[download] Zoho fetch error:", e.message);
      return res.status(502).json({ error: "Could not reach Zoho" });
    }

    const data = await zohoResp.json().catch(() => ({}));
    const result = data?.result || {};
    const success = data?.code === 3000 && result?.status === "success";
    console.log("[download] Zoho response code=" + data?.code + " status=" + result?.status + " message=" + (result?.message || ""));

    if (!success) {
      console.log("[download] Trying as client_id");
      try {
        zohoResp = await fetch(ZOHO_TRIGGER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reqData: { client_id_str: id } }),
        });
      } catch (e) {
        console.error("[download] Zoho fetch error (client_id):", e.message);
        return res.status(502).json({ error: "Could not reach Zoho" });
      }
      const data2 = await zohoResp.json().catch(() => ({}));
      const result2 = data2?.result || {};
      const success2 = data2?.code === 3000 && result2?.status === "success";
      console.log("[download] Zoho response (client_id) code=" + data2?.code + " status=" + result2?.status + " message=" + (result2?.message || ""));
      if (!success2) {
        return res.status(404).json({ error: result2?.message || "File not found" });
      }
    }

    await new Promise((r) => setTimeout(r, 800));
    entry = fileStore.get(id);
    if (!entry) {
      return res.status(504).json({ error: "File not received from Zoho" });
    }
  }

  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
  res.setHeader('Content-Type', entry.contentType);
  res.send(entry.buffer);
});

app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// So you can confirm which Zoho API we call
app.get('/zoho-url', (req, res) => {
  res.json({ zoho_trigger_url: ZOHO_TRIGGER_URL });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
