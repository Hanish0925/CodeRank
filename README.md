# 🚀 CodeRank - Online Code Execution Platform

CodeRank is a scalable, containerized code execution backend supporting multiple languages (Python, Java, C++, JavaScript) with Kafka-based job queuing, Redis-based caching, MongoDB persistence, and WebSocket live logging.

---

## 🌐 Features

- Multi-language support via Docker containers (Python, Java, C++, JavaScript)
- Kafka for decoupled job queuing
- Redis for result caching
- MongoDB for job persistence
- WebSocket for real-time output streaming
- Execution timeout + sandboxed containers for security

---

## 📦 Tech Stack

| Layer           | Tech                     |
|----------------|--------------------------|
| Backend Server | Node.js + Express        |
| Job Queue      | Kafka + KafkaJS          |
| Execution      | Docker per language      |
| Caching        | Redis                    |
| Database       | MongoDB + Mongoose       |
| Realtime Logs  | WebSocket (ws)           |
| Frontend       | Simple HTML/JS UI        |

---

## ⚙️ Local Setup

### 1. Clone and Install

```bash
git clone https://github.com/your-username/coderank.git
cd CodeRank
npm install
```

### 2. 📄 Environment Variables

Copy the template and fill it in. `.env` is gitignored — never commit it.

```bash
cp .env.example .env
```

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/coderank
REDIS_URL=redis://localhost:6379
KAFKA_BROKER=localhost:9092

# Execution limits
EXECUTION_TIMEOUT_MS=10000
MAX_OUTPUT_BYTES=10000
MAX_CONCURRENT_CONTAINERS=4

# API limits
MAX_BODY_SIZE=64kb
RATE_LIMIT_MAX=10
CORS_ORIGINS=http://localhost:5500
```

### 3. 🐳 Docker Setup

```bash
docker compose -f docker-compose.kafka.yml up -d
docker compose -f docker-compose.redis.yml up -d
```

### 4. 🛠 Build Docker containers per language

```bash
docker buildx build -t coderank-python -f docker/python/Dockerfile .
docker buildx build -t coderank-cpp -f docker/cpp/Dockerfile .
docker buildx build -t coderank-java -f docker/java/Dockerfile .
docker buildx build -t coderank-node -f docker/node/Dockerfile .
```


### 5. 🔧 Running the System

- Starts Express API Server

```bash
npm install
npm start
```

- Start Kafka Worker

```bash
npm run worker
```

Both processes handle SIGINT/SIGTERM and shut down cleanly.

---
## 📡 API

| Method | Route | Notes |
|--------|-------|-------|
| POST | `/api/execute` | Returns `202` with `{ jobId, status: 'queued' }` |
| GET | `/api/status/:jobId` | Current status; terminal results served from Redis |
| GET | `/api/result/:jobId` | Same payload as status |
| GET | `/health` | `200` when Mongo + Redis are up, `503` otherwise |

### Execution outcomes

A finished job carries an `errorType` so the four cases stay distinct rather
than collapsing into a single `error` bucket:

| `status` | `errorType` | Meaning |
|----------|-------------|---------|
| `completed` | — | Exited 0 |
| `error` | `compile_error` | Compiler exited non-zero (sentinel exit 101) |
| `error` | `runtime_error` | Program exited non-zero (traceback, segfault, `exit(1)`) |
| `error` | `timeout` | Exceeded `EXECUTION_TIMEOUT_MS` |
| `error` | `memory_limit` | Container was OOM-killed at the 64 MB cap |

Results also include `exitCode`, `durationMs`, and `truncated` (set when output
hit `MAX_OUTPUT_BYTES` and the container was stopped early).

---
## 🔌 WebSocket Server

- Attaches to the same HTTP server as the API (`ws://localhost:3000`)
- Send the `jobId` returned by `POST /api/execute` as the first message
- Receives `jobId:<log chunk>` frames while the container runs

---

## 🔐 Security

- Containers run with `NetworkMode: none`, capped CPU/memory
- `CapDrop: ALL`, `no-new-privileges`, `ReadonlyRootfs`
- Source is bind-mounted read-only at `/src`; `/code` is a 64 MB tmpfs, so a
  submission cannot fill the host disk
- Execution timeout, output cap, and a ceiling on simultaneous containers
- Request body capped at 64 KB, per-IP rate limiting, CORS allowlist

> **Note:** there is still no authentication on `/api/execute`. Do not expose
> this to the public internet as-is.

---
## 🧪 Testing

```bash
npm test          # everything (executor tests need Docker + the images built)
npm run test:api  # HTTP-level tests only; no Docker required
```

`tests/api.test.js` runs against Express with SuperTest, an in-memory MongoDB,
and mocked Kafka/Redis. `tests/codeExecutor.test.js` drives real containers.

### Load testing

With the API and worker running:

```bash
npm run loadtest
```

---

## 🧹 Docker Cleanup

- Remove stopped containers:

```bash
docker container prune
docker image prune
```

---















