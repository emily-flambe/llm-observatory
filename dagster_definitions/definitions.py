"""
Dagster definitions for llm-observatory.

This code location provides a sensor that:
1. Polls the Observatory API for swarms with schedules
2. Triggers swarm runs when cron expressions match current time

All schedule configuration happens in the Observatory UI - no code changes
needed when schedules are added/modified/deleted.
"""

from dagster import Definitions, EnvVar

from .resources import ObservatoryApiResource
from .sensors import swarm_schedule_sensor

defs = Definitions(
    sensors=[swarm_schedule_sensor],
    resources={
        "observatory_api": ObservatoryApiResource(
            cf_access_client_id=EnvVar("CF_ACCESS_CLIENT_ID"),
            cf_access_client_secret=EnvVar("CF_ACCESS_CLIENT_SECRET"),
        ),
    },
)
