package com.japanflow.mobile;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(JapanFlowUpdaterPlugin.class);
        registerPlugin(JapanFlowNativeGpsPlugin.class);
        registerPlugin(JapanFlowOtaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
