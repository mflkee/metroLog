# Нагрузочные тесты metroLog (Locust)

Read-профиль реального пользователя: вход, обзор реестра (пагинация, сортировка, поиск,
фильтр по папке), карточка оборудования, очереди поверок/ремонтов, журнал событий.
Запросы только на чтение — нагрузка не создаёт мусорных данных в рабочей БД.

## Подготовка тестового пользователя

Тесты ходят под отдельным аккаунтом, чтобы не трогать реальные:

```bash
# на сервере, внутри контейнера бэкенда
docker exec metrolog-backend-1 python -c "
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.utils.security import hash_password
s = SessionLocal()
if not s.query(User).filter(User.email == 'loadtest@example.invalid').first():
    s.add(User(first_name='Load', last_name='Test',
               email='loadtest@example.invalid',
               password_hash=hash_password('LoadTest123'),
               role=UserRole.ADMINISTRATOR, is_active=True, must_change_password=False))
    s.commit()
print('ok')
"

# после прогона — удалить, чтобы не оставлять рабочий аккаунт на проде
docker exec metrolog-backend-1 python -c "
from app.db.session import SessionLocal
from app.models.user import User
s = SessionLocal(); s.query(User).filter(User.email == 'loadtest@example.invalid').delete(); s.commit()
"
```

## Запуск

Запускать **на том же сервере**, что и приложение (через `127.0.0.1`), иначе VPN/сеть
искажают картину.

```bash
uv tool run --from locust locust -f loadtest/locustfile.py --headless \
    -u 30 -r 5 -t 120s --host http://127.0.0.1:8000 \
    --csv=report30 --html=report30.html \
    --csv-full-history
```

Параметры: `-u` — число одновременных пользователей, `-r` — скорость набора,
`-t` — длительность. Логин/пароль берутся из `LOADTEST_EMAIL` / `LOADTEST_PASSWORD`.

## Результаты прогонов на production (mkair-server-tmn)

Окружение: mkair-server-tmn (6 vCPU, 15 GiB), backend uvicorn `--workers 2`,
PostgreSQL 16, Redis 7, Docker Compose. Дата: 2026-10-06, вне рабочих часов.
Локаст запускался на том же хосте (делит CPU с контейнерами).

| Метрика | 30 users, 120 s | 60 users, 120 s |
|---|---|---|
| Всего запросов | 2 311 | 3 255 |
| RPS | 19.3 | 27.3 |
| Ошибки | 0 | 0 |
| p50 | 53 мс | 660 мс |
| p95 | 1 400 мс | 2 400 мс |
| p99 | 2 900 мс | 11 000 мс |
| Максимум | 6 100 мс | 25 500 мс |
| Среднее | 329 мс | 984 мс |

### Наблюдения

- **Ошибок нет ни на одном уровне** — сервер не падает и не отдаёт 5xx даже в
  потолке; все 5 566 запросов завершились успешно.
- **Линейного роста не происходит**: пользователей вдвое больше, а RPS вырос
  всего в 1.4 раза при росте p50 в 12 раз — узкое место насыщается.
- **Главный тормоз — `POST /auth/login`**: p50 ≈ 0.7–1.6 с, p99 до 25 с.
  Причина — PBKDF2-SHA256 с 600 000 итераций (`app/utils/security.py`),
  который выполняется синхронно в async-эндпоинте и блокирует event loop
  uvicorn. При 3 опросах в секунду на логин 2 воркера уходят в PBKDF2.
- «Холодные» первые запросы (warmup) заметно медленнее — прогрев пула
  соединений и кэшей.
- CPU после прогона низкий (backend 0.5 %), т.е. запас есть; упор — в login
  и, возможно, в самом генераторе нагрузки на том же хосте.

### Выводы и рекомендации

1. Для заявленного профиля (десятки пользователей) производительности хватает
   с большим запасом: при 30 одновременных читателях p95 = 1.4 с.
2. Логин стоит сделать неблокирующим — вынести `hash_password`/`verify_password`
   в `anyio.to_thread.run_sync` (или снизить число итераций PBKDF2 с обоснованием).
   С такой правкой сценарии с массовым входом (утро понедельника) перестанут
   образовывать очередь.
3. Полезно добавить в регрессионный чек-лист прогон 30 users / 120 s:
   текущие цифры (0 ошибок, p50 ≈ 50 мс) — базовая линия.
