FROM python:3.12-slim

WORKDIR /app

# Dependencias del sistema (para lxml y cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2-dev libxslt1-dev libssl-dev gcc curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Production: multiple workers so slow SII requests don't block config operations.
# --reload is omitted in production; Coolify handles restarts.
# Workers = 4 gives enough concurrency for parallel SII + config requests.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--timeout-keep-alive", "65"]
