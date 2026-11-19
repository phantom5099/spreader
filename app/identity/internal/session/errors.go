// Package session 会话域：AT(JWT) 签发与鉴权、RT 族轮换、重放检测与撤销。
package session

import "errors"

// ErrNotFound 会话不存在（非当前令牌）。
var ErrNotFound = notFoundError{}

type notFoundError struct{}

func (notFoundError) Error() string { return "not found" }

// ErrNotFound 判断。
func IsNotFound(err error) bool { return errors.Is(err, ErrNotFound) }

// ETokenInvalidMsg AT 无效/过期（HTTP 401，retryable）。
func ETokenInvalidMsg(msg string) error { return tokenError{msg} }

type tokenError struct{ msg string }

func (e tokenError) Error() string { return e.msg }
