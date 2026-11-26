package shortcut

import (
	"errors"

	"antigravity-hans/internal/app"
)

// Options 保存快捷方式每次启动时传递给汉化工具的选项。
type Options struct {
	TrustCustomTranslations bool
	WithProxy               bool
}

// Create 创建动态汉化快捷方式。
func Create(cfg app.Config, options Options) error {
	if options.WithProxy && !app.IsWindows {
		return errors.New("自动代理快捷方式仅支持 Windows")
	}
	return create(cfg, options)
}
