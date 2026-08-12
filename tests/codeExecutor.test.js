/**
 * Executor tests. These require a running Docker daemon and the four
 * coderank-* images to be built (see README).
 */
const executeCode = require('../services/codeExecutor');

jest.setTimeout(40000);

describe('executeCode()', () => {
  test('should reject unsupported languages', async () => {
    const result = await executeCode('ruby', 'puts "Hello"');
    expect(result.success).toBe(false);
    expect(result.errorType).toBe('unsupported_language');
    expect(result.error).toMatch(/Unsupported language/i);
  });

  test('should execute Python code and return output', async () => {
    const result = await executeCode('python', 'print("Hello, Python!")');
    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello, Python!');
    expect(result.exitCode).toBe(0);
  });

  test('should execute JavaScript code and return output', async () => {
    const result = await executeCode('javascript', 'console.log("Hello JS")');
    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello JS');
  });

  test('should execute Java code and return output', async () => {
    const code = `
public class Code {
  public static void main(String[] args) {
    System.out.println("Hello Java");
  }
}
    `.trim();

    const result = await executeCode('java', code);
    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello Java');
  });

  test('should execute C++ code and return output', async () => {
    const code = `
#include <iostream>
int main() {
  std::cout << "Hello C++" << std::endl;
  return 0;
}
    `.trim();

    const result = await executeCode('cpp', code);
    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello C++');
  });

  test('should timeout long-running code', async () => {
    const result = await executeCode('python', 'while True:\n    pass');
    expect(result.success).toBe(false);
    expect(result.errorType).toBe('timeout');
    expect(result.error).toMatch(/time limit/i);
  });

  test('should handle standard input', async () => {
    const code = 'input_text = input()\nprint(f"Received: {input_text}")';
    const result = await executeCode('python', code, 'TestInput');
    expect(result.success).toBe(true);
    expect(result.output).toContain('Received: TestInput');
  });

  test('should truncate overly long output and say so', async () => {
    const code = 'for i in range(200000):\n    print("X" * 100)';
    const result = await executeCode('python', code);

    expect(result.output.length).toBeLessThanOrEqual(10000);
    // The old behaviour discarded the overflow silently and let the container
    // run out its full timeout.
    expect(result.truncated).toBe(true);
  });

  // --- Outcomes the old implementation reported as success -------------------

  describe('non-zero exit codes', () => {
    test('a Python traceback is a runtime error, not a success', async () => {
      const result = await executeCode('python', 'raise ValueError("boom")');
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('runtime_error');
      expect(result.exitCode).not.toBe(0);
      expect(result.error).toMatch(/boom/);
    });

    test('an explicit non-zero exit is a runtime error', async () => {
      const result = await executeCode('javascript', 'process.exit(3)');
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('runtime_error');
      expect(result.exitCode).toBe(3);
    });

    test('a C++ segfault is a runtime error', async () => {
      const code = `
int main() {
  int *p = 0;
  *p = 1;
  return 0;
}
      `.trim();

      const result = await executeCode('cpp', code);
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('runtime_error');
    });
  });

  describe('compile errors', () => {
    test('a Java compile error fails the job', async () => {
      const code = `
public class Code {
  public static void main(String[] args) {
    this is not java
  }
}
      `.trim();

      const result = await executeCode('java', code);
      // The Java entrypoint used to echo "Compilation error" and exit 0.
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('compile_error');
    });

    test('a C++ compile error fails the job', async () => {
      const result = await executeCode('cpp', 'int main() { return notdeclared; }');
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('compile_error');
    });
  });

  describe('memory limit', () => {
    test('exceeding the memory cap is reported as memory_limit, not a crash', async () => {
      // Allocate well past the 64MB container limit.
      const code = 'x = bytearray(400 * 1024 * 1024)\nprint(len(x))';
      const result = await executeCode('python', code);

      expect(result.success).toBe(false);
      expect(['memory_limit', 'runtime_error']).toContain(result.errorType);
    });
  });

  test('reports an execution duration', async () => {
    const result = await executeCode('python', 'print("timing")');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThan(0);
  });
});
