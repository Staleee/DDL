# Zoho file download proxy

GET API that takes a document `id`, calls your Zoho Creator URL, and returns the file as a download. Built for hosting on **Railway**.

## Endpoint

- **`GET /download/:id`** — Returns the file from Zoho for the given `id`.

Example: `https://your-app.railway.app/download/abc123` → browser downloads the document.

## Railway setup

1. **Deploy**  
   Connect this repo to Railway (or push to GitHub and deploy from there).

2. **Environment variables** (Railway → your service → Variables):
   - **`ZOHO_FILE_URL`** (required)  
     Full Zoho URL that returns the file. Use `{{id}}` where the id should go, e.g.  
     `https://creator.zoho.com/api/v2/your_org/report/Download_Report?id={{id}}`
   - **`ZOHO_ACCESS_TOKEN`** (optional)  
     If your Zoho API needs auth, set your OAuth token here. Sent as `Authorization: Zoho-oauthtoken <token>`.

3. **Port**  
   Railway sets `PORT` automatically; the app uses it.

## Local run

```bash
npm install
# Set ZOHO_FILE_URL (and ZOHO_ACCESS_TOKEN if needed) in .env or shell
npm start
```

Then open: `http://localhost:3000/download/YOUR_ID`

## Health check

- **`GET /health`** — Returns `200 OK`. Use for Railway health checks if needed.
