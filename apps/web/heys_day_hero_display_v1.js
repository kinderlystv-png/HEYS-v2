// heys_day_hero_display_v1.js — hero display helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildHeroDisplay(params) {
        const {
            day,
            prof,
            tdee,
            displayOptimum,
            displayRemainingKcal,
            eatenKcal,
            HEYS: HEYSRef
        } = params || {};

        const ctx = HEYSRef || HEYS;

        // 🎓 TOUR DEMO OVERRIDE
        const isTourActive = ctx.OnboardingTour && ctx.OnboardingTour.isActive();
        const tourHero = isTourActive && ctx.OnboardingTour.getDemoData('hero');

        const displayTdee = tourHero ? tourHero.tdee : tdee;
        const displayHeroOptimum = tourHero ? tourHero.optimum : displayOptimum;
        const displayHeroEaten = tourHero ? tourHero.eaten : eatenKcal;
        const displayHeroRemaining = tourHero ? tourHero.remaining : displayRemainingKcal;

        // Color for remaining/surplus display
        const displayRemainCol = displayHeroRemaining > 100
            ? { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' }
            : displayHeroRemaining >= 0
                ? { bg: '#eab30820', text: '#eab308', border: '#eab30860' }
                : { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };

        // === Deficit calculations for stats VM ===
        const profileDeficit = Number(prof?.deficitPctTarget) || 0;
        const currentDeficit = (day?.deficitPct !== '' && day?.deficitPct != null)
            ? Number(day.deficitPct)
            : profileDeficit;

        return {
            displayTdee,
            displayHeroOptimum,
            displayHeroEaten,
            displayHeroRemaining,
            displayRemainCol,
            profileDeficit,
            currentDeficit
        };
    }

    HEYS.dayHeroDisplay = {
        buildHeroDisplay
    };
})(window);
