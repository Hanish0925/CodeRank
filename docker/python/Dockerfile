FROM python:3.10-alpine

WORKDIR /code

COPY docker/python/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Add essential build dependencies if needed
RUN apk add --no-cache gcc musl-dev libffi-dev

ENTRYPOINT ["/entrypoint.sh"]
