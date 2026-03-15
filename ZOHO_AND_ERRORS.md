# Zoho API we use + when you see "File not found"

## Which Zoho API we call

We call this URL (POST with JSON body):

```
https://www.zohoapis.com/creator/custom/louay.sallakho_maids/Chatbot_Fetch_Oec?publickey=w6jnMqmxMqO0k2C66d02gJ0rz
```

- **Method:** POST  
- **Body (maid):** `{ "reqData": { "maid_id_str": "38001" } }`  
- **Body (client, if maid fails):** `{ "reqData": { "client_id_str": "38001" } }`  

You can double-check from your app by opening:

**GET** `https://ddl-production-47d3.up.railway.app/zoho-url`  

It returns: `{ "zoho_trigger_url": "https://www.zohoapis.com/creator/..." }`

To use a different URL, set env **`ZOHO_TRIGGER_URL`** on Railway.

---

## When we return "File not found"

We only return that in **one** case:

1. We **do** call the Zoho API (first with `maid_id_str`, then if that fails with `client_id_str`).
2. **Both** Zoho responses are “not success” (e.g. `code !== 3000` or `result.status !== "success"`).
3. We then respond with **404** and `error: result2?.message || "File not found"`.

So if you see "File not found", it means:

- We **did** trigger Zoho (both as maid and as client).
- Zoho returned an error both times (e.g. “Either maid_id or client_id must be provided”, or “Record fetch failed”, etc.). We pass through Zoho’s `result.message` when we have it; otherwise we use the generic "File not found".

We do **not** return "File not found" without calling Zoho. If the file is missing from our store, we always call Zoho first (then possibly return "File not received from Zoho" or the message above).

---

## How to confirm we’re calling Zoho

After redeploying the latest code:

1. In **Railway** open your service → **Deployments** → latest deploy → **View logs**.
2. Hit: `https://ddl-production-47d3.up.railway.app/download/38001`
3. In the logs you should see lines like:
   - `[download] No file in store for id=38001, calling Zoho: https://...`
   - `[download] Zoho response code=... status=... message=...`

If those lines never appear, the running app is still an old deploy (one that doesn’t trigger Zoho). Redeploy the latest code.

If those lines appear but you still get "File not found", then Zoho is being called but returning an error. Check the logged `message` from Zoho; that usually means the payload format or the way your Zoho function reads `reqData` / `maid_id_str` / `client_id_str` doesn’t match what the API sends.

---

## "File not received from Zoho" (504)

We called Zoho and got success, but the file never showed up in our store (we wait and retry ~4 sec).

**Check:**

1. **Chatbot_Fetch_Oec** must POST the file to `https://ddl-production-47d3.up.railway.app/webhook` with file field **`oec_file`**. We derive the id from the **filename**: e.g. `38001.pdf` or `38001_oec.pdf` → we store under `38001`, so GET `/download/38001` finds it. You can still send `record_id` / `maid_id` / `client_id` in the form if you want; we store under those too.
2. In Railway logs, after you call `/download/38001`, do you see **`[webhook] Stored file under keys: idFromFilename=38001 ...`**? If **no** webhook line at all, Zoho is not hitting our webhook.
