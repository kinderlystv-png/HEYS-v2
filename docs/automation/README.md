# ⚙️ AUTOMATION SCRIPTS

> **Purpose:** Automates docs actualization, backups and dependency management  
> **Maintainer:** @devops-team  
> **Version:** 1.3.0

## 🔝 CRITICAL SCRIPTS

| File                                                   | Priority   | Description                              |
| ------------------------------------------------------ | ---------- | ---------------------------------------- |
| **[actualization-runner.js](actualization-runner.js)** | ⭐⭐⭐⭐⭐ | One-click documentation refresh          |
| **[dependency-resolver.js](dependency-resolver.js)**   | ⭐⭐⭐⭐   | Builds dependency graph & detects cycles |
| **[backup-system.js](backup-system.js)**               | ⭐⭐⭐⭐   | Automated nightly backups to `/backups`  |
| **[dependencies.yaml](dependencies.yaml)**             | ⭐⭐⭐     | Dependency configuration file            |

## 🔧 Git Hooks

| File                                                 | Priority | Purpose                       |
| ---------------------------------------------------- | -------- | ----------------------------- |
| [git-hooks-pre-commit.sh](git-hooks-pre-commit.sh)   | ⭐⭐⭐   | Unix pre-commit validation    |
| [git-hooks-pre-commit.bat](git-hooks-pre-commit.bat) | ⭐⭐⭐   | Windows pre-commit validation |

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Git Hooks

```bash
# Unix/Linux/macOS
cp automation/git-hooks-pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Windows
copy automation\\git-hooks-pre-commit.bat .git\\hooks\\pre-commit.bat
```

### 3. Run Documentation Refresh

```bash
node automation/actualization-runner.js
```

## 📊 Automation Features

### Documentation Actualization

- **Auto-detection** of outdated documentation
- **Smart updates** based on code changes
- **Version synchronization** across all files
- **Link validation** and repair

### Dependency Management

- **Cycle detection** in document dependencies
- **Dependency graphs** for visualization
- **Impact analysis** for changes
- **Automated resolution** suggestions

### Backup & Recovery

- **Incremental backups** every night at 2 AM
- **Version-controlled snapshots** with git integration
- **Rollback capabilities** for emergency recovery
- **Health monitoring** with email alerts

## 🔍 Monitoring & Logs

- **Execution logs:** `logs/automation/`
- **Error tracking:** Integrated with error reporting system
- **Performance metrics:** Tracked in metrics database
- **Health dashboard:** Available at `/ui/actualization-dashboard.html`

<!-- ANCHOR_AUTOMATION_MASTER -->

**MASTER INDEX:** Complete automation system documentation

---

**Related:** [Metrics System](../metrics/) | [UI Dashboard](../ui/) |
[Backup Storage](../backups/)
