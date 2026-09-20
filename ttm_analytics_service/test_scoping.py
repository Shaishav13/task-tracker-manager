"""Smoke test for analytics role-based scoping — via TestClient."""
from fastapi.testclient import TestClient
from app.main import app
from app.auth import get_current_user

ROLES = {
    "SUPER_ADMIN": {"userId": "sa1", "email": "sa@t.com", "roleId": "r1", "roleName": "SUPER_ADMIN"},
    "ADMIN":       {"userId": "ad1", "email": "ad@t.com", "roleId": "r2", "roleName": "ADMIN"},
    "MANAGER":     {"userId": "mg1", "email": "mg@t.com", "roleId": "r3", "roleName": "MANAGER"},
    "TEAM_LEAD":   {"userId": "tl1", "email": "tl@t.com", "roleId": "r4", "roleName": "TEAM_LEAD"},
    "TEAM_MEMBER": {"userId": "tm1", "email": "tm@t.com", "roleId": "r5", "roleName": "TEAM_MEMBER"},
}

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

def test_with_role(role_name: str, endpoint: str, expect_status: int):
    """Override auth to use a specific role, then hit the endpoint."""
    user = ROLES[role_name]
    app.dependency_overrides[get_current_user] = lambda: user
    client = TestClient(app)
    r = client.get(endpoint)
    label = f"{endpoint} {'allowed' if expect_status == 200 else 'denied'} for {role_name}"
    if r.status_code == expect_status:
        ok(label)
    else:
        fail(label, f"expected {expect_status}, got {r.status_code}")
    app.dependency_overrides.clear()

# ── /sample and /users should return 200 for ALL roles ───────────────────────
for rn in ROLES:
    test_with_role(rn, "/analytics/performance/sample", 200)
    test_with_role(rn, "/analytics/performance/users", 200)

# ── /teams: 200 for SA, ADMIN, MANAGER, TEAM_LEAD; 403 for TEAM_MEMBER ──────
for rn in ["SUPER_ADMIN", "ADMIN", "MANAGER", "TEAM_LEAD"]:
    test_with_role(rn, "/analytics/performance/teams", 200)
test_with_role("TEAM_MEMBER", "/analytics/performance/teams", 403)

# ── /managers: 200 for SA, ADMIN, MANAGER; 403 for TEAM_LEAD and MEMBER ─────
for rn in ["SUPER_ADMIN", "ADMIN", "MANAGER"]:
    test_with_role(rn, "/analytics/performance/managers", 200)
for rn in ["TEAM_LEAD", "TEAM_MEMBER"]:
    test_with_role(rn, "/analytics/performance/managers", 403)

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed")
if failed == 0:
    print("ALL TESTS PASSED")
else:
    print("SOME TESTS FAILED")
