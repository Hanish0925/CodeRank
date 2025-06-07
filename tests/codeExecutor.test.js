const executeCode = require('../services/codeExecutor');

jest.setTimeout(20000); 

describe('executeCode()', () => {
  test('should reject unsupported languages', async () => {
    const result = await executeCode('ruby', 'puts "Hello"');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsupported language/i);
  });

  test('should execute Python code and return output', async () => {
    const result = await executeCode('python', 'print("Hello, Python!")');
    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello, Python!');
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
  const code = `
while True:
    pass
  `.trim();

  const result = await executeCode('python', code);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/time limit/i);
}, 25000);

  test('should handle standard input', async () => {
    const code = `
input_text = input()
print(f"Received: {input_text}")
    `.trim();

    const result = await executeCode('python', code, 'TestInput');
    expect(result.success).toBe(true);
    expect(result.output).toContain('Received: TestInput');
  });

  test('should truncate overly long output', async () => {
    const code = `
for i in range(2000):
    print("X" * 100)
    `.trim();

    const result = await executeCode('python', code);
    expect(result.success).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(10000);
  });
});
