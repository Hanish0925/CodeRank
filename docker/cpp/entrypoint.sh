#!/bin/bash

# Compile the code
g++ /code/main.cpp -o /code/a.out
compile_status=$?

# If compilation failed, print errors
if [ $compile_status -ne 0 ]; then
  echo "Compilation failed"
  exit $compile_status
fi

# Run the binary
if [ -f /code/input.txt ]; then
  /code/a.out < /code/input.txt
else
  /code/a.out
fi
