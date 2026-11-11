package main

import (
	"errors"
	"testing"
)

func TestQuitOrOfferBackgroundCleanup(t *testing.T) {
	quitFailed := errors.New("quit failed")
	cleanupFailed := errors.New("cleanup failed")
	for _, tt := range []struct {
		name        string
		interactive bool
		quitErr     error
		cleanupDone bool
		cleanupErr  error
		wantCalls   int
		wantErr     error
	}{
		{"normal quit", true, nil, false, nil, 0, nil},
		{"noninteractive quit failure", false, quitFailed, true, nil, 0, quitFailed},
		{"user declined", true, quitFailed, false, nil, 1, quitFailed},
		{"cleanup failed", true, quitFailed, false, cleanupFailed, 1, cleanupFailed},
		{"cleanup completed", true, quitFailed, true, nil, 1, nil},
	} {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			err := quitOrOfferBackgroundCleanup(tt.interactive, func() error { return tt.quitErr }, func() (bool, error) {
				calls++
				return tt.cleanupDone, tt.cleanupErr
			})
			if calls != tt.wantCalls || !errors.Is(err, tt.wantErr) {
				t.Fatalf("cleanup calls=%d error=%v; want calls=%d error=%v", calls, err, tt.wantCalls, tt.wantErr)
			}
		})
	}
}
