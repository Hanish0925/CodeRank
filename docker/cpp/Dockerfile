FROM gcc:13.2.0

WORKDIR /code

COPY docker/cpp/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

