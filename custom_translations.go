package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// customTranslationsFileName 是可执行文件同目录下的“自定义翻译”名单文件。
// 每行一条：
//
//	Turbo                 只写英文 → 保留英文，不翻译
//	Turbo = 快速模式       英文 = 中文 → 使用自定义译文
const customTranslationsFileName = "custom-translations.txt"
const trustCustomTranslationsArg = "--trust-custom-translations"

const (
	maxCustomTranslationsSize    = 64 << 10
	maxCustomTranslationsEntries = 2000
	maxCustomTranslationRunes    = 300
)

// customTranslation 是一条自定义规则；Target 为空表示保留英文原文。
type customTranslation struct {
	Source string
	Target string
}

// parseCustomTranslations 解析名单：忽略空行与 # 注释；以第一个 “=” 或全角 “＝” 分隔原文与译文；
// 原文按不区分大小写去重，后出现的规则覆盖先出现的。
func parseCustomTranslations(data []byte) []customTranslation {
	var entries []customTranslation
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
		entries = append(entries, customTranslation{Source: source, Target: target})
	}
	return entries
}

// customTranslationsPrelude 生成注入在汉化脚本之前的名单声明。
// 名单经 JSON 编码，条目只能作为字符串数据出现，无法跳出字面量执行代码；
// 页面端也只把译文写入文本节点或属性，不会当作 HTML 解析。
// 始终输出（即便为空），这样删除名单后重新注入也会清空页面上旧的名单。
func customTranslationsPrelude(entries []customTranslation) string {
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

// readCustomTranslationsFile checks the origin as well as the file type: custom
// labels can change the meaning of authorization and other sensitive controls.
func readCustomTranslationsFile(path string, allowUnverified bool) ([]customTranslation, error) {
	data, info, err := readRegularFile(path, maxCustomTranslationsSize)
	if err != nil {
		return nil, err
	}
	if !allowUnverified {
		if err := verifyCustomTranslationsOwner(info); err != nil {
			return nil, err
		}
		parent, err := os.Stat(filepath.Dir(path))
		if err != nil {
			return nil, err
		}
		if err := verifyCustomTranslationsOwner(parent); err != nil {
			return nil, err
		}
	}
	return parseCustomTranslations(data), nil
}

// LoadCustomTranslations 读取可执行文件同目录下的自定义翻译名单；文件不存在时返回空名单。
func LoadCustomTranslations(allowUnverified bool) []customTranslation {
	exePath, err := os.Executable()
	if err != nil {
		return nil
	}
	path := filepath.Join(filepath.Dir(exePath), customTranslationsFileName)
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
