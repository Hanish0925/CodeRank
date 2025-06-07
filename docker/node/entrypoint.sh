#!/bin/sh

if [ -f /code/input.txt ]; then
  node /code/code.js < /code/input.txt
else
  node /code/code.js
fi
