//go:build !windows

package process

import (
	"os"
	"path/filepath"
	"testing"

	"antigravity-hans/internal/app"
)

func TestMonitorLockRejectsHardlinkedOrWritableState(t *testing.T) {
	monitorStateDirOverride = t.TempDir()
	defer func() { monitorStateDirOverride = "" }()
	cfg := app.DefaultNormal()
	victim := filepath.Join(t.TempDir(), "victim")
	if err := os.WriteFile(victim, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	lock := monitorLockPath(cfg)
	if err := os.Link(victim, lock); err != nil {
		t.Fatal(err)
	}
	if release, ok := AcquireMonitorLock(cfg); ok {
		release()
		t.Fatal("hardlinked PID file accepted")
	}
	data, _ := os.ReadFile(victim)
	if string(data) != "original" {
		t.Fatal("hardlinked file overwritten")
	}
	if err := os.Remove(lock); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(lock, []byte("0"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(lock, 0666); err != nil {
		t.Fatal(err)
	}
	if release, ok := AcquireMonitorLock(cfg); ok {
		release()
		t.Fatal("writable PID file accepted")
	}
}
