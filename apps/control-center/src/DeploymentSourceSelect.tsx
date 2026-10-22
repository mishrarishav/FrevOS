import type { DeveloperConnector } from "@frevos/contracts";

export function DeploymentSourceSelect({
  projectName,
  devices,
  value,
  disabled,
  onChange,
}: {
  projectName: string;
  devices: DeveloperConnector[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="deployment-source-select">
      <span>Source system</span>
      <select
        aria-label={`${projectName} source system`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose system</option>
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.name} — {device.online ? "Online" : "Offline"}
          </option>
        ))}
      </select>
    </label>
  );
}
