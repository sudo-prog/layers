"""Pytest configuration for LAYERS AI service tests."""
import os

# Set the AI token before any app imports so the auth middleware picks it up.
os.environ.setdefault("LAYERS_AI_TOKEN", "dev-token")
