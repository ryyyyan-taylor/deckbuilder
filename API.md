# MTG Deck Builder API Documentation

## Overview

All API endpoints are located at `/api/` and run on Vercel Serverless Functions.

### Base URL

- **Development:** `http://localhost:5173/api`
- **Production:** `https://deckbuilder.ryantaylor.tech/api`

### Authentication

- **Public endpoints:** No authentication required (but origin-checked for expensive ops)
- **Protected endpoints:** Origin verification required (checks `Origin` header)

### Rate Limiting

Rate limits are per-IP and reset every 60 seconds:

| Endpoint | Limit | Window |
|----------|-------|--------|
| Card Search | 60 req/min | 1 min |
| Single Card | 100 req/min | 1 min |
| Moxfield Import | 20 req/min | 1 min |
| EDHREC Suggestions | 30 req/min | 1 min |
| EDHTop16 Results | 30 req/min | 1 min |
| MTGTop8 Results | 30 req/min | 1 min |

When rate limited, returns `429 Too Many Requests` with `X-RateLimit-Remaining: 0` header.

---

## Endpoints

### 🔍 Card Search

**GET `/api/cards/search`**

Search for Magic cards by name.

**Query Parameters:**
- `q` (string, required): Search query (min 2 characters, max 100 characters)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "scryfall_id": "string",
      "name": "string",
      "mana_cost": "string|null",
      "cmc": "number|null",
      "type_line": "string|null",
      "colors": ["string"],
      "color_identity": ["string"],
      "set_code": "string|null",
      "image_uris": {
        "small": "string",
        "normal": "string",
        "large": "string",
        "png": "string"
      }
    }
  ],
  "source": "cache|scryfall"
}
```

**Error:** `400 Bad Request` | `429 Too Many Requests` | `500 Server Error`

**Example:**
```bash
curl "https://deckbuilder.ryantaylor.tech/api/cards/search?q=lightning+bolt"
```

---

### 🃏 Single Card

**GET `/api/cards/[scryfall_id]`**

Get details for a specific card by Scryfall ID.

**Path Parameters:**
- `scryfall_id` (string, required): Scryfall card ID (UUID format)

**Response:** `200 OK`
```json
{
  "data": { /* Card object */ },
  "source": "cache|scryfall"
}
```

**Error:** `400 Bad Request` | `404 Not Found` | `429 Too Many Requests` | `500 Server Error`

---

### 📥 Import from Moxfield

**POST `/api/import/moxfield`** ⚠️ *Origin-checked*

Import a deck from Moxfield.

**Headers:**
- `Content-Type: application/json`
- `Origin: https://deckbuilder.ryantaylor.tech` (validated)

**Request Body:**
```json
{
  "url": "https://www.moxfield.com/decks/{deckId}"
}
```

**Response:** `200 OK`
```json
{
  "name": "string",
  "cards": [
    {
      "card_id": "uuid",
      "section": "Mainboard|Sideboard|Commander|etc",
      "quantity": "number"
    }
  ],
  "sections": ["string"]
}
```

**Error:** `400 Bad Request` | `403 Forbidden` | `429 Too Many Requests` | `500 Server Error` | `502 Bad Gateway`

**Example:**
```bash
curl -X POST "https://deckbuilder.ryantaylor.tech/api/import/moxfield" \
  -H "Content-Type: application/json" \
  -H "Origin: https://deckbuilder.ryantaylor.tech" \
  -d '{"url":"https://www.moxfield.com/decks/abc123"}'
```

---

### 💡 EDHREC Suggestions

**GET `/api/suggestions/edhrec`** ⚠️ *Origin-checked*

Get card suggestions from EDHREC for a commander.

**Query Parameters:**
- `commander` (string, required): Commander name (supports partner format: "Name A / Name B")

**Response:** `200 OK`
```json
{
  "categories": [
    {
      "name": "string",
      "cards": [
        {
          "card_id": "uuid|null",
          "name": "string",
          "inclusion": "number (0-1)",
          "synergy": "number",
          "num_decks": "number",
          "image_uri": "string|null"
        }
      ]
    }
  ]
}
```

**Caching:** 24 hours (controlled by `CACHE_TTL_EDHREC` env var)

**Error:** `400 Bad Request` | `403 Forbidden` | `404 Not Found` | `429 Too Many Requests` | `500 Server Error` | `502 Bad Gateway`

---

### 🏆 EDHTop16 Tournament Results

**GET `/api/results/edhtop16`** ⚠️ *Origin-checked*

Get cEDH tournament results from EDHTop16.

**Query Parameters:**
- `commander` (string, required): Commander name

**Response:** `200 OK`
```json
{
  "results": [
    {
      "tournament_name": "string",
      "date": "YYYY-MM-DD",
      "player": "string",
      "standing": "number",
      "wins": "number",
      "losses": "number",
      "draws": "number",
      "decklist_url": "string|null",
      "tournament_size": "number"
    }
  ]
}
```

**Caching:** 6 hours

**Error:** `400 Bad Request` | `403 Forbidden` | `404 Not Found` | `429 Too Many Requests` | `502 Bad Gateway`

---

### 🎯 MTGTop8 Duel Commander Results

**GET `/api/results/mtgtop8`** ⚠️ *Origin-checked*

Get Duel Commander tournament results from MTGTop8.

**Query Parameters:**
- `commander` (string, required): Commander name

**Response:** `200 OK`
```json
{
  "results": [
    {
      "tournament_name": "string",
      "date": "YYYY-MM-DD",
      "player": "string",
      "standing": "number|null",
      "decklist_url": "string|null",
      "tournament_size": "number|null"
    }
  ],
  "search_url": "string"
}
```

**Caching:** 6 hours

**Error:** `400 Bad Request` | `403 Forbidden` | `429 Too Many Requests` | `502 Bad Gateway`

---

### 💓 Health Check

**GET `/api/health`**

Check API and service health.

**Response:** `200 OK | 503 Service Unavailable`
```json
{
  "status": "healthy|degraded",
  "timestamp": "2026-04-22T12:00:00Z",
  "uptime": 3600.5,
  "checks": {
    "environment": {
      "ok": true,
      "error": "null|string"
    },
    "supabase": {
      "ok": true,
      "error": "null|string"
    }
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Human-readable error message"
}
```

### Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (validation error) |
| 403 | Forbidden (origin check failed, rate limited) |
| 404 | Not Found |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |
| 502 | Bad Gateway (external API error) |
| 503 | Service Unavailable (health check failed) |

---

## Headers

### Response Headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Access-Control-Allow-Origin: [frontend-url]`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`

Rate-limited endpoints also include:
- `X-RateLimit-Remaining: [number]` - Remaining requests in current window
- `X-RateLimit-Reset: [timestamp]` - Unix timestamp when limit resets

---

## CORS

The API requires proper `Origin` header for all requests. Frontend requests automatically include this; server-to-server requests must include it manually.

For expensive endpoints (Moxfield import, EDHREC, tournaments), the origin must match `FRONTEND_URL` environment variable.

---

## Caching

- Card data is cached in the database indefinitely
- EDHREC suggestions are cached for 24 hours
- Tournament results are cached for 6 hours
- Cache TTLs can be configured via environment variables

---

## Rate Limiting

Rate limits are per-IP address. Each exceeded request returns `429 Too Many Requests`.

To check remaining quota, inspect the `X-RateLimit-Remaining` header in the response.

---

## Timeouts

All external API calls have a 10-second timeout. Requests that exceed this return `502 Bad Gateway`.

---

## Examples

### Search for a card
```bash
curl "https://deckbuilder.ryantaylor.tech/api/cards/search?q=sol+ring"
```

### Get EDHREC suggestions for Urza
```bash
curl "https://deckbuilder.ryantaylor.tech/api/suggestions/edhrec?commander=Urza"
```

### Import a Moxfield deck
```bash
curl -X POST https://deckbuilder.ryantaylor.tech/api/import/moxfield \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.moxfield.com/decks/xyz123"}'
```

### Check API health
```bash
curl https://deckbuilder.ryantaylor.tech/api/health
```
