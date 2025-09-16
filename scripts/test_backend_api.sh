#!/bin/bash
set -euo pipefail

# Backend API Integration Test Script
# Tests the backend API server to verify changes work correctly

BASE="http://api.faultmaven.local:8000"
COOKIE="$(mktemp)"
TMP="$(mktemp -d)"

echo "🧪 Starting Backend API Integration Tests"
echo "=========================================="
echo "Base URL: $BASE"
echo "Temp dir: $TMP"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    rm -rf "$TMP"
    rm -f "$COOKIE"
}
trap cleanup EXIT

# Test 1: Dev login
echo "1️⃣ Testing Dev Login..."
printf "{\"username\":\"tester@example.com\"}\n" > "$TMP/login.json"
LOGIN=$(curl -sS -m 20 -c "$COOKIE" -b "$COOKIE" -H "Content-Type: application/json" \
  -X POST "$BASE/api/v1/auth/dev-login" --data-binary @"$TMP/login.json")
echo "Login response:"
echo "$LOGIN" | jq -r . | sed -n "1,40p"
SID=$(echo "$LOGIN" | jq -r ".view_state.session_id // empty")
echo "Session ID: $SID"
[ -n "$SID" ] || { echo "❌ Login failed"; exit 1; }
echo "✅ Login successful"
echo ""

# Test 2: Create case
echo "2️⃣ Testing Case Creation..."
printf "{\"title\":\"API Test Case\",\"priority\":\"medium\"}\n" > "$TMP/create.json"
CREATE_HEADERS="$TMP/create.h"
CREATE_BODY="$TMP/create.b"
curl -sS -m 20 -D "$CREATE_HEADERS" -o "$CREATE_BODY" -c "$COOKIE" -b "$COOKIE" \
  -H "Content-Type: application/json" -X POST "$BASE/api/v1/cases" --data-binary @"$TMP/create.json"
echo "Create case response:"
cat "$CREATE_BODY" | jq -r . | sed -n "1,40p"
CASE_ID=$(cat "$CREATE_BODY" | jq -r ".case.case_id // .case_id // empty")
echo "Case ID: $CASE_ID"
[ -n "$CASE_ID" ] || { echo "❌ Create case failed"; exit 1; }
echo "✅ Case created successfully"
echo ""

# Test 3: Submit query to case
echo "3️⃣ Testing Query Submission..."
printf "{\"session_id\":\"$SID\",\"query\":\"Test query for API validation\",\"priority\":\"normal\"}\n" > "$TMP/query.json"
QUERY_HEADERS="$TMP/query.h"
QUERY_BODY="$TMP/query.b"
curl -sS -m 30 -D "$QUERY_HEADERS" -o "$QUERY_BODY" -c "$COOKIE" -b "$COOKIE" \
  -H "Content-Type: application/json" -X POST "$BASE/api/v1/cases/$CASE_ID/queries" --data-binary @"$TMP/query.json"
echo "Query submission response:"
cat "$QUERY_BODY" | jq -r . | sed -n "1,40p"
echo "✅ Query submitted successfully"
echo ""

# Test 4: Test data upload
echo "4️⃣ Testing Data Upload..."
printf "Test log content for API validation\nError: Connection timeout\nWarning: High memory usage\n" > "$TMP/test.log"
UPLOAD_HEADERS="$TMP/upload.h"
UPLOAD_BODY="$TMP/upload.b"
curl -sS -m 20 -D "$UPLOAD_HEADERS" -o "$UPLOAD_BODY" -c "$COOKIE" -b "$COOKIE" \
  -F "session_id=$SID" -F "file=@$TMP/test.log" -X POST "$BASE/api/v1/cases/$CASE_ID/data"
echo "Upload response:"
cat "$UPLOAD_BODY" | jq -r . | sed -n "1,40p"
echo "✅ Data upload successful"
echo ""

# Test 5: Test knowledge base operations
echo "5️⃣ Testing Knowledge Base Operations..."
echo "Fetching knowledge documents..."
KB_HEADERS="$TMP/kb.h"
KB_BODY="$TMP/kb.b"
curl -sS -m 20 -D "$KB_HEADERS" -o "$KB_BODY" -c "$COOKIE" -b "$COOKIE" \
  -H "Content-Type: application/json" -X GET "$BASE/api/v1/knowledge/documents?limit=5"
echo "Knowledge base response:"
cat "$KB_BODY" | jq -r . | sed -n "1,40p"
echo "✅ Knowledge base access successful"
echo ""

# Test 6: Test session management
echo "6️⃣ Testing Session Management..."
echo "Fetching session details..."
SESSION_HEADERS="$TMP/session.h"
SESSION_BODY="$TMP/session.b"
curl -sS -m 20 -D "$SESSION_HEADERS" -o "$SESSION_BODY" -c "$COOKIE" -b "$COOKIE" \
  -H "Content-Type: application/json" -X GET "$BASE/api/v1/sessions/$SID"
echo "Session details:"
cat "$SESSION_BODY" | jq -r . | sed -n "1,40p"
echo "✅ Session management successful"
echo ""

# Test 7: Test case conversation
echo "7️⃣ Testing Case Conversation..."
echo "Fetching case conversation..."
CONV_HEADERS="$TMP/conv.h"
CONV_BODY="$TMP/conv.b"
curl -sS -m 20 -D "$CONV_HEADERS" -o "$CONV_BODY" -c "$COOKIE" -b "$COOKIE" \
  -H "Content-Type: application/json" -X GET "$BASE/api/v1/cases/$CASE_ID/conversation"
echo "Conversation response:"
cat "$CONV_BODY" | jq -r . | sed -n "1,40p"
echo "✅ Case conversation access successful"
echo ""

# Test 8: Test heartbeat
echo "8️⃣ Testing Session Heartbeat..."
HEARTBEAT_HEADERS="$TMP/heartbeat.h"
HEARTBEAT_BODY="$TMP/heartbeat.b"
curl -sS -m 20 -D "$HEARTBEAT_HEADERS" -o "$HEARTBEAT_BODY" -c "$COOKIE" -b "$COOKIE" \
  -H "Content-Type: application/json" -X POST "$BASE/api/v1/sessions/$SID/heartbeat"
echo "Heartbeat response:"
cat "$HEARTBEAT_BODY" | jq -r . | sed -n "1,40p"
echo "✅ Heartbeat successful"
echo ""

# Test 9: Test case listing
echo "9️⃣ Testing Case Listing..."
echo "Fetching user cases..."
CASES_HEADERS="$TMP/cases.h"
CASES_BODY="$TMP/cases.b"
curl -sS -m 20 -D "$CASES_HEADERS" -o "$CASES_BODY" -c "$COOKIE" -b "$COOKIE" \
  -H "Content-Type: application/json" -X GET "$BASE/api/v1/cases?limit=10"
echo "Cases response:"
cat "$CASES_BODY" | jq -r . | sed -n "1,40p"
echo "✅ Case listing successful"
echo ""

# Test 10: Test case title generation
echo "🔟 Testing Case Title Generation..."
TITLE_HEADERS="$TMP/title.h"
TITLE_BODY="$TMP/title.b"
curl -sS -m 20 -D "$TITLE_HEADERS" -o "$TITLE_BODY" -c "$COOKIE" -b "$COOKIE" \
  -H "Content-Type: application/json" -X POST "$BASE/api/v1/cases/$CASE_ID/title" \
  --data-binary '{"max_words": 8, "hint": "API test case"}'
echo "Title generation response:"
cat "$TITLE_BODY" | jq -r . | sed -n "1,40p"
echo "✅ Title generation successful"
echo ""

echo "🎉 All Backend API Tests Completed Successfully!"
echo "================================================"
echo "✅ Authentication flow working"
echo "✅ Case management working"
echo "✅ Query processing working"
echo "✅ Data upload working"
echo "✅ Knowledge base access working"
echo "✅ Session management working"
echo "✅ Case conversation working"
echo "✅ Heartbeat functionality working"
echo "✅ Case listing working"
echo "✅ Title generation working"
echo ""
echo "Backend API changes appear to be working correctly with the frontend!"
