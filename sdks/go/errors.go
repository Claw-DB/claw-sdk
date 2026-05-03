package clawdb

import (
	"fmt"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ErrorCode identifies the category of a ClawDB error.
type ErrorCode string

const (
	ErrorCodeAuth          ErrorCode = "AUTH_FAILED"
	ErrorCodeAccessDenied  ErrorCode = "ACCESS_DENIED"
	ErrorCodeNotFound      ErrorCode = "NOT_FOUND"
	ErrorCodeRateLimit     ErrorCode = "RATE_LIMITED"
	ErrorCodeUnavailable   ErrorCode = "UNAVAILABLE"
	ErrorCodeTimeout       ErrorCode = "TIMEOUT"
	ErrorCodeValidation    ErrorCode = "INVALID_INPUT"
	ErrorCodeInternal      ErrorCode = "INTERNAL"
)

// ClawDBError is the base error type for the ClawDB Go SDK.
type ClawDBError struct {
	Code       ErrorCode
	Message    string
	Details    interface{}
	RequestID  string
	RetryAfter int // milliseconds; non-zero for rate limit errors
}

func (e *ClawDBError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// IsNotFound returns true if this is a NOT_FOUND error.
func (e *ClawDBError) IsNotFound() bool { return e.Code == ErrorCodeNotFound }

// IsRateLimited returns true if this is a RATE_LIMITED error.
func (e *ClawDBError) IsRateLimited() bool { return e.Code == ErrorCodeRateLimit }

// IsRetriable returns true for transient errors.
func (e *ClawDBError) IsRetriable() bool {
	return e.Code == ErrorCodeUnavailable || e.Code == ErrorCodeRateLimit
}

// FromGRPCError maps a gRPC status error to a ClawDBError.
func FromGRPCError(err error) *ClawDBError {
	if err == nil {
		return nil
	}
	st, ok := status.FromError(err)
	if !ok {
		return &ClawDBError{Code: ErrorCodeInternal, Message: err.Error()}
	}
	msg := st.Message()
	switch st.Code() {
	case codes.Unauthenticated:
		return &ClawDBError{Code: ErrorCodeAuth, Message: msg}
	case codes.PermissionDenied:
		return &ClawDBError{Code: ErrorCodeAccessDenied, Message: msg}
	case codes.NotFound:
		return &ClawDBError{Code: ErrorCodeNotFound, Message: msg}
	case codes.ResourceExhausted:
		return &ClawDBError{Code: ErrorCodeRateLimit, Message: msg, RetryAfter: 1000}
	case codes.Unavailable:
		return &ClawDBError{Code: ErrorCodeUnavailable, Message: msg}
	case codes.DeadlineExceeded:
		return &ClawDBError{Code: ErrorCodeTimeout, Message: msg}
	case codes.InvalidArgument:
		return &ClawDBError{Code: ErrorCodeValidation, Message: msg}
	default:
		return &ClawDBError{Code: ErrorCodeInternal, Message: msg}
	}
}

// FromHTTPResponse maps an HTTP status code to a ClawDBError.
func FromHTTPResponse(statusCode int, body string) *ClawDBError {
	switch statusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return &ClawDBError{Code: ErrorCodeAuth, Message: body}
	case http.StatusNotFound:
		return &ClawDBError{Code: ErrorCodeNotFound, Message: body}
	case http.StatusTooManyRequests:
		return &ClawDBError{Code: ErrorCodeRateLimit, Message: body, RetryAfter: 1000}
	case http.StatusServiceUnavailable:
		return &ClawDBError{Code: ErrorCodeUnavailable, Message: body}
	case http.StatusRequestTimeout, http.StatusGatewayTimeout:
		return &ClawDBError{Code: ErrorCodeTimeout, Message: body}
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		return &ClawDBError{Code: ErrorCodeValidation, Message: body}
	default:
		return &ClawDBError{Code: ErrorCodeInternal, Message: body}
	}
}
