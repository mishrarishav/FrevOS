package org.devsetu.connector;

import java.time.Instant;
import java.util.*;
import org.json.*;

/** Pure typed policy shared by the Android native execution boundary and JVM regression tests. */
final class AndroidSoftwarePolicy {
    private static final String SAMPLER="org.devsetu.connector.HealthSamplingService";
    private static void require(boolean yes) throws Exception { if(!yes)throw new Exception("Android software request denied."); }
    private static String hash(String value) throws Exception {
        byte[] bytes=java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder result=new StringBuilder();for(byte b:bytes)result.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return result.toString();
    }
    private static String ordered(JSONObject value,String... keys) throws Exception {
        StringJoiner out=new StringJoiner(",","{","}");Set<String> expected=new HashSet<>();
        for(String key:keys)if(value.has(key)){expected.add(key);Object v=value.get(key);require(v instanceof String||v instanceof Number||v instanceof Boolean);out.add(JSONObject.quote(key)+":"+(v instanceof String?JSONObject.quote((String)v):v.toString()));}
        require(value.length()==expected.size());return out.toString();
    }
    static void validate(JSONObject job,JSONObject identity,JSONObject saved,JSONObject current,boolean inventory,boolean controlConsent,long now) throws Exception {
        require(identity!=null&&job.getInt("version")==1&&job.getString("workspaceId").equals(identity.getString("workspaceId"))&&job.getString("actor").matches("usr_[A-Za-z0-9_-]+")&&job.getString("status").equals("working"));
        JSONObject request=job.getJSONObject("request");String operation=request.getString("operation");
        require(request.getInt("version")==1&&request.getString("deviceId").equals(saved.getString("deviceId"))&&request.getString("requestId").matches("sw_[a-f0-9]{32}"));
        boolean control=operation.equals("start-service")||operation.equals("stop-service");
        require(control||operation.equals("inventory")||operation.equals("services-inventory"));
        long created=Instant.parse(job.getString("createdAt")).toEpochMilli(),expires=Instant.parse(job.getString("expiresAt")).toEpochMilli();
        require(created<=now&&expires>now&&expires-created<=3600000&&!job.has("package"));
        String requestJson=control?ordered(request,"version","requestId","deviceId","operation","serviceId","policyRevision"):ordered(request,"version","requestId","deviceId","operation");
        require(request.length()==(control?6:4));
        String prefix=control?"software.service.job.v1":"software.job.v1",serviceJson="null";
        if(control){
            require(controlConsent);JSONObject target=job.getJSONObject("service"),approval=job.getJSONObject("approval");
            require(target.getString("name").equals(SAMPLER)&&target.getString("manager").equals("android-connector")&&!target.getBoolean("protected")&&target.getString("id").equals(current.getString("id"))&&target.getString("id").equals(request.getString("serviceId"))&&target.getString("definitionSha256").equals(current.getString("definitionSha256"))&&request.getInt("policyRevision")>0);
            serviceJson=ordered(target,"id","name","displayName","manager","definitionSha256","status","startupType","description","canStart","canStop","protected");
            long issued=Instant.parse(approval.getString("issuedAt")).toEpochMilli(),until=Instant.parse(approval.getString("expiresAt")).toEpochMilli(),consumed=Instant.parse(approval.getString("consumedAt")).toEpochMilli();
            require(approval.getInt("version")==1&&approval.getString("action").equals("software.service.v1")&&approval.getString("workspaceId").equals(job.getString("workspaceId"))&&approval.getString("actor").equals(job.getString("actor"))&&approval.getString("target").equals(saved.getString("deviceId"))&&approval.getString("correlationId").equals(request.getString("requestId"))&&approval.getString("artifactSha256").equals(current.getString("definitionSha256"))&&approval.getString("digest").equals(job.getString("digest"))&&issued>=created&&issued<=consumed&&consumed<=now&&until>now&&until-issued<=300000);
        }else{require(inventory&&!job.has("service"));}
        String binding="[1,"+JSONObject.quote(prefix)+","+JSONObject.quote(job.getString("workspaceId"))+","+JSONObject.quote(job.getString("actor"))+","+requestJson+","+serviceJson+","+JSONObject.quote(job.getString("createdAt"))+","+JSONObject.quote(job.getString("expiresAt"))+"]";
        require(hash(binding).equals(job.getString("digest")));
    }
}
