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

Create a `.env` file at the root of your project with the following:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/coderank
REDIS_URL=redis://localhost:6379
KAFKA_BROKER=localhost:9092
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
docker buildx build -t coderank-node -f docker/javascript/Dockerfile .
```


### 5. 🔧 Running the System

- Starts Express API Server

```bash
npm install 
npm start
```

- Start Kafka Worker

```bash
node worker.js
```
---
## 🔌 WebSocket Server

- Listens on ws://localhost:8081
- Send jobId after connection
- Receives real-time logs per job

---

## 🔐 Security

- Containers run in NetworkMode: none, limited CPU/mem
- CapDrop: ALL, no-new-privileges
- Timeout of 10 seconds + output capped

---
## 🧪 Testing

```bash
npm test
```
---

## 🧹 Docker Cleanup

- Remove stopped containers:

```bash
docker container prune
docker image prune
```

---















