# 📊 METRICS & ANALYTICS SYSTEM

> **Purpose:** Collects NPS, user engagement and system performance analytics  
> **Maintainer:** @data-team  
> **Version:** 1.3.0

## 🔝 ESSENTIAL FILES

| File                                   | Priority   | Purpose                                         |
| -------------------------------------- | ---------- | ----------------------------------------------- |
| **[README.md](README.md)**             | ⭐⭐⭐⭐⭐ | Complete metrics collection process (this file) |
| **[collect_nps.sql](collect_nps.sql)** | ⭐⭐⭐⭐⭐ | GDPR-compliant NPS data export                  |

## 🔄 Collection Process

### Automated Pipeline

```
User Feedback → Database → collect_nps.sql → S3 Storage → Grafana Dashboard
```

<!-- ANCHOR_METRICS_MASTER -->

**MASTER INDEX:** Complete metrics and analytics system

## Collection Process

### 1. NPS Survey Collection

**Schedule:** Monthly on the 1st day of each month at 09:00 UTC

**Collection Method:**

```sql
-- See: collect_nps.sql
SELECT
  SHA2(CONCAT(user_id, '${MONTHLY_SALT}'), 256) AS anonymous_id,
  score,
  feedback_text,
  created_at,
  user_segment,
  app_version
FROM user_feedback
WHERE survey_type = 'nps'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH);
```

**Data Privacy:**

- User IDs are hashed with monthly rotating salt
- Personal data is anonymized before storage
- GDPR compliance through automatic data retention (24 months)

### 2. Engagement Metrics

**Daily Collection:**

- Session duration
- Feature usage frequency
- Error rates
- Performance metrics

**Weekly Aggregation:**

- User retention rates
- Feature adoption
- Support ticket correlation

## Data Storage

### Structure

```
metrics/
├── raw/              # Raw anonymized data
│   ├── nps/         # NPS survey responses
│   ├── engagement/  # User engagement data
│   └── performance/ # System performance metrics
├── processed/       # Aggregated analytics
│   ├── weekly/      # Weekly summaries
│   ├── monthly/     # Monthly reports
│   └── quarterly/   # Quarterly trends
└── exports/         # Dashboard data exports
```

### Security

- AES-256 encryption for sensitive data
- Access control through IAM roles
- Audit logging for all data access
- Regular security reviews

## Dashboard Integration

### Grafana Configuration

**Data Source:** PostgreSQL Analytics DB

**Key Dashboards:**

1. **NPS Overview** (`nps_dashboard.json`)
   - Current NPS score
   - Trend analysis (12 months)
   - Segment breakdown
   - Response distribution

2. **User Engagement** (`engagement_dashboard.json`)
   - Daily/weekly active users
   - Feature usage heatmap
   - Session analytics
   - Retention funnel

3. **System Health** (`health_dashboard.json`)
   - Error rates by component
   - Performance metrics
   - User satisfaction correlation

### Alerting Rules

```yaml
# Alert configuration
nps_critical:
  condition: NPS < 30
  frequency: weekly
  notifications:
    - email: product-team@company.com
    - slack: #product-alerts

engagement_warning:
  condition: DAU decline > 15%
  frequency: daily
  notifications:
    - slack: #analytics

performance_critical:
  condition: Error rate > 5%
  frequency: immediate
  notifications:
    - pagerduty: critical-alerts
```

## Implementation

### Automated Collection

**Cron Jobs:**

```bash
# Daily metrics collection
0 2 * * * /scripts/collect_daily_metrics.sh

# Weekly aggregation
0 3 * * 1 /scripts/aggregate_weekly.sh

# Monthly NPS collection
0 9 1 * * /scripts/collect_nps.sh

# Quarterly reporting
0 10 1 */3 * /scripts/generate_quarterly_report.sh
```

**Scripts Location:** `scripts/metrics/`

### Manual Collection

For ad-hoc analysis or troubleshooting:

```bash
# Collect specific date range
./scripts/collect_metrics.sh --start-date 2025-08-01 --end-date 2025-08-31

# Generate report for specific segment
./scripts/generate_report.sh --segment premium --format pdf

# Test collection pipeline
./scripts/test_metrics_pipeline.sh --dry-run
```

## Analysis & Reporting

### Key Metrics

| Metric            | Target | Calculation                             | Frequency       |
| ----------------- | ------ | --------------------------------------- | --------------- |
| NPS Score         | >50    | (Promoters% - Detractors%)              | Monthly         |
| User Retention    | >80%   | Users active in month N+1               | Monthly         |
| Feature Adoption  | >60%   | Users using new features within 30 days | Feature release |
| Error Rate        | <2%    | Errors / Total requests                 | Daily           |
| Performance Score | >90    | Lighthouse-style composite              | Weekly          |

### Report Generation

**Automated Reports:**

- Weekly executive summary (PDF)
- Monthly detailed analysis (Interactive dashboard)
- Quarterly trend analysis (Presentation format)

**Custom Reports:**

```bash
# Generate custom report
./scripts/generate_custom_report.sh \
  --metrics nps,retention,engagement \
  --period 2025-Q3 \
  --format html \
  --output quarterly_review.html
```

## Data Quality

### Validation Rules

1. **Completeness:** All required fields present
2. **Accuracy:** Values within expected ranges
3. **Consistency:** Cross-metric validation
4. **Timeliness:** Data freshness checks

### Quality Monitoring

```javascript
// Quality check example
const validateNPSData = data => {
  const checks = {
    scoreRange: data.every(d => d.score >= 0 && d.score <= 10),
    noMissingIds: data.every(d => d.anonymous_id),
    recentData: data.some(d => isRecent(d.created_at, 30)),
  };

  return checks;
};
```

## Troubleshooting

### Common Issues

1. **Missing Data**
   - Check cron job status
   - Verify database connections
   - Review error logs in `/var/log/metrics/`

2. **Dashboard Not Updating**
   - Verify Grafana data source
   - Check query performance
   - Review cache settings

3. **Privacy Concerns**
   - Verify anonymization process
   - Check salt rotation
   - Review data retention policies

### Debug Commands

```bash
# Check collection status
./scripts/metrics_status.sh

# Validate data integrity
./scripts/validate_metrics_data.sh --date yesterday

# Test dashboard queries
./scripts/test_dashboard_queries.sh --dashboard nps
```

## Compliance

### GDPR Requirements

- **Data Minimization:** Only collect necessary metrics
- **Purpose Limitation:** Use data only for stated purposes
- **Storage Limitation:** Automatic deletion after 24 months
- **User Rights:** Support for data export/deletion requests

### Implementation Checklist

- [ ] Privacy notice updated
- [ ] Consent mechanisms in place
- [ ] Data processing agreements signed
- [ ] Regular compliance audits scheduled
- [ ] User rights request process documented

## Related Documentation

- [Database Schema](../database/metrics_schema.sql)
- [Privacy Policy](../legal/privacy_policy.md)
- [Security Guidelines](../security/data_handling.md)
- [Dashboard Guide](dashboard_user_guide.md)

---

**Contacts:**

- Data Team: data-team@company.com
- Privacy Officer: privacy@company.com
- System Admin: admin@company.com
