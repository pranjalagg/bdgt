package io.github.pranjalagg.bdgt;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import io.github.pranjalagg.bdgt.capture.CapturePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in this app are registered before the bridge starts.
        registerPlugin(CapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
