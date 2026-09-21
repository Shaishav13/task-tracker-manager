import os
from datetime import date, datetime
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
from sqlalchemy import text
from dotenv import load_dotenv
from app.auth import get_current_user
from app.database import engine

load_dotenv()

app = FastAPI(
    title="TTM Analytics Engine",
    description="High-performance data processing service for Task Tracker Manager",
    version="1.0.0",
)

# Configure CORS to mirror NestJS settings
client_url = os.getenv("CLIENT_URL", "")
configured_origins = [u.strip() for u in client_url.split(",") if u.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins or ["*"],
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.onrender\.com|http://localhost(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helpers ────────────────────────────────────────────────────────────────────


def _safe_json(val):
    """Convert numpy/pandas types to native Python for JSON serialisation."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if pd.isna(val):
        return None
    return val


def _load_tasks_df() -> pd.DataFrame:
    """Load all tasks joined with assignee, creator, team, and role info."""
    query = """
        SELECT
            t.id            AS task_id,
            t.title,
            t.status,
            t.priority,
            t."dueDate",
            t."createdAt",
            t."completedAt",
            t."teamId"      AS team_id,
            t."assignedToId" AS assignee_id,
            t."createdById"  AS creator_id,
            assignee.name   AS assignee_name,
            creator.name    AS creator_name,
            tm.name         AS team_name,
            tm."managerId"  AS team_manager_id,
            tm."teamLeadId" AS team_lead_id,
            mgr.name        AS manager_name,
            lead.name       AS lead_name
        FROM tasks t
        LEFT JOIN users assignee ON t."assignedToId" = assignee.id
        LEFT JOIN users creator  ON t."createdById"  = creator.id
        LEFT JOIN teams tm       ON t."teamId"       = tm.id
        LEFT JOIN users mgr      ON tm."managerId"   = mgr.id
        LEFT JOIN users lead     ON tm."teamLeadId"  = lead.id
    """
    df = pd.read_sql(query, engine)

    # Normalise dates
    for col in ("createdAt", "completedAt", "dueDate"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")

    # Compute completion_time_hrs for DONE tasks
    df["completion_time_hrs"] = 0.0
    mask = (df["status"] == "DONE") & df["completedAt"].notnull()
    if mask.any():
        df.loc[mask, "completion_time_hrs"] = (
            (df.loc[mask, "completedAt"] - df.loc[mask, "createdAt"])
            .dt.total_seconds()
            / 3600.0
        )

    # Overdue flag
    now = pd.Timestamp.now(tz="UTC")
    df["is_overdue"] = (
        df["dueDate"].notnull() & (df["status"] != "DONE") & (df["dueDate"] < now)
    )

    return df


def _filter_by_date_range(
    df: pd.DataFrame,
    date_from: Optional[date],
    date_to: Optional[date],
) -> pd.DataFrame:
    """Filter tasks by createdAt date range (inclusive)."""
    if date_from is not None:
        ts_from = pd.Timestamp(date_from, tz="UTC")
        df = df[df["createdAt"] >= ts_from]
    if date_to is not None:
        # End of day for the to-date
        ts_to = pd.Timestamp(
            datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59),
            tz="UTC",
        )
        df = df[df["createdAt"] <= ts_to]
    return df


def _paginate(items: list, page: int, page_size: int) -> dict:
    """Return a paginated slice with metadata."""
    total = len(items)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(page, total_pages))
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "data": items[start:end],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": total_pages,
        },
    }


def _get_user_led_team_ids(user_id: str) -> list[str]:
    """Return team IDs where the user is the team lead."""
    with engine.connect() as conn:
        rows = conn.execute(
            text('SELECT id FROM teams WHERE "teamLeadId" = :uid'),
            {"uid": user_id},
        ).fetchall()
    return [r[0] for r in rows]


def _get_user_managed_team_ids(user_id: str) -> list[str]:
    """Return team IDs where the user is the manager."""
    with engine.connect() as conn:
        rows = conn.execute(
            text('SELECT id FROM teams WHERE "managerId" = :uid'),
            {"uid": user_id},
        ).fetchall()
    return [r[0] for r in rows]


def _scope_df(df: pd.DataFrame, current_user: dict) -> pd.DataFrame:
    """
    Apply role-based scoping to the tasks DataFrame.
    - SUPER_ADMIN / ADMIN: see everything
    - MANAGER: see tasks in teams they manage + tasks they created
    - TEAM_LEAD: see tasks in teams they lead + tasks assigned to them
    - TEAM_MEMBER: see only tasks assigned to them
    """
    role = current_user.get("roleName")
    uid = current_user["userId"]

    if role in ("SUPER_ADMIN", "ADMIN"):
        return df

    if role == "MANAGER":
        team_ids = _get_user_managed_team_ids(uid)
        mask = (df["team_id"].isin(team_ids)) | (df["creator_id"] == uid)
        return df[mask].copy()

    if role == "TEAM_LEAD":
        team_ids = _get_user_led_team_ids(uid)
        mask = (df["team_id"].isin(team_ids)) | (df["assignee_id"] == uid)
        return df[mask].copy()

    # TEAM_MEMBER (or any unknown role) — own tasks only
    return df[df["assignee_id"] == uid].copy()


def _status_breakdown(sub_df: pd.DataFrame) -> dict:
    """Return counts per task status."""
    counts = sub_df["status"].value_counts().to_dict()
    return {
        "TODO": int(counts.get("TODO", 0)),
        "IN_PROGRESS": int(counts.get("IN_PROGRESS", 0)),
        "IN_REVIEW": int(counts.get("IN_REVIEW", 0)),
        "DONE": int(counts.get("DONE", 0)),
    }


def _priority_breakdown(sub_df: pd.DataFrame) -> dict:
    counts = sub_df["priority"].value_counts().to_dict()
    return {
        "LOW": int(counts.get("LOW", 0)),
        "MEDIUM": int(counts.get("MEDIUM", 0)),
        "HIGH": int(counts.get("HIGH", 0)),
        "URGENT": int(counts.get("URGENT", 0)),
    }


def _require_role(current_user: dict, allowed: list[str]):
    """Raise 403 if the user's role is not in the allowed list."""
    role = current_user.get("roleName")
    if role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{role}' is not authorized for this analytics endpoint",
        )


# ─── System ─────────────────────────────────────────────────────────────────────


@app.get("/analytics/health", tags=["System"])
def health_check():
    return {
        "status": "online",
        "service": "ttm_analytics_service",
        "engine": "FastAPI + Pandas + PostgreSQL",
    }


# ─── Overall / Sample (backward-compatible, now scoped + filterable) ────────────


@app.get("/analytics/performance/sample", tags=["Analytics"])
def get_sample_performance_metrics(
    current_user: dict = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Filter tasks created on or after this date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="Filter tasks created on or before this date (YYYY-MM-DD)"),
):
    """
    Overall performance summary — completion rates and assignee rankings.
    Scoped to the caller's role. Supports date_from / date_to filtering.
    """
    df = _scope_df(_load_tasks_df(), current_user)
    df = _filter_by_date_range(df, date_from, date_to)

    if len(df) == 0:
        return {
            "requested_by": current_user["email"],
            "date_range": {"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
            "overall_summary": {
                "total_tasks": 0,
                "completed_tasks": 0,
                "overall_completion_rate_pct": 0.0,
            },
            "lead_rankings": [],
        }

    df["assignee_label"] = df["assignee_name"].fillna("Unassigned")

    total_tasks = len(df)
    completed_tasks = int((df["status"] == "DONE").sum())
    overall_rate = round((completed_tasks / total_tasks) * 100, 2)

    lead_summary = (
        df.groupby("assignee_label")
        .agg(
            total_assigned=("task_id", "count"),
            completed=("status", lambda x: int((x == "DONE").sum())),
            avg_completion_hrs=(
                "completion_time_hrs",
                lambda x: round(x[x > 0].mean(), 2) if (x > 0).any() else 0.0,
            ),
        )
        .reset_index()
        .rename(columns={"assignee_label": "lead_name"})
    )
    lead_summary["completion_rate_pct"] = round(
        (lead_summary["completed"] / lead_summary["total_assigned"]) * 100, 2
    )

    return {
        "requested_by": current_user["email"],
        "date_range": {"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
        "overall_summary": {
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "overall_completion_rate_pct": overall_rate,
        },
        "lead_rankings": lead_summary.to_dict(orient="records"),
    }


# ─── Per-User Completion Stats ──────────────────────────────────────────────────


@app.get("/analytics/performance/users", tags=["Analytics"])
def get_per_user_stats(
    current_user: dict = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Filter tasks created on or after this date"),
    date_to: Optional[date] = Query(None, description="Filter tasks created on or before this date"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
):
    """
    Per-user completion stats. Supports date filtering and pagination.
    """
    df = _scope_df(_load_tasks_df(), current_user)
    df = _filter_by_date_range(df, date_from, date_to)

    if len(df) == 0 or df["assignee_id"].isna().all():
        return {
            "requested_by": current_user["email"],
            "date_range": {"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
            "users": [],
            "pagination": {"page": 1, "page_size": page_size, "total_items": 0, "total_pages": 0},
        }

    assigned = df[df["assignee_id"].notnull()].copy()

    user_stats = (
        assigned.groupby(["assignee_id", "assignee_name"])
        .apply(
            lambda g: pd.Series(
                {
                    "total_tasks": len(g),
                    "completed": int((g["status"] == "DONE").sum()),
                    "in_progress": int((g["status"] == "IN_PROGRESS").sum()),
                    "in_review": int((g["status"] == "IN_REVIEW").sum()),
                    "todo": int((g["status"] == "TODO").sum()),
                    "overdue": int(g["is_overdue"].sum()),
                    "completion_rate_pct": round(
                        (g["status"] == "DONE").sum() / len(g) * 100, 2
                    ),
                    "avg_completion_hrs": (
                        round(
                            g.loc[
                                g["completion_time_hrs"] > 0, "completion_time_hrs"
                            ].mean(),
                            2,
                        )
                        if (g["completion_time_hrs"] > 0).any()
                        else 0.0
                    ),
                    "status_breakdown": _status_breakdown(g),
                    "priority_breakdown": _priority_breakdown(g),
                }
            ),
            include_groups=False,
        )
        .reset_index()
    )

    users_list = []
    for _, row in user_stats.iterrows():
        users_list.append(
            {
                "user_id": row["assignee_id"],
                "user_name": row["assignee_name"],
                "total_tasks": _safe_json(row["total_tasks"]),
                "completed": _safe_json(row["completed"]),
                "in_progress": _safe_json(row["in_progress"]),
                "in_review": _safe_json(row["in_review"]),
                "todo": _safe_json(row["todo"]),
                "overdue": _safe_json(row["overdue"]),
                "completion_rate_pct": _safe_json(row["completion_rate_pct"]),
                "avg_completion_hrs": _safe_json(row["avg_completion_hrs"]),
                "status_breakdown": row["status_breakdown"],
                "priority_breakdown": row["priority_breakdown"],
            }
        )

    users_list.sort(key=lambda u: u["completion_rate_pct"], reverse=True)

    paginated = _paginate(users_list, page, page_size)

    return {
        "requested_by": current_user["email"],
        "date_range": {"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
        "users": paginated["data"],
        "pagination": paginated["pagination"],
    }


# ─── Per-Team Performance ───────────────────────────────────────────────────────


@app.get("/analytics/performance/teams", tags=["Analytics"])
def get_per_team_stats(
    current_user: dict = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Filter tasks created on or after this date"),
    date_to: Optional[date] = Query(None, description="Filter tasks created on or before this date"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
):
    """
    Per-team performance with member rankings. Supports date filtering and pagination.
    """
    _require_role(
        current_user, ["SUPER_ADMIN", "ADMIN", "MANAGER", "TEAM_LEAD"]
    )

    df = _scope_df(_load_tasks_df(), current_user)
    df = _filter_by_date_range(df, date_from, date_to)
    team_tasks = df[df["team_id"].notnull()].copy()

    if len(team_tasks) == 0:
        return {
            "requested_by": current_user["email"],
            "date_range": {"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
            "teams": [],
            "pagination": {"page": 1, "page_size": page_size, "total_items": 0, "total_pages": 0},
        }

    teams_list = []
    for (team_id, team_name, manager_name, lead_name), grp in team_tasks.groupby(
        ["team_id", "team_name", "manager_name", "lead_name"]
    ):
        total = len(grp)
        done = int((grp["status"] == "DONE").sum())
        rate = round(done / total * 100, 2) if total > 0 else 0.0
        avg_hrs = (
            round(
                grp.loc[
                    grp["completion_time_hrs"] > 0, "completion_time_hrs"
                ].mean(),
                2,
            )
            if (grp["completion_time_hrs"] > 0).any()
            else 0.0
        )

        # Member rankings within this team
        member_rankings = []
        assigned_in_team = grp[grp["assignee_id"].notnull()]
        if len(assigned_in_team) > 0:
            for (uid, uname), mgrp in assigned_in_team.groupby(
                ["assignee_id", "assignee_name"]
            ):
                m_total = len(mgrp)
                m_done = int((mgrp["status"] == "DONE").sum())
                m_rate = round(m_done / m_total * 100, 2) if m_total > 0 else 0.0
                member_rankings.append(
                    {
                        "user_id": uid,
                        "user_name": uname,
                        "total_tasks": m_total,
                        "completed": m_done,
                        "completion_rate_pct": m_rate,
                    }
                )
            member_rankings.sort(
                key=lambda m: m["completion_rate_pct"], reverse=True
            )

        teams_list.append(
            {
                "team_id": team_id,
                "team_name": team_name,
                "manager_name": manager_name,
                "lead_name": lead_name,
                "total_tasks": total,
                "completed": done,
                "completion_rate_pct": rate,
                "avg_completion_hrs": avg_hrs,
                "overdue": int(grp["is_overdue"].sum()),
                "status_breakdown": _status_breakdown(grp),
                "priority_breakdown": _priority_breakdown(grp),
                "member_rankings": member_rankings,
            }
        )

    teams_list.sort(key=lambda t: t["completion_rate_pct"], reverse=True)

    paginated = _paginate(teams_list, page, page_size)

    return {
        "requested_by": current_user["email"],
        "date_range": {"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
        "teams": paginated["data"],
        "pagination": paginated["pagination"],
    }


# ─── Per-Manager Rollups ────────────────────────────────────────────────────────


@app.get("/analytics/performance/managers", tags=["Analytics"])
def get_per_manager_stats(
    current_user: dict = Depends(get_current_user),
    date_from: Optional[date] = Query(None, description="Filter tasks created on or after this date"),
    date_to: Optional[date] = Query(None, description="Filter tasks created on or before this date"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
):
    """
    Per-manager rollups with team breakdown. Supports date filtering and pagination.
    """
    _require_role(current_user, ["SUPER_ADMIN", "ADMIN", "MANAGER"])

    df = _scope_df(_load_tasks_df(), current_user)
    df = _filter_by_date_range(df, date_from, date_to)
    team_tasks = df[df["team_id"].notnull()].copy()

    if len(team_tasks) == 0:
        return {
            "requested_by": current_user["email"],
            "date_range": {"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
            "managers": [],
            "pagination": {"page": 1, "page_size": page_size, "total_items": 0, "total_pages": 0},
        }

    managers_list = []
    for (mgr_id, mgr_name), mgr_grp in team_tasks.groupby(
        ["team_manager_id", "manager_name"]
    ):
        total = len(mgr_grp)
        done = int((mgr_grp["status"] == "DONE").sum())
        rate = round(done / total * 100, 2) if total > 0 else 0.0
        avg_hrs = (
            round(
                mgr_grp.loc[
                    mgr_grp["completion_time_hrs"] > 0, "completion_time_hrs"
                ].mean(),
                2,
            )
            if (mgr_grp["completion_time_hrs"] > 0).any()
            else 0.0
        )

        # Per-team breakdown under this manager
        team_breakdown = []
        for (tid, tname), tgrp in mgr_grp.groupby(["team_id", "team_name"]):
            t_total = len(tgrp)
            t_done = int((tgrp["status"] == "DONE").sum())
            t_rate = round(t_done / t_total * 100, 2) if t_total > 0 else 0.0
            team_breakdown.append(
                {
                    "team_id": tid,
                    "team_name": tname,
                    "total_tasks": t_total,
                    "completed": t_done,
                    "completion_rate_pct": t_rate,
                }
            )
        team_breakdown.sort(
            key=lambda t: t["completion_rate_pct"], reverse=True
        )

        best_team = team_breakdown[0]["team_name"] if team_breakdown else None
        worst_team = team_breakdown[-1]["team_name"] if team_breakdown else None

        managers_list.append(
            {
                "manager_id": mgr_id,
                "manager_name": mgr_name,
                "total_teams": len(team_breakdown),
                "total_tasks": total,
                "completed": done,
                "completion_rate_pct": rate,
                "avg_completion_hrs": avg_hrs,
                "overdue": int(mgr_grp["is_overdue"].sum()),
                "best_performing_team": best_team,
                "worst_performing_team": worst_team,
                "status_breakdown": _status_breakdown(mgr_grp),
                "team_breakdown": team_breakdown,
            }
        )

    managers_list.sort(key=lambda m: m["completion_rate_pct"], reverse=True)

    paginated = _paginate(managers_list, page, page_size)

    return {
        "requested_by": current_user["email"],
        "date_range": {"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
        "managers": paginated["data"],
        "pagination": paginated["pagination"],
    }


# ─── Executive Summary & Recent Tasks ──────────────────────────────────────────


@app.get("/analytics/performance/executive", tags=["Analytics"])
def get_executive_dashboard_summary(
    current_user: dict = Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """
    Executive summary endpoint for SUPER_ADMIN & ADMIN.
    Returns growth metrics, top performers, on-time vs delayed teams.
    """
    _require_role(current_user, ["SUPER_ADMIN", "ADMIN"])

    df = _scope_df(_load_tasks_df(), current_user)
    df = _filter_by_date_range(df, date_from, date_to)

    total_tasks = len(df)
    completed_tasks = int((df["status"] == "DONE").sum()) if total_tasks > 0 else 0
    overall_completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0.0
    overdue_tasks = int(df["is_overdue"].sum()) if total_tasks > 0 else 0

    # Teams evaluation
    on_time_teams = []
    delayed_teams = []
    best_team_name = "N/A"
    best_manager_name = "N/A"
    best_user_name = "N/A"

    if total_tasks > 0 and df["team_id"].notnull().any():
        team_grps = df[df["team_id"].notnull()].groupby(["team_id", "team_name"])
        team_stats = []
        for (tid, tname), tgrp in team_grps:
            t_total = len(tgrp)
            t_done = int((tgrp["status"] == "DONE").sum())
            t_overdue = int(tgrp["is_overdue"].sum())
            t_rate = round(t_done / t_total * 100, 1) if t_total > 0 else 0.0
            
            t_info = {
                "team_id": tid,
                "team_name": tname,
                "total_tasks": t_total,
                "completed": t_done,
                "overdue": t_overdue,
                "completion_rate_pct": t_rate
            }
            team_stats.append(t_info)

            if t_overdue == 0 and t_rate >= 50:
                on_time_teams.append(t_info)
            else:
                delayed_teams.append(t_info)

        team_stats.sort(key=lambda x: x["completion_rate_pct"], reverse=True)
        if team_stats:
            best_team_name = team_stats[0]["team_name"]

    if total_tasks > 0 and df["manager_name"].notnull().any():
        mgr_stats = df[df["manager_name"].notnull()].groupby("manager_name").apply(
            lambda g: round((g["status"] == "DONE").sum() / len(g) * 100, 1)
        ).sort_values(ascending=False)
        if not mgr_stats.empty:
            best_manager_name = mgr_stats.index[0]

    if total_tasks > 0 and df["assignee_name"].notnull().any():
        user_stats = df[df["assignee_name"].notnull()].groupby("assignee_name").apply(
            lambda g: round((g["status"] == "DONE").sum() / len(g) * 100, 1)
        ).sort_values(ascending=False)
        if not user_stats.empty:
            best_user_name = user_stats.index[0]

    return {
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "completion_rate_pct": overall_completion_rate,
        "overdue_tasks": overdue_tasks,
        "status_distribution": _status_breakdown(df) if total_tasks > 0 else {"TODO": 0, "IN_PROGRESS": 0, "IN_REVIEW": 0, "DONE": 0},
        "priority_distribution": _priority_breakdown(df) if total_tasks > 0 else {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "URGENT": 0},
        "best_performers": {
            "top_manager": best_manager_name,
            "top_team": best_team_name,
            "top_user": best_user_name,
        },
        "on_time_teams": on_time_teams,
        "delayed_teams": delayed_teams,
    }


@app.get("/analytics/performance/recent-tasks", tags=["Analytics"])
def get_recent_tasks_feed(
    current_user: dict = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100),
):
    """
    Returns recent tasks across the system with full creator, assignee, and team metadata.
    """
    df = _scope_df(_load_tasks_df(), current_user)
    if len(df) == 0:
        return {"tasks": []}

    df_sorted = df.sort_values(by="createdAt", ascending=False).head(limit)
    
    tasks_list = []
    for _, row in df_sorted.iterrows():
        tasks_list.append({
            "task_id": row["task_id"],
            "title": row["title"],
            "status": row["status"],
            "priority": row["priority"],
            "created_at": str(row["createdAt"]) if pd.notnull(row["createdAt"]) else None,
            "due_date": str(row["dueDate"]) if pd.notnull(row["dueDate"]) else None,
            "creator_name": row["creator_name"] or "System",
            "assignee_name": row["assignee_name"] or "Unassigned",
            "team_name": row["team_name"] or "General Pool",
            "manager_name": row["manager_name"] or "Unmanaged",
        })

    return {"tasks": tasks_list}