package org.devsetu.connector;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.*;
import android.os.Build;
import java.time.Instant;
import java.util.*;
import org.json.*;

/** Bounded public-API inventory and exact connector-owned service jobs. No shell/root APIs. */
final class AndroidSoftware {
    static final String SAMPLER="org.devsetu.connector.HealthSamplingService";
    static final String CONNECTION="org.devsetu.connector.MonitorService";
    private final Context context;
    private final SharedPreferences permissions,receipts;
    private long servicesAt,initialAt;
    private JSONObject identity;
    AndroidSoftware(Context value) {
        context=value.getApplicationContext();
        permissions=context.getSharedPreferences("software-permissions",Context.MODE_PRIVATE);
        receipts=context.getSharedPreferences("software-receipts",Context.MODE_PRIVATE);
    }
    static boolean inventoryConsent(Context context) { return context.getSharedPreferences("software-permissions",Context.MODE_PRIVATE).getBoolean("inventory",false); }
    static boolean controlConsent(Context context) { return context.getSharedPreferences("software-permissions",Context.MODE_PRIVATE).getBoolean("serviceControl",false); }
    static boolean samplingEnabled(Context context) { return context.getSharedPreferences("software-permissions",Context.MODE_PRIVATE).getBoolean("samplingEnabled",true); }
    private static void require(boolean yes) throws Exception { if(!yes)throw new Exception("Android software request denied."); }
    static String text(Object value,int max) {
        String cleaned=String.valueOf(value==null?"":value).replaceAll("[\\x00-\\x1f\\x7f]"," ").trim();
        return cleaned.substring(0,Math.min(cleaned.length(),max));
    }
    private PackageInfo ownPackage() throws Exception {
        return context.getPackageManager().getPackageInfo(context.getPackageName(),Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES);
    }
    private String definition(String name) throws Exception {
        PackageInfo own=ownPackage();
        android.content.pm.Signature[] signatures=Build.VERSION.SDK_INT>=28?own.signingInfo.getApkContentsSigners():own.signatures;
        ArrayList<String> digests=new ArrayList<>();
        for(android.content.pm.Signature signature:signatures)digests.add(ConnectorApi.hash(android.util.Base64.encodeToString(signature.toByteArray(),android.util.Base64.NO_WRAP)));
        Collections.sort(digests);
        return ConnectorApi.hash(new JSONArray().put("android-connector-v1").put(context.getPackageName()).put(name).put(own.versionName).put(Build.VERSION.SDK_INT>=28?own.getLongVersionCode():own.versionCode).put(new JSONArray(digests)).toString());
    }
    private JSONObject service(String name,boolean active,boolean protectedService) throws Exception {
        return new JSONObject().put("id",ConnectorApi.hash("android-connector:"+name)).put("name",name)
            .put("displayName",name.equals(SAMPLER)?"DevSetu health sampling":"DevSetu connection (protected)")
            .put("manager","android-connector").put("definitionSha256",definition(name)).put("status",active?"running":"stopped")
            .put("startupType",name.equals(SAMPLER)?"While the user-started connector is running":"User-started foreground service")
            .put("description",name.equals(SAMPLER)?"Collects this Android device's RAM, battery and app-volume capacity. Stopping pauses health samples; the paired connection stays online.":"Keeps authenticated connectivity and paired sign-in available. Start or Stop monitoring locally in the Android app.")
            .put("canStart",!protectedService&&MonitorService.running).put("canStop",!protectedService&&MonitorService.running)
            .put("protected",protectedService);
    }
    JSONObject services() throws Exception {
        return new JSONObject().put("version",1).put("observedAt",Instant.now().toString()).put("platform","android")
            .put("status","ready").put("truncated",false).put("items",new JSONArray()
                .put(service(CONNECTION,MonitorService.running,true)).put(service(SAMPLER,HealthSamplingService.running,false)));
    }
    JSONObject inventory() throws Exception {
        JSONArray rows=new JSONArray();boolean truncated=false,partial=false;int bytes=1024;
        List<PackageInfo> installed=context.getPackageManager().getInstalledPackages(0);
        installed.sort(Comparator.comparing(p -> p.packageName));
        for(PackageInfo p:installed) {
            if(rows.length()>=5000){truncated=true;break;}
            try {
                ApplicationInfo app=p.applicationInfo;if(app==null)continue;
                String label=text(context.getPackageManager().getApplicationLabel(app),180);if(label.isEmpty())label=text(p.packageName,180);
                JSONObject item=new JSONObject().put("id",ConnectorApi.hash("android-package:"+p.packageName))
                    .put("name",label)
                    .put("publisher",text(p.packageName,180)).put("source",(app.flags&ApplicationInfo.FLAG_SYSTEM)!=0?"android-system":"android-user");
                String version=text(p.versionName,180);if(!version.isEmpty())item.put("version",version);
                if(p.firstInstallTime>0)item.put("installedOn",Instant.ofEpochMilli(p.firstInstallTime).atOffset(java.time.ZoneOffset.UTC).toLocalDate().toString());
                bytes+=item.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
                if(bytes>2500000){truncated=true;break;}rows.put(item);
            }catch(Exception unreadable){partial=true;}
        }
        return new JSONObject().put("version",1).put("observedAt",Instant.now().toString()).put("platform","android")
            .put("scope","android-current-user").put("status",partial||truncated?"partial":"ready").put("truncated",truncated).put("items",rows);
    }
    private void validate(JSONObject job,JSONObject saved) throws Exception {
        AndroidSoftwarePolicy.validate(job,identity,saved,service(SAMPLER,HealthSamplingService.running,false),inventoryConsent(context),controlConsent(context),System.currentTimeMillis());
    }
    private void saveReceipt(String id,JSONObject receipt) throws Exception { require(receipts.edit().putString(id,receipt.toString()).commit()); }
    private void reconcile(ConnectorApi api,String credential) throws Exception {
        long now=System.currentTimeMillis();
        for(Map.Entry<String,?> entry:receipts.getAll().entrySet()){
            require(entry.getKey().matches("sw_[a-f0-9]{32}")&&entry.getValue() instanceof String);
            JSONObject receipt=new JSONObject((String)entry.getValue());
            if(receipt.optBoolean("reconciled")){
                if(Instant.parse(receipt.getString("expiresAt")).toEpochMilli()<now)require(receipts.edit().remove(entry.getKey()).commit());
            }else{
                JSONObject result=new JSONObject().put("requestId",entry.getKey()).put("digest",receipt.getString("digest")).put("result",receipt.getString("result"));
                if(receipt.getString("result").equals("inventory-updated")&&inventoryConsent(context))result.put("inventory",inventory());
                if(receipt.getString("result").equals("inventory-updated")&&!inventoryConsent(context))result.put("result","interrupted");
                if(receipt.getString("result").equals("services-updated")){
                    if(inventoryConsent(context))result.put("serviceInventory",services());else result.put("result","interrupted");
                }
                api.post("/v1/connector/software/complete",result,credential);receipt.put("reconciled",true);saveReceipt(entry.getKey(),receipt);
            }
        }
    }
    private void execute(ConnectorApi api,String credential,JSONObject saved,JSONObject job) throws Exception {
        validate(job,saved);JSONObject request=job.getJSONObject("request");String id=request.getString("requestId"),operation=request.getString("operation");
        require(!receipts.contains(id)&&receipts.getAll().size()<128);
        JSONObject receipt=new JSONObject().put("digest",job.getString("digest")).put("expiresAt",job.getString("expiresAt")).put("result","interrupted").put("reconciled",false);
        saveReceipt(id,receipt);String result="failed";JSONObject payload=new JSONObject().put("requestId",id).put("digest",job.getString("digest"));
        try{
            if(operation.equals("inventory")){JSONObject snapshot=inventory();require(inventoryConsent(context));payload.put("inventory",snapshot);result="inventory-updated";}
            else if(operation.equals("services-inventory")){require(inventoryConsent(context));payload.put("serviceInventory",services());result="services-updated";}
            else{
                validate(job,saved);require(controlConsent(context));
                require(api.post("/v1/connector/software/authorize",new JSONObject().put("requestId",id).put("digest",job.getString("digest")),credential).getBoolean("authorized"));
                require(controlConsent(context));boolean start=operation.equals("start-service");
                require(permissions.edit().putBoolean("samplingEnabled",start).commit());
                Intent intent=new Intent(context,HealthSamplingService.class);
                if(start)context.startService(intent);else context.stopService(intent);
                long deadline=System.currentTimeMillis()+4000;while(HealthSamplingService.running!=start&&System.currentTimeMillis()<deadline)Thread.sleep(50);
                result=HealthSamplingService.running==start?(start?"service-started":"service-stopped"):"interrupted";
                if(inventoryConsent(context))payload.put("serviceInventory",services());
            }
        }catch(SecurityException denied){result=operation.equals("start-service")||operation.equals("stop-service")?"os-permission-denied":"failed";}catch(Exception failed){result="interrupted";}
        receipt.put("result",result);saveReceipt(id,receipt);payload.put("result",result);
        api.post("/v1/connector/software/complete",payload,credential);receipt.put("reconciled",true);saveReceipt(id,receipt);
    }
    void tick(ConnectorApi api,JSONObject saved) throws Exception {
        String credential=saved.getString("credential");
        if(identity==null){identity=api.post("/v1/connector/software/identity",new JSONObject(),credential);require(identity.getString("deviceId").equals(saved.getString("deviceId")));}
        boolean inventory=inventoryConsent(context);JSONObject observation=new JSONObject().put("version",1).put("platform","android").put("inventoryConsent",inventory).put("installConsent",false)
            .put("programSha256",definition(CONNECTION)).put("services",new JSONArray()).put("serviceManagement",new JSONObject().put("version",1).put("controlConsent",controlConsent(context)));
        if(inventory&&System.currentTimeMillis()-servicesAt>=30000){observation.put("serviceInventory",services());servicesAt=System.currentTimeMillis();}
        api.post("/v1/connector/software/observe",observation,credential);
        reconcile(api,credential);
        if(inventory&&System.currentTimeMillis()-initialAt>=60000){api.post("/v1/connector/software/initial-inventory",new JSONObject(),credential);initialAt=System.currentTimeMillis();}
        JSONObject claimed=api.post("/v1/connector/software/claim",new JSONObject(),credential);
        if(!claimed.isNull("job"))execute(api,credential,saved,claimed.getJSONObject("job"));
    }
}
