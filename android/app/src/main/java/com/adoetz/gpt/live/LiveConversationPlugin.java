package com.adoetz.gpt.live;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LiveConversationService")
public class LiveConversationPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        Context context = getContext();
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Microphone permission is required before starting live conversation.");
            return;
        }

        Intent intent = new Intent(context, LiveConversationService.class);
        intent.setAction(LiveConversationService.ACTION_START);
        ContextCompat.startForegroundService(context, intent);
        call.resolve(statusPayload(true));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, LiveConversationService.class);
        intent.setAction(LiveConversationService.ACTION_STOP);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startService(intent);
        } else {
            context.stopService(intent);
        }

        call.resolve(statusPayload(false));
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusPayload(LiveConversationService.isActive()));
    }

    private JSObject statusPayload(boolean active) {
        JSObject result = new JSObject();
        result.put("active", active);
        return result;
    }
}
