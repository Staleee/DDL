const express = require('express');
const https = require('https');
const http = require('http');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Zoho URL that returns the file. Must contain {{id}} which we replace with the request id.
// Example: https://creator.zoho.com/api/xxx/report/Download?id={{id}}
const ZOHO_FILE_URL = process.env.ZOHO_FILE_URL;

if (!ZOHO_FILE_URL || !ZOHO_FILE_URL.includes('{{id}}')) {
  console.warn('Set ZOHO_FILE_URL in Railway (e.g. https://creator.zoho.com/...?id={{id}})');
}

app.get('/download/:id', (req, res) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: 'Missing id' });
  }
  if (!ZOHO_FILE_URL || !ZOHO_FILE_URL.includes('{{id}}')) {
    return res.status(503).json({ error: 'ZOHO_FILE_URL not configured' });
  }

  const urlTemplate = ZOHO_FILE_URL;
  const targetUrl = urlTemplate.replace('{{id}}', encodeURIComponent(id));
  const protocol = targetUrl.startsWith('https') ? https : http;

  const requestOptions = {};
  if (process.env.ZOHO_ACCESS_TOKEN) {
    requestOptions.headers = { Authorization: `Zoho-oauthtoken ${process.env.ZOHO_ACCESS_TOKEN}` };
  }

  const request = protocol.get(targetUrl, requestOptions, (zohoRes) => {
    if (zohoRes.statusCode >= 400) {
      res.status(zohoRes.statusCode).send('File not found or error from Zoho');
      return;
    }

    const disposition = zohoRes.headers['content-disposition'];
    const filename = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i)?.[1]?.trim()
      || disposition?.match(/filename="?([^";]+)"?/)?.[1]
      || `document-${id}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', zohoRes.headers['content-type'] || 'application/octet-stream');
    if (zohoRes.headers['content-length']) {
      res.setHeader('Content-Length', zohoRes.headers['content-length']);
    }
    zohoRes.pipe(res);
  });

  request.on('error', (err) => {
    console.error('Zoho request error:', err.message);
    res.status(502).json({ error: 'Download failed' });
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
