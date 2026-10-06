"""Нагрузочные тесты metroLog (Locust).

Запуск на сервере (внутри хоста, не через VPN):

    uvx locust -f locustfile.py --headless -u 20 -r 5 -t 60s \
        --host http://127.0.0.1:8000 --csv=report

Переменные окружения:
    LOADTEST_EMAIL     — логин тестового пользователя
    LOADTEST_PASSWORD  — пароль тестового пользователя

Сценарий соответствует read-профилю реального пользователя: вход, обзор
реестра (пагинация, сортировка, поиск), карточка оборудования, очереди
поверок/ремонтов, журнал событий. Запросы только на чтение, чтобы нагрузка
не создавала мусорных данных в рабочей БД.
"""

from __future__ import annotations

import os
import random
from urllib.parse import quote

from locust import HttpUser, between, events, task

API = "/api/v1"
EMAIL = os.getenv("LOADTEST_EMAIL", "loadtest@example.invalid")
PASSWORD = os.getenv("LOADTEST_PASSWORD", "LoadTest123")


@events.test_start.add_listener
def _log_target(environment, **_kwargs) -> None:  # noqa: ANN001
    print(f"[loadtest] target host = {environment.host}")


class MetroLogUser(HttpUser):
    """Читающий пользователь реестра СИ/ЭСИ."""

    wait_time = between(0.5, 2.0)

    def on_start(self) -> None:
        self.token = ""
        self.equipment_ids: list[int] = []
        self.folder_ids: list[int] = []
        self._login()
        self._sample_ids()

    # ------------------------------------------------------------------ auth

    def _login(self) -> None:
        with self.client.post(
            f"{API}/auth/login",
            json={"email": EMAIL, "password": PASSWORD},
            name="POST /auth/login",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"login failed: HTTP {response.status_code}")
                return
            payload = response.json()
            self.token = payload.get("access_token", "")
            if not self.token:
                response.failure("login response has no access_token")

    @property
    def auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def _sample_ids(self) -> None:
        page = self.client.get(
            f"{API}/equipment/page?limit=100&offset=0",
            headers=self.auth_headers,
            name="GET /equipment/page (warmup)",
        )
        if page.status_code == 200:
            self.equipment_ids = [item["id"] for item in page.json().get("items", [])]

        folders = self.client.get(
            f"{API}/equipment/folders",
            headers=self.auth_headers,
            name="GET /equipment/folders (warmup)",
        )
        if folders.status_code == 200:
            self.folder_ids = [item["id"] for item in folders.json()]

    # ---------------------------------------------------------------- tasks

    @task(3)
    def equipment_page_first(self) -> None:
        self.client.get(
            f"{API}/equipment/page?limit=50&offset=0",
            headers=self.auth_headers,
            name="GET /equipment/page?offset=0",
        )

    @task(3)
    def equipment_page_next(self) -> None:
        offset = random.choice([50, 100, 150, 200])
        self.client.get(
            f"{API}/equipment/page?limit=50&offset={offset}",
            headers=self.auth_headers,
            name="GET /equipment/page?offset=next",
        )

    @task(2)
    def equipment_page_sorted(self) -> None:
        key = random.choice(
            [
                "name",
                "equipmentType",
                "status",
                "serialNumber",
                "manufactureYear",
                "objectName",
                "currentLocationManual",
                "validFrom",
                "validTo",
            ]
        )
        direction = random.choice(["asc", "desc"])
        self.client.get(
            f"{API}/equipment/page?limit=100&offset=0&sort_key={key}&sort_direction={direction}",
            headers=self.auth_headers,
            name="GET /equipment/page (sort)",
        )

    @task(2)
    def equipment_search(self) -> None:
        term = random.choice(["СИ", "1", "а", "м", "датчик"])
        self.client.get(
            f"{API}/equipment/page?limit=50&offset=0&query={quote(term)}",
            headers=self.auth_headers,
            name="GET /equipment/page (search)",
        )

    @task(2)
    def equipment_filtered(self) -> None:
        path = f"{API}/equipment/page?limit=50&offset=0"
        if self.folder_ids:
            path += f"&folder_id={random.choice(self.folder_ids)}"
        self.client.get(
            path,
            headers=self.auth_headers,
            name="GET /equipment/page (folder)",
        )

    @task(1)
    def equipment_details(self) -> None:
        if not self.equipment_ids:
            return
        equipment_id = random.choice(self.equipment_ids)
        self.client.get(
            f"{API}/equipment/{equipment_id}/details",
            headers=self.auth_headers,
            name="GET /equipment/{id}/details",
        )

    @task(1)
    def equipment_card(self) -> None:
        if not self.equipment_ids:
            return
        equipment_id = random.choice(self.equipment_ids)
        self.client.get(
            f"{API}/equipment/{equipment_id}",
            headers=self.auth_headers,
            name="GET /equipment/{id}",
        )

    @task(1)
    def folders(self) -> None:
        self.client.get(
            f"{API}/equipment/folders",
            headers=self.auth_headers,
            name="GET /equipment/folders",
        )

    @task(1)
    def groups(self) -> None:
        self.client.get(
            f"{API}/equipment/groups",
            headers=self.auth_headers,
            name="GET /equipment/groups",
        )

    @task(2)
    def verification_queue(self) -> None:
        self.client.get(
            f"{API}/equipment/verifications/page?limit=20&offset=0&lifecycle_status=active",
            headers=self.auth_headers,
            name="GET /equipment/verifications/page",
        )

    @task(2)
    def repair_queue(self) -> None:
        self.client.get(
            f"{API}/equipment/repairs/page?limit=20&offset=0&lifecycle_status=active",
            headers=self.auth_headers,
            name="GET /equipment/repairs/page",
        )

    @task(1)
    def events(self) -> None:
        self.client.get(
            f"{API}/events?limit=100",
            headers=self.auth_headers,
            name="GET /events",
        )

    @task(1)
    def me(self) -> None:
        self.client.get(
            f"{API}/auth/me",
            headers=self.auth_headers,
            name="GET /auth/me",
        )

    @task(1)
    def health(self) -> None:
        self.client.get(
            f"{API}/health/ready",
            name="GET /health/ready",
        )

    @task(1)
    def relogin(self) -> None:
        # Периодическая проверка, что аутентификация держит нагрузку.
        self._login()
