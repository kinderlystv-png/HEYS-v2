# HEYS Early Warning System (EWS) - Developer Cheat Sheet

> **Version:** 44 (Smart Phenotype Detection) **Location:**
> `apps/web/insights/pi_early_warning.js`

## 🧬 Phenotype Quick Testing

The EWS module now includes an exposed Quick API under
`HEYS.InsightsPI.earlyWarning.phenotype`. You can use these commands in the
Chrome Console to instantly switch profiles and test threshold adjustments.

### 1. Check Current Status

```javascript
// Returns current active phenotype or "no_phenotype"
HEYS.InsightsPI.earlyWarning.phenotype.check();
```

### 2. Apply Preset Profiles

Testing specific combinations described in the requirements:

```javascript
// 🍭 Insulin Resistant + Sweet Tooth (Strict sugar/fiber/meal timing)
HEYS.InsightsPI.earlyWarning.phenotype.setIR();

// 🌙 Evening Type + Stress Eater (Strict sleep/late eating/sodium)
HEYS.InsightsPI.earlyWarning.phenotype.setEveningStress();

// 🛡️ Resilience Mode (High satiety, balanced - standard limits)
HEYS.InsightsPI.earlyWarning.phenotype.setResilient();

// 🗑️ Clear Phenotype (Return to default thresholds)
HEYS.InsightsPI.earlyWarning.phenotype.clear();
```

### 3. Verify Adjustments

After setting a phenotype, run a detection cycle to see both the _console logs_
(Adjusted X -> Y) and the _UI results_.

```javascript
// Run full detection (30 days) and print report
HEYS.InsightsPI.earlyWarning.detect(30);
```

---

## 📊 Threshold Logic Reference

| Parameter          | Default   | Adjustment Logic (Multipliers accumulate)            |
| :----------------- | :-------- | :--------------------------------------------------- |
| **Fiber Target**   | `15g`     | `+20%` (IR), `+10%` (Low Satiety), `+20%` (Evening)  |
| **Sugar Limit**    | `1.0`     | `-50%` (IR), `-30%` (Stress Eater), `-20%` (Evening) |
| **Sodium Limit**   | `4000mg`  | `-20%` (IR), `-15%` (Evening)                        |
| **Protein Target** | `1.2g/kg` | `+20%` (IR), `+20%` (Low Satiety)                    |
| **Stress Sens.**   | `1.0`     | `+30%` (Stress Eater), `+20%` (Low Satiety)          |
| **Late Meal**      | `22:00`   | `-90 min` (Evening Type), `-30 min` (IR/Stress)      |

## 🛠️ Troubleshooting

**"Active phenotype detected" message missing?**

- Ensure you are running `v=44` or later.
- The message only appears on the **first** call to `getEwsThreshold` per page
  load.
- Reload the page (`Ctrl+R`) to reset the `_phenotypeHintShown` flag.

**Changes not applying?**

- Run `HEYS.InsightsPI.earlyWarning.phenotype.clear()` then set the new profile.
- Verify `HEYS.profile.data.phenotype` exists in the console.
