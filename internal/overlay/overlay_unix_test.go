//go:build !windows

package overlay

import (
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func TestExternalOverlayRejectsFIFOBeforeRead(t *testing.T) {
	p := filepath.Join(t.TempDir(), ExternalFileName)
	if err := unix.Mkfifo(p, 0600); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() { _, err := readExternalOverlay(p, true); result <- err }()
	select {
	case err := <-result:
		if err == nil {
			t.Fatal("FIFO accepted")
		}
	case <-time.After(time.Second):
		t.Fatal("FIFO blocked startup")
	}
}
