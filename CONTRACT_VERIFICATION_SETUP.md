# Contract verification — same as OEC, different document

## What we added

- **GET /download/contract/:id** — Same flow as OEC: we call your Zoho API, Zoho POSTs the file to the **same webhook**, we store under `contract_38001` and return the file.
- **Webhook** — Detects document type from the **file field name**:
  - `38001_oec_document` → OEC, store under `38001` → **GET /download/oec/38001**
  - `38001_contract_verification_document` → Contract, store under `contract_38001` → **GET /download/verified_contract/38001**

You don’t send the “file name” separately. You only need to use the right **field name** when posting the file.

---

## What you do on your side

### 1. Zoho: contract verification function

Create a function like your OEC one, but for the contract report/file in Creator. It should:

- Take **reqData.maid_id_str** (same as OEC).
- Fetch the **contract** record and file from your app/report.
- Call the **same webhook URL**:  
  `https://ddl-production-47d3.up.railway.app/webhook`
- In the POST:
  - **File field name must be:** `maidId + "_contract_verification_document"`  
    Example: for maid **38001**, use field name **`38001_contract_verification_document`**.
  - **paramMap** can include `id`, `record_id`, `file_field` as you do for OEC (optional; we also use the field name to get the id).

Example in Zoho (same idea as OEC):

```text
fileObj.setParamName(maidId + "_contract_verification_document");
paramMap = Map();
paramMap.put("id", maidId);
paramMap.put("record_id", recIDStr);
paramMap.put("file_field", "Your_Contract_Field_Name");
webhookUrl = "https://ddl-production-47d3.up.railway.app/webhook";
invokeurl [ url: webhookUrl type: POST parameters: paramMap files: fileObj ];
```

So: **same webhook URL**, **same param naming**, only the **file field name** must be `38001_contract_verification_document` (and the report/field you use in Zoho is for contract, not OEC).

### 2. Zoho: custom API URL for contract

Create a Custom API in Creator that runs this contract function (like you did for OEC). You’ll get a URL like:

```text
https://www.zohoapis.com/creator/custom/louay.sallakho_maids/Your_Contract_Function_Name?publickey=...
```

Set that URL in Railway as the env var:

**`ZOHO_TRIGGER_CONTRACT_URL`**

(No need to send the “file name” to the webhook — we only need the **field name** `38001_contract_document`.)

### 3. Download links

- **OEC:**  
  `https://ddl-production-47d3.up.railway.app/download/oec/38001`
- **Verified contract:**  
  `https://ddl-production-47d3.up.railway.app/download/verified_contract/38001`

Chatbot or user uses: `/download/oec/:id` for OEC, `/download/verified_contract/:id` for contract.

---

## Summary

| You do | We do |
|--------|--------|
| New Zoho function for contract (same pattern as OEC) | Already done |
| POST file to **same** webhook with field name **`{maidId}_contract_verification_document`** | We detect type from field name and store under `contract_{id}` |
| Give us **ZOHO_TRIGGER_CONTRACT_URL** (Custom API for contract) | GET /download/contract/:id calls that API and serves the file |

You do **not** need to send the file name to the webhook; the **field name** is enough.
