#import <Foundation/Foundation.h>
#import <CoreWLAN/CoreWLAN.h>
#include <string.h>

char *ob_wifi_ssid(void) {
    @autoreleasepool {
        NSString *ssid = [[[CWWiFiClient sharedWiFiClient] interface] ssid];
        return ssid ? strdup([ssid UTF8String]) : NULL;
    }
}

char *ob_wifi_join(const char *name, const char *password) {
    @autoreleasepool {
        CWInterface *interface = [[CWWiFiClient sharedWiFiClient] interface];
        if (!interface) return strdup("没有可用的 Wi-Fi 网卡");
        NSString *ssid = [NSString stringWithUTF8String:name];
        NSError *error = nil;
        NSSet<CWNetwork *> *networks = [interface scanForNetworksWithSSID:[ssid dataUsingEncoding:NSUTF8StringEncoding] error:&error];
        CWNetwork *network = [networks anyObject];
        if (!network) return strdup("未找到相机热点，请稍后重试；也可从 macOS Wi-Fi 菜单手动加入，再选择已连接热点");
        BOOL ok = [interface associateToNetwork:network password:[NSString stringWithUTF8String:password] error:&error];
        if (!ok) return strdup("无法自动加入相机热点，请在 macOS Wi-Fi 菜单手动连接");
        return NULL;
    }
}
