package com.adoetz.gpt;

import android.os.Bundle;

import com.adoetz.gpt.live.LiveConversationPlugin;
import com.adoetz.gpt.sync.NativePostgresSyncPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LiveConversationPlugin.class);
        registerPlugin(NativePostgresSyncPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
