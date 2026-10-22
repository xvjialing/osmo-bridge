package main

import (
	"embed"
	"github.com/wailsapp/wails/v3/pkg/application"
	"log/slog"
	"net/http"
	"os"
	"strings"
)

//go:embed all:frontend/dist
var assets embed.FS

// 开发启动直接运行 Go 二进制，也从内嵌 PNG 设置 macOS Dock 图标。
//
//go:embed build/appicon.png
var applicationIcon []byte

func main() {
	service := NewBridgeService()
	files := application.AssetFileServerFS(assets)
	app := application.New(application.Options{Name: "映桥", Description: "Osmo 相机无线素材导入", Icon: applicationIcon, Logger: service.logs.Slog(), LogLevel: slog.LevelWarn, Services: []application.Service{application.NewService(service)}, Assets: application.AssetOptions{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/camera-thumbnail/") {
			service.serveThumbnail(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})}, Mac: application.MacOptions{ActivationPolicy: application.ActivationPolicyRegular, ApplicationShouldTerminateAfterLastWindowClosed: true}})
	service.app = app
	menu := application.NewMenu()
	for _, role := range []application.Role{application.AppMenu, application.EditMenu, application.WindowMenu} {
		menu.AddRole(role)
	}
	if item := menu.FindByRole(application.EditMenu); item != nil {
		item.SetLabel("编辑")
	}
	if item := menu.FindByRole(application.WindowMenu); item != nil {
		item.SetLabel("窗口")
	}
	app.Menu.SetApplicationMenu(menu)
	app.Window.NewWithOptions(application.WebviewWindowOptions{Title: "映桥 · Osmo Bridge", Width: 1420, Height: 900, MinWidth: 820, MinHeight: 620, URL: "/", BackgroundColour: application.NewRGB(244, 246, 250)})
	if err := app.Run(); err != nil {
		service.logs.Record("error", "app", "app.run_failed", "应用运行失败", map[string]string{"error": err.Error()})
		os.Exit(1)
	}
}
