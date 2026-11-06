package org.devsetu.connector;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Private, connector-owned sampling only. The foreground connection remains independent. */
public final class HealthSamplingService extends Service {
    static volatile boolean running;
    static volatile JSONObject latestSystem;
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
    @Override public void onCreate() {
        super.onCreate(); running=true;
        worker.scheduleWithFixedDelay(() -> {
            try { latestSystem=MonitorService.systemSample(this,new PrivateState(this).read()); }
            catch(Exception unavailable) { latestSystem=null; }
        },0,5,TimeUnit.SECONDS);
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId) { return START_NOT_STICKY; }
    @Override public void onDestroy() { running=false;latestSystem=null;worker.shutdownNow();super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
