"""
Resonance CRM — App Factory Module

Initializes the Flask application, database configurations, CORS policies,
and registers blueprints and error handling logic.
"""
import os
from flask import Flask
from app.config import config_by_name
from app.extensions import db, migrate, cors
from app.utils import register_error_handlers


def create_app(config_name=None):
    """
    Application factory for the Resonance CRM Service.
    """
    if not config_name:
        config_name = os.getenv("FLASK_ENV", "development").lower()

    app = Flask(__name__)
    app.config.from_object(config_by_name.get(config_name, config_by_name["development"]))

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # Configure CORS
    cors_origins = app.config.get("CORS_ORIGINS", ["*"])
    cors.init_app(
        app,
        resources={r"/api/*": {
            "origins": cors_origins,
            "allow_headers": ["Content-Type", "x-gemini-key", "x-openai-key", "Authorization"]
        }},
        supports_credentials=True,
    )

    # Register blueprints
    from app.routes import api_bp
    app.register_blueprint(api_bp, url_prefix="/api")

    # Base URL welcome endpoint
    @app.route("/")
    def root():
        return {
            "name": "Resonance CRM API Service",
            "version": "1.0.0",
            "status": "active",
            "health_check": "/api/health"
        }

    # Register global error handlers
    register_error_handlers(app)

    # Create tables automatically for zero-setup execution
    with app.app_context():
        try:
            db.create_all()
            app.logger.info("Database tables initialized successfully.")
        except Exception as e:
            app.logger.error(f"Failed to auto-create database tables: {e}")

    return app
