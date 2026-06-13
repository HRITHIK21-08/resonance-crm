"""
Resonance CRM — WSGI Entrypoint

This script acts as the entrypoint for WSGI servers like Gunicorn or running
the server locally using the Flask development server.
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from app import create_app

# Create Flask app instance
app = create_app(os.getenv("FLASK_ENV", "development"))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
