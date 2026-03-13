# What to do now — checklist

## 1. Zoho function — **no change needed**

Your function already:

- Accepts `maid_id` or `client_id`
- Finds the record and gets the file
- POSTs the file to `https://ddl-production-47d3.up.railway.app/webhook`
- Sends `record_id`, `maid_id` or `client_id`, and the file as `oec_file`

Leave it as is.

---

## 2. Railway (hosting) — **deploy latest code**

Make sure the app running on Railway is the **current** version (the one where `GET /download/:id` calls Zoho when the file is not in store).

- If you deploy from GitHub: push your latest code and let Railway redeploy.
- If you deploy from the CLI: run `railway up` (or your usual deploy command) from the project folder.

No new environment variables are required. Optionally you can set:

- **`BASE_URL`** = `https://ddl-production-47d3.up.railway.app` (only if you need correct URLs in webhook responses).
- **`ZOHO_TRIGGER_URL`** = only if you use a different Zoho API URL later (default is already set in code).

---

## 3. Test

1. Open in a browser (use a real `maid_id` from your data):  
   `https://ddl-production-47d3.up.railway.app/download/YOUR_MAID_ID`
2. You should get the file download (first time may take a few seconds while we call Zoho and Zoho POSTs to the webhook).
3. If you use `client_id` instead:  
   `https://ddl-production-47d3.up.railway.app/download/YOUR_CLIENT_ID`

---

## 4. Chatbot

Give the chatbot team:

- **Base URL:** `https://ddl-production-47d3.up.railway.app`
- **Link:** `{BASE_URL}/download/{maid_id}` or `{BASE_URL}/download/{client_id}`

They only build that URL and show it to the user; they do not call Zoho.

---

That’s it. No Zoho changes, no new env vars required — just deploy the latest app to Railway and test the link.
