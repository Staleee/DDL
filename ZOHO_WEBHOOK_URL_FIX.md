# Fix: "File not received" — put maid_id in the webhook URL

From the logs we saw:
- We look for **id=38001** (maid_id from the download URL).
- The webhook was storing under **linkId=1773045038830** (record_id from the file/form), so **body.id** was never received when Zoho sends the file.

**Fix:** In your Zoho function, call the webhook **with the maid_id in the query string** so we know which id to store under.

## Change in Zoho (Chatbot_Fetch_Oec / getOec2)

**Before:**
```text
webhookUrl = "https://ddl-production-47d3.up.railway.app/webhook";
```

**After:**
```text
webhookUrl = "https://ddl-production-47d3.up.railway.app/webhook?id=" + maidId;
```

So when Zoho POSTs the file, the URL is e.g.  
`https://ddl-production-47d3.up.railway.app/webhook?id=38001`  

Our server reads **req.query.id** (= 38001) and stores the file under **38001**, so **GET /download/38001** finds it.

No other change needed in Zoho. Redeploy our app (already updated to use `?id=`), then update the Zoho function and test again.
