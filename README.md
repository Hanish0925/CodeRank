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
