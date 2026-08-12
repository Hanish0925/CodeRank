#!/bin/bash
# /src is the read-only bind mount; /code is a size-limited tmpfs.
cp -r /src/. /code/ 2>/dev/null
cd /code

g++ /code/main.cpp -o /code/a.out
compile_status=$?

# 101 is the agreed sentinel for "compile error" so the executor can tell it
# apart from a runtime failure.
if [ $compile_status -ne 0 ]; then
  echo "Compilation failed"
  exit 101
fi

# exec so the program's exit code becomes the container's exit code.
if [ -f /code/input.txt ]; then
  exec /code/a.out < /code/input.txt
else
  exec /code/a.out
fi
