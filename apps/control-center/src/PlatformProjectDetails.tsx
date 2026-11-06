import type { DeploymentSettings } from "@frevos/contracts";
import { X } from "lucide-react";
import { addBasePath } from "./routing.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";

export function PlatformProjectDetails({
  project,
  owner,
  onClose,
}: {
  project: DeploymentSettings;
  owner: boolean;
  onClose: () => void;
}) {
  return (
    <WorkspaceDialog label="DevSetu project" onClose={onClose}>
      <section className="deployment-settings account-panel">
        <header className="settings-header">
          <div>
            <p className="eyebrow">Projects / Managed platform</p>
            <h2>DevSetu</h2>
          </div>
          <button
            className="button ghost"
            type="button"
            aria-label="Close DevSetu project"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="account-panel-scroll">
          <dl>
            <dt>Build source</dt>
            <dd>
              <code>{project.sourceFolder}</code>
            </dd>
            <dt>Repository</dt>
            <dd>{project.repositoryOrigin}</dd>
            <dt>Destination</dt>
            <dd>
              {project.destination.host} · {project.destination.root}
            </dd>
          </dl>
          <p>
            No configured source-to-build pipeline is available for this project. Configure its
            source, builder and destination to enable the complete deployment flow.
          </p>
          <p>
            The prepared-release updater is a separate fallback. It activates only an already
            reviewed artifact; it does not publish local changes or run a new build.
          </p>
          <p>
            Existing configuration, database and application data stay in place. These protections
            are managed by the platform release workflow; they cannot be edited or archived here.
          </p>
          <p>
            Self-service platform rollback is not available. Failed activation uses the existing
            recovery workflow.
          </p>
          {owner ? (
            <div className="record-row-actions">
              <a className="button primary" href={addBasePath("/projects/components")}>
                Configure deployment
              </a>
              <a className="button secondary" href={addBasePath("/maintenance")}>
                Review prepared release
              </a>
            </div>
          ) : (
            <p>The server20 owner manages platform updates.</p>
          )}
        </div>
      </section>
    </WorkspaceDialog>
  );
}
