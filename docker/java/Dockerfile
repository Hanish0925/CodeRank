FROM openjdk:17-alpine

WORKDIR /code

COPY docker/java/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

