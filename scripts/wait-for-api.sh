#!/bin/sh

MAX_RETRIES=30
RETRY_INTERVAL=2

retries=0
until curl -s http://api:8080/health || [ $retries -eq $MAX_RETRIES ]; do
    echo "Waiting for API (attempt $((retries+1))/$MAX_RETRIES)..."
    retries=$((retries+1))
    sleep $RETRY_INTERVAL

    # run curl for debugging output
    curl -v -k http://api:8080/health || true 
done

if [ $retries -eq $MAX_RETRIES ]; then
    echo "API failed to start within ${MAX_RETRIES} retries"
    exit 1
fi

echo "API is ready!"