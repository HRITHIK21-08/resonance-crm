"""
Resonance CRM — Error Handling

Custom exception classes and global error handler registration.
Provides consistent JSON error responses across all endpoints.
"""
from flask import jsonify


class AppError(Exception):
    """Base application error."""

    def __init__(self, message, status_code=500, payload=None):
        super().__init__()
        self.message = message
        self.status_code = status_code
        self.payload = payload


class NotFoundError(AppError):
    """Resource not found."""

    def __init__(self, message="Resource not found"):
        super().__init__(message, status_code=404)


class ValidationError(AppError):
    """Request validation failed."""

    def __init__(self, message="Validation error", errors=None):
        super().__init__(message, status_code=400, payload={"errors": errors})


class ConflictError(AppError):
    """Resource conflict (duplicate)."""

    def __init__(self, message="Resource already exists"):
        super().__init__(message, status_code=409)


class AIServiceError(AppError):
    """AI service (Gemini/OpenAI) error."""

    def __init__(self, message="AI service temporarily unavailable"):
        super().__init__(message, status_code=503)


class ChannelServiceError(AppError):
    """Channel service communication error."""

    def __init__(self, message="Channel service unavailable"):
        super().__init__(message, status_code=502)


def register_error_handlers(app):
    """Register global error handlers on the Flask app."""

    @app.errorhandler(AppError)
    def handle_app_error(error):
        response = {
            "error": True,
            "message": error.message,
            "status_code": error.status_code,
        }
        if error.payload:
            response.update(error.payload)
        return jsonify(response), error.status_code

    @app.errorhandler(404)
    def handle_404(error):
        return jsonify({
            "error": True,
            "message": "Endpoint not found",
            "status_code": 404,
        }), 404

    @app.errorhandler(405)
    def handle_405(error):
        return jsonify({
            "error": True,
            "message": "Method not allowed",
            "status_code": 405,
        }), 405

    @app.errorhandler(500)
    def handle_500(error):
        return jsonify({
            "error": True,
            "message": "Internal server error",
            "status_code": 500,
        }), 500
