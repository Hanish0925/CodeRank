#!/bin/sh
# /src is the read-only bind mount; /code is a size-limited tmpfs.
cp -r /src/. /code/ 2>/dev/null
cd /code

# exec so the program's exit code becomes the container's exit code.
if [ -f /code/input.txt ]; then
  exec node /code/code.js < /code/input.txt
else
  exec node /code/code.js
fi
