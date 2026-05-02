# plumbingslatepress-com-site

Source for `https://plumbingslatepress.com` — the Phase-1 cold-acquisition lander for SlatePress's plumbing-vertical front door.

## Deployment

Auto-deploys to Cloudflare Pages project `plumbingslatepress-com` on push to `main`. ~30-60 second build; no build step (static HTML/CSS/JS + Pages Functions in `_worker.js`).

## Layout

- `index.html` — the lander (modal-form opt-in, three-state SMS Verify flow, hero, demo iframe)
- `blog/` — `/blog/index.html` listing + `/blog/posts/<slug>/index.html` per post
- `mockups/` — internal design library, gated behind HTTP Basic Auth via `_worker.js`
- `_worker.js` — Cloudflare Pages Worker handling Twilio Verify (`/api/verify/start` + `/api/verify/check`) and `/mockups/*` Basic Auth
- `build-manifest.sh` — regenerates `mockups/manifest.json` for the design-library catalog

## Required Cloudflare Pages env vars

Set in the Pages project Settings → Variables and Secrets:

| Name | Type | Purpose |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Plain text | `AC...` |
| `TWILIO_VERIFY_SERVICE_SID` | Plain text | `VA...` |
| `TWILIO_AUTH_TOKEN` | Secret | Twilio auth token |
| `MOCKUPS_AUTH_USER` | Plain text | Basic Auth username for `/mockups/*` |
| `MOCKUPS_AUTH_PASS` | Secret | Basic Auth password for `/mockups/*` |

## Sister property

`bearllc555-spec/slatepress-ops` is the operator-context backup repo for the broader SlatePress workspace (private, full operational mirror).

— Another SlatePress company.
