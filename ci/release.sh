#!/bin/bash

# Check if version argument is provided
if [ -z "$1" ]; then
  echo "Error: Version argument is missing."
  exit 1
fi

# Read the version argument
version="$1"

# Extract prerelease version if it contains "-dev"
if [[ "$version" == *"-dev"* ]]; then
  echo "$version" > /tmp/pre-release.version
else
  echo "$version" > /tmp/pre-release.version
fi
