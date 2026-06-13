"""
Resonance CRM — Configuration Module

Environment-based configuration with sensible defaults for development.
Production values are injected via Railway environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration."""

    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "resonance-dev-secret-change-in-prod")
    DEBUG = False
    TESTING = False

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://localhost:5432/resonance"
    )
    # Fix Railway/Heroku postgres:// → postgresql:// scheme
    if SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace(
            "postgres://", "postgresql://", 1
        )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 10,
        "pool_recycle": 300,
        "pool_pre_ping": True,
        "max_overflow": 20,
    }

    # CORS
    CORS_ORIGINS = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")

    # Channel Service
    CHANNEL_SERVICE_URL = os.getenv(
        "CHANNEL_SERVICE_URL",
        "http://localhost:5001"
    )

    # AI Configuration
    AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini")  # "gemini" or "openai"
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    AI_MODEL = os.getenv("AI_MODEL", "gemini-2.0-flash")

    # Campaign defaults
    CAMPAIGN_BATCH_SIZE = int(os.getenv("CAMPAIGN_BATCH_SIZE", "50"))
    CALLBACK_RETRY_MAX = int(os.getenv("CALLBACK_RETRY_MAX", "3"))


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 20,
        "pool_recycle": 300,
        "pool_pre_ping": True,
        "max_overflow": 40,
    }


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}
