"""Smoke test for date-range filtering and pagination on analytics endpoints."""
from fastapi.testclient import TestClient
from app.main import app
from app.auth import get_current_user

# Override auth to inject a SUPER_ADMIN user
def mock_super_admin():
    return {
        "userId": "sa1",
        "email": "sa@test.com",
        "roleId": "r1",
        "roleName": "SUPER_ADMIN",
    }

app.dependency_overrides[get_current_user] = mock_super_admin
client = TestClient(app)

passed = 0
failed = 0

def ok(label):
    global passed
    passed += 1
    print(f"  PASS  {label}")

def fail(label, msg=""):
    global failed
    failed += 1
    print(f"  FAIL  {label} — {msg}")


# ── 1. /sample with date filtering ─────────────────────────────────────────────
r = client.get("/analytics/performance/sample", params={"date_from": "2026-01-01", "date_to": "2026-12-31"})
if r.status_code == 200:
    data = r.json()
    if data.get("date_range", {}).get("from") == "2026-01-01":
        ok("/sample date_from parsed correctly")
    else:
        fail("/sample date_from", f"got {data.get('date_range')}")
    if data.get("date_range", {}).get("to") == "2026-12-31":
        ok("/sample date_to parsed correctly")
    else:
        fail("/sample date_to", f"got {data.get('date_range')}")
else:
    fail("/sample date filter", f"status={r.status_code}")

# ── 2. /sample without date filtering should still work ─────────────────────────
r = client.get("/analytics/performance/sample")
if r.status_code == 200:
    ok("/sample without dates returns 200")
else:
    fail("/sample without dates", f"status={r.status_code}")

# ── 3. /users pagination ───────────────────────────────────────────────────────
r = client.get("/analytics/performance/users", params={"page": 1, "page_size": 5})
if r.status_code == 200:
    data = r.json()
    if "pagination" in data:
        p = data["pagination"]
        if p["page_size"] == 5:
            ok("/users page_size=5 respected")
        else:
            fail("/users page_size", f"got {p['page_size']}")
        if p["page"] == 1:
            ok("/users page=1 correct")
        else:
            fail("/users page", f"got {p['page']}")
    else:
        fail("/users pagination", "no pagination key in response")
else:
    fail("/users pagination", f"status={r.status_code}")

# ── 4. /teams pagination ───────────────────────────────────────────────────────
r = client.get("/analytics/performance/teams", params={"page": 1, "page_size": 10})
if r.status_code == 200:
    data = r.json()
    if "pagination" in data:
        ok("/teams has pagination")
    else:
        fail("/teams pagination", "missing")
else:
    fail("/teams pagination", f"status={r.status_code}")

# ── 5. /managers pagination ─────────────────────────────────────────────────────
r = client.get("/analytics/performance/managers", params={"page": 1, "page_size": 10})
if r.status_code == 200:
    data = r.json()
    if "pagination" in data:
        ok("/managers has pagination")
    else:
        fail("/managers pagination", "missing")
else:
    fail("/managers pagination", f"status={r.status_code}")

# ── 6. Date range with no results ──────────────────────────────────────────────
r = client.get("/analytics/performance/sample", params={"date_from": "2099-01-01"})
if r.status_code == 200:
    data = r.json()
    if data["overall_summary"]["total_tasks"] == 0:
        ok("/sample future date_from returns 0 tasks")
    else:
        fail("/sample future date", f"got {data['overall_summary']['total_tasks']} tasks")
else:
    fail("/sample future date", f"status={r.status_code}")

# ── 7. Invalid page_size clamped ────────────────────────────────────────────────
r = client.get("/analytics/performance/users", params={"page_size": 200})
if r.status_code == 422:
    ok("/users page_size=200 rejected (>100)")
else:
    fail("/users page_size=200", f"expected 422, got {r.status_code}")


print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed")
if failed == 0:
    print("ALL TESTS PASSED")
else:
    print("SOME TESTS FAILED")

# Clean up
app.dependency_overrides.clear()
