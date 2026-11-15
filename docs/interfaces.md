# Программные интерфейсы взаимодействия компонентов

Дата: 28 октября 2026 года. Проект контрактов для реализации, а не описание работающего API. Основание: [архитектура](architecture.md), [требования](../svyaz-est-analysis.md), решения пользователя о гостевых замерах, их участии в цвете и квадратах 250×250 м. Значения сроков и лимитов, не утверждённые в требованиях, задаются конфигурацией перед пилотом.

## 1. Взаимодействие компонентов

| Откуда → куда | Интерфейс | Данные и ответственность |
|---|---|---|
| React → адаптер данных | `DataGateway` | Фильтры, карточки, справочники и отправка. Демо- и HTTP-адаптер соблюдают один контракт. |
| Геолокация → модуль сетки | `resolveCell` | Координаты обрабатываются только на устройстве; результат — идентификатор квадрата либо отсутствие привязки. |
| Измеритель → измерительный API | Создание сессии, probe, download, upload | Реальные байты и время; лимиты, отмена, версия метода. Результат автоматически становится замером или событием ошибки. |
| Измеритель → локальная очередь | `enqueue` | Неизменяемый запрос, ключ повтора, ID и токен попытки. Локальное сохранение завершается до первой отправки результата. |
| Очередь → API наблюдений | `submitObservation` | Повтор доставки до квитанции; одинаковые ключ и тело. Вход для гостя не требуется. |
| Контроллер → прикладной сервис | `createMeasurement`, `createFailureEvent` | Runtime-валидация, проверка токена, прав и лимитов, транзакция. |
| Прикладной сервис → репозиторий | `withTransaction`, `insert`, `findReceipt` | Наблюдение и квитанция сохраняются атомарно; уникальные ограничения защищают конкурентные запросы. |
| Сервис карты → ядро оценки | `evaluateCell` | Допущенные записи, фильтры, версия методики и фиксированное время. Чистый расчёт без HTTP и БД. |
| Адаптер карты → Яндекс Карты v3 | `YMapFeature` | Полигоны GeoJSON и цвет; нажатие выбирает ячейку. Исходные точные координаты замера не передаются картографическому API. |

## 2. Общие форматы и правила доступа

- HTTPS, REST, базовый путь `/api/v1`. JSON в UTF-8; бинарные измерительные операции описаны отдельно.
- ID попыток, сессий, наблюдений и операций — UUID. `cellId` — строка формата сетки. Моменты времени — RFC 3339 UTC, например `2026-10-28T10:00:00Z`; публичная дата последнего замера — `YYYY-MM-DD` в часовом поясе пилота.
- Скорости — Мбит/с, прикладной RTT — мс, трафик — байты. Числа конечные, неотрицательные. Неизвестный оператор — `null`; неизвестные категории — `unknown`; отсутствующие агрегаты — `null`, не ноль.
- `authorId` отсутствует во входном DTO. Сервер берёт пользователя из действующей сессии входа при создании тестовой сессии. Без неё записывает `user_id = NULL`, затем `author_id = NULL`. Невалидная переданная сессия возвращает `401`, не вызывает молчаливый переход в гостевой режим.
- Авторство теста фиксируется при создании сессии. Последующий вход не присваивает гостевой замер аккаунту; выход не превращает тест участника в гостевой. `/me/observations` возвращает только записи текущего аккаунта.
- Перед тестом клиент создаёт `attemptId` и криптографически случайный `attemptToken` (32 байта), сохраняет их локально. Токен передаётся заголовком `X-Test-Token`, никогда в URL; сервер хранит только хеш. Новая попытка получает новую пару. Это техническая возможность доставить одну попытку, не постоянный ID гостя и не доказательство личности.
- `POST /test-sessions` регистрирует пару попытки, используя необязательную сессию входа. Измерительные операции и доставка проверяют токен. Сведения об авторе берутся из зафиксированной попытки, не из тела повторного запроса.
- Для cookie-аутентификации применяются проверка Origin и CSRF-защита изменяющих операций. `/me` требует сессию аккаунта, `/admin` — роль администратора. Токен попытки не даёт прав на эти разделы.
- Лимиты длительности и байтов действуют на сервере, а также на клиенте. Ограничения частоты создания попыток и публикаций действуют и для гостей, с `429` и `Retry-After`. Краткоживущие сетевые счётчики защиты не становятся автором наблюдения; IP не используется как ID человека. Токены, точные координаты и содержимое сессий не пишутся в логи.

## 3. Сетка 250×250 м

`GET /grid` возвращает `gridVersion`, `cellSizeMeters: 250`, `crs`, `projectionDefinition`, `originEasting`, `originNorthing`, `pilotBoundary` и `timezone`. Конкретные проекция и начало фиксируются после выбора города. Проекция должна быть метрической и пригодной для пилотной территории; размер 250 означает метры в этой проекции, с документированной погрешностью на местности. Квадраты не строятся шагом в градусах или экранных пикселях.

После преобразования геолокации в метрические `x, y`:

```text
column = floor((x - originEasting) / 250)
row    = floor((y - originNorthing) / 250)
cellId = gridVersion + ":" + column + ":" + row
```

Ячейка включает левую/нижнюю границу и исключает правую/верхнюю. `floor` применяется и для отрицательных индексов. На границе пилота сохраняются полные квадраты, пересекающие территорию; точка вне `pilotBoundary` не публикуется. Клиент и сервер используют одну версию конфигурации; сервер проверяет существование и принадлежность ячейки пилоту, но без исходных координат не может доказать физическое нахождение устройства в ней.

В БД хранится геометрия квадрата и индексы. Для отображения сервер преобразует вершины в GeoJSON WGS84 `[longitude, latitude]`, с замкнутым кольцом. Клиент передаёт только `cellId` и `gridVersion`. При отказе геолокации замер остаётся локальным результатом; событие ошибки может быть принято с `cellId: null`, без нанесения на карту.

## 4. REST API

| Метод и путь | Запрос → ответ | Доступ / коды успеха |
|---|---|---|
| `GET /catalog` | Нет тела → операторы, профили, версии методики, справочник причин модерации | Все / `200` |
| `GET /grid` | Нет тела → конфигурация сетки | Все / `200` |
| `GET /map/cells` | `bbox` и фильтры → GeoJSON FeatureCollection с краткими оценками | Все / `200` |
| `GET /cells/{id}/summary` | Фильтры → `CellSummary` | Все / `200` |
| `GET /auth/start` | Нет тела → перенаправление к провайдеру | Все / `302` |
| `GET /auth/callback` | Ответ провайдера, проверяемый `state` → cookie и перенаправление | Все / `302` |
| `POST /auth/logout` | Нет тела → завершение сессии | Участник / `204` |
| `GET /me` | Нет тела → `{ id, role }` | Участник / `200` |
| `POST /test-sessions` | `CreateTestSessionInput` → `TestSession` | Гость/участник, токен попытки / `201`, повтор `200` |
| `GET /test-sessions/{id}/probe` | Токен, уникальный параметр `nonce` → `{ nonce, serverTime }` | Токен попытки / `200` |
| `GET /test-sessions/{id}/download` | `bytes` в пределах остатка лимита → бинарный поток | Токен попытки / `200` |
| `POST /test-sessions/{id}/upload` | Бинарный поток → `{ receivedBytes }` | Токен попытки / `200` |
| `POST /test-sessions/{id}/cancel` | Нет тела → прекращение сессии | Токен попытки / `204` |
| `POST /measurements` | `MeasurementInput` → `ObservationReceipt` | Гость/участник, токен попытки / `201`, повтор `200` |
| `POST /failure-events` | `FailureEventInput` → `ObservationReceipt` | Гость/участник, токен попытки / `201`, повтор `200` |
| `GET /me/observations` | `cursor`, `limit`, необязательный `kind` → `{ items, nextCursor }` | Участник / `200` |
| `DELETE /me/observations/{id}` | Нет тела → удаление своего наблюдения | Владелец аккаунта / `204` |
| `DELETE /me` | `{ confirm: true }` → `{ requestId, status: "accepted" }` | Владелец аккаунта / `202` |
| `GET /admin/observations` | `cursor`, `limit`, `status`, `kind`, `cellId` → `{ items, nextCursor }` | Администратор / `200` |
| `POST /admin/observations/{id}/moderation` | `{ action, reasonCode }` → `{ id, status, recalculation: "pending" }` | Администратор / `200` |
| `GET /admin/moderation-actions` | `cursor`, `limit`, `observationId` → `{ items, nextCursor }` | Администратор / `200` |

Постраничные списки: `limit` по умолчанию 50, максимум 100; курсор непрозрачный, порядок `(createdAt, id)` стабильный. Это предложенные ограничения контракта. Чужое или несуществующее личное наблюдение возвращает `404`.

Фильтры карты и карточки: `operatorId` (ID или `unknown`), `networkType`, `environment`, `periodFrom`, `periodTo`, `profileCode`. Пропущенные категориальные фильтры означают отдельные группы, а не смешивание операторов/условий. Карточка запрашивает одну группу; при неполном выборе возвращается `422 FILTER_GROUP_REQUIRED`. Карта возвращает отдельный feature для каждой группы с идентификатором `cellId + groupKey`; интерфейс требует выбора группы перед окраской, чтобы перекрывающиеся полигоны не создавали случайный общий статус. Период — полуинтервал `[periodFrom, periodTo)`, по умолчанию последние 30 дней. `bbox = west,south,east,north` в WGS84; для пилота пересечение антимеридиана не поддерживается. Некорректные границы — `422`, неизвестная ячейка — `404`. Карта и карточка содержат эффективные фильтры и версию методики.

Измерительные ответы имеют `Cache-Control: no-store`; бинарный тип — `application/octet-stream`, без сжатия и обработки service worker. RTT измеряется монотонными часами клиента, не разностью часов клиента и сервера. Общий объём upload/download ограничивается атомарно на сессию, в том числе при конкурентных запросах. Отмена останавливает локальные потоки через `AbortSignal`; сервер ограничивает поток даже если запрос cancel не дошёл.

## 5. Форматы данных

```ts
type UUID = string;
type Instant = string; // RFC 3339 UTC
type NetworkType = '2g' | '3g' | '4g' | '5g' | 'unknown';
type Transport = 'cellular' | 'wifi' | 'other' | 'unknown';
type Environment = 'indoor' | 'outdoor' | 'unknown';
type ProfileCode = 'basic' | 'video-call';
type CellStatus = 'green' | 'yellow' | 'red' | 'insufficient_data';
type Actor = { kind: 'guest' } | { kind: 'member'; userId: UUID };

interface CreateTestSessionInput {
  attemptId: UUID;
  trafficLimitBytes: number; // целое, положительное, не выше серверного лимита
}
interface TestSession {
  id: UUID;
  attemptId: UUID;
  authorKind: 'guest' | 'member'; // без публичного userId
  methodVersion: string;
  serverId: string;
  expiresAt: Instant; // конец разрешённого измерения
  acceptUntil: Instant; // более поздний срок доставки результата
  trafficLimitBytes: number;
  durationLimitMs: number; // не более 30000
}
interface Metadata {
  operatorId: string | null;
  networkType: NetworkType;
  transport: Transport;
  vpn: 'detected' | 'not-detected' | 'unknown';
  environment: Environment;
  metadataProvenance: Record<
    'operatorId' | 'networkType' | 'transport' | 'vpn' | 'environment',
    string // код источника из версионированного справочника, включая unavailable
  >;
}
interface MeasurementInput extends Metadata {
  attemptId: UUID;
  testSessionId: UUID;
  gridVersion: string;
  cellId: string;
  occurredAt: Instant;
  downloadMbps: number;
  uploadMbps: number;
  rttMs: number;
  source: 'builtin-speed-test';
  inputMethod: 'automatic';
  methodVersion: string;
}
interface FailureEventInput extends Metadata {
  attemptId: UUID;
  testSessionId: UUID | null;
  gridVersion: string | null;
  cellId: string | null;
  occurredAt: Instant;
  stage: 'session' | 'probe' | 'download' | 'upload';
  errorCode: 'NETWORK_ERROR' | 'TIMEOUT' | 'SERVER_ERROR';
  source: 'builtin-speed-test';
  methodVersion: string;
}
interface ObservationReceipt {
  id: UUID;
  attemptId: UUID;
  kind: 'measurement' | 'failure-event';
  status: 'accepted'; // приём, а не обещание участия в рейтинге
  submittedAt: Instant;
}
interface CellFilters {
  operatorId: string | 'unknown';
  networkType: NetworkType;
  environment: Environment;
  periodFrom: Instant;
  periodTo: Instant;
  profileCode: ProfileCode;
}
interface CellSummary {
  cellId: string;
  gridVersion: string;
  filters: CellFilters;
  methodologyVersion: string;
  calculatedAt: Instant;
  status: CellStatus;
  reasonCodes: string[];
  sampleCount: number; // после всех исключений, включая допустимые гостевые
  lastMeasurementDate: string | null;
  metrics: { downloadMbps: number | null; uploadMbps: number | null;
    rttMs: number | null };
  complaintCount: number; // историческое имя счётчика автоматических ошибок
}
```

`vpn` выделен явно: транспорт `cellular` сам по себе не исключает VPN. Происхождение метаданных проверяется сервером; присланная строка не считается доказательством. Для мобильной оценки нужны подтверждённый мобильный транспорт, известный оператор и отсутствие обнаруженного VPN; неизвестный статус VPN допускается только если согласованная методика доверяет источнику, иначе запись исключается с причиной `UNVERIFIED_METADATA`. `effectiveType` не преобразуется в 4G/5G. Правила допуска одинаковы для гостя и участника.

Пример гостевого запроса: `POST /measurements`, заголовки `X-Test-Token` и `Idempotency-Key`, без сессии аккаунта и без `authorId`:

```json
{
  "attemptId": "74b81009-c326-4eb7-81af-90fb2d7b7dc1",
  "testSessionId": "9c0ddfe8-8895-4dc9-9df0-8a00d8315b90",
  "gridVersion": "pilot-v1",
  "cellId": "pilot-v1:12:34",
  "occurredAt": "2026-10-28T10:00:00Z",
  "operatorId": null,
  "networkType": "unknown",
  "transport": "unknown",
  "vpn": "unknown",
  "environment": "unknown",
  "downloadMbps": 12.4,
  "uploadMbps": 4.8,
  "rttMs": 82,
  "source": "builtin-speed-test",
  "inputMethod": "automatic",
  "methodVersion": "1",
  "metadataProvenance": {
    "operatorId": "unavailable", "networkType": "unavailable",
    "transport": "unavailable", "vpn": "unavailable", "environment": "unavailable"
  }
}
```

Этот пример может быть сохранён, но не входит в мобильный рейтинг из-за неизвестных метаданных. Гостевой замер с допущенными метаданными участвует в цвете. `pilot-v1` — пример, не выбранная территория.

Публичная карточка достаточной выборки:

```json
{
  "cellId": "pilot-v1:12:34",
  "gridVersion": "pilot-v1",
  "filters": {
    "operatorId": "operator-example", "networkType": "4g", "environment": "outdoor",
    "periodFrom": "2026-09-28T10:00:00Z", "periodTo": "2026-10-28T10:00:00Z",
    "profileCode": "video-call"
  },
  "methodologyVersion": "2-guest-draft",
  "calculatedAt": "2026-10-28T10:00:00Z",
  "status": "green",
  "reasonCodes": ["PROFILE_PASSED", "GUEST_AUTHOR_INDEPENDENCE_UNVERIFIED"],
  "sampleCount": 5,
  "lastMeasurementDate": "2026-10-27",
  "metrics": { "downloadMbps": 12.4, "uploadMbps": 4.8, "rttMs": 82 },
  "complaintCount": 0
}
```

Пример иллюстративный: пять допущенных результатов с одинаковыми метриками за две даты, прошедших профиль. Публичный ответ не раскрывает список наблюдений, авторов, попыток или их точное время.

## 6. Повторы, очередь и события без сессии

Для создания сессии и публикации обязателен `Idempotency-Key` (UUID). Уникальная область — `(attemptId, operation, key)`, без зависимости от `user_id`. В хранилище операций есть хеш токена попытки, хеш канонического DTO, статус и квитанция. Проверка токена предшествует возврату результата. Совпадающие ключ и тело возвращают прежнюю квитанцию; другое тело — `409 IDEMPOTENCY_CONFLICT`. Повтор создания сессии возвращает ту же сессию и первоначальное авторство, даже если состояние входа изменилось.

Дополнительное ограничение — один итоговый результат попытки: замер либо событие ошибки. Нельзя опубликовать второй замер с новым ключом для той же сессии; сервер возвращает `409 ATTEMPT_ALREADY_FINALIZED`. Транспортный сбой доставки готового замера не создаёт событие неуспешного измерения: повторяется отправка исходного замера. Отмена пользователем не считается отсутствием связи и не создаёт сетевой ошибки.

При сбое до выдачи сессии клиент сохраняет событие с `testSessionId: null`. При восстановлении связи сервер регистрирует ещё неизвестную пару `attemptId`/хеш токена и событие атомарно; это непроверенное событие, не количественный замер, с `author_id = NULL`. Если попытка уже известна, нужен её исходный токен; автор берётся из сохранённой сессии. Наличие cookie при поздней доставке не присваивает событие пользователю. Такой контракт не требует доступного сервера в момент ошибки.

Квитанция, уникальность попытки и хеш токена хранятся не меньше окна разрешённой доставки; после его окончания старый известный ID не превращается в новую попытку. Для уже принятой операции доступен повтор квитанции в объявленный срок. Истечение `expiresAt` прекращает измерение, но до `acceptUntil` допускает доставку. Максимальная давность события без сессии задаётся конфигурацией, проверяется по `occurredAt`. Будущее время сверх допуска часов отклоняется. Просроченная запись получает `410 DELIVERY_EXPIRED`, остаётся локально с явным статусом и не отправляется бесконечно.

Очередь хранит `payload`, `attemptId`, `attemptToken`, `idempotencyKey`, `createdAt`, `retryCount`, `nextRetryAt`, `state`. Состояния: `pending`, `sending`, `sent`, `blocked`, `expired`. Повторяются сетевые ошибки, `429` с учётом `Retry-After` и `5xx`, с возрастающей задержкой и случайным разбросом. `401/403` токена, `409`, `422` переводят запись в `blocked`; автоматическая замена ключа или авторства запрещена. Токен удаляется после завершения нужного окна повторов. Очередь гостя не требует повторного входа.

## 7. Ошибки и валидация

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Результат теста не принят",
  "details": { "reason": "INVALID_MEASUREMENT_TIME" },
  "requestId": "f12f086b-4c11-4d6e-b851-1b92c3baf578"
}
```

| HTTP | Примеры кодов | Поведение |
|---|---|---|
| `400` | `INVALID_JSON`, `MISSING_IDEMPOTENCY_KEY` | Исправление клиента; автоматический повтор бесполезен |
| `401` | `AUTH_REQUIRED`, `INVALID_TEST_TOKEN` | Различать сессию аккаунта и токен попытки; гостю не предлагать вход вместо потерянного токена |
| `403` | `FORBIDDEN` | Нет прав на операцию |
| `404` | `CELL_NOT_FOUND`, `OBSERVATION_NOT_FOUND` | Не раскрывать чужие личные записи |
| `409` | `IDEMPOTENCY_CONFLICT`, `ATTEMPT_ALREADY_FINALIZED`, `GRID_VERSION_MISMATCH` | Сохранить запись и показать причину; не менять автоматически ключ |
| `410` | `DELIVERY_EXPIRED`, `TEST_SESSION_EXPIRED` | Не возобновлять просроченный тест или доставку |
| `413` | `TRAFFIC_LIMIT_EXCEEDED` | Прекратить передачу |
| `422` | `VALIDATION_ERROR`, `FILTER_GROUP_REQUIRED` | Причина и проблемные поля без секретов |
| `429` | `RATE_LIMITED` | Повтор после `Retry-After` |
| `503` | `TEMPORARILY_UNAVAILABLE` | Сохранить очередь, повторить позже |

Схемы запрещают неизвестные поля, включая переданный `authorId`. Проверяются конечность чисел, единицы и диапазоны, обязательные метрики полного замера, версия метода/сетки, принадлежность сессии попытке, время, лимиты и согласованность с серверными измерительными данными. Сервер не может доказать достоверность произвольных клиентских метаданных только валидацией JSON.

## 8. Сигнатуры основных методов

Типы DTO приведены выше. Ниже `GridConfig` соответствует ответу `/grid`, `GeoPoint` содержит локальные `longitude/latitude`, `EvaluationInput` содержит внутренние наблюдения с nullable-автором, фильтры, `now` и конфигурацию методики. `AttemptContext` — результат серверной проверки токена с фиксированным `Actor`; он никогда не принимается из тела запроса. `AdminContext` — проверенная сессия администратора.

```ts
interface DataGateway {
  getGrid(signal?: AbortSignal): Promise<GridConfig>;
  getCellSummary(cellId: string, filters: CellFilters,
    signal?: AbortSignal): Promise<CellSummary>;
  createTestSession(input: CreateTestSessionInput, token: string,
    idempotencyKey: UUID): Promise<TestSession>;
  submitObservation(input: MeasurementInput | FailureEventInput,
    token: string, idempotencyKey: UUID): Promise<ObservationReceipt>;
}

// Чистые функции: нет HTTP, React и обращений к БД.
declare function resolveCell(point: GeoPoint, grid: GridConfig):
  { cellId: string; gridVersion: string } | null;
declare function evaluateCell(input: EvaluationInput): CellSummary;

// Клиент: измерение и очередь. Ошибка и успех имеют разные типы результата.
type MeasurementOutcome =
  | { kind: 'publishable'; input: MeasurementInput }
  | { kind: 'failure'; input: FailureEventInput }
  | { kind: 'local-only'; reason: 'LOCATION_UNAVAILABLE' | 'OUTSIDE_PILOT';
      metrics: { downloadMbps: number; uploadMbps: number; rttMs: number } }
  | { kind: 'cancelled' };
declare function runMeasurement(session: TestSession, token: string,
  signal: AbortSignal): Promise<MeasurementOutcome>;
declare function enqueue(input: MeasurementInput | FailureEventInput,
  token: string, idempotencyKey: UUID): Promise<void>;
declare function flushQueue(gateway: DataGateway, signal: AbortSignal): Promise<void>;

// Серверные прикладные сервисы.
declare function createMeasurement(context: AttemptContext,
  input: MeasurementInput, key: UUID): Promise<ObservationReceipt>;
declare function createFailureEvent(context: AttemptContext,
  input: FailureEventInput, key: UUID): Promise<ObservationReceipt>;
declare function moderateObservation(context: AdminContext, observationId: UUID,
  decision: { action: 'hide' | 'restore'; reasonCode: string }): Promise<void>;

// Репозитории получают транзакцию явно; tx — контекст соединения с БД.
interface ObservationRepository {
  insert(tx: Transaction, input: MeasurementInput | FailureEventInput,
    authorId: UUID | null): Promise<ObservationReceipt>;
}
interface IdempotencyRepository {
  findReceipt(tx: Transaction, attemptId: UUID, operation: string,
    key: UUID): Promise<StoredOperation | null>;
  insert(tx: Transaction, operation: StoredOperation): Promise<void>;
}
declare function withTransaction<T>(
  work: (tx: Transaction) => Promise<T>
): Promise<T>;
```

`runMeasurement` получает привязку и метаданные через клиентские зависимости измерителя. При отсутствии геолокации возвращается `local-only`, при отмене — `cancelled`: эти результаты не передаются в очередь публикации. Сбой создания сессии обрабатывает вызывающий сценарий и формирует `FailureEventInput` с `testSessionId: null`.

`evaluateCell` включает гостевые замеры после тех же проверок, что и участнические. Методика `2-guest-draft`: минимум 5 учтённых сессий за 2 даты, без минимального числа аккаунтов. Для известных авторов остаётся один последний вклад в сутки на группу, для гостей — один на тестовую сессию. Веса, окно и пороги профилей сохраняются из требований. Доля гостей не раскрывает их личности; уникальность авторов не заявляется. Это предложенная адаптация методики к согласованному участию гостей и требует полевой проверки.

## 9. Контрактные проверки перед реализацией MVP

1. Гость создаёт сессию и публикует замер: обе ссылки на пользователя `NULL`; запись с подходящими метаданными влияет на цвет.
2. Участник публикует с серверным автором; переданный `authorId` отклоняется. Поздний вход не присваивает гостевой результат аккаунту.
3. Повтор и два конкурентных запроса создают одну запись; чужой токен не получает квитанцию; новый ключ не обходит финализацию попытки.
4. Событие до создания сессии доставляется без входа; неизвестная ячейка не подставляется, событие не превращается в ноль.
5. Пять допустимых сессий за две даты могут дать цвет без аккаунтов; повтор одной сессии и скрытые записи не увеличивают выборку.
6. Точки на границах квадратов и отрицательные индексы дают одинаковый `cellId` на клиенте и сервере. Проверены размер 250 м в выбранной проекции и порядок координат GeoJSON.
7. Точные координаты и токены отсутствуют в API наблюдений, URL и журналах; публичные ответы не раскрывают авторов и отдельных событий.
8. HTTP- и демо-адаптеры проходят общие проверки схем, фильтров, `null`, ошибок, повторов и сроков доставки.
