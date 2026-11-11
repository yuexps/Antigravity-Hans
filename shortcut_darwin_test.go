//go:build darwin

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestMacLauncherPreservesUnusualExecutablePath(t *testing.T) {
	dir := t.TempDir()
	selfDir := filepath.Join(dir, "$(touch UNEXPECTED) dollar$ quote'\" line\nbreak")
	if err := os.Mkdir(selfDir, 0700); err != nil {
		t.Fatal(err)
	}
	self := filepath.Join(selfDir, "antigravity-hans")
	if err := os.WriteFile(self, []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$AGY_HANS_TEST_OUTPUT\"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	script := macLauncherScript(self, "--app", false)
	start := strings.Index(script, "\nnohup ")
	if start < 0 {
		t.Fatal("launcher command missing")
	}
	launch := script[start+1:]
	output := filepath.Join(dir, "argv.txt")
	cmd := exec.Command("/bin/bash", "-c", "LOG_FILE="+shellQuote(filepath.Join(dir, "log"))+"\n"+launch+"\nwait")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "AGY_HANS_TEST_OUTPUT="+output)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("launcher failed: %v %s", err, out)
	}
	args, err := os.ReadFile(output)
	if err != nil || string(args) != "--app\n--nogui\n" {
		t.Fatalf("path/args corrupted: %q %v", args, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "UNEXPECTED")); !os.IsNotExist(err) {
		t.Fatal("launcher executed path contents")
	}
}

func TestMacLauncherRequiresExplicitCustomTrust(t *testing.T) {
	if strings.Contains(macLauncherScript("/tmp/launcher", "--app", false), trustCustomTranslationsArg) {
		t.Fatal("unrequested custom trust included in launcher")
	}
	if !strings.Contains(macLauncherScript("/tmp/launcher", "--app", true), trustCustomTranslationsArg) {
		t.Fatal("explicit custom trust missing from launcher")
	}
}
