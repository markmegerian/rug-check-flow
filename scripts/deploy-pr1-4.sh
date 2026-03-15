#!/usr/bin/env bash
set -euo pipefail

# Deployment script for PR-1 through PR-4
# This script helps deploy migrations and edge functions to Supabase

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  echo "[$(timestamp)] $*"
}

error() {
  echo "[$(timestamp)] ERROR: $*" >&2
  exit 1
}

require_envs() {
  local context="$1"
  shift
  local missing=()
  for var_name in "$@"; do
    if [[ -z "${!var_name:-}" ]]; then
      missing+=("$var_name")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    error "${context} requires environment variables: ${missing[*]}"
  fi
}

log "==> PR-1 through PR-4 Deployment"
log "This script helps deploy database migrations and edge functions"

# Check if Supabase CLI is available
if command -v supabase &> /dev/null; then
  log "Supabase CLI detected"
  USE_CLI=true
else
  log "Supabase CLI not found - will provide manual instructions"
  USE_CLI=false
fi

# Step 1: Database Migrations
log "Step 1/3: Database Migrations"

if [[ "$USE_CLI" == "true" ]]; then
  require_envs "Supabase CLI deployment" SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF
  
  log "Applying migrations via Supabase CLI..."
  supabase db push
  
  if [[ $? -eq 0 ]]; then
    log "✓ Migrations applied successfully"
  else
    error "Migration deployment failed"
  fi
else
  log "Manual migration required:"
  log "1. Go to Supabase Dashboard → SQL Editor"
  log "2. Execute these files in order:"
  log "   - supabase/migrations/20260305000000_add_route_stops_unified_model.sql"
  log "   - supabase/migrations/20260305000002_update_delivery_list_items_rls.sql"
  log "3. Verify no errors"
  read -p "Press Enter when migrations are applied..."
fi

# Step 2: Edge Function
log "Step 2/3: Edge Function Deployment"

if [[ "$USE_CLI" == "true" ]]; then
  log "Deploying ingest-stop-events function..."
  supabase functions deploy ingest-stop-events
  
  if [[ $? -eq 0 ]]; then
    log "✓ Edge function deployed successfully"
  else
    error "Edge function deployment failed"
  fi
else
  log "Manual edge function deployment required:"
  log "1. Go to Supabase Dashboard → Edge Functions"
  log "2. Create new function: ingest-stop-events"
  log "3. Copy contents from: supabase/functions/ingest-stop-events/index.ts"
  log "4. Deploy"
  read -p "Press Enter when edge function is deployed..."
fi

# Step 3: Frontend Dependencies
log "Step 3/3: Frontend Dependencies"

log "Installing npm dependencies..."
npm install

if [[ $? -eq 0 ]]; then
  log "✓ Dependencies installed"
else
  error "npm install failed"
fi

log "Building frontend..."
npm run build

if [[ $? -eq 0 ]]; then
  log "✓ Frontend built successfully"
else
  error "Frontend build failed"
fi

log ""
log "=========================================="
log "Deployment complete!"
log "=========================================="
log ""
log "Next steps:"
log "1. Update App.tsx to wrap with OfflineQueueProvider"
log "2. Update driver route to use StopPortal"
log "3. Run acceptance tests (see docs/deployment-guide-pr1-4.md)"
log "4. Test with real users"
log ""
log "See docs/deployment-guide-pr1-4.md for detailed verification steps"
