"""
Resonance CRM — Flask Extensions

Centralized extension initialization to avoid circular imports.
Extensions are created here and initialized with the app in the factory.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS

# Database ORM
db = SQLAlchemy()

# Database migrations
migrate = Migrate()

# Cross-Origin Resource Sharing
cors = CORS()
