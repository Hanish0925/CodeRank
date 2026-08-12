#!/bin/sh
# /src is the read-only bind mount; /code is a size-limited tmpfs.
cp -r /src/. /code/ 2>/dev/null
cd /code

javac Code.java
compile_status=$?

# 101 is the agreed sentinel for "compile error" so the executor can tell it
# apart from a runtime failure. Previously this branch fell through with exit 0.
if [ $compile_status -ne 0 ]; then
  echo "Compilation error"
  exit 101
fi

# exec so the program's exit code becomes the container's exit code.
if [ -f /code/input.txt ]; then
  exec java Code < /code/input.txt
else
  exec java Code
fi
