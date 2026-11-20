//go:build !windows

package main

import "bufio"

// The optional background-process cleanup is available only on Windows.
func requestBackgroundCleanup(_ AppConfig, _ *bufio.Reader) (bool, error) {
	return false, nil
}

// Without platform support there is nothing to clean up automatically.
func autoTerminateBackgroundProcesses(_ AppConfig) (bool, error) {
	return false, nil
}
