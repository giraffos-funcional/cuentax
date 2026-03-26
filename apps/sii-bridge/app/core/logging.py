"""Logging estructurado en JSON para el SII Bridge."""

import logging
import json
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Formatea logs como JSON para facilitar parsing en producción."""
    
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": "sii-bridge",
            "module": record.module,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> None:
    """Configura el logging global del servicio."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    root_logger.handlers = [handler]
    
    # Silenciar loggers ruidosos de librerías
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("zeep").setLevel(logging.WARNING)
