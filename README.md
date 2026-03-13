# Zoho file download proxy (Railway)

Your flow: **Zoho has the auth and the record lookup** (by `maid_id` / `client_id`). Zoho gets the file and **POSTs it to this app**. We store it and give back a **direct download link** that anyone can open — no auth on our side.

## The two approaches (what we did vs the other way)

| | **What we implemented (your flow)** | **The other way** |
|---|-------------------------------------|-------------------|
| **Who has Zoho auth?** | Zoho only (your function uses `zoho_oauth_connection`) | Our server (we’d set `ZOHO_ACCESS_TOKEN` on Railway) |
| **Who has maid_id / client_id?** | Zoho function gets it, finds the record, gets the file | We’d need to call Zoho twice: once to get record by maid_id, once to download file by record_id |
| **Flow** | Chatbot → Zoho function (maid_id) → Zoho fetches file → Zoho **POSTs file to us** → we store and return `download_url` | Chatbot → Zoho function (maid_id) → Zoho returns **record_id** → link is our URL with record_id → **we** call Zoho file API (with our token) and stream file |
| **We need** | Endpoint to **receive** the file (POST) and serve it (GET) | Endpoint that **calls** Zoho (so we need their token) |

You said you don’t want to set up auth here and you don’t have the record id (you have maid_id/client_id). So we use **your flow**: Zoho does the lookup and sends the file; we only receive and serve it.

## Endpoints

- **`POST /webhook`** — Zoho function POSTs the file here (multipart, field `oec_file` + form fields `record_id`, `maid_id` or `client_id`, `file_field`). We store the file and respond with JSON: `{ "download_url": "https://.../download/<record_id>" }`.
- **`GET /download/:id`** — Direct download. User opens this link and gets the file (no auth). `id` = `record_id` we got from the POST. Files expire after 1 hour (configurable with `FILE_TTL_MS`).
- **`GET /health`** — For Railway health checks.

## Railway

1. Deploy this repo to Railway.
2. **Optional:** set **`BASE_URL`** to your public URL (e.g. `https://ddl-production-47d3.up.railway.app`) so the returned `download_url` is correct if the app is behind a proxy. Otherwise we derive it from the request.
3. **Optional:** set **`FILE_TTL_MS`** (milliseconds; default 3600000 = 1 hour) for how long files are kept.

No Zoho tokens or env vars needed on Railway for this flow.

## Zoho function

Use the version in **`ZOHO_FUNCTION_GET_OEC_FILE.deluge`**: it POSTs the file to `https://<your-app>.railway.app/webhook`. The response includes `download_url` (from our JSON body when possible, else fallback to `/download/<record_id>`). Give that URL to the user as the direct download link.

---

## Chatbot integration — direct download link (no Zoho call from chatbot)

**The chatbot never talks to Zoho.** It only has the **base URL** and the **id** (maid_id or client_id). It **assembles the link** and gives it to the user.

**Link format:**  
`https://ddl-production-47d3.up.railway.app/download/{id}`  

where `{id}` is the **maid_id** or **client_id**.

**What happens when the user opens that link:**

1. Request hits **our** server: `GET /download/12345`
2. **We** call Zoho (with that id as maid_id, or if that fails as client_id).
3. Zoho runs your function → finds the record → gets the file → **POSTs the file to our webhook**.
4. We receive the file and **return it** in the same request → user gets the download.

So we **imitate** a direct download: one URL, open it → file downloads. We call Zoho in the background; Zoho sends the file to our webhook; we stream it back.

---

### What to give the chatbot team

| What | Value |
|------|--------|
| **Base URL** | `https://ddl-production-47d3.up.railway.app` |
| **Link pattern** | `{BASE_URL}/download/{id}` |
| **id** | `maid_id` **or** `client_id` (they use whichever they have) |

**Example:**  
- Chatbot has `maid_id = "12345"` → link: `https://ddl-production-47d3.up.railway.app/download/12345`  
- Chatbot has `client_id = "67890"` → link: `https://ddl-production-47d3.up.railway.app/download/67890`  

User clicks the link → file downloads. No login. Chatbot does **not** call Zoho.
