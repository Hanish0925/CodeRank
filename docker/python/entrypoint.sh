#!/bin/sh
if [ -f /code/input.txt ]; then
  python3 /code/code.py < /code/input.txt
else
  python3 /code/code.py
fi
