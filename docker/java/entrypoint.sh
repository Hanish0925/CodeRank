#!/bin/sh

cd /code

javac Code.java
if [ $? -eq 0 ]; then
  if [ -f /code/input.txt ]; then
    java Code < /code/input.txt
  else
    java Code
  fi
else
  echo "Compilation error"
fi
