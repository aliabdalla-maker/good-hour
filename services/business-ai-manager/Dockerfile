FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY start.sh ./start.sh
RUN useradd --system --uid 10001 app && mkdir -p /data/storage && chown -R app /data && chmod +x start.sh
USER app
ENV ENVIRONMENT=production STORAGE_DIR=/data/storage FORWARDED_ALLOW_IPS=*
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=4)"
CMD ["./start.sh"]
