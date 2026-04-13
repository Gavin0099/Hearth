#!/bin/bash
set -e

echo "Building web..."
cd "$(dirname "$0")/../apps/web"

VITE_API_BASE_URL=https://hearth-api.meiraybooks.workers.dev \
VITE_SUPABASE_URL=https://mqsmgtazihljcjbtjney.supabase.co \
VITE_SUPABASE_ANON_KEY=sb_publishable_B2NrQt5mze1DSv2no8gwUw_gyLegYLO \
VITE_AUTH_REDIRECT_URL=https://hearth-web.pages.dev \
npm run build

echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name hearth-web

echo "Done!"
