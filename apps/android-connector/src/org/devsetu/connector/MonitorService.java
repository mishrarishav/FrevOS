package org.devsetu.connector;

import android.app.*;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.*;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;
import org.json.*;

public final class MonitorService extends Service {
    private static final String CHANNEL="devsetu-monitoring";
    private static final int ID=28101;
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
    private final String bootId=UUID.randomUUID().toString();
    private PrivateState state;
    private LoginProofServer proof;
    private volatile boolean stopping;
    private int retrySeconds=5;

    @Override public void onCreate() {
        super.onCreate(); state=new PrivateState(this);
        NotificationManager manager=getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL,"DevSetu monitoring",NotificationManager.IMPORTANCE_LOW));
        if (Build.VERSION.SDK_INT>=34) startForeground(ID,notification("Starting monitoring"),ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(ID,notification("Starting monitoring"));
        worker.execute(() -> {
            try {
                JSONObject saved=state.read();
                if (!saved.optBoolean("paired")) throw new Exception("Complete approved pairing before starting monitoring.");
                ConnectorApi api=new ConnectorApi(saved.getString("server"),saved.optBoolean("internalHttp"));
                proof=new LoginProofServer(api,saved.getString("credential")); proof.start();
                tick();
            } catch(Exception error) { status("Monitoring could not start. Open DevSetu Connector and check its pairing."); stopSelf(); }
        });
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if (intent!=null && "stop".equals(intent.getAction())) { stopping=true; status("Monitoring stopped by you."); stopSelf(); return START_NOT_STICKY; }
        return START_STICKY;
    }
    private Notification notification(String message) {
        Intent open=new Intent(this,MainActivity.class);
        PendingIntent activity=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,MonitorService.class).setAction("stop"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,CHANNEL).setContentTitle("DevSetu system monitoring").setContentText(message)
                .setSmallIcon(android.R.drawable.ic_menu_info_details).setContentIntent(activity).setOngoing(true)
                .addAction(new Notification.Action.Builder(null,"Stop",stop).build()).build();
    }
    private void status(String message) {
        getSharedPreferences("monitor-status",MODE_PRIVATE).edit().putString("message",message).apply();
        if (!stopping) getSystemService(NotificationManager.class).notify(ID,notification(message));
    }
    private void tick() {
        if (stopping) return;
        try {
            if (!getSystemService(NotificationManager.class).areNotificationsEnabled()) { status("Notifications disabled. Open the app to review monitoring."); stopSelf(); return; }
            JSONObject saved=state.read();
            ConnectorApi api=new ConnectorApi(saved.getString("server"),saved.optBoolean("internalHttp"));
            String credential=saved.getString("credential");
            api.post("/v1/connector/heartbeat",new JSONObject().put("loginProofPort",proof.port()),credential);
            JSONObject policy=api.post("/v1/connector/discovery/policy",new JSONObject(),credential);
            JSONObject accepted=api.post("/v1/connector/discovery/observe",sample(saved,policy.getInt("revision")),credential);
            if (!accepted.optBoolean("accepted")) throw new Exception("Monitoring policy changed. Rechecking.");
            retrySeconds=5;
            status("Online · Last sync "+java.text.DateFormat.getDateTimeInstance().format(new java.util.Date()));
        } catch(ConnectorApi.AccessDenied denied) {
            status("Pairing is expired, revoked or unauthorized. Contact your administrator."); stopSelf(); return;
        } catch(Exception unavailable) {
            retrySeconds=Math.min(60,retrySeconds*2);
            status("Server unavailable · retry in "+retrySeconds+"s. Check VPN and network.");
        }
        if (!stopping) worker.schedule(this::tick,retrySeconds,TimeUnit.SECONDS);
    }
    private JSONObject sample(JSONObject saved,int revision) throws Exception {
        ActivityManager.MemoryInfo memory=new ActivityManager.MemoryInfo();
        getSystemService(ActivityManager.class).getMemoryInfo(memory);
        StatFs volume=new StatFs(getFilesDir().getAbsolutePath());
        Intent battery=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        Object batteryPercent=JSONObject.NULL;
        if (battery!=null && battery.getIntExtra(BatteryManager.EXTRA_SCALE,0)>0) {
            batteryPercent=Math.max(0,Math.min(100,100.0*battery.getIntExtra(BatteryManager.EXTRA_LEVEL,0)/battery.getIntExtra(BatteryManager.EXTRA_SCALE,100)));
        }
        JSONObject system=new JSONObject().put("systemName",saved.getString("name")).put("installationId",saved.getString("installationId"))
                .put("platform","android").put("os","Android "+Build.VERSION.RELEASE+" · API "+Build.VERSION.SDK_INT)
                .put("architecture",ConnectorApi.architecture()).put("cpuPercent",JSONObject.NULL).put("cpuCount",Math.max(1,Runtime.getRuntime().availableProcessors()))
                .put("memoryTotal",memory.totalMem).put("memoryAvailable",memory.availMem).put("uptimeSeconds",SystemClock.elapsedRealtime()/1000.0)
                .put("batteryPercent",batteryPercent).put("tools",new JSONArray())
                .put("disks",new JSONArray().put(new JSONObject().put("root","App data volume").put("total",volume.getTotalBytes()).put("available",volume.getAvailableBytes())));
        JSONObject coverage=new JSONObject().put("status","disabled").put("roots",new JSONArray()).put("watchedDirectories",0)
                .put("gaps",new JSONArray()).put("attribution","unavailable").put("droppedEvents",0);
        return new JSONObject().put("version",1).put("deviceId",saved.getString("deviceId")).put("profileId",JSONObject.NULL)
                // No file-event sequences are emitted. A persisted health-only
                // epoch prevents ordinary service restarts consuming the server's
                // bounded event-epoch retention budget.
                .put("bootId",saved.optString("monitoringEpoch",bootId)).put("at",Instant.now().toString()).put("policyRevision",revision).put("system",system)
                .put("coverage",coverage).put("events",new JSONArray());
    }
    @Override public void onDestroy() {
        stopping=true; worker.shutdownNow(); if(proof!=null) proof.close(); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
