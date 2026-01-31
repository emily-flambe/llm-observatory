"""Resources for calling the LLM Observatory API."""

import json
import urllib.request
import urllib.error
from typing import Optional

from dagster import ConfigurableResource


class ObservatoryApiResource(ConfigurableResource):
    """Resource for interacting with the LLM Observatory API."""

    # Use workers.dev domain to bypass Cloudflare bot detection on custom domain
    api_url: str = "https://llm-observatory.emily-cogsdill.workers.dev"
    cf_access_client_id: str
    cf_access_client_secret: str

    def _headers(self) -> dict:
        """Get headers including Cloudflare Access authentication."""
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "CF-Access-Client-Id": self.cf_access_client_id,
            "CF-Access-Client-Secret": self.cf_access_client_secret,
        }

    def get_swarms(self) -> list[dict]:
        """Fetch all swarms from the API."""
        url = f"{self.api_url}/api/swarms"
        request = urllib.request.Request(url, headers=self._headers())

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read().decode())
                return data.get("swarms", [])
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"API error fetching swarms: {e.code} - {e.read().decode()}")

    def run_swarm(self, swarm_id: str) -> dict:
        """Trigger a swarm run via the API."""
        url = f"{self.api_url}/api/admin/swarms/{swarm_id}/run"
        request = urllib.request.Request(
            url,
            data=b"{}",
            headers=self._headers(),
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as e:
            error_body = e.read().decode()
            raise RuntimeError(f"API error running swarm {swarm_id}: {e.code} - {error_body}")
