const { v4: uuid } = require('uuid');
const fs = require('fs/promises');
const path = require('path');
const Docker = require('dockerode');
const { getSocketForJob } = require('../wsServer');
const Semaphore = require('./semaphore');

const docker = new Docker();

const EXECUTION_TIMEOUT_MS = Number(process.env.EXECUTION_TIMEOUT_MS) || 10000;
const MAX_OUTPUT_BYTES = Number(process.env.MAX_OUTPUT_BYTES) || 10000;
const MAX_CONCURRENT_CONTAINERS = Number(process.env.MAX_CONCURRENT_CONTAINERS) || 4;

// Entrypoints exit with this code when compilation fails, which is what lets us
// tell a compile error apart from a runtime error.
const COMPILE_ERROR_EXIT_CODE = 101;

// Grace period for the log stream to flush after the container exits.
const LOG_FLUSH_MS = 500;

const slots = new Semaphore(MAX_CONCURRENT_CONTAINERS);

const LANGUAGE_CONFIG = {
  python: {
    image: 'coderank-python',
    extension: 'py',
  },
  cpp: {
    image: 'coderank-cpp',
    extension: 'cpp',
    filename: 'main.cpp',
  },
  javascript: {
    image: 'coderank-node',
    extension: 'js',
  },
  java: {
    image: 'coderank-java',
    extension: 'java',
    filename: 'Code.java',
  }
};

/**
 * Runs a submission in a throwaway container.
 *
 * @param {string} language
 * @param {string} code
 * @param {string} input
 * @param {string} jobId  Mongo job id. Must be the same id the client registered
 *                        its WebSocket under, or live log streaming silently no-ops.
 */
const executeCode = async (language, code, input = '', jobId = uuid()) => {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    return {
      success: false,
      errorType: 'unsupported_language',
      error: `Unsupported language: ${language}`
    };
  }

  return slots.run(() => runInContainer(config, code, input, jobId));
};

const runInContainer = async (config, code, input, jobId) => {
  const tempDir = path.resolve(__dirname, '..', 'temp', jobId);
  const codeFileName = config.filename || `code.${config.extension}`;
  const codeFilePath = path.join(tempDir, codeFileName);
  const inputFilePath = path.join(tempDir, 'input.txt');

  const startedAt = Date.now();
  let container;
  let output = '';
  let truncated = false;
  let timedOut = false;

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(codeFilePath, code);
    if (input) await fs.writeFile(inputFilePath, input);

    container = await docker.createContainer({
      Image: config.image,
      Cmd: [],
      HostConfig: {
        // Left false so container.wait()/inspect() can read the exit status
        // before the container disappears. Removal happens in the finally block.
        AutoRemove: false,
        NetworkMode: 'none',
        // Source is mounted read-only; the entrypoint copies it into the
        // size-limited tmpfs at /code so submissions can't fill the host disk.
        Binds: [`${tempDir}:/src:ro`],
        ReadonlyRootfs: true,
        Tmpfs: {
          '/code': 'rw,nosuid,size=64m',
          '/tmp': 'rw,nosuid,noexec,size=16m'
        },
        Memory: 64 * 1024 * 1024,       // 64MB
        MemorySwap: 64 * 1024 * 1024,   // no swap, so OOM actually triggers
        NanoCPUs: 500000000,            // 0.5 CPU
        PidsLimit: 50,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges']
      }
    });

    await container.start();

    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true
    });

    const streamEnded = new Promise(resolve => {
      logStream.on('end', resolve);
      logStream.on('close', resolve);
      logStream.on('error', resolve);
    });

    logStream.on('data', chunk => {
      if (truncated) return;

      const log = chunk.slice(8).toString();
      const remaining = MAX_OUTPUT_BYTES - output.length;

      if (log.length > remaining) {
        // Hit the cap. Keep what fits, then stop the container instead of
        // letting it burn the rest of its timeout producing discarded output.
        output += log.slice(0, remaining);
        truncated = true;
        sendToSocket(jobId, log.slice(0, remaining));
        container.kill().catch(() => {});
        return;
      }

      output += log;
      sendToSocket(jobId, log);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      container.kill().catch(() => {});
    }, EXECUTION_TIMEOUT_MS);

    let statusCode;
    try {
      const waitResult = await container.wait();
      statusCode = waitResult.StatusCode;
    } finally {
      clearTimeout(timer);
    }

    // Let the remaining buffered logs land before we read `output`.
    await Promise.race([
      streamEnded,
      new Promise(resolve => setTimeout(resolve, LOG_FLUSH_MS))
    ]);

    let oomKilled = false;
    try {
      const info = await container.inspect();
      oomKilled = Boolean(info.State && info.State.OOMKilled);
    } catch (_) {
      // Container already gone; fall back to the exit code alone.
    }

    const durationMs = Date.now() - startedAt;
    const trimmed = output.trim();

    if (timedOut) {
      return {
        success: false,
        errorType: 'timeout',
        error: `Code execution exceeded the time limit (${EXECUTION_TIMEOUT_MS / 1000} seconds).`,
        output: trimmed,
        exitCode: statusCode,
        truncated,
        durationMs
      };
    }

    if (oomKilled) {
      return {
        success: false,
        errorType: 'memory_limit',
        error: 'Code execution exceeded the memory limit (64 MB).',
        output: trimmed,
        exitCode: statusCode,
        truncated,
        durationMs
      };
    }

    // We killed it ourselves at the output cap, so its exit code is our SIGKILL
    // (137), not the program's. Don't misreport that as a runtime error.
    if (truncated) {
      return {
        success: true,
        output: trimmed,
        exitCode: null,
        truncated: true,
        durationMs
      };
    }

    if (statusCode === COMPILE_ERROR_EXIT_CODE) {
      return {
        success: false,
        errorType: 'compile_error',
        error: trimmed || 'Compilation failed.',
        output: trimmed,
        exitCode: statusCode,
        truncated,
        durationMs
      };
    }

    if (statusCode !== 0) {
      return {
        success: false,
        errorType: 'runtime_error',
        error: trimmed || `Process exited with code ${statusCode}.`,
        output: trimmed,
        exitCode: statusCode,
        truncated,
        durationMs
      };
    }

    return {
      success: true,
      output: trimmed,
      exitCode: 0,
      truncated,
      durationMs
    };

  } catch (err) {
    return {
      success: false,
      errorType: 'internal',
      error: `Execution failed: ${err.message}`,
      output: output.trim(),
      truncated,
      durationMs: Date.now() - startedAt
    };

  } finally {
    if (container) {
      await container.remove({ force: true }).catch(() => {});
    }
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

function sendToSocket(jobId, log) {
  const ws = getSocketForJob(jobId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(`${jobId}:${log}`);
  }
}

module.exports = executeCode;
module.exports.COMPILE_ERROR_EXIT_CODE = COMPILE_ERROR_EXIT_CODE;
