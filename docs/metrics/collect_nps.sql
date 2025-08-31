-- NPS Collection Script
-- Collects anonymized Net Promoter Score data for monthly analysis
-- Privacy-compliant with hashed user identifiers

SET @MONTHLY_SALT = CONCAT('nps_', YEAR(NOW()), '_', MONTH(NOW()));

-- Main NPS data collection
SELECT 
    -- Anonymized user identifier (changes monthly for privacy)
    SHA2(CONCAT(user_id, @MONTHLY_SALT), 256) AS anonymous_id,
    
    -- Core NPS data
    score,
    feedback_text,
    survey_version,
    
    -- Metadata for analysis
    created_at,
    updated_at,
    
    -- User segmentation (anonymized)
    CASE 
        WHEN subscription_type = 'premium' THEN 'premium'
        WHEN subscription_type = 'basic' THEN 'basic'
        ELSE 'free'
    END AS user_segment,
    
    -- App context
    app_version,
    platform,
    device_type,
    
    -- Geographic data (country level only)
    country_code,
    
    -- Usage context
    days_since_signup,
    total_sessions_last_30d,
    
    -- Classification for NPS calculation
    CASE 
        WHEN score >= 9 THEN 'promoter'
        WHEN score >= 7 THEN 'passive'
        ELSE 'detractor'
    END AS nps_category

FROM user_feedback f
JOIN users u ON f.user_id = u.id
JOIN user_analytics ua ON u.id = ua.user_id

WHERE 
    -- Only NPS surveys
    f.survey_type = 'nps'
    
    -- Collect last month's data
    AND f.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
    AND f.created_at < CURDATE()
    
    -- Only completed surveys
    AND f.status = 'completed'
    
    -- Privacy compliance: exclude opted-out users
    AND u.data_processing_consent = true
    AND u.marketing_consent_status != 'opted_out'

ORDER BY f.created_at DESC;

-- Additional aggregation query for quick insights
SELECT 
    DATE(created_at) as survey_date,
    user_segment,
    COUNT(*) as total_responses,
    AVG(score) as avg_score,
    
    -- NPS calculation
    COUNT(CASE WHEN score >= 9 THEN 1 END) as promoters,
    COUNT(CASE WHEN score BETWEEN 7 AND 8 THEN 1 END) as passives,
    COUNT(CASE WHEN score <= 6 THEN 1 END) as detractors,
    
    ROUND(
        (COUNT(CASE WHEN score >= 9 THEN 1 END) * 100.0 / COUNT(*)) -
        (COUNT(CASE WHEN score <= 6 THEN 1 END) * 100.0 / COUNT(*)),
        2
    ) as nps_score

FROM user_feedback f
JOIN users u ON f.user_id = u.id

WHERE 
    f.survey_type = 'nps'
    AND f.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
    AND f.created_at < CURDATE()
    AND f.status = 'completed'
    AND u.data_processing_consent = true

GROUP BY DATE(created_at), user_segment
ORDER BY survey_date DESC, user_segment;

-- Data quality checks
SELECT 
    'Data Quality Check' as check_type,
    
    -- Completeness checks
    COUNT(*) as total_records,
    COUNT(CASE WHEN score IS NULL THEN 1 END) as missing_scores,
    COUNT(CASE WHEN anonymous_id IS NULL THEN 1 END) as missing_ids,
    
    -- Range validation
    COUNT(CASE WHEN score < 0 OR score > 10 THEN 1 END) as invalid_scores,
    
    -- Freshness check
    MAX(created_at) as latest_response,
    DATEDIFF(NOW(), MAX(created_at)) as days_since_latest,
    
    -- Privacy validation
    COUNT(DISTINCT anonymous_id) as unique_anonymous_users,
    COUNT(DISTINCT LEFT(anonymous_id, 8)) as unique_id_prefixes

FROM (
    SELECT 
        SHA2(CONCAT(user_id, @MONTHLY_SALT), 256) AS anonymous_id,
        score,
        created_at
    FROM user_feedback f
    JOIN users u ON f.user_id = u.id
    WHERE 
        f.survey_type = 'nps'
        AND f.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
        AND f.status = 'completed'
        AND u.data_processing_consent = true
) quality_check_data;
