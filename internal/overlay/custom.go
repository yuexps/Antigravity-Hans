package overlay

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"antigravity-hans/internal/safeio"
)

const (
	// CustomTranslationsFileName 是可执行文件同目录下的自定义翻译名单文件名。
	CustomTranslationsFileName = "custom-translations.txt"
	// TrustCustomTranslationsArg 是显式信任自定义翻译名单的 CLI 参数。
	TrustCustomTranslationsArg = "--trust-custom-translations"

	maxCustomTranslationsSize    = 64 << 10
	maxCustomTranslationsEntries = 2000
	maxCustomTranslationRunes    = 300
)

// CustomTranslation 表示一条自定义翻译规则；Target 为空表示保留英文原文。
type CustomTranslation struct {
	Source string
	Target string
}

// ParseCustomTranslations 解析名单：忽略空行与 # 注释，后出现的同名规则覆盖先出现的。
func ParseCustomTranslations(data []byte) []CustomTranslation {
	var entries []CustomTranslation
	index := make(map[string]int)
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(line, "\uFEFF"))
		if line == "" || strings.HasPrefix(line, "#") || !utf8.ValidString(line) {
			continue
		}
		source, target := line, ""
		if i := strings.IndexAny(line, "=＝"); i >= 0 {
			_, size := utf8.DecodeRuneInString(line[i:])
			source = strings.TrimSpace(line[:i])
			target = strings.TrimSpace(line[i+size:])
		}
		if source == "" || utf8.RuneCountInString(source) > maxCustomTranslationRunes || utf8.RuneCountInString(target) > maxCustomTranslationRunes {
			continue
		}
		key := strings.ToLower(source)
		if i, ok := index[key]; ok {
			entries[i].Target = target
			continue
		}
		if len(entries) >= maxCustomTranslationsEntries {
			continue
		}
		index[key] = len(entries)
		entries = append(entries, CustomTranslation{Source: source, Target: target})
	}
	return entries
}

// CustomTranslationsPrelude 生成注入在汉化脚本之前的 JSON 数据前导声明。
func CustomTranslationsPrelude(entries []CustomTranslation) string {
	pairs := make([][2]string, 0, len(entries))
	for _, entry := range entries {
		pairs = append(pairs, [2]string{entry.Source, entry.Target})
	}
	data, err := json.Marshal(pairs)
	if err != nil {
		data = []byte("[]")
	}
	return "if (typeof window !== 'undefined') window.__antigravityZhCustom = " + string(data) + ";\n"
}

func readCustomTranslationsFile(path string, allowUnverified bool) ([]CustomTranslation, error) {
	data, info, err := safeio.ReadRegularFile(path, maxCustomTranslationsSize)
	if err != nil {
		return nil, err
	}
	if !allowUnverified {
		if err := safeio.VerifyCustomTranslationsOwner(info); err != nil {
			return nil, err
		}
		parent, err := os.Stat(filepath.Dir(path))
		if err != nil {
			return nil, err
		}
		if err := safeio.VerifyCustomTranslationsOwner(parent); err != nil {
			return nil, err
		}
	}
	return ParseCustomTranslations(data), nil
}

// LoadCustomTranslations 读取可执行文件同目录下的自定义翻译名单；文件不存在时返回 nil。
func LoadCustomTranslations(allowUnverified bool) []CustomTranslation {
	exePath, err := os.Executable()
	if err != nil {
		return nil
	}
	path := filepath.Join(filepath.Dir(exePath), CustomTranslationsFileName)
	entries, err := readCustomTranslationsFile(path, allowUnverified)
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			fmt.Printf("[警告] 已忽略自定义翻译名单: %v\n       路径: %s\n", err, path)
		}
		return nil
	}
	keep := 0
	for _, entry := range entries {
		if entry.Target == "" {
			keep++
		}
	}
	if allowUnverified {
		fmt.Println("[警告] 已显式信任自定义翻译名单，请确认其来源可靠。")
	}
	fmt.Printf("[提示] 已加载自定义翻译名单: %d 条（保留英文 %d 条，自定义译文 %d 条）(%s)\n", len(entries), keep, len(entries)-keep, path)
	return entries
}
