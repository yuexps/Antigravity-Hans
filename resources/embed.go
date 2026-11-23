package resources

import _ "embed"

//go:embed antigravity-hans-overlay.js
var OverlayJS []byte

//go:embed swarm-overlay.js
var SwarmOverlayJS string
