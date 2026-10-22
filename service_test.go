package main

import (
	"encoding/json"
	"os"
	"osmobridge/internal/diagnostics"
	"path/filepath"
	"testing"
)

func TestLogServiceSettingsAndClearDoNotTouchTasks(t *testing.T) {
	root := t.TempDir()
	t.Setenv("OSMO_BRIDGE_DATA", root)
	s := NewBridgeService()
	s.state.Tasks = []Task{{ID: "keep", Status: "completed"}}
	if err := s.SaveLogSettings(diagnostics.Settings{RetentionDays: 14, Level: "debug"}); err != nil {
		t.Fatal(err)
	}
	if s.GetLogInfo().Settings.RetentionDays != 14 {
		t.Fatal("日志设置未保存")
	}
	s.logs.RegisterSecrets("hidden-wifi-name")
	s.logs.Record("error", "wifi", "wifi.failed", "hidden-wifi-name 连接失败", nil)
	p, err := s.ReadLogs(diagnostics.Query{Level: "error", Limit: 10})
	if err != nil || len(p.Entries) != 1 {
		t.Fatal(p, err)
	}
	if _, err = s.CleanLogs(true); err != nil {
		t.Fatal(err)
	}
	if len(s.GetState().Tasks) != 1 || s.GetState().Tasks[0].ID != "keep" {
		t.Fatal("清理日志影响了下载记录")
	}
	p, err = s.ReadLogs(diagnostics.Query{})
	if err != nil || len(p.Entries) != 1 || p.Entries[0].Event != "logs.cleaned" {
		t.Fatal(p, err)
	}
}

func TestRestartPausesInterruptedTransfers(t *testing.T) {
	root := t.TempDir()
	t.Setenv("OSMO_BRIDGE_DATA", root)
	c := config{Identity: "0123456789abcdef0123456789abcdef", Destination: root, Tasks: []Task{{ID: "one", Status: "downloading"}, {ID: "two", Status: "queued"}, {ID: "three", Status: "completed"}}}
	b, _ := json.Marshal(c)
	if e := os.WriteFile(filepath.Join(root, "settings.json"), b, 0600); e != nil {
		t.Fatal(e)
	}
	s := NewBridgeService()
	state := s.GetState()
	if state.Tasks[0].Status != "paused" || state.Tasks[1].Status != "paused" || state.Tasks[2].Status != "completed" {
		t.Fatal(state.Tasks)
	}
	state.Tasks[0].Status = "changed"
	if s.GetState().Tasks[0].Status != "paused" {
		t.Fatal("状态快照共享可变切片")
	}
	if e := s.Enqueue([]string{"unknown"}); e == nil {
		t.Fatal("未连接设备时不应排队下载")
	}
}
