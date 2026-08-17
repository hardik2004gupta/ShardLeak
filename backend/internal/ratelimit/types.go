package ratelimit

import "time"

type Algorithm string

const (
	TokenBucket Algorithm = "token_bucket"
	FixedWindow Algorithm = "fixed_window"
)

type Request struct {
	Identifier    string
	Limit         int
	WindowSeconds int
	Algorithm     Algorithm
}

type Result struct {
	Allowed    bool
	Remaining  int
	Limit      int
	ResetAt    time.Time
	RetryAfter int // seconds until next allowed request; 0 when allowed
}
