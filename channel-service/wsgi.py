"""
WSGI Entry Point for the Channel Service.

This module creates the Flask application instance via the app factory
and exposes it as `app` for gunicorn / any WSGI server.

Usage:
    gunicorn wsgi:app --bind 0.0.0.0:5001
    python wsgi.py  (development only)
"""

from app import create_app

app = create_app()

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
