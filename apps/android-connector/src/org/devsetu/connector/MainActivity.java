package org.devsetu.connector;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.*;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private EditText server, code, name;
    private CheckBox http, consent;
    private TextView status;
    private Button connect, start, stop, check;
    private PrivateState state;
    // Serialize pairing across Activity recreation (for example screen rotation).
    // A second Activity must not replace a credential while the first is redeeming it.
    private static final java.util.concurrent.ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        state = new PrivateState(this);
        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (20 * getResources().getDisplayMetrics().density); content.setPadding(padding,padding,padding,padding);
        scroll.addView(content); setContentView(scroll);
        TextView title = new TextView(this); title.setText("DevSetu · Connect this Android"); title.setTextSize(24); content.addView(title);
        text(content, "System health and presence only. No admin password or project required. A server-scoped device identifier groups your connections. No personal files, location, contacts, camera or microphone are collected.");
        server = field(content,"DevSetu server URL",android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        name = field(content,"Device name",android.text.InputType.TYPE_CLASS_TEXT); name.setText(Build.MANUFACTURER + " " + Build.MODEL);
        code = field(content,"Approved join code (optional)",android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        code.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO); code.setSaveEnabled(false);
        http = new CheckBox(this); http.setText("Allow this private IPv4 server over HTTP (internal VPN pilot)"); content.addView(http);
        consent = new CheckBox(this); consent.setText("Share OS, RAM, battery, app-volume capacity and Online / Last seen with my DevSetu workspace"); content.addView(consent);
        connect = button(content,"Connect this device",() -> connect());
        check = button(content,"Check approval",() -> checkApproval());
        start = button(content,"Start monitoring",() -> startMonitoring());
        stop = button(content,"Stop monitoring",() -> { stopService(new Intent(this, MonitorService.class)); getSharedPreferences("monitor-status",MODE_PRIVATE).edit().putString("message","Monitoring stopped by you.").apply(); message("Monitoring stopped. DevSetu will show Offline / stale after the heartbeat expires."); });
        button(content,"Request to join in browser",() -> {
            try { String origin = ServerOrigin.normalize(server.getText().toString(),http.isChecked()); startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(origin))); }
            catch(Exception error) { message(error.getMessage()); }
        });
        button(content,"Refresh status",() -> refresh());
        button(content,"Reset an unfinished pairing",() -> {
            try {
                if (state.read().optBoolean("paired")) { message("This device is paired. Ask an administrator before changing its connection."); return; }
                new android.app.AlertDialog.Builder(this).setTitle("Reset unfinished pairing?")
                    .setMessage("Clear this app's pending request so you can enter a new approved code. The server's approval history is retained.")
                    .setNegativeButton("Cancel",null).setPositiveButton("Reset",(dialog,which) -> {
                        worker.execute(() -> { try { if (state.read().optBoolean("paired")) { message("The connection completed meanwhile. Pairing was preserved."); return; } state.write(new JSONObject()); runOnUiThread(() -> { getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE); refresh(); }); } catch(Exception error) { message("Pending identity could not be reset."); } });
                    }).show();
            } catch(Exception error) { message("Private identity could not be read. Contact your administrator."); }
        });
        status = new TextView(this); status.setTextIsSelectable(true); content.addView(status);
        text(content,"Keep your VPN connected if required. Android may pause monitoring when stopped, force-closed or restricted by the OS. Open the app and Start monitoring to resume. APK updates preserve pairing; uninstalling does not.");
        refresh();
    }
    private void text(LinearLayout parent,String value) { TextView view = new TextView(this); view.setText(value); view.setPadding(0,16,0,16); parent.addView(view); }
    private EditText field(LinearLayout parent,String label,int type) { text(parent,label); EditText view = new EditText(this); view.setSingleLine(true); view.setInputType(type); view.setSaveEnabled(false); parent.addView(view); return view; }
    private Button button(LinearLayout parent,String label,Runnable action) { Button view=new Button(this); view.setText(label); view.setOnClickListener(v -> action.run()); parent.addView(view); return view; }
    private void message(String value) { if (!isFinishing()) runOnUiThread(() -> status.setText(value == null ? "Connection could not complete. Retry after checking VPN and approval." : value)); }
    private void busy(boolean value) { runOnUiThread(() -> {connect.setEnabled(!value);check.setEnabled(!value);start.setEnabled(!value);}); }
    private void refresh() {
        try {
            JSONObject saved = state.read();
            if (saved.has("server")) { server.setText(saved.getString("server")); http.setChecked(saved.optBoolean("internalHttp")); name.setText(saved.getString("name")); consent.setChecked(true); }
            boolean paired = saved.optBoolean("paired");
            if (paired) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else if (saved.has("pairCode")) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            server.setEnabled(!saved.has("deviceId")); name.setEnabled(!saved.has("deviceId")); http.setEnabled(!saved.has("deviceId"));
            check.setEnabled(saved.has("deviceId") && !paired); start.setEnabled(paired); connect.setEnabled(!paired);
            message(paired ? "Paired. Last reported: " + getSharedPreferences("monitor-status",MODE_PRIVATE).getString("message","No sync yet.") + " Tap Start monitoring to resume if stopped."
                : saved.has("pairCode") ? "Pending administrator approval. Discovery → Approve connection code: " + saved.getString("pairCode") + ". Then tap Check approval."
                : "Enter your DevSetu URL and approved code. Leave the code empty to generate a request for an administrator to approve.");
        } catch(Exception error) { message("Private identity could not be read. Pairing was preserved; contact your administrator."); connect.setEnabled(false); start.setEnabled(false); }
    }
    private void connect() {
        if (!consent.isChecked()) { message("Choose monitoring consent before connecting."); return; }
        final String url = server.getText().toString(), deviceName = name.getText().toString().trim();
        final boolean allowHttp = http.isChecked();
        final String approvedCode = code.getText().toString().toUpperCase(java.util.Locale.ROOT).replaceAll("[\\s-]", "");
        code.setText("");
        if (deviceName.isEmpty() || deviceName.length()>80 || (!approvedCode.isEmpty() && !approvedCode.matches("[A-HJ-NP-Z2-9]{8}"))) { message("Enter a device name and a valid eight-character approval code."); return; }
        busy(true); message("Preparing the approved connection…");
        worker.execute(() -> {
            try {
                ConnectorApi api = new ConnectorApi(url,allowHttp);
                JSONObject saved = state.read();
                if (saved.optBoolean("paired")) throw new Exception("This app is already paired. Start monitoring to resume it.");
                String target = null;
                if (!approvedCode.isEmpty() && saved.has("deviceId") && saved.optBoolean("join")) {
                    if (!api.origin.equals(saved.getString("server")) || !ConnectorApi.hash(approvedCode).equals(saved.optString("joinCodeHash"))) throw new Exception("Re-enter the code used for this pending connection, or reset the unfinished pairing.");
                    // Redeem is idempotent for the same saved identity. Retrying
                    // prepare after a lost successful response would reject the
                    // already consumed code and strand a valid local identity.
                    target = saved.getString("deviceId");
                } else if (!approvedCode.isEmpty()) {
                    JSONObject prepared = api.post("/v1/connector/join/prepare",new JSONObject().put("version",1).put("code",approvedCode),null);
                    if (!"android".equals(prepared.getString("platform")) || prepared.getBoolean("fileActivity")) throw new Exception("This approval is not for Android system monitoring.");
                    target = prepared.getString("deviceId");
                }
                if (saved.has("deviceId")) {
                    if (!api.origin.equals(saved.getString("server")) || (target != null && !target.equals(saved.getString("deviceId")))) throw new Exception("A pending connection exists for another target. Check its approval first.");
                } else {
                    String id = target == null ? "fc_"+UUID.randomUUID().toString().replace("-","") : target;
                    if (!id.matches("fc_[a-f0-9]{32}")) throw new Exception("Server returned an invalid device identity.");
                    saved = new JSONObject().put("server",api.origin).put("internalHttp",allowHttp).put("name",deviceName).put("deviceId",id)
                            .put("credential",id+"."+ConnectorApi.secret()).put("pollSecret",id+"."+ConnectorApi.secret())
                            .put("installationId",ConnectorApi.installationId(this,api.origin)).put("monitoringEpoch",UUID.randomUUID().toString()).put("paired",false).put("join",!approvedCode.isEmpty());
                    if (!approvedCode.isEmpty()) saved.put("joinCodeHash",ConnectorApi.hash(approvedCode));
                    if (approvedCode.isEmpty()) {
                        String alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; StringBuilder pairCode=new StringBuilder();
                        java.security.SecureRandom random=new java.security.SecureRandom();
                        for(int i=0;i<8;i++) pairCode.append(alphabet.charAt(random.nextInt(32)));
                        saved.put("pairCode",pairCode.toString());
                    }
                    state.write(saved);
                }
                JSONObject proposal = new JSONObject().put("version",1).put("deviceId",saved.getString("deviceId")).put("platform","android")
                        .put("architecture",ConnectorApi.architecture()).put("name",saved.getString("name")).put("fileActivity",false)
                        .put("credentialHash",ConnectorApi.hash(saved.getString("credential"))).put("pollHash",ConnectorApi.hash(saved.getString("pollSecret")));
                if (!approvedCode.isEmpty()) {
                    if (!saved.optBoolean("join")) throw new Exception("This pending request uses administrator code approval. Check that approval first.");
                    api.post("/v1/connector/join/redeem",proposal.put("code",approvedCode),null);
                    saved.put("paired",true); saved.remove("joinCodeHash"); state.write(saved); runOnUiThread(() -> getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE)); message("Paired. Tap Start monitoring.");
                } else {
                    if (saved.optBoolean("join")) throw new Exception("Re-enter your approved join code to retry this saved connection.");
                    api.post("/v1/connector/enrollment/start",proposal.put("codeHash",ConnectorApi.hash(saved.getString("pairCode"))),null);
                    runOnUiThread(() -> getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE));
                    message("Ask an administrator to open Discovery → Approve connection and enter: "+saved.getString("pairCode")+". Then tap Check approval.");
                }
                runOnUiThread(() -> { busy(false); check.setEnabled(!readPaired()); start.setEnabled(readPaired()); });
            } catch(Exception error) { message(error.getMessage()); busy(false); }
        });
    }
    private boolean readPaired() { try { return state.read().optBoolean("paired"); } catch(Exception error) { return false; } }
    private void checkApproval() {
        busy(true); worker.execute(() -> {
            try {
                JSONObject saved=state.read(); ConnectorApi api=new ConnectorApi(saved.getString("server"),saved.optBoolean("internalHttp"));
                if (saved.optBoolean("join")) {
                    // A lost redemption response must not require an already
                    // consumed code. Successful credential authentication proves
                    // the server completed the prior approved redemption.
                    api.post("/v1/connector/heartbeat",new JSONObject(),saved.getString("credential"));
                    saved.put("paired",true); saved.remove("joinCodeHash"); state.write(saved);
                    runOnUiThread(() -> getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE));
                    message("The approved connection is paired. Tap Start monitoring."); busy(false); return;
                }
                JSONObject result=api.post("/v1/connector/enrollment/poll",new JSONObject(),saved.getString("pollSecret"));
                if (!"approved".equals(result.getString("status"))) { message("Approval status: "+result.getString("status")+". Ask your administrator, then check again."); }
                else { saved.put("paired",true); saved.remove("pairCode"); state.write(saved); runOnUiThread(() -> getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE)); message("Approved and paired. Tap Start monitoring."); }
            } catch(Exception error) { message(error.getMessage()); }
            busy(false);
        });
    }
    private void startMonitoring() {
        if (!readPaired()) { message("Complete pairing first."); return; }
        if (Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},1); message("Allow the monitoring notification, then tap Start monitoring."); return;
        }
        if (!getSystemService(NotificationManager.class).areNotificationsEnabled()) { message("Enable DevSetu notifications in Android settings before starting monitoring."); return; }
        startForegroundService(new Intent(this,MonitorService.class)); message("Monitoring is starting. Refresh status to check the server result.");
    }
    @Override protected void onResume() { super.onResume(); if (state != null) refresh(); }
}
