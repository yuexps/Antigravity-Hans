package main

import (
	_ "embed"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

//go:embed swarm-overlay.js
var embeddedSwarmOverlayJS string

// A negative value distinguishes the Swarm plugin frame from an IDE agent port.
const swarmFrame = -1

var swarmBoardHost = regexp.MustCompile(`^swarm--swarm_board-[a-z0-9]{5}$`)

// Only the observed built-in Swarm board authority is eligible. Queries can
// contain session data, so they are neither logged nor copied into scripts.
func isSwarmBoardTarget(target CDPTarget) bool {
	if target.Type != "iframe" {
		return false
	}
	u, err := url.Parse(target.URL)
	if err != nil || u.Scheme != "plugin" || u.User != nil || u.Port() != "" ||
		(u.Path != "" && u.Path != "/") || u.RawPath != "" || u.Fragment != "" {
		return false
	}
	return swarmBoardHost.MatchString(strings.ToLower(u.Hostname()))
}

// The frame can navigate after discovery. Recheck its exact authority and
// fixed document markers at execution time, and do not persist the script.
func swarmBoardInjectionSource(source, host string) string {
	return "(() => { if (location.protocol !== 'plugin:' || location.hostname !== " + strconv.Quote(host) +
		" || (location.pathname !== '/' && location.pathname !== '') || " +
		"!document.querySelector('[data-testid=\"swarm-tabs\"]') || " +
		"!document.querySelector('[data-testid=\"swarm-empty-state\"]')) return;\n" +
		strings.TrimSpace(source) + "\n})()"
}

func swarmBoardHostForTarget(target CDPTarget) (string, error) {
	if !isSwarmBoardTarget(target) {
		return "", fmt.Errorf("Swarm 面板地址校验失败")
	}
	u, _ := url.Parse(target.URL)
	return u.Hostname(), nil
}
