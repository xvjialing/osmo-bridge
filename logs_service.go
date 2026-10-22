package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"osmobridge/internal/diagnostics"
)

func (s *BridgeService) GetLogInfo() diagnostics.Info { return s.logs.Info() }
func (s *BridgeService) ReadLogs(q diagnostics.Query) (diagnostics.Page, error) {
	return s.logs.Read(q)
}
func (s *BridgeService) SaveLogSettings(settings diagnostics.Settings) error {
	if err := s.logs.SaveSettings(settings); err != nil {
		return err
	}
	s.logs.Record("info", "app", "logs.settings_changed", "日志设置已保存", map[string]string{"retention_days": fmt.Sprint(settings.RetentionDays), "level": settings.Level})
	return nil
}
func (s *BridgeService) CleanLogs(all bool) (diagnostics.Cleanup, error) {
	result, err := s.logs.Clean(all)
	if err != nil {
		return result, err
	}
	s.logs.Record("info", "app", "logs.cleaned", "日志清理完成", map[string]string{"all": fmt.Sprint(all), "files": fmt.Sprint(result.Files), "bytes": fmt.Sprint(result.Bytes)})
	return result, nil
}
func (s *BridgeService) OpenLogDirectory() error {
	dir := s.logs.Info().Directory
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	return exec.Command("/usr/bin/open", dir).Run()
}

// 用户选择目录后创建唯一文件，避免覆盖已有诊断包；失败时移除不完整导出。
func (s *BridgeService) ExportLogs() (string, error) {
	if s.app == nil {
		return "", errors.New("请从桌面应用导出诊断包")
	}
	dir, err := s.app.Dialog.OpenFile().SetTitle("选择诊断包保存目录").SetMessage("导出保留期内全部日志和版本信息，不包含素材文件；不会自动上传。").CanChooseFiles(false).CanChooseDirectories(true).CanCreateDirectories(true).PromptForSingleSelection()
	if err != nil || dir == "" {
		return "", err
	}
	f, err := os.CreateTemp(dir, "映桥诊断-"+time.Now().Format("20060102-150405")+"-*.zip")
	if err != nil {
		return "", err
	}
	name := f.Name()
	success := false
	defer func() {
		f.Close()
		if !success {
			os.Remove(name)
		}
	}()
	if err = s.logs.Export(f); err != nil {
		return "", err
	}
	if err = f.Sync(); err != nil {
		return "", err
	}
	if err = f.Close(); err != nil {
		return "", err
	}
	success = true
	s.logs.Record("info", "app", "logs.exported", "诊断包已保存到用户选择的目录", nil)
	return filepath.Clean(name), nil
}
