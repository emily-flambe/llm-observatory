"""Sensor that polls the Observatory API and triggers swarm runs."""

import json
from datetime import datetime, timezone

from dagster import sensor, SensorEvaluationContext, SkipReason

from .resources import ObservatoryApiResource


def cron_matches(cron_expression: str, dt: datetime) -> bool:
    """
    Check if a cron expression matches the given datetime (UTC).
    Supports: *, specific values, ranges (1-5), lists (1,3,5), steps (*/5)
    """
    parts = cron_expression.strip().split()
    if len(parts) != 5:
        return False

    minute, hour, day, month, weekday = parts

    def matches_field(field: str, value: int) -> bool:
        if field == "*":
            return True
        if "/" in field:
            base, step = field.split("/")
            step_val = int(step)
            if base == "*":
                return value % step_val == 0
            return False
        if "-" in field:
            start, end = map(int, field.split("-"))
            return start <= value <= end
        if "," in field:
            return value in [int(x) for x in field.split(",")]
        return value == int(field)

    # Cron weekday: 0=Sunday, Python weekday: 0=Monday
    # Convert Python weekday to cron weekday
    cron_weekday = (dt.weekday() + 1) % 7

    return (
        matches_field(minute, dt.minute)
        and matches_field(hour, dt.hour)
        and matches_field(day, dt.day)
        and matches_field(month, dt.month)
        and matches_field(weekday, cron_weekday)
    )


def get_effective_cron(swarm: dict) -> str | None:
    """Convert schedule_type to cron expression if not custom."""
    schedule_type = swarm.get("schedule_type")
    cron_expr = swarm.get("cron_expression")

    if not schedule_type:
        return None
    if cron_expr:
        return cron_expr

    # Default schedules run at 9:00 AM UTC
    defaults = {
        "daily": "0 9 * * *",
        "weekly": "0 9 * * 1",  # Monday at 9 AM
        "monthly": "0 9 1 * *",  # 1st of month at 9 AM
    }
    return defaults.get(schedule_type)


@sensor(minimum_interval_seconds=60)
def swarm_schedule_sensor(
    context: SensorEvaluationContext,
    observatory_api: ObservatoryApiResource,
):
    """
    Polls the Observatory API for swarms with schedules and triggers runs
    when cron expressions match the current time.

    Schedule configuration comes from D1 via the API - no code changes
    needed when schedules are updated in the UI.
    """
    now = datetime.now(timezone.utc)
    current_minute = now.strftime("%Y-%m-%d-%H-%M")

    # Load cursor (tracks which swarms we've triggered this minute)
    cursor = json.loads(context.cursor or "{}")

    # Clean up old cursor entries (keep only current hour)
    cutoff = now.strftime("%Y-%m-%d-%H")
    cursor = {k: v for k, v in cursor.items() if k.startswith(cutoff) or k > cutoff[:10]}

    try:
        swarms = observatory_api.get_swarms()
    except Exception as e:
        context.log.error(f"Failed to fetch swarms: {e}")
        return SkipReason(f"API error: {e}")

    triggered = []

    for swarm in swarms:
        swarm_id = swarm.get("id")
        is_paused = swarm.get("is_paused")

        # Skip paused swarms
        if is_paused:
            continue

        cron_expr = get_effective_cron(swarm)
        if not cron_expr:
            continue

        # Check if cron matches current time
        if not cron_matches(cron_expr, now):
            continue

        # Deduplication: don't trigger same swarm twice in same minute
        dedup_key = f"{current_minute}:{swarm_id}"
        if dedup_key in cursor:
            context.log.debug(f"Skipping swarm {swarm_id} - already triggered this minute")
            continue

        # Trigger the swarm run
        try:
            display_name = swarm.get("display_name") or swarm_id[:8]
            result = observatory_api.run_swarm(swarm_id)
            context.log.info(f"Triggered swarm '{display_name}': {result}")
            triggered.append(display_name)
            cursor[dedup_key] = True

        except Exception as e:
            context.log.error(f"Failed to trigger swarm {swarm_id}: {e}")

    # Update cursor
    context.update_cursor(json.dumps(cursor))

    if triggered:
        return None  # Success, runs were triggered
    else:
        return SkipReason("No swarms matched current time")
