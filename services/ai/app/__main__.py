"""Entry point for running the LAYERS AI Service with ``python -m app``."""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8123)
