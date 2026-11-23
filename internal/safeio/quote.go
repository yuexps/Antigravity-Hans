package safeio

import "strings"

// ShellQuote 将字符串转换为 POSIX shell 单引号字面量。
func ShellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

// PowerShellQuote 将字符串转换为 PowerShell 单引号字面量（内部单引号翻倍转义）。
func PowerShellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
