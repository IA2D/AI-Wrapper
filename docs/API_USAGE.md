# Public API Usage

Admin users can create API keys from `/admin`. Each key has independent allowance checkboxes for text, image, video, and voice requests.

Assigned users can open `/api-console` after login to view their API keys, limits, detailed usage, and ready-to-copy curl, JavaScript, PHP, and Python examples for text, image, voice, and video requests.

## Endpoint

```bash
POST /api/v1/chat
Authorization: Bearer sk_your_key
Content-Type: application/json
```

The endpoint accepts OpenAI-style chat completion payloads and forwards them directly to the configured provider. It is intentionally left out of RAG, so public API calls do not use the RAG service or session document context.

## Example

```bash
curl http://localhost:3000/api/v1/chat \
  -H "Authorization: Bearer sk_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "Write a short welcome message." }
    ]
  }'
```

## Streaming

```bash
curl http://localhost:3000/api/v1/chat \
  -H "Authorization: Bearer sk_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "stream": true,
    "messages": [
      { "role": "user", "content": "Write three bullet points." }
    ]
  }'
```

## Limits

- Request and token limits can be set per day, week, month, or year.
- `Unlimited until` bypasses request and token limits until the selected date.
- If both request and token limits are empty and no date is set, the key is unlimited.
- Usage is recorded in `usage_events` and shown in the admin dashboard.
- Provider token usage is used when available. Streamed output falls back to an approximate token calculation.
