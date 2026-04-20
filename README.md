# Triu (EmproiumVipani)

Production-focused marketplace platform with:
- Frontend: Vite + Alpine.js (multi-page app)
- Backend: Express API with JWT auth, billing, GST, orders, users, admin and seller modules
- Tests: Jest (unit + integration) and Playwright setup

## Available Pages
- `/` → Home storefront
- `/admin` or `/admin.html` → Admin panel
- `/supplier` or `/supplier.html` → Seller panel
- `/partner` or `/partner.html` → Partner login
- `/privacy` or `/legal/privacy.html` → Privacy Policy
- `/terms` or `/legal/terms.html` → Terms of Service

## Local Setup
```bash
cd /home/runner/work/Triu/Triu
npm install
cp .env.example .env
cp server/.env.example server/.env
```

## Run
```bash
# frontend
npm run dev

# backend (new terminal)
cd server && npm run dev
```

## Build
```bash
cd /home/runner/work/Triu/Triu
npm run build
cd server && npm run build
```

## Test
```bash
cd /home/runner/work/Triu/Triu
npm run test
```

## Lint
```bash
cd /home/runner/work/Triu/Triu
npm run lint
cd server && npm run lint
```

## Deployment
This repo is configured for Vercel static deployment of the frontend (`vercel.json`) and GitHub Actions workflows in `.github/workflows`.

## Notes
- API base URL is controlled by `VITE_API_URL`.
- Backend default port is `5000`.
- Frontend default port is `5173`.
