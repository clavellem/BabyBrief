# BabyBrief

A polished prototype for logging feedings, naps, diapers, next-nap planning estimates, and caregiver handoff summaries.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Deploy

This is a standard Next.js app and can be deployed to Vercel or Cloudflare Pages without a database, authentication, API keys, or paid services. Data persists in the browser with `localStorage`.

## Prototype Notes

- Use **Load sample day** to populate a 5-month-old demo day.
- Use **Clear all demo data** to reset local events.
- Wake window guidance is deterministic and rule-based.
- Handoff summaries are generated locally; no AI API is used.
