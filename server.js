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

// Zoho APIs: OEC document and Contract Verification (set ZOHO_TRIGGER_CONTRACT_URL in env when you have the contract API URL)
const ZOHO_TRIGGER_URL = process.env.ZOHO_TRIGGER_URL || "https://www.zohoapis.com/creator/custom/louay.sallakho_maids/Chatbot_Fetch_Oec?publickey=w6jnMqmxMqO0k2C66d02gJ0rz";
const ZOHO_TRIGGER_CONTRACT_URL = process.env.ZOHO_TRIGGER_CONTRACT_URL || "https://www.zohoapis.com/creator/custom/louay.sallakho_maids/Chatbot_Fetch_Verified_Contract?publickey=5WsJ6KxKwb25a5eHXYEJPEwyE";

// ----- Your flow: Zoho POSTs the file here -----
// Pass maid_id in the URL: webhook?id=38001 (form body "id" often missing when Zoho sends files).
app.post('/webhook', upload.any(), (req, res) => {
  const bodyKeys = req.body ? Object.keys(req.body) : [];
  const filesCount = (req.files && Array.isArray(req.files)) ? req.files.length : (req.file ? 1 : 0);
  console.log("[webhook] Received POST body keys=" + bodyKeys.join(",") + " filesCount=" + filesCount);

  const recordId = req.body?.record_id?.trim();
  // Zoho often doesn't put params in body when sending files - so use ?id=38001 in the webhook URL
  const idFromQuery = req.query?.id?.trim();
  const maidId = idFromQuery || req.body?.id?.trim() || req.body?.maid_id?.trim();
  const clientId = req.body?.client_id?.trim();
  const file = (req.files && req.files[0]) || req.file || null;

  if (!file || !file.buffer) {
    console.log("[webhook] Missing file - query.id=" + idFromQuery + " body.record_id=" + recordId);
    return res.status(400).json({ error: 'Missing file in form' });
  }
  // Document type from fieldname: "38001_oec_document" -> oec; "38001_contract_verification_document" -> contract
  const isContract = file.fieldname && file.fieldname.includes("_contract_verification_document");
  const idFromFieldname = (file.fieldname && (file.fieldname.includes("_oec_document") || file.fieldname.includes("_contract_verification_document")))
    ? file.fieldname.replace(/_oec_document$/, "").replace(/_contract_verification_document$/, "").trim()
    : "";
  const prefix = isContract ? "contract_" : "";
  console.log("[webhook] File fieldname=" + file.fieldname + " type=" + (isContract ? "contract" : "oec") + " query.id=" + idFromQuery + " idFromFieldname=" + idFromFieldname);

  const filename = file.originalname || 'document';
  const nameWithoutExt = filename.replace(/\.[^.]*$/, '').trim();
  const idFromFilename = nameWithoutExt.includes('_') ? nameWithoutExt.split('_')[0] : nameWithoutExt;
  const rawId = maidId || idFromFieldname || clientId || idFromFilename;
  const linkId = prefix + rawId;

  const entry = {
    buffer: file.buffer,
    contentType: file.mimetype || 'application/octet-stream',
    filename,
    storedAt: Date.now(),
  };

  fileStore.set(linkId, entry);
  fileStore.set(idFromFilename, entry);
  if (recordId) fileStore.set(recordId, entry);
  if (maidId) fileStore.set(maidId, entry);
  if (clientId) fileStore.set(clientId, entry);
  console.log("[webhook] Stored file under keys: linkId=" + linkId + " idFromFilename=" + idFromFilename + (recordId ? " record_id=" + recordId : ""));

  const base = BASE_URL || `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
  const path = isContract ? "download/verified_contract" : "download/oec";
  const downloadUrl = `${base}/${path}/${rawId}`;

  res.status(200).json({
    status: 'success',
    record_id: recordId || null,
    id_from_filename: idFromFilename,
    download_url: downloadUrl,
  });
});

// ----- OEC document: GET /download/oec/:id -----
app.get('/download/oec/:id', async (req, res) => {
  const id = req.params.id;
  let entry = fileStore.get(id);

  if (!entry) {
    console.log("[download/oec] No file in store for id=" + id + ", calling Zoho: " + ZOHO_TRIGGER_URL);

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
    console.log("[download/oec] Zoho response code=" + data?.code + " status=" + result?.status + " message=" + (result?.message || ""));

    if (!success) {
      console.log("[download/oec] Trying as client_id");
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
      console.log("[download/oec] Zoho response (client_id) code=" + data2?.code + " status=" + result2?.status + " message=" + (result2?.message || ""));
      if (!success2) {
        return res.status(404).json({ error: result2?.message || "File not found" });
      }
    }

    // Zoho POSTs to our webhook; may take a moment. Retry a few times.
    for (let wait of [1500, 2500, 4000]) {
      await new Promise((r) => setTimeout(r, wait));
      entry = fileStore.get(id);
      if (entry) break;
    }
    if (!entry) {
      const storeKeys = Array.from(fileStore.keys()).slice(0, 20).join(",");
      console.log("[download/oec] File not in store for id=" + id + " storeKeys=[" + storeKeys + "] (did [webhook] log appear above?)");
      return res.status(504).json({ error: "File not received from Zoho" });
    }
  }

  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
  res.setHeader('Content-Type', entry.contentType);
  res.send(entry.buffer);
});

// ----- Verified contract: GET /download/verified_contract/:id -----
app.get('/download/verified_contract/:id', async (req, res) => {
  const id = req.params.id;
  const storeKey = "contract_" + id;
  let entry = fileStore.get(storeKey);

  if (!entry && ZOHO_TRIGGER_CONTRACT_URL) {
    console.log("[download/verified_contract] No file in store for id=" + id + ", calling Zoho: " + ZOHO_TRIGGER_CONTRACT_URL);
    let zohoResp;
    try {
      zohoResp = await fetch(ZOHO_TRIGGER_CONTRACT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reqData: { maid_id_str: id }, maid_id_str: id }),
      });
    } catch (e) {
      console.error("[download/verified_contract] Zoho fetch error:", e.message);
      return res.status(502).json({ error: "Could not reach Zoho" });
    }
    const data = await zohoResp.json().catch(() => ({}));
    const result = data?.result || {};
    const success = data?.code === 3000 && result?.status === "success";
    if (!success) {
      try {
        zohoResp = await fetch(ZOHO_TRIGGER_CONTRACT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reqData: { client_id_str: id }, client_id_str: id }),
        });
      } catch (e) {
        return res.status(502).json({ error: "Could not reach Zoho" });
      }
      const data2 = await zohoResp.json().catch(() => ({}));
      const result2 = data2?.result || {};
      if (data2?.code !== 3000 || result2?.status !== "success") {
        return res.status(404).json({ error: result2?.message || "File not found" });
      }
    }
    for (let wait of [1500, 2500, 4000]) {
      await new Promise((r) => setTimeout(r, wait));
      entry = fileStore.get(storeKey);
      if (entry) break;
    }
    if (!entry) {
      return res.status(504).json({ error: "File not received from Zoho" });
    }
  } else if (!entry) {
    return res.status(503).json({ error: "Verified contract download not configured (ZOHO_TRIGGER_CONTRACT_URL)" });
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
