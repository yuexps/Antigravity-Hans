//go:build !windows

package app

// GetPathsFromRegistry 在非 Windows 平台返回空列表。
func GetPathsFromRegistry(_, _ string) []string {
	return []string{}
}
