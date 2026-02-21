#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

info() { echo "[INFO] $*"; }
warn() { echo "[WARN] $*"; }
error() { echo "[ERROR] $*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Missing required command: $1"
    exit 1
  fi
}

update_npmrc() {
  local token="$1"
  local npmrc="$HOME/.npmrc"
  local line="//registry.npmjs.org/:_authToken=${token}"

  touch "$npmrc"

  if grep -q '^//registry\.npmjs\.org/:_authToken=' "$npmrc"; then
    awk -v replacement="$line" '
      /^\/\/registry\.npmjs\.org\/:_authToken=/ { print replacement; next }
      { print }
    ' "$npmrc" >"${npmrc}.tmp"
    mv "${npmrc}.tmp" "$npmrc"
  else
    printf '%s\n' "$line" >>"$npmrc"
  fi

  chmod 600 "$npmrc"
  info "Updated npm auth token in $npmrc"
}

update_git_credentials() {
  local user="$1"
  local pat="$2"
  local cred_file="$HOME/.git-credentials"
  local host="github.com"
  local url="https://${user}:${pat}@${host}"

  git config --global credential.helper store
  touch "$cred_file"

  if grep -q "@${host}" "$cred_file"; then
    awk -v host="$host" -v replacement="$url" '
      $0 ~ "@" host "$" { print replacement; next }
      { print }
    ' "$cred_file" >"${cred_file}.tmp"
    mv "${cred_file}.tmp" "$cred_file"
  else
    printf '%s\n' "$url" >>"$cred_file"
  fi

  chmod 600 "$cred_file"
  info "Stored GitHub credentials in $cred_file"
  info "Credential helper set to 'store'"
}

prompt_hidden() {
  local var_name="$1"
  local prompt="$2"
  local value

  read -r -s -p "$prompt" value
  echo
  printf -v "$var_name" '%s' "$value"
}

prompt_yes_no() {
  local prompt="$1"
  local answer
  read -r -p "$prompt [y/N]: " answer
  case "${answer,,}" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

main() {
  require_cmd node
  require_cmd npm
  require_cmd git

  local node_version major
  node_version="$(node -v 2>/dev/null || true)"
  info "Detected Node version: ${node_version:-unknown}"

  if [[ "$node_version" =~ ^v([0-9]+)\..* ]]; then
    major="${BASH_REMATCH[1]}"
    if (( major < 22 )); then
      warn "Node <22 detected. Some tools (e.g., newer Capacitor CLI workflows) may expect Node 22+."
    fi
  else
    warn "Could not parse Node version string: ${node_version:-empty}"
  fi

  if prompt_yes_no "Configure npm registry auth token in ~/.npmrc?"; then
    local npm_token
    prompt_hidden npm_token "Enter NPM_TOKEN (input hidden): "
    if [[ -n "$npm_token" ]]; then
      update_npmrc "$npm_token"
    else
      warn "Empty token provided. Skipping npm auth setup."
    fi
  else
    info "Skipped npm auth setup."
  fi

  if prompt_yes_no "Configure GitHub PAT credentials for git push/pull?"; then
    local gh_user gh_pat
    read -r -p "Enter GitHub username: " gh_user
    prompt_hidden gh_pat "Enter GitHub PAT (input hidden): "

    if [[ -n "$gh_user" && -n "$gh_pat" ]]; then
      update_git_credentials "$gh_user" "$gh_pat"
    else
      warn "Username or PAT was empty. Skipping git credential setup."
    fi
  else
    info "Skipped git credential setup."
  fi

  if prompt_yes_no "Run npm install now?"; then
    info "Running npm install..."
    npm install
  else
    info "Skipped npm install."
  fi

  info "Setup complete."
}

main "$@"
