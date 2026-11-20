package main

import (
	"errors"
	"testing"
)

func TestQuitOrOfferBackgroundCleanup(t *testing.T) {
	quitFailed := errors.New("quit failed")
	cleanupFailed := errors.New("cleanup failed")
	autoFailed := errors.New("auto cleanup failed")
	for _, tt := range []struct {
		name          string
		interactive   bool
		quitErr       error
		cleanupDone   bool
		cleanupErr    error
		autoDone      bool
		autoErr       error
		wantCalls     int
		wantAutoCalls int
		wantErr       error
	}{
		{"normal quit", true, nil, false, nil, false, nil, 0, 0, nil},
		{"noninteractive auto cleanup completed", false, quitFailed, false, nil, true, nil, 0, 1, nil},
		{"noninteractive auto cleanup unavailable", false, quitFailed, false, nil, false, nil, 0, 1, quitFailed},
		{"noninteractive auto cleanup failed", false, quitFailed, false, nil, false, autoFailed, 0, 1, autoFailed},
		{"user declined", true, quitFailed, false, nil, false, nil, 1, 0, quitFailed},
		{"cleanup failed", true, quitFailed, false, cleanupFailed, false, nil, 1, 0, cleanupFailed},
		{"cleanup completed", true, quitFailed, true, nil, false, nil, 1, 0, nil},
	} {
		t.Run(tt.name, func(t *testing.T) {
			calls, autoCalls := 0, 0
			err := quitOrOfferBackgroundCleanup(tt.interactive, func() error { return tt.quitErr }, func() (bool, error) {
				calls++
				return tt.cleanupDone, tt.cleanupErr
			}, func() (bool, error) {
				autoCalls++
				return tt.autoDone, tt.autoErr
			})
			if calls != tt.wantCalls || autoCalls != tt.wantAutoCalls || !errors.Is(err, tt.wantErr) {
				t.Fatalf("cleanup calls=%d auto calls=%d error=%v; want calls=%d auto calls=%d error=%v",
					calls, autoCalls, err, tt.wantCalls, tt.wantAutoCalls, tt.wantErr)
			}
		})
	}
}
