package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

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
