const { v4: uuid } = require('uuid');
const fs = require('fs/promises');
const path = require('path');
const Docker = require('dockerode');
const { getSocketForJob } = require('../wsServer');

const docker = new Docker();
const EXECUTION_TIMEOUT_MS = 10000;
const MAX_LOG_SIZE = 10000; // Limit output to 10 KB

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

const executeCode = async (language, code, input = '') => {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    return { success: false, error: `Unsupported language: ${language}` };
  }

  const jobId = uuid();
  const tempDir = path.resolve(__dirname, '..', '..', 'temp', jobId);
  const codeFileName = config.filename || `code.${config.extension}`;
  const codeFilePath = path.join(tempDir, codeFileName);
  const inputFilePath = path.join(tempDir, 'input.txt');

  let container;

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(codeFilePath, code);
    if (input) await fs.writeFile(inputFilePath, input);

    container = await docker.createContainer({
      Image: config.image,
      Cmd: [],
      HostConfig: {
        AutoRemove: true,
        NetworkMode: 'none',
        Binds: [`${tempDir}:/code`],
        Memory: 64 * 1024 * 1024,       // 64MB
        NanoCPUs: 500000000,            // 0.5 CPU
        PidsLimit: 50,
        CapDrop: ['ALL'],               // Drop all Linux capabilities
        SecurityOpt: ['no-new-privileges'] // Prevent privilege escalation
      }
    });

    await container.start();

    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true
    });

    let output = '';
    logStream.on('data', chunk => {
      const log = chunk.slice(8).toString();

      // Cap total output to MAX_LOG_SIZE
      if (output.length + log.length <= MAX_LOG_SIZE) {
        output += log;

        const ws = getSocketForJob(jobId);
        if (ws && ws.readyState === ws.OPEN) {
          ws.send(`${jobId}:${log}`);
        }
      }
    });

    await Promise.race([
      new Promise((resolve, reject) => {
        logStream.on('end', resolve);
        logStream.on('error', reject);
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Execution timed out')), EXECUTION_TIMEOUT_MS)
      )
    ]);

    await fs.rm(tempDir, { recursive: true, force: true });

    return { success: true, output: output.trim() };

  } catch (err) {
    if (container) {
      try {
        await container.stop();
      } catch (_) {}
    }

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    const message = err.message === 'Execution timed out'
      ? 'Code execution exceeded the time limit (10 seconds).'
      : `Execution failed: ${err.message}`;

    return { success: false, error: message };
  }
};

module.exports = executeCode;
